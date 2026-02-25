import json
import logging
from typing import Optional

import redis.asyncio as redis

from app.config import get_settings

logger = logging.getLogger(__name__)


HISTORY_TTL = 86400  # 24 hours — long enough for customers who return next day


class RedisClient:
    """Redis client for conversation caching, rate limiting, and deduplication."""

    def __init__(self):
        self._client: Optional[redis.Redis] = None

    async def connect(self) -> None:
        settings = get_settings()
        self._client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
        await self._client.ping()
        logger.info("Redis connected")

    @property
    def client(self) -> redis.Redis:
        if not self._client:
            raise RuntimeError("Redis not connected")
        return self._client

    # ─── Conversation History Cache ──────────────────────────────────────

    async def cache_conversation_history(
        self, conversation_id: str, messages: list[dict]
    ) -> None:
        """Cache recent conversation messages for fast Gemini context loading."""
        key = f"conv:{conversation_id}:history"
        await self.client.set(key, json.dumps(messages, default=str), ex=HISTORY_TTL)

    async def get_conversation_history(self, conversation_id: str) -> Optional[list[dict]]:
        key = f"conv:{conversation_id}:history"
        data = await self.client.get(key)
        return json.loads(data) if data else None

    async def append_to_history(
        self, conversation_id: str, message: dict
    ) -> None:
        """Append a message to cached history, trimming to last 50."""
        key = f"conv:{conversation_id}:history"
        history = await self.get_conversation_history(conversation_id)
        if history is None:
            history = []
        history.append(message)
        history = history[-50:]  # keep last 50 messages in cache
        await self.client.set(key, json.dumps(history, default=str), ex=HISTORY_TTL)

    async def invalidate_conversation_history(self, conversation_id: str) -> None:
        """Delete cached history, forcing a fresh load from DB next time."""
        key = f"conv:{conversation_id}:history"
        await self.client.delete(key)

    # ─── Conversation Summary Cache ────────────────────────────────────

    async def get_conversation_summary(self, conversation_id: str) -> Optional[dict]:
        """Return cached summary as {text, msg_count} or None."""
        key = f"conv:{conversation_id}:summary"
        data = await self.client.get(key)
        if not data:
            return None
        try:
            parsed = json.loads(data)
            if isinstance(parsed, dict) and "text" in parsed:
                return parsed
            # Backwards compat: old plain-string format
            return {"text": parsed if isinstance(parsed, str) else str(parsed), "msg_count": 0}
        except (json.JSONDecodeError, TypeError):
            return None

    async def cache_conversation_summary(
        self, conversation_id: str, summary: str, msg_count: int
    ) -> None:
        key = f"conv:{conversation_id}:summary"
        value = json.dumps({"text": summary, "msg_count": msg_count})
        await self.client.set(key, value, ex=HISTORY_TTL)

    # ─── Hold Reply Rate Limiting ──────────────────────────────────────

    async def claim_hold_reply(self, conversation_id: str) -> bool:
        """Atomically claim the right to send a hold reply.

        Returns True if the flag was newly set (caller should send the reply).
        Returns False if it already existed (another worker already sent it).
        Uses SET NX for atomic check-and-set — same pattern as dedup.
        """
        key = f"holdreply:{conversation_id}"
        result = await self.client.set(key, "1", nx=True, ex=HISTORY_TTL)
        return result is not None

    async def clear_hold_reply_flag(self, conversation_id: str) -> None:
        """Clear the hold reply flag (called on handoff resolution)."""
        key = f"holdreply:{conversation_id}"
        await self.client.delete(key)

    # ─── Message Deduplication ───────────────────────────────────────────

    async def is_duplicate_message(self, meta_message_id: str) -> bool:
        """Check if we've already processed this Meta message ID."""
        key = f"dedup:{meta_message_id}"
        result = await self.client.set(key, "1", nx=True, ex=86400)  # 24h TTL
        return result is None  # None means key already existed → duplicate

    # ─── Rate Limiting ───────────────────────────────────────────────────

    async def check_rate_limit(
        self, shop_id: str, limit: int = 100, window_seconds: int = 60
    ) -> bool:
        """Sliding window rate limiter. Returns True if within limit."""
        key = f"ratelimit:{shop_id}"
        current = await self.client.incr(key)
        if current == 1:
            await self.client.expire(key, window_seconds)
        return current <= limit

    # ─── Circuit Breaker for Gemini ──────────────────────────────────────

    async def is_circuit_open(self, service: str = "gemini") -> bool:
        """Check if the circuit breaker is open (service considered down)."""
        key = f"circuit:{service}"
        return await self.client.exists(key) == 1

    async def open_circuit(
        self, service: str = "gemini", ttl_seconds: int = 60
    ) -> None:
        """Open the circuit breaker — stop calling the service for ttl_seconds."""
        key = f"circuit:{service}"
        await self.client.set(key, "open", ex=ttl_seconds)
        logger.warning("Circuit breaker OPEN for %s for %ds", service, ttl_seconds)

    async def record_failure(
        self, service: str = "gemini", threshold: int = 5, window: int = 60
    ) -> None:
        """Record a failure. Open circuit if threshold is exceeded."""
        key = f"circuit:{service}:failures"
        count = await self.client.incr(key)
        if count == 1:
            await self.client.expire(key, window)
        if count >= threshold:
            await self.open_circuit(service)

    async def record_success(self, service: str = "gemini") -> None:
        """Record a success and reset failure counters."""
        await self.client.delete(f"circuit:{service}:failures")

    # ─── Shop Context Cache ──────────────────────────────────────────────

    async def cache_shop_context(self, shop_id: str, context: dict) -> None:
        key = f"shop:{shop_id}:context"
        await self.client.set(key, json.dumps(context, default=str), ex=1800)  # 30 min

    async def get_shop_context(self, shop_id: str) -> Optional[dict]:
        key = f"shop:{shop_id}:context"
        data = await self.client.get(key)
        return json.loads(data) if data else None

    async def invalidate_shop_context(self, shop_id: str) -> None:
        key = f"shop:{shop_id}:context"
        await self.client.delete(key)

    async def close(self) -> None:
        if self._client:
            await self._client.close()
            logger.info("Redis connection closed")


# Singleton instance
redis_client = RedisClient()
