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


async def process_dead_letter(msg: dict) -> None:
    """Process a message from the dead letter queue.

    In production this would:
    - Send alerts (Slack, PagerDuty, etc.)
    - Store in a dead letter table for manual review
    - Attempt smart retry based on failure reason

    For now: log with full context and track metrics in Redis.
    """
    reason = msg.pop("_dlq_reason", "unknown")
    platform = msg.get("platform", "unknown")
    shop_id = msg.get("shop_id", "unknown")
    customer_id = msg.get("customer_id", "unknown")

    logger.error(
        "DLQ message | reason=%s platform=%s shop=%s customer=%s",
        reason, platform, shop_id, customer_id,
    )

    # Track count for monitoring
    await redis_client.client.incr(DLQ_COUNTER_KEY)

    # Store last 100 failures for dashboard visibility
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
