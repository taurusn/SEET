"""
Dashboard API — shop owner management endpoints.

All endpoints are JWT-protected and tenant-isolated.
A shop owner can only access their own data.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, exists as sa_exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.schemas import (
    Shop,
    ShopContext,
    Conversation,
    Message,
    HandoffRequest,
    CompensationTier,
    Voucher,
    ShopCreate,
    ShopUpdate,
    ShopResponse,
    ShopContextCreate,
    ShopContextResponse,
    ConversationResponse,
    MessageResponse,
    HandoffRequestResponse,
    CompensationTierCreate,
    CompensationTierUpdate,
    CompensationTierResponse,
    VoucherIssue,
    VoucherResponse,
    VoucherStatsResponse,
    PlaygroundChatRequest,
    PlaygroundChatResponse,
    OwnerReplyRequest,
    CustomerProfile,
    CustomerProfileResponse,
    CustomerProfileUpdate,
)
from app.services.encryption import encrypt_token
from app.services.redis_client import redis_client
from app.services.handoff import resolve_handoff, trigger_handoff
from app.services.export import messages_to_transcript, messages_to_csv, analytics_to_csv
from app.services.ai_pipeline import ai_pipeline
from app.workers.message_worker import get_shop_context, get_recent_messages, save_message, HANDOFF_REPLY
from app.services.voucher import generate_voucher_code, is_voucher_expired
from app.queue.rabbitmq import rabbitmq, OUTBOUND_QUEUE
from app.api.auth import (
    get_current_shop,
    get_current_shop_id,
    create_access_token,
    TokenResponse,
)

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


# ─── Auth ─────────────────────────────────────────────────────────────────────


@router.post("/shops", response_model=TokenResponse, status_code=201)
async def register_shop(data: ShopCreate, db: AsyncSession = Depends(get_db)):
    """Register a new shop and return a JWT for future requests."""
    shop = Shop(
        name=data.name,
        ig_page_id=data.ig_page_id,
        ig_access_token=encrypt_token(data.ig_access_token) if data.ig_access_token else None,
        wa_phone_number_id=data.wa_phone_number_id,
        wa_waba_id=data.wa_waba_id,
        wa_access_token=encrypt_token(data.wa_access_token) if data.wa_access_token else None,
    )
    db.add(shop)
    await db.flush()

    return create_access_token(shop.id)


@router.post("/auth/login", response_model=TokenResponse)
async def login_by_name(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """Login by shop name and return a JWT."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Shop name is required")
    stmt = select(Shop).where(func.lower(Shop.name) == name.lower())
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not shop.is_active:
        raise HTTPException(status_code=403, detail="Shop is deactivated")
    return create_access_token(shop.id)


@router.post("/auth/token", response_model=TokenResponse)
async def refresh_shop_token(
    shop: Shop = Depends(get_current_shop),
):
    """Issue a new JWT for an authenticated shop."""
    return create_access_token(shop.id)


# ─── Shop (own profile) ──────────────────────────────────────────────────────


@router.get("/shop", response_model=ShopResponse)
async def get_my_shop(shop: Shop = Depends(get_current_shop)):
    """Get the authenticated shop's profile."""
    return shop


