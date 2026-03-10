"""
Conversation-aware sentiment classifier — Gemini JSON mode.

Analyzes the customer's initial mood (why they reached out) and current mood
(how they feel now) by looking at the first and last inbound messages.

Runs via asyncio.gather() alongside the main Gemini call — zero extra latency.
"""

import asyncio
import json
import logging
from dataclasses import dataclass

import google.generativeai as genai

from app.config import get_settings

logger = logging.getLogger(__name__)

VALID_SENTIMENTS = {"positive", "neutral", "negative"}

MSG_TRUNCATE = 200  # chars per message sent to classifier

SENTIMENT_PROMPT = """صنّف مزاج العميل في محادثة مع محل تجاري.

القواعد:
- شكوى أو إزعاج أو إساءة أو ألفاظ سيئة أو زعل = negative
- مدح أو شكر أو رضا = positive
- أسئلة عادية أو سلام أو استفسار = neutral

initial_mood = مزاج العميل لما تواصل أول مرة (من أول رسائله ذات المعنى، تجاهل السلام البسيط)
current_mood = مزاج العميل الحين (من آخر رسائله)

Output format: JSON with keys "initial_mood" and "current_mood", values must be "positive", "neutral", or "negative"."""

_configured = False


@dataclass
class SentimentResult:
    """Result of conversation-aware sentiment classification."""
    initial_mood: str
    current_mood: str


_FALLBACK = SentimentResult(initial_mood="neutral", current_mood="neutral")


def _ensure_configured() -> None:
    global _configured
    if not _configured:
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        _configured = True


def _build_classifier_input(history: list[dict], current_text: str) -> str:
    """Build the classifier input from conversation history.

    Extracts first 3 + last 3 inbound messages. For short conversations
    (<6 inbound messages), sends all as a single group.
    """
    inbound = []
    for msg in history:
        if msg.get("direction") == "inbound":
            content = msg.get("content", "").strip()
            if content:
                inbound.append(content[:MSG_TRUNCATE])

    # Add current message
    current = current_text.strip()
    if current:
        inbound.append(current[:MSG_TRUNCATE])

    if not inbound:
        return current_text[:MSG_TRUNCATE]

    total = len(inbound)

    if total <= 5:
        # Short conversation — send all as single group
        lines = [f"{i+1}. {m}" for i, m in enumerate(inbound)]
        return "هذي كل رسائل العميل:\n" + "\n".join(lines)

    # Long conversation — first 3 + last 3
    first_3 = inbound[:3]
    last_3 = inbound[-3:]

    parts = ["--- أول رسائل العميل ---"]
    parts.extend(f"{i+1}. {m}" for i, m in enumerate(first_3))
    parts.append("")
    parts.append("--- آخر رسائل العميل ---")
    parts.extend(f"{i+1}. {m}" for i, m in enumerate(last_3))

    return "\n".join(parts)


async def classify_sentiment(
    history: list[dict],
    current_text: str,
) -> SentimentResult:
    """Conversation-aware sentiment classification using Gemini JSON mode.

    Analyzes first + last inbound messages to determine initial and current mood.
    Runs in parallel with main Gemini call via asyncio.gather().

    Fail-safe: returns neutral/neutral on any error — never blocks the pipeline.
    """
    try:
        _ensure_configured()
        settings = get_settings()

        classifier_input = _build_classifier_input(history, current_text)

        inbound_count = len([
            m for m in history
            if m.get("direction") == "inbound" and m.get("content", "").strip()
        ]) + (1 if current_text.strip() else 0)

        model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=SENTIMENT_PROMPT,
            generation_config=genai.GenerationConfig(
                temperature=0.0,
                max_output_tokens=30,
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "initial_mood": {
                            "type": "string",
                            "enum": ["positive", "neutral", "negative"],
                        },
                        "current_mood": {
                            "type": "string",
                            "enum": ["positive", "neutral", "negative"],
                        },
                    },
                    "required": ["initial_mood", "current_mood"],
                },
            ),
        )

        response = await asyncio.to_thread(
            model.generate_content,
            [{"role": "user", "parts": [classifier_input]}],
        )

        data = json.loads(response.text)
        initial = data.get("initial_mood", "neutral").strip().lower()
        current = data.get("current_mood", "neutral").strip().lower()

        # Validate
        if initial not in VALID_SENTIMENTS:
            initial = "neutral"
        if current not in VALID_SENTIMENTS:
            current = "neutral"

        result = SentimentResult(initial_mood=initial, current_mood=current)

        logger.info(
            "Sentiment classified: initial=%s, current=%s "
            "(conversation has %d inbound messages)",
            result.initial_mood,
            result.current_mood,
            inbound_count,
        )
        return result

    except Exception as e:
        logger.warning(
            "Sentiment classification failed: %s. Returning neutral/neutral fallback.",
            e,
        )
        return _FALLBACK
