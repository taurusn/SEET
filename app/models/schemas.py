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
    Integer,
    Numeric,
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


class CompensationTier(Base):
    __tablename__ = "compensation_tiers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False)
    label = Column(String(255), nullable=False)  # e.g. "مشروب مجاني"
    description = Column(Text, nullable=True)
    value_sar = Column(Numeric(10, 2), nullable=False)
    validity_days = Column(Integer, nullable=False, default=30)
    tier_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    shop = relationship("Shop", backref="compensation_tiers")
    vouchers = relationship("Voucher", back_populates="tier", lazy="select")


class Voucher(Base):
    __tablename__ = "vouchers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=False)
    tier_id = Column(UUID(as_uuid=True), ForeignKey("compensation_tiers.id"), nullable=False)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    handoff_id = Column(UUID(as_uuid=True), ForeignKey("handoff_requests.id"), nullable=True)
    code = Column(String(20), unique=True, nullable=False)
    customer_id = Column(String(255), nullable=False)
    platform = Column(String(20), nullable=False)
    status = Column(String(20), default="issued")  # 'issued', 'redeemed', 'expired'
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    redeemed_at = Column(DateTime(timezone=True), nullable=True)

    shop = relationship("Shop", backref="vouchers")
    tier = relationship("CompensationTier", back_populates="vouchers")
    conversation = relationship("Conversation", backref="vouchers")


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


# ─── Compensation & Voucher Schemas ──────────────────────────────────────────


class VoucherStatusEnum(str, Enum):
    issued = "issued"
    redeemed = "redeemed"
    expired = "expired"


class CompensationTierCreate(BaseModel):
    label: str
    description: Optional[str] = None
    value_sar: float
    validity_days: int = 30
    tier_order: int = 0


class CompensationTierUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    value_sar: Optional[float] = None
    validity_days: Optional[int] = None
    tier_order: Optional[int] = None
    is_active: Optional[bool] = None


class CompensationTierResponse(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    label: str
    description: Optional[str] = None
    value_sar: float
    validity_days: int
    tier_order: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class VoucherIssue(BaseModel):
    tier_id: uuid.UUID
    conversation_id: uuid.UUID
    handoff_id: Optional[uuid.UUID] = None
    customer_id: str
    platform: str


class VoucherResponse(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    tier_id: uuid.UUID
    conversation_id: uuid.UUID
    handoff_id: Optional[uuid.UUID] = None
    code: str
    customer_id: str
    platform: str
    status: str
    issued_at: datetime
    expires_at: datetime
    redeemed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class VoucherStatsResponse(BaseModel):
    total_issued: int
    total_redeemed: int
    total_expired: int
    total_active: int
    budget_spent_sar: float


# ─── Playground Schemas ──────────────────────────────────────────────────────


class PlaygroundChatRequest(BaseModel):
    conversation_id: uuid.UUID
    message: str = Field(..., min_length=1, max_length=2000)


class PlaygroundChatResponse(BaseModel):
    user_message: MessageResponse
    ai_message: MessageResponse
    handoff_detected: bool = False
