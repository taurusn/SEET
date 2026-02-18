"""Add compensation tiers and vouchers tables.

Revision ID: 002
Revises: 001
Create Date: 2026-02-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Compensation tiers
    op.create_table(
        "compensation_tiers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("shop_id", UUID(as_uuid=True), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("value_sar", sa.Numeric(10, 2), nullable=False),
        sa.Column("validity_days", sa.Integer, nullable=False, server_default=sa.text("30")),
        sa.Column("tier_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Vouchers
    op.create_table(
        "vouchers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("shop_id", UUID(as_uuid=True), sa.ForeignKey("shops.id"), nullable=False),
        sa.Column("tier_id", UUID(as_uuid=True), sa.ForeignKey("compensation_tiers.id"), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("handoff_id", UUID(as_uuid=True), sa.ForeignKey("handoff_requests.id"), nullable=True),
        sa.Column("code", sa.String(20), unique=True, nullable=False),
        sa.Column("customer_id", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), server_default=sa.text("'issued'")),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Indexes
    op.create_index("ix_compensation_tiers_shop_id", "compensation_tiers", ["shop_id"])
    op.create_index("ix_vouchers_shop_id", "vouchers", ["shop_id"])
    op.create_index("ix_vouchers_code", "vouchers", ["code"], unique=True)
    op.create_index("ix_vouchers_status", "vouchers", ["status"])
    op.create_index("ix_vouchers_conversation_id", "vouchers", ["conversation_id"])


def downgrade() -> None:
    op.drop_table("vouchers")
    op.drop_table("compensation_tiers")
