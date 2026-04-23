"""Add per-shop Meta app credentials for multi-tenant webhook routing.

Phase 14: each shop now brings their own Meta App (SEET no longer needs
a Business Portfolio or CR). Webhooks route by shop_id in the URL path,
HMAC verified against that shop's own app_secret.

All three columns are nullable so existing shops keep working via the
global META_APP_SECRET fallback until they're migrated.

Revision ID: 011
Revises: 010
Create Date: 2026-04-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Public identifier — not a secret, shown in admin UI for deep-links
    op.add_column(
        "shops",
        sa.Column("meta_app_id", sa.String(100), nullable=True),
    )
    # Confidential — stored Fernet-encrypted, same key as access tokens
    op.add_column(
        "shops",
        sa.Column("meta_app_secret", sa.Text(), nullable=True),
    )
    # Opaque string the shop's owner/admin pastes into Meta's webhook
    # config. Checked on the GET handshake. Admin picks the value.
    op.add_column(
        "shops",
        sa.Column("meta_verify_token", sa.String(128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("shops", "meta_verify_token")
    op.drop_column("shops", "meta_app_secret")
    op.drop_column("shops", "meta_app_id")
