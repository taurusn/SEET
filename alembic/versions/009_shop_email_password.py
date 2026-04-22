"""Add shop email + password_hash + must_change_password for real auth.

Phase 12: Replace name-based pseudo-auth with bcrypt email/password.
Existing shops stay logged-out until an admin sets credentials via
POST /api/v1/admin/shops/{id}/credentials, which auto-sets
must_change_password=True so the owner rotates on first login.

Revision ID: 009
Revises: 008
Create Date: 2026-04-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shops",
        sa.Column("email", sa.String(255), nullable=True),
    )
    op.add_column(
        "shops",
        sa.Column("password_hash", sa.Text(), nullable=True),
    )
    op.add_column(
        "shops",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_shops_email",
        "shops",
        ["email"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_shops_email", table_name="shops")
    op.drop_column("shops", "must_change_password")
    op.drop_column("shops", "password_hash")
    op.drop_column("shops", "email")
