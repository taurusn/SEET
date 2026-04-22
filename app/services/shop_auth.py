"""
Shop owner authentication — bcrypt password hashing + rate/lockout helpers.

Separate from admin auth: shops authenticate with their own email + password
and get a shop-scoped JWT. The admin auth flow lives in app/api/admin_auth.py.
"""

import logging
import re
import secrets

import bcrypt

logger = logging.getLogger(__name__)


# Rate-limit & lockout keys (kept here so admin + dashboard share constants)
LOGIN_IP_KEY = "shop_login_ip"            # hash: attempts / 15min window per IP
LOGIN_EMAIL_KEY = "shop_login_email"      # per-email failure count
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_IP_MAX_ATTEMPTS = 10
LOGIN_EMAIL_MAX_FAILURES = 5
TOKEN_BLACKLIST_KEY = "shop_token_blacklist"  # set per-jti entry


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def hash_password(password: str) -> str:
    """Bcrypt-hash a password. Caller should .strip() first."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time bcrypt verify. Caller should .strip() first."""
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except (ValueError, TypeError):
        return False


def is_valid_email(email: str) -> bool:
    """Cheap email shape check. Deeper validation is out of scope."""
    return bool(EMAIL_RE.match(email))


def validate_password_strength(password: str) -> str | None:
    """Return an error message if weak, None if acceptable.

    Minimum bar: 8 chars, at least one letter, at least one digit.
    Not trying to be a security theater — covers the most common weaknesses
    without annoying users with symbol-requirement rituals.
    """
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not re.search(r"[A-Za-z]", password):
        return "Password must contain at least one letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one digit"
    return None


def generate_temp_password(length: int = 12) -> str:
    """Generate a URL-safe temporary password for admin-issued credentials.

    Uses secrets.token_urlsafe which gives ~1.3 chars of entropy per length
    unit. At length 12 that's ~71 bits — fine for a short-lived temp
    password that the owner MUST rotate on first login.
    """
    return secrets.token_urlsafe(length)[:length]
