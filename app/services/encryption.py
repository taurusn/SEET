import base64
import logging

from cryptography.fernet import Fernet

from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet:
    settings = get_settings()
    key = settings.encryption_key
    if not key:
        raise ValueError("ENCRYPTION_KEY is not set")
    # Ensure the key is valid Fernet key (32 url-safe base64-encoded bytes)
    if len(key) == 32:
        key = base64.urlsafe_b64encode(key.encode()).decode()
    return Fernet(key.encode())


def encrypt_token(plaintext: str) -> str:
    """Encrypt an access token for storage."""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a stored access token."""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
