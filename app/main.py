"""
Cafe Reply — Multi-tenant AI messaging platform.

FastAPI application entry point.
"""

import logging

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.webhooks import router as webhook_router
from app.api.dashboard import router as dashboard_router
from app.queue.rabbitmq import rabbitmq
from app.services.redis_client import redis_client

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown of external connections."""
    # Startup
    logger.info("Connecting to Redis...")
    await redis_client.connect()

    logger.info("Connecting to RabbitMQ...")
    await rabbitmq.connect()

    logger.info("Application ready")
    yield

    # Shutdown
    logger.info("Shutting down...")
    await rabbitmq.close()
    await redis_client.close()


app = FastAPI(
    title="Cafe Reply",
    description="Multi-tenant AI messaging platform for Instagram & WhatsApp",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "https://*.trycloudflare.com",
    ],
    allow_origin_regex=r"https://.*\.trycloudflare\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)
app.include_router(dashboard_router)


@app.get("/health")
async def health_check():
    """Real health check — verify all dependencies are reachable."""
    checks = {}

    # Redis
    try:
        await redis_client.client.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    # RabbitMQ
    try:
        if rabbitmq._connection and not rabbitmq._connection.is_closed:
            checks["rabbitmq"] = "ok"
        else:
            checks["rabbitmq"] = "error"
    except Exception:
        checks["rabbitmq"] = "error"

    # Database (lightweight check via engine)
    try:
        from app.db.database import async_engine
        from sqlalchemy import text

        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    all_ok = all(v == "ok" for v in checks.values())

    return {
        "status": "ok" if all_ok else "degraded",
        "service": "cafe-reply",
        "checks": checks,
    }
