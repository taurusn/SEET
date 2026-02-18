"""
Message Worker — the brain of the system.

Consumes inbound messages from the queue, identifies the shop,
loads context, generates AI replies, and pushes to outbound queue.

Run with: python -m app.workers.message_worker
"""

import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.database import async_session_factory
from app.models.schemas import Shop, ShopContext, Conversation, Message
from app.queue.rabbitmq import rabbitmq, INBOUND_QUEUE, OUTBOUND_QUEUE
from app.services.redis_client import redis_client
from app.services.gemini import gemini_service
from app.services.handoff import needs_human_handoff, trigger_handoff
from app.services.instagram import extract_ig_messages
from app.services.whatsapp import extract_wa_messages

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

HANDOFF_REPLY = "أبشر، بحولك على الفريق الحين 🙏"


async def identify_shop(
    db: AsyncSession, platform: str, identifier: str
) -> Shop | None:
    """Find the shop by Instagram page_id or WhatsApp phone_number_id."""
    if platform == "instagram":
        stmt = select(Shop).where(
            Shop.ig_page_id == identifier, Shop.is_active == True  # noqa: E712
        )
    else:
        stmt = select(Shop).where(
            Shop.wa_phone_number_id == identifier, Shop.is_active == True  # noqa: E712
        )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_or_create_conversation(
    db: AsyncSession, shop_id: uuid.UUID, platform: str, customer_id: str
) -> Conversation:
    """Get an existing conversation or create a new one.

    Handles the race condition where two workers may try to create
    the same conversation simultaneously by catching IntegrityError.
    """
    from sqlalchemy.exc import IntegrityError

    stmt = select(Conversation).where(
        Conversation.shop_id == shop_id,
        Conversation.platform == platform,
        Conversation.customer_id == customer_id,
    )
    result = await db.execute(stmt)
    convo = result.scalar_one_or_none()

    if not convo:
        try:
            convo = Conversation(
                shop_id=shop_id,
                platform=platform,
                customer_id=customer_id,
                status="ai",
            )
            db.add(convo)
            await db.flush()
            logger.info("New conversation created: %s", convo.id)
        except IntegrityError:
            # Another worker created it first — rollback and re-fetch
            await db.rollback()
            result = await db.execute(stmt)
            convo = result.scalar_one_or_none()
            if not convo:
                raise  # something else went wrong

    return convo


async def get_recent_messages(
    db: AsyncSession, conversation_id: uuid.UUID, limit: int = 10
) -> list[dict]:
    """Load recent messages, preferring Redis cache, falling back to DB."""
    convo_id_str = str(conversation_id)

    # Try Redis cache first
    cached = await redis_client.get_conversation_history(convo_id_str)
    if cached:
        return cached[-limit:]

    # Fall back to DB
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    history = [
        {"direction": m.direction, "content": m.content}
        for m in reversed(messages)
    ]

    # Cache for next time
    await redis_client.cache_conversation_history(convo_id_str, history)
    return history


async def get_shop_context(db: AsyncSession, shop: Shop) -> dict:
    """Load shop context, preferring Redis cache."""
    shop_id_str = str(shop.id)

    cached = await redis_client.get_shop_context(shop_id_str)
    if cached:
        return cached

    stmt = select(ShopContext).where(ShopContext.shop_id == shop.id)
    result = await db.execute(stmt)
    contexts = result.scalars().all()

    context_dict = {"name": shop.name}
    for ctx in contexts:
        context_dict[ctx.context_type] = ctx.content

    await redis_client.cache_shop_context(shop_id_str, context_dict)
    return context_dict


async def save_message(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    direction: str,
    content: str,
    sender_type: str,
    meta_message_id: str | None = None,
) -> Message:
    """Save a message to the database and update Redis cache."""
    msg = Message(
        conversation_id=conversation_id,
        direction=direction,
        content=content,
        sender_type=sender_type,
        meta_message_id=meta_message_id,
        status="sent" if direction == "inbound" else "pending",
    )
    db.add(msg)
    await db.flush()

    # Update Redis cache
    await redis_client.append_to_history(
        str(conversation_id),
        {"direction": direction, "content": content},
    )
    return msg


async def process_message(msg: dict) -> None:
    """Process a single inbound message from the queue."""
    platform = msg["platform"]
    payload = msg["payload"]

    # Extract individual messages from the webhook payload
    if platform == "instagram":
        extracted = extract_ig_messages(payload)
    else:
        extracted = extract_wa_messages(payload)

    if not extracted:
        logger.debug("No actionable messages in payload")
        return

    for item in extracted:
        meta_message_id = item.get("meta_message_id", "")

        # Deduplication check
        if meta_message_id and await redis_client.is_duplicate_message(meta_message_id):
            logger.info("Duplicate message skipped: %s", meta_message_id)
            continue

        # Process each message in its own DB session for isolation
        try:
            async with async_session_factory() as db:
                # Identify shop
                if platform == "instagram":
                    identifier = item.get("page_id", "")
                else:
                    identifier = item.get("phone_number_id", "")

                shop = await identify_shop(db, platform, identifier)
                if not shop:
                    logger.warning("No active shop found for %s: %s", platform, identifier)
                    continue

                # Rate limiting
                if not await redis_client.check_rate_limit(str(shop.id)):
                    logger.warning("Rate limit exceeded for shop %s", shop.id)
                    continue

                customer_id = item.get("sender_id", item.get("wa_id", ""))
                text = item.get("text", "")

                # Get or create conversation
                convo = await get_or_create_conversation(db, shop.id, platform, customer_id)

                # Save inbound message
                await save_message(
                    db, convo.id, "inbound", text, "customer", meta_message_id
                )

                # If human handoff is active, skip AI
                if convo.status == "human":
                    logger.info("Conversation %s in human mode, skipping AI", convo.id)
                    await db.commit()
                    continue

                # Check for handoff triggers
                if needs_human_handoff(text):
                    await trigger_handoff(db, str(convo.id), reason=f"Customer said: {text}")
                    reply = HANDOFF_REPLY
                else:
                    # Load context and history, then generate reply
                    context = await get_shop_context(db, shop)
                    history = await get_recent_messages(db, convo.id)
                    reply = await gemini_service.generate_reply(context, history, text)

                # Save outbound message
                outbound_msg = await save_message(db, convo.id, "outbound", reply, "ai")
                await db.commit()

                # Push to outbound queue (after commit so DB state is consistent)
                await rabbitmq.publish(OUTBOUND_QUEUE, {
                    "conversation_id": str(convo.id),
                    "platform": platform,
                    "customer_id": customer_id,
                    "shop_id": str(shop.id),
                    "reply": reply,
                    "message_id": str(outbound_msg.id),
                })

                logger.info(
                    "Processed message for shop=%s convo=%s", shop.id, convo.id
                )

        except Exception as e:
            logger.exception(
                "Failed to process message %s: %s", meta_message_id, e
            )


async def main() -> None:
    """Entry point for the message worker."""
    logger.info("Starting message worker...")

    await redis_client.connect()
    await rabbitmq.connect()

    logger.info("Message worker consuming from '%s'", INBOUND_QUEUE)
    await rabbitmq.consume(INBOUND_QUEUE, process_message)


if __name__ == "__main__":
    asyncio.run(main())
