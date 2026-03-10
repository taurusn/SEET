"""
Message Worker — the brain of the system.

Consumes inbound messages from the queue, identifies the shop,
loads context, generates AI replies, and pushes to outbound queue.

Run with: python -m app.workers.message_worker
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session_factory
from app.models.schemas import Shop, ShopContext, Conversation, Message, ConversationVisit
from app.queue.rabbitmq import rabbitmq, INBOUND_QUEUE, OUTBOUND_QUEUE
from app.services.redis_client import redis_client
from app.services.ai_pipeline import ai_pipeline
from app.services.handoff import trigger_handoff
from app.services.instagram import extract_ig_messages
from app.services.whatsapp import extract_wa_messages

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

HANDOFF_REPLY = "أبشر، خلني أتواصل مع المسؤول ويرد عليك"

VISIT_GAP_HOURS = 0.03  # TEMPORARY: ~2 minutes for testing (normally 24)


async def detect_and_snapshot_visit(
    db: AsyncSession, convo: Conversation
) -> None:
    """Check if a new visit should start (>24h gap since last message).

    If so, snapshot the current visit into conversation_visits and reset
    the conversation's sentiment for the new visit.
    """
    # Find the latest message timestamp for this conversation
    result = await db.execute(
        select(sa_func.max(Message.created_at)).where(
            Message.conversation_id == convo.id
        )
    )
    last_msg_at = result.scalar_one_or_none()

    if not last_msg_at:
        # First ever message — initialize visit start, no snapshot needed
        if not convo.current_visit_started_at:
            convo.current_visit_started_at = datetime.now(timezone.utc)
        return

    now = datetime.now(timezone.utc)
    gap = now - last_msg_at.replace(tzinfo=timezone.utc) if last_msg_at.tzinfo is None else now - last_msg_at

    if gap.total_seconds() <= VISIT_GAP_HOURS * 3600:
        # Same visit — no action needed
        return

    # ── New visit detected — snapshot the old one ──

    # Count messages in the current visit
    visit_start = convo.current_visit_started_at or convo.created_at
    msg_count_result = await db.execute(
        select(sa_func.count()).select_from(Message).where(
            Message.conversation_id == convo.id,
            Message.created_at >= visit_start,
        )
    )
    msg_count = msg_count_result.scalar() or 0

    # Determine visit number
    visit_count_result = await db.execute(
        select(sa_func.count()).select_from(ConversationVisit).where(
            ConversationVisit.conversation_id == convo.id
        )
    )
    prev_visits = visit_count_result.scalar() or 0

    # Snapshot the completed visit
    visit = ConversationVisit(
        conversation_id=convo.id,
        shop_id=convo.shop_id,
        visit_number=prev_visits + 1,
        initial_sentiment=convo.initial_sentiment,
        current_sentiment=convo.current_sentiment,
        message_count=msg_count,
        started_at=visit_start,
        ended_at=last_msg_at,
    )
    db.add(visit)

    logger.info(
        "New visit detected for convo=%s (24h+ gap). "
        "Snapshotting visit #%d (initial=%s, current=%s, %d messages). "
        "Starting visit #%d.",
        convo.id,
        prev_visits + 1,
        convo.initial_sentiment,
        convo.current_sentiment,
        msg_count,
        prev_visits + 2,
    )

    # Reset conversation for the new visit
    convo.initial_sentiment = None
    convo.current_sentiment = None
    convo.current_visit_started_at = now


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
    db: AsyncSession, conversation_id: uuid.UUID, limit: int = 50
) -> list[dict]:
    """Load recent messages, preferring Redis cache, falling back to DB."""
    convo_id_str = str(conversation_id)

    # Try Redis cache first
    cached = await redis_client.get_conversation_history(convo_id_str)
    if cached:
        return cached[-limit:]

    # Fall back to DB — exclude human agent messages so Gemini only
    # sees customer + AI messages (human replies would confuse the model).
    stmt = (
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_type.in_(["customer", "ai"]),
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    history = [
        {
            "direction": m.direction,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
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
        {
            "direction": direction,
            "content": content,
            "created_at": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
        },
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

                # Visit detection: snapshot old visit + reset sentiment if 24h+ gap
                await detect_and_snapshot_visit(db, convo)

                # Load history BEFORE saving inbound message to avoid
                # duplicating the current message in Gemini's context.
                history = await get_recent_messages(db, convo.id)

                # Save inbound message
                await save_message(
                    db, convo.id, "inbound", text, "customer", meta_message_id
                )

                # Publish inbound event for SSE
                await redis_client.publish_event(str(shop.id), {
                    "type": "new_message",
                    "direction": "inbound",
                    "conversation_id": str(convo.id),
                    "customer_id": customer_id,
                    "platform": platform,
                    "preview": text[:100],
                })

                # If human handoff is active, send ONE holding reply then stay silent
                if convo.status == "human":
                    if await redis_client.claim_hold_reply(str(convo.id)):
                        logger.info("Conversation %s in human mode, sending hold reply", convo.id)
                        hold_reply = "رسالتك وصلت! المسؤول يراجع الموضوع ويرد عليك بأقرب وقت."
                        outbound_msg = await save_message(
                            db, convo.id, "outbound", hold_reply, "ai"
                        )
                        await db.commit()

                        await rabbitmq.publish(OUTBOUND_QUEUE, {
                            "conversation_id": str(convo.id),
                            "platform": platform,
                            "customer_id": customer_id,
                            "shop_id": str(shop.id),
                            "reply": hold_reply,
                            "message_id": str(outbound_msg.id),
                        })
                    else:
                        logger.info("Conversation %s in human mode, hold reply already sent", convo.id)
                        await db.commit()
                    continue

                # Run the AI pipeline — handles prompt composition, parallel
                # Gemini + sentiment calls, handoff extraction, and timing.
                context = await get_shop_context(db, shop)
                visit_start_iso = (
                    convo.current_visit_started_at.isoformat()
                    if convo.current_visit_started_at
                    else None
                )
                result = await ai_pipeline.process(
                    context=context,
                    conversation_id=str(convo.id),
                    customer_id=customer_id,
                    text=text,
                    history=history,
                    db=db,
                    shop_id=str(shop.id),
                    platform=platform,
                    visit_started_at=visit_start_iso,
                )

                # Store sentiment on conversation (Sentiment V2: dual tracking)
                # Count only current-visit inbound messages for locking threshold
                visit_start_str = visit_start_iso
                if visit_start_str:
                    has_timestamps = any(m.get("created_at") for m in history)
                    if has_timestamps:
                        visit_inbound = [
                            m for m in history
                            if m.get("direction") == "inbound"
                            and m.get("created_at")
                            and m["created_at"] >= visit_start_str
                        ]
                        inbound_count = len(visit_inbound) + 1
                    else:
                        # Old cache without timestamps — count all as fallback
                        inbound_count = len([m for m in history if m.get("direction") == "inbound"]) + 1
                else:
                    inbound_count = len([m for m in history if m.get("direction") == "inbound"]) + 1
                if result.initial_sentiment:
                    if not convo.initial_sentiment or inbound_count <= 3:
                        convo.initial_sentiment = result.initial_sentiment
                if result.current_sentiment:
                    convo.current_sentiment = result.current_sentiment

                # Only track transitions when initial_sentiment is locked (>3 messages)
                # to avoid per-message overcounting
                locked_initial = convo.initial_sentiment if inbound_count > 3 else ""

                # Track analytics in Redis
                await redis_client.track_message_processed(
                    shop_id=str(shop.id),
                    response_time_ms=result.response_time_ms,
                    was_escalated=result.handoff_needed,
                    current_sentiment=result.current_sentiment,
                    initial_sentiment=locked_initial,
                    hour=datetime.now(timezone.utc).hour,
                )

                if result.handoff_needed:
                    reason = result.handoff_reason or f"رسالة العميل: {text}"
                    await trigger_handoff(db, str(convo.id), reason=reason)
                    reply = HANDOFF_REPLY

                    # Publish handoff event for SSE
                    await redis_client.publish_event(str(shop.id), {
                        "type": "handoff_triggered",
                        "conversation_id": str(convo.id),
                        "customer_id": customer_id,
                        "platform": platform,
                        "reason": reason,
                    })
                else:
                    reply = result.reply

                # Save outbound message
                outbound_msg = await save_message(db, convo.id, "outbound", reply, "ai")
                await db.commit()

                # Publish outbound event for SSE
                await redis_client.publish_event(str(shop.id), {
                    "type": "new_message",
                    "direction": "outbound",
                    "conversation_id": str(convo.id),
                    "sender_type": "ai",
                    "preview": reply[:100],
                })

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
