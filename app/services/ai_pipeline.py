"""
Agentic AI Pipeline — orchestrates the full message processing flow.

Replaces direct gemini_service.generate_reply() calls in the worker.
Stages: pre-processors → prompt composition → parallel Gemini calls → post-processors.
"""

import asyncio
import logging
import re
import time
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.gemini import gemini_service, build_modular_prompt
from app.services.classifiers import classify_sentiment
from app.services.business_hours import check_business_hours

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """Result of processing a message through the pipeline."""
    reply: str
    handoff_needed: bool
    handoff_reason: str
    sentiment: str
    response_time_ms: int


def _extract_handoff(raw_reply: str) -> tuple[bool, str, str]:
    """Parse [HANDOFF_NEEDED: reason] from Gemini output.

    Returns (handoff_needed, handoff_reason, clean_reply).
    """
    match = re.search(r"\[HANDOFF_NEEDED:\s*(.+?)\]", raw_reply)
    if match or "[HANDOFF_NEEDED" in raw_reply:
        reason = match.group(1).strip() if match else ""
        clean = re.sub(r"\[HANDOFF_NEEDED[^\]]*\]", "", raw_reply).strip()
        return True, reason, clean
    return False, "", raw_reply


def _enrich_message(
    text: str,
    customer_info: dict | None = None,
) -> str:
    """Enrich the customer message with metadata (prepended as context tags).

    Customer info is injected INTO the message, not the system prompt —
    Gemini naturally adapts tone without explicit rules.
    """
    parts: list[str] = []

    # Customer recognition tag
    if customer_info:
        total = customer_info.get("total_conversations", 1)
        if total > 1:
            parts.append(f"[عميل عائد — {total} محادثات سابقة]")
        else:
            parts.append("[عميل جديد]")

    parts.append(text)
    return "\n".join(parts)


async def upsert_customer_profile(
    db: AsyncSession,
    shop_id: str,
    platform: str,
    customer_id: str,
) -> dict | None:
    """Upsert customer profile and return info for message enrichment.

    Uses INSERT ON CONFLICT UPDATE for race-condition safety.
    Returns dict with total_conversations, first_seen_at, last_seen_at.
    """
    try:
        result = await db.execute(
            text("""
                INSERT INTO customer_profiles (shop_id, platform, customer_id, total_conversations, first_seen_at, last_seen_at)
                VALUES (:shop_id, :platform, :customer_id, 1, now(), now())
                ON CONFLICT (shop_id, platform, customer_id)
                DO UPDATE SET
                    total_conversations = customer_profiles.total_conversations + 1,
                    last_seen_at = now()
                RETURNING total_conversations, first_seen_at, last_seen_at
            """),
            {"shop_id": shop_id, "platform": platform, "customer_id": customer_id},
        )
        row = result.fetchone()
        if row:
            return {
                "total_conversations": row[0],
                "first_seen_at": row[1],
                "last_seen_at": row[2],
            }
    except Exception as e:
        logger.warning("Customer profile upsert failed: %s", e)
    return None


class AIPipeline:
    """Orchestrates the full AI message processing pipeline."""

    async def process(
        self,
        context: dict,
        conversation_id: str,
        customer_id: str,
        text: str,
        history: list[dict],
        customer_info: dict | None = None,
        db: AsyncSession | None = None,
        shop_id: str | None = None,
        platform: str | None = None,
    ) -> PipelineResult:
        """Run the full pipeline: prompt → parallel Gemini calls → post-process.

        Args:
            context: Shop context dict (name, menu, hours, etc.)
            conversation_id: UUID string for conversation summary caching
            customer_id: Platform-specific customer identifier
            text: The customer's message
            history: Recent conversation history
            customer_info: Optional customer profile data for recognition
            db: Optional DB session for customer profile upsert
            shop_id: Shop UUID string (needed for customer profile)
            platform: Platform string (needed for customer profile)
        """
        start = time.monotonic()

        # ── Pre-processor: customer profile upsert ──
        if db and shop_id and platform and not customer_info:
            customer_info = await upsert_customer_profile(db, shop_id, platform, customer_id)

        # ── Pre-processor: business hours short-circuit ──
        business_hours_json = context.get("business_hours")
        if business_hours_json:
            is_open, closed_msg = check_business_hours(business_hours_json)
            if not is_open and closed_msg:
                elapsed = int((time.monotonic() - start) * 1000)
                logger.info("Shop closed — skipping Gemini, sending auto-reply")
                return PipelineResult(
                    reply=closed_msg,
                    handoff_needed=False,
                    handoff_reason="",
                    sentiment="neutral",
                    response_time_ms=elapsed,
                )

        # ── Prompt composition ──
        system_prompt = build_modular_prompt(context, customer_info)
        enriched_msg = _enrich_message(text, customer_info)

        # ── PARALLEL: Main Gemini + Sentiment micro-call ──
        raw_reply, sentiment = await asyncio.gather(
            gemini_service.generate_reply(
                system_prompt, history, enriched_msg, conversation_id
            ),
            classify_sentiment(text),
        )

        # ── Post-processors ──
        handoff_needed, handoff_reason, clean_reply = _extract_handoff(raw_reply)

        # Clean response is already handled inside gemini_service.generate_reply()
        # but handoff extraction may have left artifacts
        clean_reply = clean_reply.strip()

        elapsed = int((time.monotonic() - start) * 1000)

        result = PipelineResult(
            reply=clean_reply,
            handoff_needed=handoff_needed,
            handoff_reason=handoff_reason,
            sentiment=sentiment,
            response_time_ms=elapsed,
        )

        logger.info(
            "Pipeline result: sentiment=%s, handoff=%s, time=%dms, reply='%s'",
            result.sentiment,
            result.handoff_needed,
            result.response_time_ms,
            result.reply[:80],
        )

        return result


# Singleton
ai_pipeline = AIPipeline()
