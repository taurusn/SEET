from __future__ import annotations

import logging

from cryptography.fernet import Fernet

from app.config import get_settings

logger = logging.getLogger(__name__)

_fernet_instance: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance

    settings = get_settings()
    key = settings.encryption_key
    if not key:
        raise ValueError("ENCRYPTION_KEY is not set")
    # Expect a valid 44-char url-safe base64-encoded Fernet key.
    # Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    _fernet_instance = Fernet(key.encode())
    return _fernet_instance


def encrypt_token(plaintext: str) -> str:
    """Encrypt an access token for storage."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a stored access token."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
