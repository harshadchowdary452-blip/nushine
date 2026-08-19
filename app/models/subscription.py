"""Subscription models for the enterprise SaaS billing system."""

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from sqlalchemy import (
    String, DateTime, Text, Boolean, Integer, ForeignKey,
    Enum as SAEnum, Numeric, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SubscriptionStatus(str, PyEnum):
    TRIAL = "TRIAL"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class SubscriptionType(str, PyEnum):
    PAID = "PAID"
    FREE = "FREE"
    TRIAL = "TRIAL"


class SubscriberType(str, PyEnum):
    ADMIN_GROUP = "ADMIN_GROUP"
    HOSPITAL = "HOSPITAL"


class PaymentMethod(str, PyEnum):
    CASH = "CASH"
    UPI = "UPI"
    BANK_TRANSFER = "BANK_TRANSFER"
    CHEQUE = "CHEQUE"
    OTHER = "OTHER"


class SubscriptionEventType(str, PyEnum):
    CREATED = "CREATED"
    ACTIVATED = "ACTIVATED"
    RENEWED = "RENEWED"
    EXTENDED = "EXTENDED"
    PLAN_CHANGED = "PLAN_CHANGED"
    FREE_GRANTED = "FREE_GRANTED"
    FREE_EXTENDED = "FREE_EXTENDED"
    CANCELLED = "CANCELLED"
    REACTIVATED = "REACTIVATED"
    PAYMENT_RECORDED = "PAYMENT_RECORDED"
    STATUS_CHANGED = "STATUS_CHANGED"


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_hospitals: Mapped[int] = mapped_column(Integer, nullable=True)
    max_doctors: Mapped[int] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    subscriptions = relationship("Subscription", back_populates="plan")


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("subscriber_type", "subscriber_id", name="uq_subscription_tenant"),
        Index("ix_subscription_status", "status"),
        Index("ix_subscription_tenant", "subscriber_type", "subscriber_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscriber_type: Mapped[str] = mapped_column(
        SAEnum(SubscriberType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    subscriber_id: Mapped[str] = mapped_column(String(36), nullable=False)
    plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("subscription_plans.id"), nullable=False)
    subscription_type: Mapped[str] = mapped_column(
        SAEnum(SubscriptionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        SAEnum(SubscriptionStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=SubscriptionStatus.TRIAL.value,
    )
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    grace_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[str] = mapped_column(String(36), nullable=True)
    free_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    free_forever: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    free_reason: Mapped[str] = mapped_column(Text, nullable=True)
    free_notes: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    plan = relationship("SubscriptionPlan", back_populates="subscriptions")
    payments = relationship("SubscriptionPayment", back_populates="subscription", cascade="all, delete-orphan")
    events = relationship("SubscriptionEvent", back_populates="subscription", cascade="all, delete-orphan")


class SubscriptionPayment(Base):
    __tablename__ = "subscription_payments"
    __table_args__ = (
        Index("ix_subscription_payment_sub", "subscription_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id: Mapped[str] = mapped_column(String(36), ForeignKey("subscriptions.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    payment_method: Mapped[str] = mapped_column(
        SAEnum(PaymentMethod, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reference_number: Mapped[str] = mapped_column(String(255), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=True)
    provider_payment_id: Mapped[str] = mapped_column(String(255), nullable=True)
    provider_order_id: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    subscription = relationship("Subscription", back_populates="payments")


class SubscriptionEvent(Base):
    __tablename__ = "subscription_events"
    __table_args__ = (
        Index("ix_subscription_event_sub", "subscription_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id: Mapped[str] = mapped_column(String(36), ForeignKey("subscriptions.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(
        SAEnum(SubscriptionEventType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    previous_plan_id: Mapped[str] = mapped_column(String(36), nullable=True)
    new_plan_id: Mapped[str] = mapped_column(String(36), nullable=True)
    previous_status: Mapped[str] = mapped_column(
        SAEnum(SubscriptionStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    new_status: Mapped[str] = mapped_column(
        SAEnum(SubscriptionStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    performed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    details: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    subscription = relationship("Subscription", back_populates="events")
