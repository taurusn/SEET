"""
Admin API — internal portal for onboarding team.

All endpoints (except seed and login) require admin JWT.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.schemas import (
    Admin,
    Shop,
    ShopContext,
    Conversation,
    Message,
    HandoffRequest,
    Voucher,
    AdminCreate,
    AdminLogin,
    AdminTokenResponse,
    AdminResponse,
    AdminShopCreate,
    AdminShopResponse,
    ShopResponse,
    ShopUpdate,
    ShopContextCreate,
    ShopContextResponse,
)
from app.api.admin_auth import (
    hash_password,
    verify_password,
    create_admin_token,
    get_current_admin,
)
from app.services.encryption import encrypt_token
from app.services.redis_client import redis_client
from app.services.storage import upload_logo, delete_logo

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

ALLOWED_LOGO_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


# ─── Auth ─────────────────────────────────────────────────────────────────────


@router.post("/seed", response_model=AdminTokenResponse, status_code=201)
async def seed_first_admin(data: AdminCreate, db: AsyncSession = Depends(get_db)):
    """Create the first admin account. Only works when no admins exist."""
    count = await db.execute(select(func.count()).select_from(Admin))
    if count.scalar() > 0:
        raise HTTPException(status_code=403, detail="Admin already exists. Use login.")

    admin = Admin(
        email=data.email.lower().strip(),
        password_hash=hash_password(data.password.strip()),
        name=data.name,
    )
    db.add(admin)
    await db.flush()
    return create_admin_token(admin.id, admin.name, admin.role)


@router.post("/login", response_model=AdminTokenResponse)
async def admin_login(data: AdminLogin, db: AsyncSession = Depends(get_db)):
    """Admin login with email + password."""
    stmt = select(Admin).where(Admin.email == data.email.lower().strip())
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(data.password.strip(), admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return create_admin_token(admin.id, admin.name, admin.role)


@router.get("/me", response_model=AdminResponse)
async def get_admin_profile(admin: Admin = Depends(get_current_admin)):
    """Get the current admin's profile."""
    return admin


# ─── Shops ────────────────────────────────────────────────────────────────────


