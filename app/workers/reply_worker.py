"""
Reply Worker — sends AI-generated replies back to customers via Meta APIs.

Handles retry logic, token refresh, and dead-letter routing.

Run with: python -m app.workers.reply_worker
"""

import asyncio
import logging

from sqlalchemy import select, update
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
    db: AsyncSession, conversation_id: str, reply_text: str, status: str
) -> None:
    """Update the status of the most recent outbound message matching the reply."""
    stmt = (
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.direction == "outbound",
            Message.content == reply_text,
            Message.status == "pending",
        )
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    msg = result.scalar_one_or_none()
    if msg:
        msg.status = status


async def refresh_token(db: AsyncSession, shop: Shop) -> None:
    """Placeholder for Meta token refresh flow.

    In production, this would call the Meta OAuth endpoint
    to exchange a long-lived token or refresh an expiring one.
    """
    logger.warning("Token refresh needed for shop %s — not yet implemented", shop.id)


async def send_reply(msg: dict) -> None:
    """Send a single reply to the customer with retry logic."""
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
            await update_message_status(db, msg["conversation_id"], reply, "failed")
            await db.commit()
            await rabbitmq.move_to_dead_letter(msg, reason=f"Token decryption failed: {e}")
            return

        for attempt in range(MAX_RETRIES):
            try:
                if platform == "instagram":
                    await send_ig_message(token, customer_id, reply)
                elif platform == "whatsapp":
                    await send_wa_message(
                        token, shop.wa_phone_number_id, customer_id, reply
                    )

                await update_message_status(db, msg["conversation_id"], reply, "sent")
                await db.commit()
                logger.info(
                    "Reply sent: platform=%s customer=%s attempt=%d",
                    platform, customer_id, attempt + 1,
                )
                return

            except TokenExpiredError:
                logger.warning("Token expired for shop %s, attempting refresh", shop.id)
                await refresh_token(db, shop)
                await db.commit()

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
        await update_message_status(db, msg["conversation_id"], reply, "failed")
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
