"""Add shop moderation_mode + message approval_state for human-in-the-loop review.

Phase 13: when a shop is set to 'pending' mode, inbound customer messages
are saved and parked awaiting admin approval; no AI reply runs until the
admin clicks Approve. Auto mode (default) keeps today's behavior.

Revision ID: 010
Revises: 009
Create Date: 2026-04-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Shop-level switch: 'auto' (today's behavior) or 'pending' (queue for admin)
    op.add_column(
        "shops",
        sa.Column(
            "moderation_mode",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'auto'"),
        ),
    )

    # Per-message approval state — only set on inbound messages for shops in
    # 'pending' mode. Values: pending | approved | rejected. NULL = not
    # applicable (old rows, auto-mode shops, outbound messages).
    op.add_column(
        "messages",
        sa.Column("approval_state", sa.String(20), nullable=True),
    )
    op.create_index(
        "ix_messages_approval_state",
        "messages",
        ["approval_state"],
    )


def downgrade() -> None:
    op.drop_index("ix_messages_approval_state", table_name="messages")
    op.drop_column("messages", "approval_state")
    op.drop_column("shops", "moderation_mode")
