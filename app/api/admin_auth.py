"""
Admin JWT Authentication.

Separate auth flow from shop owners — admins login with email + password.
"""

import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.database import get_db
from app.models.schemas import Admin, AdminTokenResponse

security = HTTPBearer()

ALGORITHM = "HS256"
ADMIN_TOKEN_EXPIRE_HOURS = 12


class AdminTokenPayload(BaseModel):
    admin_id: str
    role: str
    name: str
    exp: datetime


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_admin_token(admin_id: uuid.UUID, name: str, role: str = "admin") -> AdminTokenResponse:
    """Create a JWT for an admin user."""
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS)

    payload = {
        "admin_id": str(admin_id),
        "role": role,
        "name": name,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)

    return AdminTokenResponse(
        access_token=token,
        admin_id=str(admin_id),
        name=name,
        expires_at=expires_at,
    )


def decode_admin_token(token: str) -> AdminTokenPayload:
    """Decode and validate an admin JWT."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return AdminTokenPayload(**payload)
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


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Admin:
    """Dependency: extract admin from JWT and verify they exist + are active."""
    token_data = decode_admin_token(credentials.credentials)

    if token_data.role not in ("admin", "superadmin", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not an admin token",
        )

    stmt = select(Admin).where(Admin.id == token_data.admin_id)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin not found",
        )
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is deactivated",
        )
    return admin


def require_role(*allowed_roles: str):
    """Dependency factory: checks the admin has one of the allowed roles."""
    async def _check(admin: Admin = Depends(get_current_admin)):
        if admin.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return admin
    return _check
