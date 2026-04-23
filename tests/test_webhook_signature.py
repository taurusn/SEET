"""Tests for webhook signature verification."""

import hashlib
import hmac

from app.api.webhooks import verify_meta_signature, _hmac_matches


class FakeSettings:
    meta_app_secret = "test_secret_key_123"


def _make_signature(body: bytes, secret: str) -> str:
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def test_valid_signature(monkeypatch):
    monkeypatch.setattr("app.api.webhooks.get_settings", lambda: FakeSettings())
    body = b'{"entry": [{"id": "123"}]}'
    sig = _make_signature(body, "test_secret_key_123")
    assert verify_meta_signature(body, sig) is True


def test_invalid_signature(monkeypatch):
    monkeypatch.setattr("app.api.webhooks.get_settings", lambda: FakeSettings())
    body = b'{"entry": [{"id": "123"}]}'
    assert verify_meta_signature(body, "sha256=wrong") is False


def test_missing_signature(monkeypatch):
    monkeypatch.setattr("app.api.webhooks.get_settings", lambda: FakeSettings())
    body = b'{"entry": []}'
    assert verify_meta_signature(body, "") is False


def test_no_sha256_prefix(monkeypatch):
    monkeypatch.setattr("app.api.webhooks.get_settings", lambda: FakeSettings())
    body = b'{"entry": []}'
    assert verify_meta_signature(body, "md5=abc123") is False


def test_tampered_body(monkeypatch):
    monkeypatch.setattr("app.api.webhooks.get_settings", lambda: FakeSettings())
    original = b'{"entry": [{"id": "123"}]}'
    sig = _make_signature(original, "test_secret_key_123")
    tampered = b'{"entry": [{"id": "HACKED"}]}'
    assert verify_meta_signature(tampered, sig) is False


# ─── Per-shop HMAC (new architecture) ────────────────────────────────────────


def test_hmac_matches_with_shop_secret():
    """Core per-shop HMAC helper — works with an arbitrary secret."""
    body = b'{"entry": [{"id": "abc"}]}'
    shop_secret = "some_shop_specific_secret_xyz"
    sig = _make_signature(body, shop_secret)
    assert _hmac_matches(body, sig, shop_secret) is True


def test_hmac_matches_rejects_wrong_secret():
    body = b'{"entry": [{"id": "abc"}]}'
    right_secret = "real_shop_secret"
    wrong_secret = "different_shop_secret"
    sig = _make_signature(body, right_secret)
    # Signature was made with right_secret, but we're verifying with wrong_secret
    assert _hmac_matches(body, sig, wrong_secret) is False


def test_hmac_matches_rejects_bad_header():
    body = b'{"entry": []}'
    assert _hmac_matches(body, "", "any_secret") is False
    assert _hmac_matches(body, "md5=abc", "any_secret") is False
    assert _hmac_matches(body, "sha256=", "any_secret") is False


def test_per_shop_and_global_secrets_are_isolated():
    """A signature valid for shop A must NOT be valid for shop B (or the
    global fallback). Confirms multi-tenant isolation."""
    body = b'{"entry": []}'
    shop_a_secret = "shop-a-secret"
    shop_b_secret = "shop-b-secret"
    global_secret = "global-secret"

    sig_from_a = _make_signature(body, shop_a_secret)

    assert _hmac_matches(body, sig_from_a, shop_a_secret) is True
    assert _hmac_matches(body, sig_from_a, shop_b_secret) is False
    assert _hmac_matches(body, sig_from_a, global_secret) is False