@router.patch("/shop", response_model=ShopResponse)
async def update_my_shop(
    data: ShopUpdate,
    shop: Shop = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    """Update the authenticated shop's profile."""
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


# ─── Shop Context ────────────────────────────────────────────────────────────


@router.post("/shop/context", response_model=ShopContextResponse, status_code=201)
async def add_shop_context(
    data: ShopContextCreate,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    ctx = ShopContext(
        shop_id=shop_id,
        context_type=data.context_type,
        content=data.content,
    )
    db.add(ctx)
    await db.flush()

    await redis_client.invalidate_shop_context(str(shop_id))
    return ctx


@router.get("/shop/context", response_model=list[ShopContextResponse])
async def list_shop_context(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ShopContext).where(ShopContext.shop_id == shop_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.delete("/shop/context/{context_id}", status_code=204)
async def delete_shop_context(
    context_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
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


# ─── Conversations ───────────────────────────────────────────────────────────


@router.get("/shop/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    status: Optional[str] = None,
    platform: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Conversation).where(Conversation.shop_id == shop_id)
    if status:
        stmt = stmt.where(Conversation.status == status)
    if platform:
        stmt = stmt.where(Conversation.platform == platform)
    if search:
        safe = search.replace("%", r"\%").replace("_", r"\_")
        msg_match = (
            sa_exists()
            .where(Message.conversation_id == Conversation.id)
            .where(Message.content.ilike(f"%{safe}%", escape="\\"))
        )
        stmt = stmt.where(
            Conversation.customer_id.ilike(f"%{safe}%", escape="\\") | msg_match
        )
    stmt = stmt.order_by(Conversation.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/shop/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    # Verify the conversation belongs to this shop
    convo_stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.shop_id == shop_id,
    )
    convo_result = await db.execute(convo_stmt)
    if not convo_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/shop/conversations/{conversation_id}/reply",
    response_model=MessageResponse,
)
async def owner_reply(
    conversation_id: uuid.UUID,
    data: OwnerReplyRequest,
    shop: Shop = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    """Send a custom reply from the shop owner to the customer.

    Only allowed when conversation is in 'human' mode (active handoff).
    """
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.shop_id == shop.id,
    )
    result = await db.execute(stmt)
    convo = result.scalar_one_or_none()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if convo.status != "human":
        raise HTTPException(
            status_code=400,
            detail="Can only reply when conversation is in human mode",
        )

    if convo.platform == "playground":
        raise HTTPException(
            status_code=400,
            detail="Cannot send replies to playground conversations",
        )

    outbound_msg = await save_message(
        db, convo.id, "outbound", data.message, "human"
    )
    await db.commit()

    await rabbitmq.publish(OUTBOUND_QUEUE, {
        "conversation_id": str(convo.id),
        "platform": convo.platform,
        "customer_id": convo.customer_id,
        "shop_id": str(shop.id),
        "reply": data.message,
        "message_id": str(outbound_msg.id),
    })

    # Publish SSE event for live updates
    await redis_client.publish_event(str(shop.id), {
        "type": "new_message",
        "direction": "outbound",
        "conversation_id": str(convo.id),
        "sender_type": "human",
        "preview": data.message[:100],
    })

    return outbound_msg


@router.get("/shop/conversations/{conversation_id}/export")
async def export_conversation(
    conversation_id: uuid.UUID,
    format: str = Query("txt", pattern="^(txt|csv)$"),
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Export a conversation transcript as text or CSV."""
    convo_stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.shop_id == shop_id,
    )
    convo_result = await db.execute(convo_stmt)
    if not convo_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
    )
    result = await db.execute(stmt)
    messages = [
        {
            "created_at": m.created_at,
            "direction": m.direction,
            "sender_type": m.sender_type,
            "content": m.content,
        }
        for m in result.scalars()
    ]

    if format == "csv":
        content = messages_to_csv(messages)
        media_type = "text/csv"
        filename = f"conversation-{conversation_id}.csv"
    else:
        content = messages_to_transcript(messages)
        media_type = "text/plain"
        filename = f"conversation-{conversation_id}.txt"

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/shop/conversations/{conversation_id}/close")
async def close_conversation(
    conversation_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Manually close a conversation."""
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.shop_id == shop_id,
    )
    result = await db.execute(stmt)
    convo = result.scalar_one_or_none()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if convo.status == "closed":
        raise HTTPException(status_code=400, detail="Conversation is already closed")

    convo.status = "closed"

    # Auto-resolve any open handoff for this conversation
    open_handoff = await db.execute(
        select(HandoffRequest).where(
            HandoffRequest.conversation_id == conversation_id,
            HandoffRequest.resolved_at.is_(None),
        )
    )
    for h in open_handoff.scalars():
        h.resolved_at = datetime.now(timezone.utc)

    await db.flush()

    try:
        await redis_client.publish_event(str(shop_id), {
            "type": "conversation_updated",
            "conversation_id": str(conversation_id),
            "new_status": "closed",
        })
    except Exception:
        pass  # SSE notification is best-effort; DB changes are already flushed

    return {"status": "closed", "conversation_id": str(conversation_id)}


# ─── Handoff Management ──────────────────────────────────────────────────────


@router.get("/shop/handoffs", response_model=list[HandoffRequestResponse])
async def list_handoffs(
    pending_only: bool = True,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(HandoffRequest)
        .join(Conversation)
        .where(Conversation.shop_id == shop_id)
    )
    if pending_only:
        stmt = stmt.where(HandoffRequest.resolved_at.is_(None))
    stmt = stmt.order_by(HandoffRequest.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/shop/handoffs/{handoff_id}/resolve", status_code=200)
async def resolve_handoff_endpoint(
    handoff_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    # Verify the handoff belongs to this shop
    stmt = (
        select(HandoffRequest)
        .join(Conversation)
        .where(HandoffRequest.id == handoff_id, Conversation.shop_id == shop_id)
    )
    result = await db.execute(stmt)
    handoff = result.scalar_one_or_none()
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")

    await resolve_handoff(db, str(handoff.conversation_id))

    # Publish SSE event for live updates
    await redis_client.publish_event(str(shop_id), {
        "type": "conversation_updated",
        "conversation_id": str(handoff.conversation_id),
        "new_status": "ai",
    })

    return {"status": "resolved", "conversation_id": str(handoff.conversation_id)}


# ─── Stats ───────────────────────────────────────────────────────────────────


@router.get("/shop/stats")
async def get_shop_stats(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    convo_count = await db.execute(
        select(func.count()).select_from(Conversation).where(
            Conversation.shop_id == shop_id
        )
    )
    msg_count = await db.execute(
        select(func.count())
        .select_from(Message)
        .join(Conversation)
        .where(Conversation.shop_id == shop_id)
    )
    handoff_count = await db.execute(
        select(func.count())
        .select_from(HandoffRequest)
        .join(Conversation)
        .where(
            Conversation.shop_id == shop_id,
            HandoffRequest.resolved_at.is_(None),
        )
    )

    voucher_count = await db.execute(
        select(func.count())
        .select_from(Voucher)
        .where(Voucher.shop_id == shop_id, Voucher.status == "issued")
    )

    return {
        "total_conversations": convo_count.scalar(),
        "total_messages": msg_count.scalar(),
        "active_handoffs": handoff_count.scalar(),
        "active_vouchers": voucher_count.scalar(),
    }


# ─── Analytics ───────────────────────────────────────────────────────────────


@router.get("/shop/analytics")
async def get_shop_analytics(
    period: str = Query("7d", pattern="^(today|7d|30d)$"),
    shop_id: uuid.UUID = Depends(get_current_shop_id),
):
    """Get analytics for this shop.

    Period: today (1 day), 7d (7 days), 30d (30 days).
    """
    days_map = {"today": 1, "7d": 7, "30d": 30}
    days = days_map.get(period, 7)
    return await redis_client.get_analytics(str(shop_id), days)


@router.get("/shop/analytics/export")
async def export_analytics(
    period: str = Query("7d", pattern="^(today|7d|30d)$"),
    shop_id: uuid.UUID = Depends(get_current_shop_id),
):
    """Export analytics as CSV."""
    days_map = {"today": 1, "7d": 7, "30d": 30}
    days = days_map.get(period, 7)
    data = await redis_client.get_analytics(str(shop_id), days)
    content = analytics_to_csv(data)
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="analytics-{period}.csv"'},
    )


# ─── Compensation Tiers ─────────────────────────────────────────────────────


@router.post("/shop/compensation-tiers", response_model=CompensationTierResponse, status_code=201)
async def create_compensation_tier(
    data: CompensationTierCreate,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new compensation tier for this shop."""
    tier = CompensationTier(
        shop_id=shop_id,
        label=data.label,
        description=data.description,
        value_sar=data.value_sar,
        validity_days=data.validity_days,
        tier_order=data.tier_order,
    )
    db.add(tier)
    await db.flush()
    return tier


@router.get("/shop/compensation-tiers", response_model=list[CompensationTierResponse])
async def list_compensation_tiers(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """List all compensation tiers for this shop."""
    stmt = (
        select(CompensationTier)
        .where(CompensationTier.shop_id == shop_id)
        .order_by(CompensationTier.tier_order.asc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/shop/compensation-tiers/{tier_id}", response_model=CompensationTierResponse)
async def update_compensation_tier(
    tier_id: uuid.UUID,
    data: CompensationTierUpdate,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a compensation tier."""
    stmt = select(CompensationTier).where(
        CompensationTier.id == tier_id, CompensationTier.shop_id == shop_id
    )
    result = await db.execute(stmt)
    tier = result.scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tier, key, value)
    await db.flush()
    return tier


@router.delete("/shop/compensation-tiers/{tier_id}", status_code=204)
async def delete_compensation_tier(
    tier_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a compensation tier."""
    stmt = select(CompensationTier).where(
        CompensationTier.id == tier_id, CompensationTier.shop_id == shop_id
    )
    result = await db.execute(stmt)
    tier = result.scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    await db.delete(tier)
    await db.flush()


# ─── Vouchers ───────────────────────────────────────────────────────────────


@router.post("/shop/vouchers", response_model=VoucherResponse, status_code=201)
async def issue_voucher(
    data: VoucherIssue,
    shop: Shop = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    """Issue a voucher to a customer (approve compensation)."""
    # Verify tier belongs to this shop
    tier_stmt = select(CompensationTier).where(
        CompensationTier.id == data.tier_id, CompensationTier.shop_id == shop.id
    )
    tier_result = await db.execute(tier_stmt)
    tier = tier_result.scalar_one_or_none()
    if not tier:
        raise HTTPException(status_code=404, detail="Compensation tier not found")

    # Verify conversation belongs to this shop
    convo_stmt = select(Conversation).where(
        Conversation.id == data.conversation_id, Conversation.shop_id == shop.id
    )
    convo_result = await db.execute(convo_stmt)
    if not convo_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Generate unique code using shop name as prefix
    prefix = shop.name[:4].upper().replace(" ", "")
    if len(prefix) < 3:
        prefix = "CAFE"
    code = generate_voucher_code(prefix)

    voucher = Voucher(
        shop_id=shop.id,
        tier_id=data.tier_id,
        conversation_id=data.conversation_id,
        handoff_id=data.handoff_id,
        code=code,
        customer_id=data.customer_id,
        platform=data.platform,
        expires_at=datetime.now(timezone.utc) + timedelta(days=tier.validity_days),
    )
    db.add(voucher)
    await db.flush()

    # Build voucher message for real platforms
    outbound = None
    voucher_msg = None
    if data.platform in ("instagram", "whatsapp"):
        voucher_msg = (
            f"هلا! رتبنا لك تعويض: {tier.label}.\n"
            f"كود القسيمة: {code}\n"
            f"صلاحيتها {tier.validity_days} يوم."
        )
        outbound = await save_message(
            db, data.conversation_id, "outbound", voucher_msg, "human"
        )

    # Auto-resolve handoff so conversation returns to AI mode
    await resolve_handoff(
        db, str(data.conversation_id),
        resolution_note=f"[المسؤول رتب تعويض للعميل: {tier.label}. المحادثة رجعت للوضع العادي.]",
    )

    # Commit everything atomically (voucher + message + resolve) before publishing
    await db.commit()

    # Now safe to publish — DB state is consistent
    if outbound and voucher_msg:
        await rabbitmq.publish(OUTBOUND_QUEUE, {
            "conversation_id": str(data.conversation_id),
            "platform": data.platform,
            "customer_id": data.customer_id,
            "shop_id": str(shop.id),
            "reply": voucher_msg,
            "message_id": str(outbound.id),
        })

    return voucher


@router.get("/shop/vouchers", response_model=list[VoucherResponse])
async def list_vouchers(
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """List vouchers for this shop, optionally filtered by status."""
    stmt = select(Voucher).where(Voucher.shop_id == shop_id)
    if status:
        stmt = stmt.where(Voucher.status == status)
    stmt = stmt.order_by(Voucher.issued_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/shop/vouchers/{voucher_id}/redeem", response_model=VoucherResponse)
async def redeem_voucher(
    voucher_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Mark a voucher as redeemed."""
    stmt = select(Voucher).where(
        Voucher.id == voucher_id, Voucher.shop_id == shop_id
    )
    result = await db.execute(stmt)
    voucher = result.scalar_one_or_none()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if voucher.status == "redeemed":
        raise HTTPException(status_code=400, detail="Voucher already redeemed")
    if is_voucher_expired(voucher.expires_at):
        voucher.status = "expired"
        await db.commit()  # persist before raising — HTTPException triggers rollback in get_db
        raise HTTPException(status_code=400, detail="Voucher has expired")

    voucher.status = "redeemed"
    voucher.redeemed_at = datetime.now(timezone.utc)
    await db.flush()
    return voucher


@router.get("/shop/voucher-stats", response_model=VoucherStatsResponse)
async def get_voucher_stats(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Get voucher statistics for this shop (current month)."""
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    base = select(Voucher).where(
        Voucher.shop_id == shop_id,
        Voucher.issued_at >= month_start,
    )

    total = await db.execute(select(func.count()).select_from(base.subquery()))
    redeemed = await db.execute(
        select(func.count()).select_from(
            base.where(Voucher.status == "redeemed").subquery()
        )
    )
    expired = await db.execute(
        select(func.count()).select_from(
            base.where(Voucher.status == "expired").subquery()
        )
    )
    active = await db.execute(
        select(func.count()).select_from(
            base.where(Voucher.status == "issued").subquery()
        )
    )

    # Budget spent = sum of tier values for redeemed vouchers this month
    budget_stmt = (
        select(func.coalesce(func.sum(CompensationTier.value_sar), 0))
        .select_from(Voucher)
        .join(CompensationTier)
        .where(
            Voucher.shop_id == shop_id,
            Voucher.issued_at >= month_start,
            Voucher.status == "redeemed",
        )
    )
    budget_result = await db.execute(budget_stmt)

    return VoucherStatsResponse(
        total_issued=total.scalar() or 0,
        total_redeemed=redeemed.scalar() or 0,
        total_expired=expired.scalar() or 0,
        total_active=active.scalar() or 0,
        budget_spent_sar=float(budget_result.scalar() or 0),
    )


# ─── AI Playground ───────────────────────────────────────────────────────────


@router.post("/shop/playground/conversations", response_model=ConversationResponse, status_code=201)
async def create_playground_conversation(
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new playground conversation."""
    customer_id = f"playground-{uuid.uuid4()}"
    convo = Conversation(
        shop_id=shop_id,
        platform="playground",
        customer_id=customer_id,
        status="ai",
    )
    db.add(convo)
    await db.flush()
    return convo


@router.get("/shop/playground/conversations", response_model=list[ConversationResponse])
async def list_playground_conversations(
    limit: int = Query(50, le=200),
    offset: int = 0,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """List playground conversations for this shop."""
    stmt = (
        select(Conversation)
        .where(Conversation.shop_id == shop_id, Conversation.platform == "playground")
        .order_by(Conversation.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/shop/playground/chat", response_model=PlaygroundChatResponse)
async def playground_chat(
    data: PlaygroundChatRequest,
    shop: Shop = Depends(get_current_shop),
    db: AsyncSession = Depends(get_db),
):
    """Send a message in the playground and get an AI reply."""
    # Verify conversation belongs to this shop and is playground
    stmt = select(Conversation).where(
        Conversation.id == data.conversation_id,
        Conversation.shop_id == shop.id,
        Conversation.platform == "playground",
    )
    result = await db.execute(stmt)
    convo = result.scalar_one_or_none()
    if not convo:
        raise HTTPException(status_code=404, detail="Playground conversation not found")

    # Respect handoff state in playground
    if convo.status == "human":
        user_msg = await save_message(db, convo.id, "inbound", data.message, "customer")
        hold_text = "المحادثة محولة للمسؤول حالياً. استخدم زر حل التحويل للرجوع للذكاء الاصطناعي."
        ai_msg = await save_message(db, convo.id, "outbound", hold_text, "ai")
        return PlaygroundChatResponse(
            user_message=MessageResponse.model_validate(user_msg, from_attributes=True),
            ai_message=MessageResponse.model_validate(ai_msg, from_attributes=True),
            handoff_detected=False,
        )

    # Load history BEFORE saving inbound message to avoid
    # duplicating the current message in Gemini's context.
    history = await get_recent_messages(db, convo.id)

    # Save user message
    user_msg = await save_message(db, convo.id, "inbound", data.message, "customer")

    # Run the AI pipeline — handles prompt composition, parallel
    # Gemini + sentiment calls, handoff extraction, and timing.
    context = await get_shop_context(db, shop)
    result = await ai_pipeline.process(
        context=context,
        conversation_id=str(convo.id),
        customer_id=convo.customer_id,
        text=data.message,
        history=history,
    )

    # Store sentiment on conversation (Sentiment V2: dual tracking)
    inbound_count = len([m for m in history if m.get("direction") == "inbound"]) + 1
    if result.initial_sentiment:
        if not convo.initial_sentiment or inbound_count <= 3:
            convo.initial_sentiment = result.initial_sentiment
    if result.current_sentiment:
        convo.current_sentiment = result.current_sentiment

    # Only track transitions when initial_sentiment is locked (>3 messages)
    locked_initial = convo.initial_sentiment if inbound_count > 3 else ""

    # Track analytics in Redis (same as message_worker)
    await redis_client.track_message_processed(
        shop_id=str(shop.id),
        response_time_ms=result.response_time_ms,
        was_escalated=result.handoff_needed,
        current_sentiment=result.current_sentiment,
        initial_sentiment=locked_initial,
        hour=datetime.now(timezone.utc).hour,
    )

    handoff_detected = result.handoff_needed
    if handoff_detected:
        reply_text = HANDOFF_REPLY
        await trigger_handoff(
            db, str(convo.id), reason=result.handoff_reason or f"رسالة العميل: {data.message}"
        )
    else:
        reply_text = result.reply

    # Save AI reply
    ai_msg = await save_message(db, convo.id, "outbound", reply_text, "ai")

    return PlaygroundChatResponse(
        user_message=MessageResponse.model_validate(user_msg, from_attributes=True),
        ai_message=MessageResponse.model_validate(ai_msg, from_attributes=True),
        handoff_detected=handoff_detected,
    )


@router.delete("/shop/playground/conversations/{conversation_id}", status_code=204)
async def delete_playground_conversation(
    conversation_id: uuid.UUID,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Delete a playground conversation and its messages."""
    stmt = select(Conversation).where(
        Conversation.id == conversation_id,
        Conversation.shop_id == shop_id,
        Conversation.platform == "playground",
    )
    result = await db.execute(stmt)
    convo = result.scalar_one_or_none()
    if not convo:
        raise HTTPException(status_code=404, detail="Playground conversation not found")

    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(Message).where(Message.conversation_id == conversation_id))
    await db.delete(convo)
    await db.flush()


# ─── Customer Profile Endpoints ─────────────────────────────────────────────


@router.get("/shop/customers/{platform}/{customer_id}", response_model=CustomerProfileResponse)
async def get_customer_profile(
    platform: str,
    customer_id: str,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Get a customer profile by platform and customer_id."""
    stmt = select(CustomerProfile).where(
        CustomerProfile.shop_id == shop_id,
        CustomerProfile.platform == platform,
        CustomerProfile.customer_id == customer_id,
    )
    result = await db.execute(stmt)
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Customer profile not found")
    return profile


@router.patch("/shop/customers/{platform}/{customer_id}", response_model=CustomerProfileResponse)
async def update_customer_profile(
    platform: str,
    customer_id: str,
    data: CustomerProfileUpdate,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    """Update a customer profile (display_name, notes)."""
    stmt = select(CustomerProfile).where(
        CustomerProfile.shop_id == shop_id,
        CustomerProfile.platform == platform,
        CustomerProfile.customer_id == customer_id,
    )
    result = await db.execute(stmt)
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Customer profile not found")

    if data.display_name is not None:
        profile.display_name = data.display_name
    if data.notes is not None:
        profile.notes = data.notes

    await db.flush()
    return profile
