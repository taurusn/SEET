"""Add admins table and white-label columns to shops.

Revision ID: 003
Revises: 002
Create Date: 2026-02-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Admins table
    op.create_table(
        "admins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), server_default=sa.text("'admin'")),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_admins_email", "admins", ["email"], unique=True)

    # White-label columns on shops
    op.add_column("shops", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column("shops", sa.Column("brand_color", sa.String(7), nullable=True))
    op.add_column("shops", sa.Column("splash_text", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("shops", "splash_text")
    op.drop_column("shops", "brand_color")
    op.drop_column("shops", "logo_url")
    op.drop_table("admins")
