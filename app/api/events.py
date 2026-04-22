"""
SSE (Server-Sent Events) endpoint for real-time updates.

Shop owners connect via EventSource with their JWT token as a query param
(EventSource API doesn't support Authorization headers).

Each shop gets its own Redis pub/sub channel: events:{shop_id}
"""

import asyncio
import json
import logging

import jwt
from fastapi import APIRouter, Query, Request
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings
from app.db.database import async_session_factory
from app.models.schemas import Shop
from app.services.redis_client import redis_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["events"])

KEEPALIVE_INTERVAL = 15  # seconds


async def _authenticate_sse_token(token: str) -> str | None:
    """Validate a JWT delivered via query-param for the SSE endpoint.

    EventSource has no custom headers, so tokens ride on the query string.
    We still enforce the same guarantees as get_current_shop: valid JWT,
    not blacklisted, shop exists and is active. Returns shop_id on success.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=["HS256"]
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

    shop_id = payload.get("shop_id")
    if not shop_id:
        return None

    jti = payload.get("jti")
    if jti and await redis_client.is_token_blacklisted(jti):
        return None

    async with async_session_factory() as db:
        result = await db.execute(select(Shop).where(Shop.id == shop_id))
        shop = result.scalar_one_or_none()
        if not shop or not shop.is_active:
            return None

    return shop_id


async def event_generator(request: Request, shop_id: str):
    """Yield SSE events from Redis pub/sub for a specific shop."""
    try:
        pubsub = await redis_client.subscribe_events(shop_id)
    except Exception as e:
        logger.warning("Failed to subscribe to Redis pub/sub for shop %s: %s", shop_id, e)
        # Yield a retry hint and stop — prevents rapid reconnect storms
        yield {"event": "error", "data": json.dumps({"message": "temporary error"}), "retry": 10000}
        return

    try:
        while True:
            if await request.is_disconnected():
                break

            try:
                message = await asyncio.wait_for(
                    pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0),
                    timeout=KEEPALIVE_INTERVAL,
                )
            except asyncio.TimeoutError:
                # No message within keepalive — sse-starlette handles pings
                continue

            if message and message["type"] == "message":
                data = message["data"]
                try:
                    event_data = json.loads(data)
                    event_type = event_data.pop("type", "update")
                    yield {
                        "event": event_type,
                        "data": json.dumps(event_data, default=str),
                    }
                except (json.JSONDecodeError, TypeError):
                    continue

    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.unsubscribe(f"events:{shop_id}")
        await pubsub.close()


@router.get("/shop/events")
async def shop_events(
    request: Request,
    token: str = Query(..., description="JWT token for authentication"),
):
    """SSE endpoint for real-time shop events.

    Token is passed via query param because the browser EventSource API
    does not support custom headers.
    """
    shop_id = await _authenticate_sse_token(token)
    if not shop_id:
        from starlette.responses import JSONResponse
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or expired token"},
        )

    return EventSourceResponse(
        event_generator(request, shop_id),
        ping=KEEPALIVE_INTERVAL,
    )
