"""Add initial_sentiment and current_sentiment columns to conversations.

Part of Sentiment V2: conversation-aware dual sentiment analysis.
Keeps the old `sentiment` column for backward compatibility during transition.
Drop it later in migration 007.

Revision ID: 006
Revises: 005
Create Date: 2026-03-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new sentiment columns
    op.add_column(
        "conversations",
        sa.Column("initial_sentiment", sa.String(20), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("current_sentiment", sa.String(20), nullable=True),
    )

    # CHECK constraints for data integrity
    op.execute(
        "ALTER TABLE conversations ADD CONSTRAINT chk_initial_sentiment "
        "CHECK (initial_sentiment IN ('positive', 'neutral', 'negative'))"
    )
    op.execute(
        "ALTER TABLE conversations ADD CONSTRAINT chk_current_sentiment "
        "CHECK (current_sentiment IN ('positive', 'neutral', 'negative'))"
    )

    # Composite index for transition queries and conversation listing
    op.create_index(
        "ix_conversations_shop_created",
        "conversations",
        ["shop_id", sa.text("created_at DESC")],
    )

    # Backfill: copy existing sentiment data to current_sentiment
    op.execute(
        "UPDATE conversations SET current_sentiment = sentiment "
        "WHERE sentiment IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_shop_created", table_name="conversations")
    op.execute("ALTER TABLE conversations DROP CONSTRAINT IF EXISTS chk_current_sentiment")
    op.execute("ALTER TABLE conversations DROP CONSTRAINT IF EXISTS chk_initial_sentiment")
    op.drop_column("conversations", "current_sentiment")
    op.drop_column("conversations", "initial_sentiment")
