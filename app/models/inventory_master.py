import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class InventoryMaster(Base):
    __tablename__ = "inventory_master"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    category_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_categories.id"), nullable=True, index=True)
    sub_category_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_categories.id"), nullable=True, index=True)
    brand: Mapped[str] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[str] = mapped_column(String(255), nullable=True)
    preferred_vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("suppliers.id"), nullable=True, index=True)
    unit: Mapped[str] = mapped_column(String(50), default="PCS", nullable=False)
    purchase_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    average_cost: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    initial_estimated_monthly_usage: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    minimum_stock: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    reorder_level: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    critical_level: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    maximum_stock: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    batch_tracking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expiry_tracking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    image_url: Mapped[str] = mapped_column(String(500), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    category = relationship("InventoryCategory", foreign_keys=[category_id], back_populates="items")
    sub_category = relationship("InventoryCategory", foreign_keys=[sub_category_id])
    preferred_vendor = relationship("Supplier", back_populates="items")
    hospital_stock = relationship("HospitalInventory", back_populates="item", cascade="all, delete-orphan")
    transactions = relationship("InventoryTransaction", back_populates="item", cascade="all, delete-orphan")
