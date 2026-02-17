import logging
from typing import Optional

import google.generativeai as genai

from app.config import get_settings
from app.services.redis_client import redis_client

logger = logging.getLogger(__name__)

FALLBACK_REPLY = "Thank you for your message! We'll get back to you shortly. 🙏"


class GeminiService:
    """Gemini LLM integration with circuit breaker pattern."""

    def __init__(self):
        self._configured = False

    def _ensure_configured(self) -> None:
        if not self._configured:
            settings = get_settings()
            genai.configure(api_key=settings.gemini_api_key)
            self._configured = True

    async def generate_reply(
        self,
        shop_context: dict,
        history: list[dict],
        customer_message: str,
    ) -> str:
        """Generate an AI reply using Gemini, with circuit breaker fallback."""
        # Check circuit breaker
        if await redis_client.is_circuit_open("gemini"):
            logger.warning("Gemini circuit breaker is OPEN, returning fallback")
            return FALLBACK_REPLY

        self._ensure_configured()
        settings = get_settings()

        system_prompt = self._build_system_prompt(shop_context)
        contents = self._format_history(history) + [
            {"role": "user", "parts": [customer_message]}
        ]

        try:
            model = genai.GenerativeModel(
                model_name=settings.gemini_model,
                system_instruction=system_prompt,
            )
            response = model.generate_content(contents)
            await redis_client.record_success("gemini")
            return response.text

        except Exception as e:
            logger.error("Gemini API error: %s", e)
            await redis_client.record_failure("gemini")
            return FALLBACK_REPLY

    def _build_system_prompt(self, ctx: dict) -> str:
        name = ctx.get("name", "the shop")
        menu = ctx.get("menu", "Not provided")
        hours = ctx.get("hours", "Not provided")
        location = ctx.get("location", "Not provided")
        tone = ctx.get("tone", "friendly and helpful")
        faq = ctx.get("faq", "")

        return f"""You are a friendly assistant for {name}.
Reply in the same language the customer uses.
Be concise — this is a DM, not an email.

SHOP INFO:
- Menu: {menu}
- Hours: {hours}
- Location: {location}
- Tone: {tone}
- FAQ: {faq}

RULES:
- Never make up information not in the shop info above
- If unsure, say you'll check and get back to them
- If they want to order, give them the ordering link if available
- If they're angry or need help beyond the FAQ, trigger handoff by saying exactly: [HANDOFF_NEEDED]
"""

    def _format_history(self, history: list[dict]) -> list[dict]:
        """Convert stored message history into Gemini content format."""
        formatted = []
        for msg in history:
            role = "user" if msg.get("direction") == "inbound" else "model"
            formatted.append({"role": role, "parts": [msg.get("content", "")]})
        return formatted


# Singleton
gemini_service = GeminiService()
