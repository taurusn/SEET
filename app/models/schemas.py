import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


# ─── SQLAlchemy ORM Models ───────────────────────────────────────────────────


class Base(DeclarativeBase):
    pass


class Shop(Base):
    __tablename__ = "shops"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    ig_page_id = Column(String(100), nullable=True)
    ig_access_token = Column(Text, nullable=True)  # stored encrypted
    wa_phone_number_id = Column(String(100), nullable=True)
    wa_waba_id = Column(String(100), nullable=True)
    wa_access_token = Column(Text, nullable=True)  # stored encrypted
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contexts = relationship("ShopContext", back_populates="shop", lazy="select")
    conversations = relationship("Conversation", back_populates="shop", lazy="select")


class ShopContext(Base):
    __tablename__ = "shop_context"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False)
    context_type = Column(String(50), nullable=False)  # 'menu', 'hours', 'faq', 'tone'
    content = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    shop = relationship("Shop", back_populates="contexts")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False)
    platform = Column(String(20), nullable=False)  # 'instagram', 'whatsapp'
    customer_id = Column(String(255), nullable=False)
    status = Column(String(20), default="ai")  # 'ai', 'human', 'closed'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("shop_id", "platform", "customer_id", name="uq_shop_platform_customer"),
    )

    shop = relationship("Shop", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", lazy="select")
    handoff_requests = relationship("HandoffRequest", back_populates="conversation", lazy="select")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    direction = Column(String(10), nullable=False)  # 'inbound', 'outbound'
    content = Column(Text, nullable=False)
    sender_type = Column(String(10), nullable=True)  # 'customer', 'ai', 'human'
    meta_message_id = Column(String(255), nullable=True)
    status = Column(String(20), default="pending")  # 'pending', 'sent', 'failed'
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")


class HandoffRequest(Base):
    __tablename__ = "handoff_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    reason = Column(Text, nullable=True)
    notified = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("Conversation", back_populates="handoff_requests")


# ─── Pydantic Schemas ────────────────────────────────────────────────────────


class PlatformEnum(str, Enum):
    instagram = "instagram"
    whatsapp = "whatsapp"


class DirectionEnum(str, Enum):
    inbound = "inbound"
    outbound = "outbound"


class SenderTypeEnum(str, Enum):
    customer = "customer"
    ai = "ai"
    human = "human"


class ConversationStatusEnum(str, Enum):
    ai = "ai"
    human = "human"
    closed = "closed"


class MessageStatusEnum(str, Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


# ─── Request / Response Schemas ──────────────────────────────────────────────


class ShopCreate(BaseModel):
    name: str
    ig_page_id: Optional[str] = None
    ig_access_token: Optional[str] = None
    wa_phone_number_id: Optional[str] = None
    wa_waba_id: Optional[str] = None
    wa_access_token: Optional[str] = None


class ShopUpdate(BaseModel):
    name: Optional[str] = None
    ig_page_id: Optional[str] = None
    ig_access_token: Optional[str] = None
    wa_phone_number_id: Optional[str] = None
    wa_waba_id: Optional[str] = None
    wa_access_token: Optional[str] = None
    is_active: Optional[bool] = None


class ShopResponse(BaseModel):
    id: uuid.UUID
    name: str
    ig_page_id: Optional[str] = None
    wa_phone_number_id: Optional[str] = None
    wa_waba_id: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ShopContextCreate(BaseModel):
    context_type: str
    content: str


class ShopContextResponse(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    context_type: str
    content: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    platform: str
    customer_id: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    direction: str
    content: str
    sender_type: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HandoffRequestResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    reason: Optional[str] = None
    notified: bool
    resolved_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InboundQueueMessage(BaseModel):
    platform: PlatformEnum
    payload: dict
    received_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class OutboundQueueMessage(BaseModel):
    conversation_id: str
    platform: PlatformEnum
    customer_id: str
    shop_id: str
    reply: str
    message_id: str
