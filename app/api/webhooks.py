"""
Meta webhook handlers — Instagram + WhatsApp.

Uses PEP 604 `X | Y` annotations; `from __future__ import annotations`
below keeps us compatible with 3.9 local-dev environments.

Two routing patterns coexist:

1. Per-shop path (preferred):
     GET/POST /webhook/instagram/{shop_id}
     GET/POST /webhook/whatsapp/{shop_id}
   Each shop brings their own Meta App. The URL carries the shop_id so
   the handler can load that shop's meta_app_secret + meta_verify_token
   and verify against them. Enables SEET to operate without its own
   verified Business Portfolio — shops own their Meta compliance posture.

2. Legacy path (back-compat):
     GET/POST /webhook/instagram
     GET/POST /webhook/whatsapp
   No shop_id in the URL. Falls back to the global META_APP_SECRET /
   META_VERIFY_TOKEN from .env. For shops onboarded before per-shop
   routing existed. Kept until production logs show no hits.

Both paths end up publishing the same shape to the inbound queue,
plus a shop_id key when the per-shop path is used so workers can
skip a lookup.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.database import async_session_factory
from app.models.schemas import Shop
from app.queue.rabbitmq import rabbitmq, INBOUND_QUEUE
from app.services.encryption import decrypt_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


def _hmac_matches(body: bytes, signature_header: str, secret: str) -> bool:
    """Constant-time HMAC-SHA256 check against the given secret."""
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header[7:]
    computed = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, expected)


def verify_meta_signature(request_body: bytes, signature_header: str) -> bool:
    """Verify the legacy webhook signature against the global app secret."""
    settings = get_settings()
    return _hmac_matches(request_body, signature_header, settings.meta_app_secret)


async def _load_shop(db: AsyncSession, shop_id: uuid.UUID) -> Shop | None:
    result = await db.execute(select(Shop).where(Shop.id == shop_id))
    return result.scalar_one_or_none()


async def _verify_per_shop_signature(
    shop_id: uuid.UUID, body: bytes, signature_header: str
) -> Shop | None:
    """Load shop, decrypt its meta_app_secret, check HMAC.

    Returns the shop on success. Returns None on any failure (missing
    shop, missing secret, bad signature). Caller should 403 on None.
    """
    async with async_session_factory() as db:
        shop = await _load_shop(db, shop_id)
    if not shop or not shop.meta_app_secret:
        return None
    try:
        secret = decrypt_token(shop.meta_app_secret)
    except Exception as e:
        logger.warning("Failed to decrypt meta_app_secret for shop %s: %s", shop_id, e)
        return None
    if not _hmac_matches(body, signature_header, secret):
        return None
    return shop


async def _enqueue_inbound(platform: str, body: dict, shop_id: uuid.UUID | None) -> None:
    """Publish an inbound webhook payload to the queue with optional shop_id."""
    envelope = {
        "platform": platform,
        "payload": body,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    if shop_id is not None:
        envelope["shop_id"] = str(shop_id)
    await rabbitmq.publish(INBOUND_QUEUE, envelope)


# ─── Per-shop endpoints (preferred) ──────────────────────────────────────────


@router.get("/webhook/instagram/{shop_id}")
async def ig_webhook_verify_shop(
    shop_id: uuid.UUID,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Per-shop Instagram webhook verification handshake."""
    async with async_session_factory() as db:
        shop = await _load_shop(db, shop_id)
    if (
        hub_mode == "subscribe"
        and shop is not None
        and shop.meta_verify_token
        and hub_verify_token == shop.meta_verify_token
    ):
        logger.info("IG webhook verified for shop %s", shop_id)
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/instagram/{shop_id}")
async def ig_webhook_shop(shop_id: uuid.UUID, request: Request):
    """Per-shop Instagram webhook — HMAC verified against shop's app_secret."""
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    shop = await _verify_per_shop_signature(shop_id, body_bytes, signature)
    if not shop:
        logger.warning("Instagram per-shop webhook rejected for %s", shop_id)
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError as e:
        logger.warning("Instagram webhook: invalid JSON body (%s)", e)
        return Response(status_code=200)

    await _enqueue_inbound("instagram", body, shop.id)
    return Response(status_code=200)


@router.get("/webhook/whatsapp/{shop_id}")
async def wa_webhook_verify_shop(
    shop_id: uuid.UUID,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Per-shop WhatsApp webhook verification handshake."""
    async with async_session_factory() as db:
        shop = await _load_shop(db, shop_id)
    if (
        hub_mode == "subscribe"
        and shop is not None
        and shop.meta_verify_token
        and hub_verify_token == shop.meta_verify_token
    ):
        logger.info("WA webhook verified for shop %s", shop_id)
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/whatsapp/{shop_id}")
async def wa_webhook_shop(shop_id: uuid.UUID, request: Request):
    """Per-shop WhatsApp webhook — HMAC verified against shop's app_secret."""
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    shop = await _verify_per_shop_signature(shop_id, body_bytes, signature)
    if not shop:
        logger.warning("WhatsApp per-shop webhook rejected for %s", shop_id)
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError as e:
        logger.warning("WhatsApp webhook: invalid JSON body (%s)", e)
        return Response(status_code=200)

    await _enqueue_inbound("whatsapp", body, shop.id)
    return Response(status_code=200)


# ─── Legacy endpoints (global secret, back-compat for pre-migration shops) ───


@router.get("/webhook/instagram")
async def ig_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Legacy Instagram webhook verification (global verify token)."""
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_verify_token:
        logger.info("Instagram webhook verified (legacy path)")
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/instagram")
async def ig_webhook(request: Request):
    """Legacy Instagram webhook — global META_APP_SECRET.

    Kept for shops that haven't yet been migrated to per-shop apps.
    New shops should use /webhook/instagram/{shop_id}.
    """
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not verify_meta_signature(body_bytes, signature):
        logger.warning("Invalid Instagram webhook signature (legacy path)")
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError as e:
        logger.warning("Instagram webhook: invalid JSON body (%s)", e)
        return Response(status_code=200)

    await _enqueue_inbound("instagram", body, None)
    return Response(status_code=200)


@router.get("/webhook/whatsapp")
async def wa_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Legacy WhatsApp webhook verification (global verify token)."""
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_verify_token:
        logger.info("WhatsApp webhook verified (legacy path)")
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/whatsapp")
async def wa_webhook(request: Request):
    """Legacy WhatsApp webhook — global META_APP_SECRET."""
    body_bytes = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not verify_meta_signature(body_bytes, signature):
        logger.warning("Invalid WhatsApp webhook signature (legacy path)")
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        body = json.loads(body_bytes)
    except json.JSONDecodeError as e:
        logger.warning("WhatsApp webhook: invalid JSON body (%s)", e)
        return Response(status_code=200)

    await _enqueue_inbound("whatsapp", body, None)
    return Response(status_code=200)
