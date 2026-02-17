import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response, HTTPException, Query

from app.config import get_settings
from app.queue.rabbitmq import rabbitmq, INBOUND_QUEUE

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


def verify_meta_signature(request_body: bytes, signature_header: str) -> bool:
    """Verify the HMAC SHA-256 signature from Meta webhook."""
    settings = get_settings()
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected_signature = signature_header[7:]  # strip "sha256="
    computed = hmac.new(
        settings.meta_app_secret.encode(),
        request_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(computed, expected_signature)


# ─── Instagram Webhooks ──────────────────────────────────────────────────────


@router.get("/webhook/instagram")
async def ig_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification (subscribe handshake)."""
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_verify_token:
        logger.info("Instagram webhook verified")
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/instagram")
async def ig_webhook(request: Request):
    """Receive Instagram webhook events — ACK fast, queue for processing."""
    body_bytes = await request.body()

    # Verify signature
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not verify_meta_signature(body_bytes, signature):
        logger.warning("Invalid Instagram webhook signature")
        raise HTTPException(status_code=403, detail="Invalid signature")

    # Parse from already-read bytes to avoid double read
    body = json.loads(body_bytes)

    # Publish to queue immediately for fast ACK
    await rabbitmq.publish(INBOUND_QUEUE, {
        "platform": "instagram",
        "payload": body,
        "received_at": datetime.now(timezone.utc).isoformat(),
    })

    return Response(status_code=200)


# ─── WhatsApp Webhooks ───────────────────────────────────────────────────────


@router.get("/webhook/whatsapp")
async def wa_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification for WhatsApp."""
    settings = get_settings()
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_verify_token:
        logger.info("WhatsApp webhook verified")
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/webhook/whatsapp")
async def wa_webhook(request: Request):
    """Receive WhatsApp webhook events — ACK fast, queue for processing."""
    body_bytes = await request.body()

    signature = request.headers.get("X-Hub-Signature-256", "")
    if not verify_meta_signature(body_bytes, signature):
        logger.warning("Invalid WhatsApp webhook signature")
        raise HTTPException(status_code=403, detail="Invalid signature")

    body = json.loads(body_bytes)

    await rabbitmq.publish(INBOUND_QUEUE, {
        "platform": "whatsapp",
        "payload": body,
        "received_at": datetime.now(timezone.utc).isoformat(),
    })

    return Response(status_code=200)
