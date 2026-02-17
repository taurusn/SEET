"""
Cafe Reply — Multi-tenant AI messaging platform.

FastAPI application entry point.
"""

import logging

from contextlib import asynccontextmanager
from fastapi import FastAPI

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

app.include_router(webhook_router)
app.include_router(dashboard_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "cafe-reply"}
