"""Tests for token encryption/decryption."""

from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet

import app.services.encryption as enc_module


@pytest.fixture(autouse=True)
def reset_fernet():
    """Reset the cached Fernet instance between tests."""
    enc_module._fernet_instance = None
    yield
    enc_module._fernet_instance = None


class FakeSettings:
    encryption_key = Fernet.generate_key().decode()


class FakeSettingsEmpty:
    encryption_key = ""


def test_encrypt_decrypt_roundtrip():
    with patch("app.services.encryption.get_settings", return_value=FakeSettings()):
        plaintext = "meta-access-token-abc123"
        encrypted = enc_module.encrypt_token(plaintext)
        assert encrypted != plaintext
        decrypted = enc_module.decrypt_token(encrypted)
        assert decrypted == plaintext


def test_different_encryptions_differ():
    with patch("app.services.encryption.get_settings", return_value=FakeSettings()):
        enc1 = enc_module.encrypt_token("same-token")
        enc_module._fernet_instance = None  # force re-init with same key
        enc2 = enc_module.encrypt_token("same-token")
        # Fernet uses random IV, so two encryptions of same text differ
        assert enc1 != enc2


def test_missing_key_raises():
    with patch("app.services.encryption.get_settings", return_value=FakeSettingsEmpty()):
        with pytest.raises(ValueError, match="ENCRYPTION_KEY is not set"):
            enc_module.encrypt_token("test")


def test_invalid_ciphertext_raises():
    with patch("app.services.encryption.get_settings", return_value=FakeSettings()):
        with pytest.raises(Exception):
            enc_module.decrypt_token("not-valid-ciphertext")
