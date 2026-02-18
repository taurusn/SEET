"""
Dashboard API — shop owner management endpoints.

All endpoints are JWT-protected and tenant-isolated.
A shop owner can only access their own data.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.schemas import (
    Shop,
    ShopContext,
    Conversation,
    Message,
    HandoffRequest,
    ShopCreate,
    ShopUpdate,
    ShopResponse,
    ShopContextCreate,
    ShopContextResponse,
    ConversationResponse,
    MessageResponse,
    HandoffRequestResponse,
)
from app.services.encryption import encrypt_token
from app.services.redis_client import redis_client
from app.services.handoff import resolve_handoff
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
    limit: int = Query(50, le=200),
    offset: int = 0,
    shop_id: uuid.UUID = Depends(get_current_shop_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Conversation).where(Conversation.shop_id == shop_id)
    if status:
        stmt = stmt.where(Conversation.status == status)
    if platform:
        stmt = stmt.where(Conversation.platform == platform)
    stmt = stmt.order_by(Conversation.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/shop/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_conversation_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(50, le=200),
    offset: int = 0,
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

    return {
        "total_conversations": convo_count.scalar(),
        "total_messages": msg_count.scalar(),
        "active_handoffs": handoff_count.scalar(),
    }
