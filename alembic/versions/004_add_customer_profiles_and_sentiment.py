"""Add customer_profiles table and conversations.sentiment column.

Revision ID: 004
Revises: 003
Create Date: 2026-02-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Customer profiles table
    op.create_table(
        "customer_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("shop_id", UUID(as_uuid=True), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("total_conversations", sa.Integer, server_default=sa.text("1")),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("shop_id", "platform", "customer_id", name="uq_customer_profile"),
    )
    op.create_index(
        "ix_customer_profiles_lookup",
        "customer_profiles",
        ["shop_id", "platform", "customer_id"],
    )

    # Sentiment column on conversations
    op.add_column("conversations", sa.Column("sentiment", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "sentiment")
    op.drop_table("customer_profiles")
