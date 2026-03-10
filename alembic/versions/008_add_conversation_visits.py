"""Add conversation_visits table and current_visit_started_at column.

Phase 11: Visit-based sentiment sessions. Snapshots sentiment per visit
so returning customers get fresh sentiment tracking each time.

Revision ID: 008
Revises: 007
Create Date: 2026-03-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create conversation_visits table
    op.create_table(
        "conversation_visits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("shop_id", UUID(as_uuid=True), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("visit_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("initial_sentiment", sa.String(20), nullable=True),
        sa.Column("current_sentiment", sa.String(20), nullable=True),
        sa.Column("message_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "initial_sentiment IN ('positive', 'neutral', 'negative')",
            name="chk_visit_initial",
        ),
        sa.CheckConstraint(
            "current_sentiment IN ('positive', 'neutral', 'negative')",
            name="chk_visit_current",
        ),
    )

    op.create_index("ix_visits_conversation", "conversation_visits", ["conversation_id"])
    op.create_index("ix_visits_shop_started", "conversation_visits", ["shop_id", sa.text("started_at DESC")])

    # Add current_visit_started_at to conversations
    op.add_column(
        "conversations",
        sa.Column("current_visit_started_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Backfill: set current_visit_started_at = created_at for all existing conversations
    op.execute("UPDATE conversations SET current_visit_started_at = created_at")


def downgrade() -> None:
    op.drop_column("conversations", "current_visit_started_at")
    op.drop_index("ix_visits_shop_started", table_name="conversation_visits")
    op.drop_index("ix_visits_conversation", table_name="conversation_visits")
    op.drop_table("conversation_visits")
