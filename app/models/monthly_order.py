import uuid
from enum import Enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Float, ForeignKey, UniqueConstraint
from sqlalchemy.types import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MonthlyOrderStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    REVIEWED = "REVIEWED"
    APPROVED = "APPROVED"
    ORDERED = "ORDERED"
    COMPLETED = "COMPLETED"


class MonthlyOrder(Base):
    __tablename__ = "monthly_orders"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    admin_group_id: Mapped[str] = mapped_column(String(36), ForeignKey("admin_groups.id"), nullable=True, index=True)
    order_period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)
    status: Mapped[MonthlyOrderStatus] = mapped_column(
        SAEnum(MonthlyOrderStatus, create_constraint=False, native_enum=False),
        default=MonthlyOrderStatus.DRAFT,
        nullable=False,
        index=True,
    )
    submitted_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    ordered_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_cost_total: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    submitted_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    hospital = relationship("Hospital", back_populates="monthly_orders")
    items = relationship("MonthlyOrderItem", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("hospital_id", "order_period", name="uq_monthly_order_hospital_period"),
    )


class MonthlyOrderItem(Base):
    __tablename__ = "monthly_order_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("monthly_orders.id"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_master.id"), nullable=False, index=True)
    item_name: Mapped[str] = mapped_column(String(255), nullable=True)
    item_code: Mapped[str] = mapped_column(String(50), nullable=True)
    unit: Mapped[str] = mapped_column(String(50), nullable=True)
    current_stock: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    minimum_stock: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    avg_monthly_usage: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    remaining_days: Mapped[float] = mapped_column(Float, nullable=True)
    suggested_quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    required_quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    preferred_supplier_name: Mapped[str] = mapped_column(String(255), nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    order = relationship("MonthlyOrder", back_populates="items")
    item = relationship("InventoryMaster")
