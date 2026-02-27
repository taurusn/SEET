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

from app.services.gemini import gemini_service, build_modular_prompt
from app.services.classifiers import classify_sentiment

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
    ) -> PipelineResult:
        """Run the full pipeline: prompt → parallel Gemini calls → post-process.

        Args:
            context: Shop context dict (name, menu, hours, etc.)
            conversation_id: UUID string for conversation summary caching
            customer_id: Platform-specific customer identifier
            text: The customer's message
            history: Recent conversation history
            customer_info: Optional customer profile data for recognition
        """
        start = time.monotonic()

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
