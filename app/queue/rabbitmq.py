import json
import logging
from typing import Any, Callable, Awaitable, Optional

import aio_pika
from aio_pika import Message as AMQPMessage, DeliveryMode, ExchangeType
from aio_pika.abc import AbstractRobustConnection, AbstractChannel

from app.config import get_settings

logger = logging.getLogger(__name__)

INBOUND_QUEUE = "inbound_messages"
OUTBOUND_QUEUE = "outbound_replies"
DEAD_LETTER_QUEUE = "dead_letter"
DEAD_LETTER_EXCHANGE = "dlx"


class RabbitMQClient:
    """Production-grade RabbitMQ client with dead-letter support."""

    def __init__(self):
        self._connection: Optional[AbstractRobustConnection] = None
        self._channel: Optional[AbstractChannel] = None

    async def connect(self) -> None:
        settings = get_settings()
        self._connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=10)
        await self._setup_queues()
        logger.info("RabbitMQ connected and queues declared")

    async def _setup_queues(self) -> None:
        """Declare exchanges and queues with dead-letter routing."""
        # Dead letter exchange and queue
        dlx = await self._channel.declare_exchange(
            DEAD_LETTER_EXCHANGE, ExchangeType.DIRECT, durable=True
        )
        dl_queue = await self._channel.declare_queue(DEAD_LETTER_QUEUE, durable=True)
        await dl_queue.bind(dlx, routing_key=DEAD_LETTER_QUEUE)

        # Inbound messages queue with DLX
        await self._channel.declare_queue(
            INBOUND_QUEUE,
            durable=True,
            arguments={
                "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
                "x-dead-letter-routing-key": DEAD_LETTER_QUEUE,
            },
        )

        # Outbound replies queue with DLX
        await self._channel.declare_queue(
            OUTBOUND_QUEUE,
            durable=True,
            arguments={
                "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
                "x-dead-letter-routing-key": DEAD_LETTER_QUEUE,
            },
        )

    async def publish(self, queue_name: str, body: dict[str, Any]) -> None:
        """Publish a message to the specified queue."""
        if not self._channel:
            raise RuntimeError("RabbitMQ not connected")

        message = AMQPMessage(
            body=json.dumps(body, default=str).encode(),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        )
        await self._channel.default_exchange.publish(
            message, routing_key=queue_name
        )
        logger.debug("Published message to %s", queue_name)

    async def consume(
        self,
        queue_name: str,
        callback: Callable[[dict], Awaitable[None]],
    ) -> None:
        """Start consuming messages from a queue."""
        if not self._channel:
            raise RuntimeError("RabbitMQ not connected")

        queue = await self._channel.get_queue(queue_name)

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process(requeue=False):
                    try:
                        body = json.loads(message.body.decode())
                        await callback(body)
                    except Exception:
                        logger.exception(
                            "Failed to process message from %s, sent to DLQ",
                            queue_name,
                        )
                        # nack with requeue=False sends to DLX
                        raise

    async def move_to_dead_letter(self, body: dict[str, Any], reason: str = "") -> None:
        """Explicitly move a message to the dead letter queue."""
        body["_dlq_reason"] = reason
        await self.publish(DEAD_LETTER_QUEUE, body)

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            logger.info("RabbitMQ connection closed")


# Singleton instance
rabbitmq = RabbitMQClient()
