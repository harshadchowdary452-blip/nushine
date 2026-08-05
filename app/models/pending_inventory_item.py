import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PendingInventoryItem(Base):
    """A hospital-scoped request for a material not present in the Master Catalogue.

    Hospital admins never create master catalogue items directly. When the required
    material is missing they submit a pending custom item; group admins then approve,
    reject or convert it into a master catalogue item.
    """
    __tablename__ = "pending_inventory_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(50), default="PCS", nullable=False)
    required_quantity: Mapped[float] = mapped_column(Float, nullable=True)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    order_period: Mapped[str] = mapped_column(String(7), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    rollout: Mapped[str] = mapped_column(String(20), default="ALL", nullable=False)
    category_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_categories.id"), nullable=True, index=True)
    converted_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_master.id"), nullable=True, index=True)
    review_notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    hospital = relationship("Hospital")
    category = relationship("InventoryCategory")
    converted_item = relationship("InventoryMaster")
