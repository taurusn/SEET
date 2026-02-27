import json
import logging
from datetime import datetime, timedelta, timezone
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

    # ─── Pub/Sub for Real-time Events ────────────────────────────────────

    async def publish_event(self, shop_id: str, event: dict) -> None:
        """Publish a real-time event for a shop's SSE subscribers."""
        channel = f"events:{shop_id}"
        await self.client.publish(channel, json.dumps(event, default=str))

    async def subscribe_events(self, shop_id: str):
        """Subscribe to a shop's event channel. Returns an async pubsub object."""
        pubsub = self.client.pubsub()
        await pubsub.subscribe(f"events:{shop_id}")
        return pubsub

    # ─── Analytics Tracking ─────────────────────────────────────────────

    ANALYTICS_TTL = 35 * 86400  # 35 days — ~1 month of data

    async def track_message_processed(
        self,
        shop_id: str,
        response_time_ms: int,
        was_escalated: bool,
        sentiment: str,
        hour: int,
    ) -> None:
        """Track a processed message for analytics.

        Uses Redis pipeline for atomic batch writes (single round-trip).
        Keys are per shop per day with 35-day TTL.
        """
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        prefix = f"analytics:{shop_id}:{date_str}"

        pipe = self.client.pipeline()
        pipe.incr(f"{prefix}:messages")
        pipe.expire(f"{prefix}:messages", self.ANALYTICS_TTL)

        if was_escalated:
            pipe.incr(f"{prefix}:escalations")
            pipe.expire(f"{prefix}:escalations", self.ANALYTICS_TTL)

        pipe.incrby(f"{prefix}:rt_sum", response_time_ms)
        pipe.expire(f"{prefix}:rt_sum", self.ANALYTICS_TTL)
        pipe.incr(f"{prefix}:rt_count")
        pipe.expire(f"{prefix}:rt_count", self.ANALYTICS_TTL)

        pipe.incr(f"{prefix}:hourly:{hour}")
        pipe.expire(f"{prefix}:hourly:{hour}", self.ANALYTICS_TTL)

        if sentiment in ("positive", "neutral", "negative"):
            pipe.incr(f"{prefix}:sentiment:{sentiment}")
            pipe.expire(f"{prefix}:sentiment:{sentiment}", self.ANALYTICS_TTL)

        await pipe.execute()

    async def get_analytics(self, shop_id: str, days: int = 7) -> dict:
        """Aggregate analytics over N days.

        Returns: total_messages, total_escalations, ai_handled_pct,
        avg_response_time_ms, messages_by_hour, messages_by_day,
        sentiment_breakdown.
        """
        today = datetime.now(timezone.utc).date()
        total_messages = 0
        total_escalations = 0
        rt_sum = 0
        rt_count = 0
        hourly = [0] * 24
        daily: list[dict] = []
        sentiment = {"positive": 0, "neutral": 0, "negative": 0}

        for i in range(days):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            prefix = f"analytics:{shop_id}:{date_str}"

            pipe = self.client.pipeline()
            pipe.get(f"{prefix}:messages")
            pipe.get(f"{prefix}:escalations")
            pipe.get(f"{prefix}:rt_sum")
            pipe.get(f"{prefix}:rt_count")
            for h in range(24):
                pipe.get(f"{prefix}:hourly:{h}")
            pipe.get(f"{prefix}:sentiment:positive")
            pipe.get(f"{prefix}:sentiment:neutral")
            pipe.get(f"{prefix}:sentiment:negative")
            results = await pipe.execute()

            day_msgs = int(results[0] or 0)
            day_esc = int(results[1] or 0)
            day_rt_sum = int(results[2] or 0)
            day_rt_count = int(results[3] or 0)

            total_messages += day_msgs
            total_escalations += day_esc
            rt_sum += day_rt_sum
            rt_count += day_rt_count

            for h in range(24):
                hourly[h] += int(results[4 + h] or 0)

            sentiment["positive"] += int(results[28] or 0)
            sentiment["neutral"] += int(results[29] or 0)
            sentiment["negative"] += int(results[30] or 0)

            daily.append({"date": date_str, "messages": day_msgs, "escalations": day_esc})

        daily.reverse()  # chronological order

        ai_handled_pct = (
            round((total_messages - total_escalations) / total_messages * 100, 1)
            if total_messages > 0
            else 0
        )
        avg_rt = round(rt_sum / rt_count) if rt_count > 0 else 0

        return {
            "total_messages": total_messages,
            "total_escalations": total_escalations,
            "ai_handled_pct": ai_handled_pct,
            "avg_response_time_ms": avg_rt,
            "messages_by_hour": hourly,
            "messages_by_day": daily,
            "sentiment_breakdown": sentiment,
        }

    async def close(self) -> None:
        if self._client:
            await self._client.close()
            logger.info("Redis connection closed")


# Singleton instance
redis_client = RedisClient()
