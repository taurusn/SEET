"""
Admin API — internal portal for onboarding team.

All endpoints (except seed and login) require admin JWT.
"""

import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
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
    ConversationVisit,
    ConversationVisitResponse,
    AdminCreate,
    AdminLogin,
    AdminPasswordChange,
    AdminTokenResponse,
    AdminResponse,
    AdminShopCreate,
    AdminShopResponse,
    ShopResponse,
    ShopSetCredentialsRequest,
    ShopUpdate,
    ShopContextCreate,
    ShopContextResponse,
)
from app.api.admin_auth import (
    hash_password,
    verify_password,
    create_admin_token,
    get_current_admin,
    require_role,
)
from app.services.encryption import encrypt_token, decrypt_token
from app.services.redis_client import redis_client
from app.services.storage import upload_logo, delete_logo
from app.services.export import messages_to_csv, analytics_to_csv
from app.services.meta_verify import verify_ig_credentials, verify_wa_credentials
from app.services.shop_auth import (
    hash_password as hash_shop_password,
    is_valid_email,
    validate_password_strength,
    generate_temp_password,
)

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
        role="superadmin",
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


@router.patch("/me/password")
async def change_admin_password(
    data: AdminPasswordChange,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change the current admin's password."""
    if not verify_password(data.current_password.strip(), admin.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    admin.password_hash = hash_password(data.new_password.strip())
    await db.flush()
    return {"message": "Password updated"}


# ─── Admin CRUD ──────────────────────────────────────────────────────────────


@router.get("/admins", response_model=list[AdminResponse])
async def list_admins(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all admin accounts."""
    stmt = select(Admin).order_by(Admin.created_at.asc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/admins", response_model=AdminResponse, status_code=201)
async def create_admin(
    data: AdminCreate,
    admin: Admin = Depends(require_role("admin", "superadmin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new admin account (requires admin role)."""
    existing = await db.execute(
        select(Admin).where(Admin.email == data.email.lower().strip())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    if data.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'viewer'")

    new_admin = Admin(
        email=data.email.lower().strip(),
        password_hash=hash_password(data.password.strip()),
        name=data.name,
        role=data.role,
    )
    db.add(new_admin)
    await db.flush()
    return new_admin


# ─── Shops ────────────────────────────────────────────────────────────────────


@router.get("/shops", response_model=list[AdminShopResponse])
async def list_all_shops(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    sort_by: Optional[str] = Query(None, pattern="^(conversations|handoffs|created|name)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
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
        safe = search.replace("%", r"\%").replace("_", r"\_")
        stmt = stmt.where(Shop.name.ilike(f"%{safe}%", escape="\\"))
    if is_active is not None:
        stmt = stmt.where(Shop.is_active == is_active)

    # Sorting (A-11)
    sort_map = {
        "conversations": convo_sub,
        "handoffs": handoff_sub,
        "created": Shop.created_at,
        "name": Shop.name,
    }
    sort_col = sort_map.get(sort_by, Shop.created_at)
    stmt = stmt.order_by(sort_col.asc() if sort_dir == "asc" else sort_col.desc())
    stmt = stmt.limit(limit).offset(offset)

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
    admin: Admin = Depends(require_role("admin", "superadmin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new shop (onboarding).

    Shops start inactive — they must pass Meta credential verification
    and be explicitly accepted before receiving webhook traffic. See
    POST /admin/shops/{id}/verify and POST /admin/shops/{id}/accept.
    """
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
        is_active=False,
    )
    db.add(shop)
    await db.flush()
    return shop


@router.post("/shops/{shop_id}/verify")
async def verify_shop(
    shop_id: uuid.UUID,
    admin: Admin = Depends(require_role("admin", "superadmin")),
    db: AsyncSession = Depends(get_db),
):
    """Run Meta credential verification against the shop's stored tokens.

    Returns a per-platform result with the list of checks. Read-only —
    does not activate the shop. Callers should follow up with /accept
    once all configured platforms pass.
    """
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    results: list[dict] = []
    any_checked = False

    if shop.ig_page_id or shop.ig_access_token:
        any_checked = True
        try:
            token = decrypt_token(shop.ig_access_token) if shop.ig_access_token else ""
        except Exception as e:
            results.append({
                "platform": "instagram",
                "ok": False,
                "checks": [{"name": "token_decrypt", "ok": False, "detail": str(e)}],
            })
        else:
            results.append(
                (await verify_ig_credentials(token, shop.ig_page_id or "")).to_dict()
            )

    if shop.wa_phone_number_id or shop.wa_access_token:
        any_checked = True
        try:
            token = decrypt_token(shop.wa_access_token) if shop.wa_access_token else ""
        except Exception as e:
            results.append({
                "platform": "whatsapp",
                "ok": False,
                "checks": [{"name": "token_decrypt", "ok": False, "detail": str(e)}],
            })
        else:
            results.append(
                (await verify_wa_credentials(token, shop.wa_phone_number_id or "")).to_dict()
            )

    if not any_checked:
        raise HTTPException(
            status_code=400,
            detail="Shop has no IG or WhatsApp credentials to verify",
        )

    all_ok = all(r["ok"] for r in results)
    return {"shop_id": str(shop.id), "ok": all_ok, "results": results}


@router.post("/shops/{shop_id}/accept")
async def accept_shop(
    shop_id: uuid.UUID,
    admin: Admin = Depends(require_role("admin", "superadmin")),
    db: AsyncSession = Depends(get_db),
):
    """Activate a shop after successful verification.

    Re-runs verification server-side — we never trust a client-side
    "verified" claim. All configured platforms must pass before is_active
    flips to True.
    """
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if shop.is_active:
        return {"shop_id": str(shop.id), "is_active": True, "already_active": True}

    verify_resp = await verify_shop(shop_id=shop_id, admin=admin, db=db)
    if not verify_resp["ok"]:
        raise HTTPException(
            status_code=400,
            detail={"message": "Verification failed — cannot accept", "results": verify_resp["results"]},
        )

    shop.is_active = True
    await db.flush()
    await redis_client.invalidate_shop_context(str(shop.id))
    return {"shop_id": str(shop.id), "is_active": True, "results": verify_resp["results"]}


@router.post("/shops/{shop_id}/credentials")
async def set_shop_credentials(
    shop_id: uuid.UUID,
    data: ShopSetCredentialsRequest,
    admin: Admin = Depends(require_role("admin", "superadmin")),
    db: AsyncSession = Depends(get_db),
):
    """Assign or reset an email + password for a shop.

    Used to migrate pre-auth shops and to issue a reset when an owner
    loses their password (until a self-service reset flow exists).
    The shop owner must rotate this password on first login —
    must_change_password is set to True.

    If password is omitted, a random 12-char password is generated and
    returned in the response. Admin is responsible for delivering it
    out-of-band.
    """
    email = data.email.strip().lower()
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    temp_password = (data.password or "").strip() or generate_temp_password()
    pw_error = validate_password_strength(temp_password)
    if pw_error:
        raise HTTPException(status_code=400, detail=pw_error)

    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # Make sure email isn't taken by a different shop
    conflict = await db.execute(
        select(Shop).where(Shop.email == email, Shop.id != shop_id)
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email is already in use")

    shop.email = email
    shop.password_hash = hash_shop_password(temp_password)
    shop.must_change_password = True

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email is already in use")

    return {
        "shop_id": str(shop.id),
        "email": email,
        "temporary_password": temp_password,
        "must_change_password": True,
    }


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
    admin: Admin = Depends(require_role("admin", "superadmin")),
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
    admin: Admin = Depends(require_role("admin", "superadmin")),
    db: AsyncSession = Depends(get_db),
):
    """Flip a shop's is_active flag.

    The standard onboarding path is POST /shops/{shop_id}/accept, which
    re-verifies Meta credentials server-side. This endpoint is an admin
    override: it flips is_active in either direction without verification,
    for cases where the shop needs to be toggled on/off manually.
    """
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    shop.is_active = not shop.is_active
    await db.flush()
    await redis_client.invalidate_shop_context(str(shop.id))
    return {"id": str(shop.id), "is_active": shop.is_active}


# ─── Logo Upload ──────────────────────────────────────────────────────────────


@router.post("/shops/{shop_id}/logo", response_model=ShopResponse)
async def upload_shop_logo(
    shop_id: uuid.UUID,
    file: UploadFile = File(...),
    admin: Admin = Depends(require_role("admin", "superadmin")),
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
    admin: Admin = Depends(require_role("admin", "superadmin")),
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
    admin: Admin = Depends(require_role("admin", "superadmin")),
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
    admin: Admin = Depends(require_role("admin", "superadmin")),
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


@router.get("/dlq")
async def get_dlq_stats(
    admin: Admin = Depends(get_current_admin),
    limit: int = Query(50, ge=1, le=100),
):
    """Dead-letter queue visibility for ops.

    Returns total lifetime count, per-reason breakdown, and the most
    recent N entries (newest first). Each entry is pipe-delimited:
    timestamp|reason|shop_id|customer_id.
    """
    total_raw = await redis_client.client.get("dlq:total_count")
    reason_counts_raw = await redis_client.client.hgetall("dlq:reason")
    recent = await redis_client.client.lrange("dlq:recent", 0, limit - 1)

    def _parse(entry: str) -> dict:
        parts = entry.split("|", 3)
        while len(parts) < 4:
            parts.append("")
        return {
            "timestamp": parts[0],
            "reason": parts[1],
            "shop_id": parts[2],
            "customer_id": parts[3],
        }

    return {
        "total": int(total_raw or 0),
        "by_reason": {k: int(v) for k, v in (reason_counts_raw or {}).items()},
        "recent": [_parse(e) for e in recent],
    }


# ─── Analytics ──────────────────────────────────────────────────────────────


@router.get("/shops/{shop_id}/analytics")
async def get_shop_analytics_admin(
    shop_id: uuid.UUID,
    period: str = Query("7d", pattern="^(today|7d|30d)$"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics for a specific shop (admin view)."""
    shop = await db.execute(select(Shop).where(Shop.id == shop_id))
    if not shop.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Shop not found")

    days_map = {"today": 1, "7d": 7, "30d": 30}
    return await redis_client.get_analytics(str(shop_id), days_map.get(period, 7))


@router.get("/analytics")
async def get_platform_analytics(
    period: str = Query("7d", pattern="^(today|7d|30d)$"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide analytics aggregated across all active shops."""
    days_map = {"today": 1, "7d": 7, "30d": 30}
    days = days_map.get(period, 7)

    shops_result = await db.execute(
        select(Shop.id).where(Shop.is_active.is_(True))
    )
    shop_ids = [str(row[0]) for row in shops_result.all()]

    totals = {
        "total_messages": 0,
        "total_escalations": 0,
        "avg_response_time_ms": 0,
        "ai_handled_pct": 0,
        "messages_by_hour": [0] * 24,
        "messages_by_day": {},
        "sentiment_breakdown": {"positive": 0, "neutral": 0, "negative": 0},
        "sentiment_transitions": {"resolved": 0, "worsened": 0},
    }
    rt_sum, rt_count = 0, 0

    for sid in shop_ids:
        data = await redis_client.get_analytics(sid, days)
        totals["total_messages"] += data.get("total_messages", 0)
        totals["total_escalations"] += data.get("total_escalations", 0)

        # Response time weighted average
        shop_msgs = data.get("total_messages", 0)
        shop_rt = data.get("avg_response_time_ms", 0)
        if shop_msgs > 0 and shop_rt > 0:
            rt_sum += shop_rt * shop_msgs
            rt_count += shop_msgs

        # Hourly
        for i, v in enumerate(data.get("messages_by_hour", [])):
            totals["messages_by_hour"][i] += v

        # Daily
        for day in data.get("messages_by_day", []):
            d = day.get("date", "")
            if d not in totals["messages_by_day"]:
                totals["messages_by_day"][d] = {"date": d, "messages": 0, "escalations": 0}
            totals["messages_by_day"][d]["messages"] += day.get("messages", 0)
            totals["messages_by_day"][d]["escalations"] += day.get("escalations", 0)

        # Sentiment
        sb = data.get("sentiment_breakdown", {})
        totals["sentiment_breakdown"]["positive"] += sb.get("positive", 0)
        totals["sentiment_breakdown"]["neutral"] += sb.get("neutral", 0)
        totals["sentiment_breakdown"]["negative"] += sb.get("negative", 0)

        # Transitions
        st = data.get("sentiment_transitions", {})
        totals["sentiment_transitions"]["resolved"] += st.get("resolved", 0)
        totals["sentiment_transitions"]["worsened"] += st.get("worsened", 0)

    total_msgs = totals["total_messages"]
    totals["avg_response_time_ms"] = round(rt_sum / rt_count) if rt_count > 0 else 0
    totals["ai_handled_pct"] = round(
        ((total_msgs - totals["total_escalations"]) / total_msgs * 100) if total_msgs > 0 else 0,
        1,
    )
    totals["messages_by_day"] = sorted(totals["messages_by_day"].values(), key=lambda x: x["date"])

    return totals


@router.get("/activity")
async def get_activity_feed(
    limit: int = Query(20, le=100),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Recent platform events: new shops, handoffs."""
    events = []

    # Recent shops created
    shops_result = await db.execute(
        select(Shop).order_by(Shop.created_at.desc()).limit(limit)
    )
    for s in shops_result.scalars():
        events.append({
            "type": "shop_created",
            "timestamp": s.created_at.isoformat() if s.created_at else "",
            "shop_id": str(s.id),
            "shop_name": s.name,
            "detail": f"New shop onboarded: {s.name}",
        })

    # Recent handoffs
    handoff_result = await db.execute(
        select(HandoffRequest, Conversation, Shop)
        .join(Conversation, HandoffRequest.conversation_id == Conversation.id)
        .join(Shop, Conversation.shop_id == Shop.id)
        .order_by(HandoffRequest.created_at.desc())
        .limit(limit)
    )
    for h, c, s in handoff_result.all():
        events.append({
            "type": "handoff_triggered",
            "timestamp": h.created_at.isoformat() if h.created_at else "",
            "shop_id": str(s.id),
            "shop_name": s.name,
            "detail": h.reason or "Handoff triggered",
        })

    # Sort by timestamp desc and limit
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events[:limit]


# ─── Conversation Audit (A-38) ─────────────────────────────────────────────


@router.get("/shops/{shop_id}/conversations")
async def list_shop_conversations_admin(
    shop_id: uuid.UUID,
    platform: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List conversations for a shop (admin audit view)."""
    shop = await db.execute(select(Shop).where(Shop.id == shop_id))
    if not shop.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Shop not found")

    stmt = select(Conversation).where(Conversation.shop_id == shop_id)
    if platform:
        stmt = stmt.where(Conversation.platform == platform)
    if status:
        stmt = stmt.where(Conversation.status == status)
    stmt = stmt.order_by(Conversation.created_at.desc()).limit(limit).offset(offset)

    result = await db.execute(stmt)
    convos = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "platform": c.platform,
            "customer_id": c.customer_id,
            "status": c.status,
            "initial_sentiment": c.initial_sentiment,
            "current_sentiment": c.current_sentiment,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in convos
    ]


@router.get("/shops/{shop_id}/conversations/{conversation_id}/messages")
async def get_conversation_messages_admin(
    shop_id: uuid.UUID,
    conversation_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get messages for a conversation (admin audit view, read-only)."""
    convo = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.shop_id == shop_id,
        )
    )
    if not convo.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "direction": m.direction,
            "sender_type": m.sender_type,
            "content": m.content,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


@router.get(
    "/shops/{shop_id}/conversations/{conversation_id}/visits",
    response_model=list[ConversationVisitResponse],
)
async def get_conversation_visits_admin(
    shop_id: uuid.UUID,
    conversation_id: uuid.UUID,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get visit history for a conversation (admin audit view)."""
    convo = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.shop_id == shop_id,
        )
    )
    if not convo.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmt = (
        select(ConversationVisit)
        .where(ConversationVisit.conversation_id == conversation_id)
        .order_by(ConversationVisit.visit_number.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# ─── Shop Data Export (A-39) ──────────────────────────────────────────────


@router.get("/shops/{shop_id}/export")
async def export_shop_data(
    shop_id: uuid.UUID,
    type: str = Query("conversations", pattern="^(conversations|analytics)$"),
    period: str = Query("30d", pattern="^(today|7d|30d)$"),
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Export shop data as CSV (conversations or analytics)."""
    shop = await db.execute(select(Shop).where(Shop.id == shop_id))
    s = shop.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Shop not found")

    safe_name = re.sub(r"[^\w\-.]", "_", s.name)

    if type == "analytics":
        days_map = {"today": 1, "7d": 7, "30d": 30}
        data = await redis_client.get_analytics(str(shop_id), days_map.get(period, 30))
        csv_content = analytics_to_csv(data)
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}-analytics-{period}.csv"'},
        )

    # type == "conversations" — single joined query (avoids N+1), capped at 50k rows
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Conversation.shop_id == shop_id)
        .order_by(Message.created_at.asc())
        .limit(50000)
    )
    messages = result.scalars().all()

    all_messages = [
        {
            "conversation_id": str(m.conversation_id),
            "created_at": m.created_at,
            "direction": m.direction,
            "sender_type": m.sender_type,
            "content": m.content,
        }
        for m in messages
    ]

    csv_content = messages_to_csv(all_messages)
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-conversations.csv"'},
    )
