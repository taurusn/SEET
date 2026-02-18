"""Tests for webhook signature verification."""

import hashlib
import hmac

from app.api.webhooks import verify_meta_signature


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
