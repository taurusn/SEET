"""Initial schema — shops, conversations, messages, handoffs.

Revision ID: 001
Revises:
Create Date: 2026-02-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Shops
    op.create_table(
        "shops",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("ig_page_id", sa.String(100), nullable=True),
        sa.Column("ig_access_token", sa.Text, nullable=True),
        sa.Column("wa_phone_number_id", sa.String(100), nullable=True),
        sa.Column("wa_waba_id", sa.String(100), nullable=True),
        sa.Column("wa_access_token", sa.Text, nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Shop context
    op.create_table(
        "shop_context",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("shop_id", UUID(as_uuid=True), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("context_type", sa.String(50), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Conversations
    op.create_table(
        "conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("shop_id", UUID(as_uuid=True), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), server_default=sa.text("'ai'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("shop_id", "platform", "customer_id", name="uq_shop_platform_customer"),
    )

    # Messages
    op.create_table(
        "messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("sender_type", sa.String(10), nullable=True),
        sa.Column("meta_message_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Handoff requests
    op.create_table(
        "handoff_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("notified", sa.Boolean, server_default=sa.text("false")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Indexes for performance
    op.create_index("ix_shops_ig_page_id", "shops", ["ig_page_id"])
    op.create_index("ix_shops_wa_phone_number_id", "shops", ["wa_phone_number_id"])
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_meta_message_id", "messages", ["meta_message_id"])
    op.create_index("ix_conversations_shop_platform_customer", "conversations", ["shop_id", "platform", "customer_id"])


def downgrade() -> None:
    op.drop_table("handoff_requests")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("shop_context")
    op.drop_table("shops")
