import uuid
from datetime import datetime, timezone, date
from sqlalchemy import String, DateTime, Text, Float, Boolean, ForeignKey, Enum as SAEnum, Date, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class DiscountType(str, Enum):
    PERCENTAGE = "PERCENTAGE"
    FIXED = "FIXED"
    FIXED_AMOUNT = "FIXED_AMOUNT"


class PaymentStatus(str, Enum):
    DRAFT = "DRAFT"
    PARTIAL = "PARTIAL"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    CANCELLED = "CANCELLED"


class Billing(Base):
    __tablename__ = "billings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    treatment_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plans.id"), nullable=True, index=True)
    original_amount: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False, server_default="0")
    pending_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    discount_type: Mapped[str] = mapped_column(String(20), default=DiscountType.PERCENTAGE.value)
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0)
    discount_reason: Mapped[str] = mapped_column(String(255), nullable=True)
    payment_status: Mapped[PaymentStatus] = mapped_column(SAEnum(PaymentStatus, create_constraint=False), default=PaymentStatus.DRAFT, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    pdf_path: Mapped[str] = mapped_column(String(500), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(50), nullable=True, unique=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=True)
    projected_amount: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), index=True)
    case = relationship("Case", back_populates="billings")
    items = relationship("BillingItem", back_populates="billing", cascade="all, delete-orphan", lazy="selectin")
