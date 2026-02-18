"""Voucher code generation and validation."""

import secrets
import string
from datetime import datetime, timezone


def generate_voucher_code(prefix: str = "CAFE") -> str:
    """Generate a unique voucher code like CAFE-KH7X-3M9P.

    Uses cryptographically secure random characters.
    """
    alphabet = string.ascii_uppercase + string.digits
    segment1 = "".join(secrets.choice(alphabet) for _ in range(4))
    segment2 = "".join(secrets.choice(alphabet) for _ in range(4))
    return f"{prefix}-{segment1}-{segment2}"


def is_voucher_expired(expires_at: datetime) -> bool:
    """Check if a voucher has passed its expiry date."""
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return now > expires_at
