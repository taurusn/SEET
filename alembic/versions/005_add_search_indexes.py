"""Add trigram index for message content search and conversation customer_id index.

Revision ID: 005
Revises: 004
Create Date: 2026-02-27
"""
from typing import Sequence, Union

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index(
        "ix_messages_content_trgm",
        "messages",
        ["content"],
        postgresql_using="gin",
        postgresql_ops={"content": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_conversations_customer_id",
        "conversations",
        ["customer_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_customer_id", table_name="conversations")
    op.drop_index("ix_messages_content_trgm", table_name="messages")
