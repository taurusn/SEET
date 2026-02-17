"""
Dashboard API — shop owner management endpoints.

Provides CRUD for shops, shop context, conversations, and handoff management.
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

router = APIRouter(prefix="/api", tags=["dashboard"])


# ─── Shops ───────────────────────────────────────────────────────────────────


@router.post("/shops", response_model=ShopResponse, status_code=201)
async def create_shop(data: ShopCreate, db: AsyncSession = Depends(get_db)):
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
    return shop


@router.get("/shops", response_model=list[ShopResponse])
async def list_shops(
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Shop)
    if is_active is not None:
        stmt = stmt.where(Shop.is_active == is_active)
    stmt = stmt.order_by(Shop.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/shops/{shop_id}", response_model=ShopResponse)
async def get_shop(shop_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop


@router.patch("/shops/{shop_id}", response_model=ShopResponse)
async def update_shop(
    shop_id: uuid.UUID, data: ShopUpdate, db: AsyncSession = Depends(get_db)
):
    stmt = select(Shop).where(Shop.id == shop_id)
    result = await db.execute(stmt)
    shop = result.scalar_one_or_none()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    update_data = data.model_dump(exclude_unset=True)
    # Encrypt tokens if provided
    if "ig_access_token" in update_data and update_data["ig_access_token"]:
        update_data["ig_access_token"] = encrypt_token(update_data["ig_access_token"])
    if "wa_access_token" in update_data and update_data["wa_access_token"]:
        update_data["wa_access_token"] = encrypt_token(update_data["wa_access_token"])

    for key, value in update_data.items():
        setattr(shop, key, value)

    await db.flush()

    # Invalidate cached context
    await redis_client.invalidate_shop_context(str(shop_id))
    return shop


# ─── Shop Context ────────────────────────────────────────────────────────────


@router.post(
    "/shops/{shop_id}/context",
    response_model=ShopContextResponse,
    status_code=201,
)
async def add_shop_context(
    shop_id: uuid.UUID,
    data: ShopContextCreate,
    db: AsyncSession = Depends(get_db),
):
    # Verify shop exists
    shop_stmt = select(Shop).where(Shop.id == shop_id)
    shop_result = await db.execute(shop_stmt)
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


@router.get(
    "/shops/{shop_id}/context",
    response_model=list[ShopContextResponse],
)
async def list_shop_context(
    shop_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    stmt = select(ShopContext).where(ShopContext.shop_id == shop_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.delete("/shops/{shop_id}/context/{context_id}", status_code=204)
async def delete_shop_context(
    shop_id: uuid.UUID,
    context_id: uuid.UUID,
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

    await redis_client.invalidate_shop_context(str(shop_id))


# ─── Conversations ───────────────────────────────────────────────────────────


@router.get(
    "/shops/{shop_id}/conversations",
    response_model=list[ConversationResponse],
)
async def list_conversations(
    shop_id: uuid.UUID,
    status: Optional[str] = None,
    platform: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
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


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
)
async def get_conversation_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
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


@router.get(
    "/shops/{shop_id}/handoffs",
    response_model=list[HandoffRequestResponse],
)
async def list_handoffs(
    shop_id: uuid.UUID,
    pending_only: bool = True,
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


@router.post("/handoffs/{handoff_id}/resolve", status_code=200)
async def resolve_handoff_endpoint(
    handoff_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    stmt = select(HandoffRequest).where(HandoffRequest.id == handoff_id)
    result = await db.execute(stmt)
    handoff = result.scalar_one_or_none()
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")

    await resolve_handoff(db, str(handoff.conversation_id))
    return {"status": "resolved", "conversation_id": str(handoff.conversation_id)}


# ─── Stats ───────────────────────────────────────────────────────────────────


@router.get("/shops/{shop_id}/stats")
async def get_shop_stats(
    shop_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    # Total conversations
    convo_count = await db.execute(
        select(func.count()).select_from(Conversation).where(
            Conversation.shop_id == shop_id
        )
    )
    # Total messages
    msg_count = await db.execute(
        select(func.count())
        .select_from(Message)
        .join(Conversation)
        .where(Conversation.shop_id == shop_id)
    )
    # Active handoffs
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
