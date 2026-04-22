"""Drop deprecated sentiment column from conversations.

Phase 10 cleanup: the old `sentiment` column was replaced by
`initial_sentiment` and `current_sentiment` in migration 006.

Revision ID: 007
Revises: 006
Create Date: 2026-03-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # safe-migration: contract phase for the sentiment refactor. Migration
    # 006 added initial_sentiment + current_sentiment and the code switched
    # to reading those columns in the same release, so the old `sentiment`
    # column is definitely unused by the time this runs.
    op.drop_column("conversations", "sentiment")


def downgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("sentiment", sa.String(20), nullable=True),
    )
    # Restore data from current_sentiment
    op.execute(
        "UPDATE conversations SET sentiment = current_sentiment "
        "WHERE current_sentiment IS NOT NULL"
    )