@router.get("/shops", response_model=list[AdminShopResponse])
async def list_all_shops(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all shops with basic stats (single query with subqueries)."""
    convo_sub = (
        select(func.count())
        .where(Conversation.shop_id == Shop.id)
        .correlate(Shop)
        .scalar_subquery()
    )
    handoff_sub = (
        select(func.count())
        .where(
            HandoffRequest.conversation_id == Conversation.id,
            Conversation.shop_id == Shop.id,
            HandoffRequest.resolved_at.is_(None),
        )
        .correlate(Shop)
        .scalar_subquery()
    )

    stmt = select(Shop, convo_sub.label("convo_count"), handoff_sub.label("handoff_count"))
    if search:
        stmt = stmt.where(Shop.name.ilike(f"%{search}%"))
    if is_active is not None:
        stmt = stmt.where(Shop.is_active == is_active)
    stmt = stmt.order_by(Shop.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(stmt)
    rows = result.all()

    return [
        AdminShopResponse(
            id=shop.id,
            name=shop.name,
            ig_page_id=shop.ig_page_id,
            wa_phone_number_id=shop.wa_phone_number_id,
            wa_waba_id=shop.wa_waba_id,
            is_active=shop.is_active,
            logo_url=shop.logo_url,
            brand_color=shop.brand_color,
            splash_text=shop.splash_text,
            created_at=shop.created_at,
            total_conversations=convo_count or 0,
            active_handoffs=handoff_count or 0,
        )
        for shop, convo_count, handoff_count in rows
    ]


@router.post("/shops", response_model=ShopResponse, status_code=201)
async def create_shop(
    data: AdminShopCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new shop (onboarding)."""
    shop = Shop(
        name=data.name,
        ig_page_id=data.ig_page_id,
        ig_access_token=encrypt_token(data.ig_access_token) if data.ig_access_token else None,
        wa_phone_number_id=data.wa_phone_number_id,
        wa_waba_id=data.wa_waba_id,
        wa_access_token=encrypt_token(data.wa_access_token) if data.wa_access_token else None,
        logo_url=data.logo_url,
        brand_color=data.brand_color,
        splash_text=data.splash_text,
    )
    db.add(shop)
    await db.flush()
    return shop


@router.get("/shops/{shop_id}", response_model=AdminShopResponse)
async def get_shop_detail(
    shop_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get full shop detail with stats."""
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    convo_count = await db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.shop_id == shop.id)
    )
    handoff_count = await db.execute(
        select(func.count())
        .select_from(HandoffRequest)
        .join(Conversation)
        .where(Conversation.shop_id == shop.id, HandoffRequest.resolved_at.is_(None))
    )

    return AdminShopResponse(
        id=shop.id,
        name=shop.name,
        ig_page_id=shop.ig_page_id,
        wa_phone_number_id=shop.wa_phone_number_id,
        wa_waba_id=shop.wa_waba_id,
        is_active=shop.is_active,
        logo_url=shop.logo_url,
        brand_color=shop.brand_color,
        splash_text=shop.splash_text,
        created_at=shop.created_at,
        total_conversations=convo_count.scalar() or 0,
        active_handoffs=handoff_count.scalar() or 0,
    )


@router.patch("/shops/{shop_id}", response_model=ShopResponse)
async def update_shop(
    shop_id: uuid.UUID,
    data: ShopUpdate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a shop's details."""
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    update_data = data.model_dump(exclude_unset=True)

    if "ig_access_token" in update_data and update_data["ig_access_token"]:
        update_data["ig_access_token"] = encrypt_token(update_data["ig_access_token"])
    if "wa_access_token" in update_data and update_data["wa_access_token"]:
        update_data["wa_access_token"] = encrypt_token(update_data["wa_access_token"])

    for key, value in update_data.items():
        setattr(shop, key, value)

    await db.flush()
    await redis_client.invalidate_shop_context(str(shop.id))
    return shop


@router.post("/shops/{shop_id}/toggle")
async def toggle_shop(
    shop_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Activate or deactivate a shop."""
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    shop.is_active = not shop.is_active
    await db.flush()
    return {"id": str(shop.id), "is_active": shop.is_active}


# ─── Logo Upload ──────────────────────────────────────────────────────────────


@router.post("/shops/{shop_id}/logo", response_model=ShopResponse)
async def upload_shop_logo(
    shop_id: uuid.UUID,
    file: UploadFile = File(...),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Upload a logo for a shop (multipart file → MinIO)."""
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    file_data = await file.read()
    if len(file_data) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 2 MB)")

    ext = ALLOWED_LOGO_TYPES[file.content_type]
    logo_url = upload_logo(str(shop.id), file_data, file.content_type, ext)

    shop.logo_url = logo_url
    await db.flush()
    return shop


@router.delete("/shops/{shop_id}/logo", status_code=204)
async def remove_shop_logo(
    shop_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove a shop's logo from MinIO."""
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    delete_logo(str(shop.id))
    shop.logo_url = None
    await db.flush()


# ─── Shop Context ─────────────────────────────────────────────────────────────


@router.get("/shops/{shop_id}/context", response_model=list[ShopContextResponse])
async def list_shop_context(
    shop_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List a shop's AI context items."""
    stmt = select(ShopContext).where(ShopContext.shop_id == shop_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/shops/{shop_id}/context", response_model=ShopContextResponse, status_code=201)
async def add_shop_context(
    shop_id: uuid.UUID,
    data: ShopContextCreate,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Add an AI context item for a shop."""
    # Verify shop exists
    shop_result = await db.execute(select(Shop).where(Shop.id == shop_id))
    if not shop_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Shop not found")

    ctx = ShopContext(
        shop_id=shop_id,
        context_type=data.context_type,
        content=data.content,
    )
    db.add(ctx)
    await db.flush()
    await redis_client.invalidate_shop_context(str(shop_id))
    return ctx


@router.delete("/shops/{shop_id}/context/{context_id}", status_code=204)
async def delete_shop_context(
    shop_id: uuid.UUID,
    context_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an AI context item."""
    stmt = select(ShopContext).where(
        ShopContext.id == context_id, ShopContext.shop_id == shop_id
    )
    result = await db.execute(stmt)
    ctx = result.scalar_one_or_none()
    if not ctx:
        raise HTTPException(status_code=404, detail="Context not found")
    await db.delete(ctx)
    await db.flush()
    await redis_client.invalidate_shop_context(str(shop_id))


# ─── Platform Stats ──────────────────────────────────────────────────────────


@router.get("/stats")
async def get_platform_stats(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide stats for admin dashboard."""
    total_shops = await db.execute(select(func.count()).select_from(Shop))
    active_shops = await db.execute(
        select(func.count()).select_from(Shop).where(Shop.is_active.is_(True))
    )
    total_conversations = await db.execute(select(func.count()).select_from(Conversation))
    total_messages = await db.execute(select(func.count()).select_from(Message))
    active_handoffs = await db.execute(
        select(func.count()).select_from(HandoffRequest).where(HandoffRequest.resolved_at.is_(None))
    )
    total_vouchers = await db.execute(select(func.count()).select_from(Voucher))

    return {
        "total_shops": total_shops.scalar() or 0,
        "active_shops": active_shops.scalar() or 0,
        "total_conversations": total_conversations.scalar() or 0,
        "total_messages": total_messages.scalar() or 0,
        "active_handoffs": active_handoffs.scalar() or 0,
        "total_vouchers": total_vouchers.scalar() or 0,
    }
