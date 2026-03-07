"""
AI-powered classifiers — micro Gemini calls that run in parallel with the main conversation call.

Each classifier uses a tiny prompt and returns a single-word response.
They run via asyncio.gather() alongside the main call, adding zero extra latency.
"""

import asyncio
import logging

import google.generativeai as genai

from app.config import get_settings

logger = logging.getLogger(__name__)

SENTIMENT_PROMPT = "صنّف هالرسالة من عميل لمحل تجاري. رد بكلمة وحدة بس: positive أو neutral أو negative. الرسائل اللي فيها شكوى أو إزعاج أو إساءة أو تحرش أو ألفاظ سيئة = negative. المدح والشكر = positive. الأسئلة العادية = neutral"

VALID_SENTIMENTS = {"positive", "neutral", "negative"}

_configured = False


def _ensure_configured() -> None:
    global _configured
    if not _configured:
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        _configured = True


async def classify_sentiment(text: str) -> str:
    """Micro Gemini call — runs in parallel with main conversation call.

    Returns "positive", "neutral", or "negative".
    Fail-safe: returns "neutral" on any error — never blocks the pipeline.
    """
    try:
        _ensure_configured()
        settings = get_settings()

        model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=SENTIMENT_PROMPT,
            generation_config=genai.GenerationConfig(
                temperature=0.0,
                max_output_tokens=5,
            ),
        )
        response = await asyncio.to_thread(
            model.generate_content, [{"role": "user", "parts": [text]}]
        )
        result = response.text.strip().lower()
        if result in VALID_SENTIMENTS:
            return result
        return "neutral"
    except Exception as e:
        logger.warning("Sentiment classification failed: %s", e)
        return "neutral"
