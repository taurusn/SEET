"""
Dead Letter Queue Worker — processes failed messages.

Logs failures for alerting/monitoring and stores them for later retry.

Run with: python -m app.workers.dlq_worker
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.queue.rabbitmq import rabbitmq, DEAD_LETTER_QUEUE
from app.services.redis_client import redis_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Track DLQ stats in Redis
DLQ_COUNTER_KEY = "dlq:total_count"
DLQ_RECENT_KEY = "dlq:recent"
DLQ_REASON_KEY = "dlq:reason"  # hash: reason -> count
DLQ_WINDOW_KEY = "dlq:window"  # rolling bucket for rate alerts

# Alert when more than THRESHOLD messages hit the DLQ within WINDOW_SECONDS.
# Adjust via ops once we see baseline traffic.
DLQ_ALERT_THRESHOLD = 10
DLQ_ALERT_WINDOW_SECONDS = 300


def _sanitize_reason(reason: str) -> str:
    """Normalize free-text reasons into a small set of Redis-safe keys."""
    r = (reason or "unknown").strip().lower()
    if not r:
        return "unknown"
    # Collapse verbose "Token decryption failed: <trace>" into a stable key
    return r.split(":", 1)[0].replace(" ", "_")[:64]


async def process_dead_letter(msg: dict) -> None:
    """Process a message from the dead letter queue.

    Persists failure metadata to Redis (total, per-reason, rolling window,
    last-100 entries) and emits a loud warning when the rolling window
    crosses the alert threshold. No paging integration yet — ops reads
    the warning log or the /admin/dlq endpoint.
    """
    reason = msg.pop("_dlq_reason", "unknown")
    reason_key = _sanitize_reason(reason)
    platform = msg.get("platform", "unknown")
    shop_id = msg.get("shop_id", "unknown")
    customer_id = msg.get("customer_id", "unknown")

    logger.error(
        "DLQ message | reason=%s platform=%s shop=%s customer=%s",
        reason, platform, shop_id, customer_id,
    )

    # Total count (ever)
    await redis_client.client.incr(DLQ_COUNTER_KEY)

    # Per-reason breakdown (hash, persists forever — cheap)
    await redis_client.client.hincrby(DLQ_REASON_KEY, reason_key, 1)

    # Rolling window counter — one key per (WINDOW_SECONDS) bucket, TTL
    # covers one extra bucket so we can read recent history if needed.
    now = int(datetime.now(timezone.utc).timestamp())
    bucket = now // DLQ_ALERT_WINDOW_SECONDS
    window_key = f"{DLQ_WINDOW_KEY}:{bucket}"
    current = await redis_client.client.incr(window_key)
    if current == 1:
        await redis_client.client.expire(
            window_key, DLQ_ALERT_WINDOW_SECONDS * 2
        )
    if current == DLQ_ALERT_THRESHOLD:
        logger.critical(
            "DLQ alert: %d messages dead-lettered in the last %ds "
            "(bucket=%d). Check /admin/dlq.",
            current, DLQ_ALERT_WINDOW_SECONDS, bucket,
        )

    # Last 100 failures for dashboard visibility
    entry = f"{datetime.now(timezone.utc).isoformat()}|{reason}|{shop_id}|{customer_id}"
    await redis_client.client.lpush(DLQ_RECENT_KEY, entry)
    await redis_client.client.ltrim(DLQ_RECENT_KEY, 0, 99)


async def main() -> None:
    """Entry point for the DLQ worker."""
    logger.info("Starting DLQ worker...")

    await redis_client.connect()
    await rabbitmq.connect()

    logger.info("DLQ worker consuming from '%s'", DEAD_LETTER_QUEUE)
    await rabbitmq.consume(DEAD_LETTER_QUEUE, process_dead_letter)


if __name__ == "__main__":
    asyncio.run(main())
