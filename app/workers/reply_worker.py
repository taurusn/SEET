"""
Reply Worker — sends AI-generated replies back to customers via Meta APIs.

Handles retry logic, token refresh, and dead-letter routing.

Run with: python -m app.workers.reply_worker
"""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session_factory
from app.models.schemas import Shop, Message
from app.queue.rabbitmq import rabbitmq, OUTBOUND_QUEUE
from app.services.redis_client import redis_client
from app.services.instagram import send_ig_message, TokenExpiredError, RateLimitError
from app.services.whatsapp import send_wa_message
from app.services.encryption import decrypt_token

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

MAX_RETRIES = 3


async def get_shop(db: AsyncSession, shop_id: str) -> Shop | None:
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_message_status(
    db: AsyncSession,
    message_id: str,
    status: str,
    meta_message_id: str | None = None,
) -> None:
    """Update the status of an outbound message by its unique ID.

    If meta_message_id is provided, also persist the Meta-issued id so we
    can correlate later events (delivery receipts, reactions, reply-to).
    """
    stmt = select(Message).where(Message.id == message_id)
    result = await db.execute(stmt)
    msg = result.scalar_one_or_none()
    if msg:
        msg.status = status
        if meta_message_id:
            msg.meta_message_id = meta_message_id


async def deactivate_for_token_expiry(
    db: AsyncSession, shop: Shop, platform: str
) -> None:
    """Deactivate a shop whose Meta token has expired.

    Takes the shop out of rotation so the message_worker stops spinning up
    AI replies we can't deliver, invalidates cached context, and publishes
    an SSE event so the shop owner's dashboard can surface a re-auth banner.
    """
    if shop.is_active:
        shop.is_active = False
        await db.commit()
        logger.warning(
            "Shop %s deactivated — %s token expired; re-auth required",
            shop.id, platform,
        )
    else:
        logger.info(
            "Shop %s already inactive; skipping deactivation for expired %s token",
            shop.id, platform,
        )

    try:
        await redis_client.invalidate_shop_context(str(shop.id))
    except Exception as e:
        logger.warning("Failed to invalidate shop context cache: %s", e)

    try:
        await redis_client.publish_event(str(shop.id), {
            "type": "shop_deactivated",
            "reason": "token_expired",
            "platform": platform,
        })
    except Exception as e:
        logger.warning("Failed to publish shop_deactivated SSE event: %s", e)


async def send_reply(msg: dict) -> None:
    """Send a single reply to the customer with retry logic."""
    message_id = msg.get("message_id", "")

    async with async_session_factory() as db:
        shop = await get_shop(db, msg["shop_id"])
        if not shop:
            logger.error("Shop not found: %s", msg["shop_id"])
            return

        platform = msg["platform"]
        customer_id = msg["customer_id"]
        reply = msg["reply"]

        # Decrypt token once before retry loop
        try:
            if platform == "instagram":
                token = decrypt_token(shop.ig_access_token) if shop.ig_access_token else ""
            elif platform == "whatsapp":
                token = decrypt_token(shop.wa_access_token) if shop.wa_access_token else ""
            else:
                logger.error("Unknown platform: %s", platform)
                return
        except Exception as e:
            logger.error("Token decryption failed for shop %s: %s", shop.id, e)
            if message_id:
                await update_message_status(db, message_id, "failed")
                await db.commit()
            await rabbitmq.move_to_dead_letter(msg, reason=f"Token decryption failed: {e}")
            return

        for attempt in range(MAX_RETRIES):
            try:
                meta_msg_id: str | None = None
                if platform == "instagram":
                    resp = await send_ig_message(token, customer_id, reply)
                    meta_msg_id = resp.get("message_id") or None
                elif platform == "whatsapp":
                    resp = await send_wa_message(
                        token, shop.wa_phone_number_id, customer_id, reply
                    )
                    messages_list = resp.get("messages") or []
                    if messages_list:
                        meta_msg_id = messages_list[0].get("id") or None

                if message_id:
                    await update_message_status(
                        db, message_id, "sent", meta_message_id=meta_msg_id
                    )
                    await db.commit()
                logger.info(
                    "Reply sent: platform=%s customer=%s attempt=%d meta_id=%s",
                    platform, customer_id, attempt + 1, meta_msg_id or "?",
                )
                return

            except TokenExpiredError:
                # No point retrying — token won't un-expire. Break out
                # immediately, deactivate the shop, and DLQ the message
                # with a specific reason so ops / the admin dashboard
                # can distinguish re-auth from transient failures.
                await deactivate_for_token_expiry(db, shop, platform)
                if message_id:
                    await update_message_status(db, message_id, "failed")
                    await db.commit()
                await rabbitmq.move_to_dead_letter(msg, reason="token_expired")
                return

            except RateLimitError:
                wait = 2 ** attempt
                logger.warning("Rate limited, retrying in %ds (attempt %d)", wait, attempt + 1)
                await asyncio.sleep(wait)

            except Exception as e:
                logger.error("Send failed attempt %d: %s", attempt + 1, e)
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(2 ** attempt)

        # All retries exhausted — move to dead letter queue
        logger.error("All retries failed for message to %s, moving to DLQ", customer_id)
        if message_id:
            await update_message_status(db, message_id, "failed")
            await db.commit()

        await rabbitmq.move_to_dead_letter(msg, reason="Max retries exceeded")


async def main() -> None:
    """Entry point for the reply worker."""
    logger.info("Starting reply worker...")

    await redis_client.connect()
    await rabbitmq.connect()

    logger.info("Reply worker consuming from '%s'", OUTBOUND_QUEUE)
    await rabbitmq.consume(OUTBOUND_QUEUE, send_reply)


if __name__ == "__main__":
    asyncio.run(main())
