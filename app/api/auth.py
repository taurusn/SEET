"""
JWT Authentication & Tenant Isolation.

Each shop owner gets a JWT containing their shop_id.
All dashboard endpoints are scoped to that shop — no cross-tenant access.
"""

import uuid
from datetime import datetime, timezone, timedelta


import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.database import get_db
from app.models.schemas import Shop
from app.services.redis_client import redis_client

security = HTTPBearer()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24


class TokenPayload(BaseModel):
    shop_id: str
    jti: str
    must_change_password: bool = False
    exp: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    shop_id: str
    expires_at: datetime
    must_change_password: bool = False


def create_access_token(
    shop_id: uuid.UUID, must_change_password: bool = False
) -> TokenResponse:
    """Create a JWT scoped to a specific shop.

    Includes a random jti so individual tokens can be revoked
    (logout / password change / admin force-out).
    """
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)

    payload = {
        "shop_id": str(shop_id),
        "jti": uuid.uuid4().hex,
        "must_change_password": must_change_password,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)

    return TokenResponse(
        access_token=token,
        shop_id=str(shop_id),
        expires_at=expires_at,
        must_change_password=must_change_password,
    )


def decode_token(token: str) -> TokenPayload:
    """Decode and validate a JWT."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        # Back-compat: older tokens may lack jti; fall back to a stable sentinel
        # so blacklist lookups never crash, but those tokens can't be revoked.
        payload.setdefault("jti", "")
        return TokenPayload(**payload)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


async def get_current_shop(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Shop:
    """Dependency: extract shop from JWT and verify it exists + is active.

    This is the tenant isolation gate — every dashboard endpoint
    uses this dependency so a shop can only access its own data.
    """
    token_data = decode_token(credentials.credentials)

    if token_data.jti and await redis_client.is_token_blacklisted(token_data.jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revoked",
        )

    stmt = select(Shop).where(Shop.id == token_data.shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()

    if not shop:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Shop not found",
        )
    if not shop.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Shop is deactivated",
        )
    return shop


async def get_current_shop_id(
    shop: Shop = Depends(get_current_shop),
) -> uuid.UUID:
    """Convenience dependency returning just the shop UUID."""
    return shop.id


async def get_current_token_payload(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> TokenPayload:
    """Dependency to access raw JWT claims — used by logout to get the jti."""
    return decode_token(credentials.credentials)
