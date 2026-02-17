import logging
import re
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import Conversation, HandoffRequest

logger = logging.getLogger(__name__)

# Keywords that trigger human handoff (multi-language)
HANDOFF_KEYWORDS = [
    # English
    r"\bhuman\b", r"\bagent\b", r"\bspeak to someone\b", r"\breal person\b",
    r"\bmanager\b", r"\bcomplaint\b",
    # Arabic
    r"أريد التحدث", r"شخص حقيقي", r"مدير", r"شكوى",
]

HANDOFF_PATTERN = re.compile("|".join(HANDOFF_KEYWORDS), re.IGNORECASE)


def needs_human_handoff(text: str) -> bool:
    """Check if customer message contains handoff trigger keywords."""
    return bool(HANDOFF_PATTERN.search(text))


async def trigger_handoff(
    db: AsyncSession,
    conversation_id: str,
    reason: Optional[str] = None,
) -> HandoffRequest:
    """Set conversation to human mode and create a handoff request."""
    # Update conversation status
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(status="human")
    )

    # Create handoff request
    handoff = HandoffRequest(
        conversation_id=conversation_id,
        reason=reason or "Customer requested human agent",
    )
    db.add(handoff)
    await db.flush()

    logger.info("Handoff triggered for conversation %s: %s", conversation_id, reason)
    return handoff


async def resolve_handoff(
    db: AsyncSession,
    conversation_id: str,
) -> None:
    """Resolve a handoff and return conversation to AI mode."""
    from datetime import datetime, timezone

    # Update conversation status back to AI
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(status="ai")
    )

    # Mark the most recent unresolved handoff as resolved
    stmt = (
        select(HandoffRequest)
        .where(
            HandoffRequest.conversation_id == conversation_id,
            HandoffRequest.resolved_at.is_(None),
        )
        .order_by(HandoffRequest.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    handoff = result.scalar_one_or_none()
    if handoff:
        handoff.resolved_at = datetime.now(timezone.utc)

    logger.info("Handoff resolved for conversation %s", conversation_id)
