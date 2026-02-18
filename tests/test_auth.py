"""Tests for JWT authentication."""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import jwt
import pytest

from app.api.auth import create_access_token, decode_token, TokenPayload


MOCK_SECRET = "test-jwt-secret-key-for-testing"


class FakeSettings:
    jwt_secret = MOCK_SECRET


@pytest.fixture(autouse=True)
def mock_settings():
    with patch("app.api.auth.get_settings", return_value=FakeSettings()):
        yield


def test_create_and_decode_token():
    shop_id = uuid.uuid4()
    token_resp = create_access_token(shop_id)

    assert token_resp.shop_id == str(shop_id)
    assert token_resp.token_type == "bearer"
    assert token_resp.access_token

    payload = decode_token(token_resp.access_token)
    assert payload.shop_id == str(shop_id)


def test_expired_token_raises():
    payload = {
        "shop_id": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        "iat": datetime.now(timezone.utc) - timedelta(hours=2),
    }
    token = jwt.encode(payload, MOCK_SECRET, algorithm="HS256")

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        decode_token(token)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_invalid_token_raises():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        decode_token("this.is.garbage")
    assert exc_info.value.status_code == 401


def test_token_with_wrong_secret():
    payload = {
        "shop_id": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(payload, "wrong-secret", algorithm="HS256")

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        decode_token(token)
    assert exc_info.value.status_code == 401
