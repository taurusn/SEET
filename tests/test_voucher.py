"""Tests for voucher code generation and validation."""

import re
from datetime import datetime, timedelta, timezone

from app.services.voucher import generate_voucher_code, is_voucher_expired


# ─── Code Generation ──────────────────────────────────────────────────────────


def test_voucher_code_format():
    """Code follows PREFIX-XXXX-XXXX pattern."""
    code = generate_voucher_code("CAFE")
    assert re.match(r"^CAFE-[A-Z0-9]{4}-[A-Z0-9]{4}$", code)


def test_voucher_code_custom_prefix():
    """Custom prefix is used in the generated code."""
    code = generate_voucher_code("SHOP")
    assert code.startswith("SHOP-")


def test_voucher_codes_are_unique():
    """Two generated codes should differ (with overwhelming probability)."""
    codes = {generate_voucher_code() for _ in range(100)}
    assert len(codes) == 100


def test_voucher_code_default_prefix():
    """Default prefix is CAFE."""
    code = generate_voucher_code()
    assert code.startswith("CAFE-")


# ─── Expiry Check ─────────────────────────────────────────────────────────────


def test_expired_voucher():
    """A voucher with expiry in the past is expired."""
    past = datetime.now(timezone.utc) - timedelta(days=1)
    assert is_voucher_expired(past) is True


def test_valid_voucher():
    """A voucher with expiry in the future is still valid."""
    future = datetime.now(timezone.utc) + timedelta(days=30)
    assert is_voucher_expired(future) is False


def test_naive_datetime_treated_as_utc():
    """A naive datetime (no tzinfo) is treated as UTC."""
    past = datetime.utcnow() - timedelta(hours=1)
    assert is_voucher_expired(past) is True
