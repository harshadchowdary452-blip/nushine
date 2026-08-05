import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class HospitalInventory(Base):
    __tablename__ = "hospital_inventory"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_master.id"), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(50), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    minimum_stock: Mapped[float] = mapped_column(Float, nullable=True)
    reorder_level: Mapped[float] = mapped_column(Float, nullable=True)
    critical_level: Mapped[float] = mapped_column(Float, nullable=True)
    maximum_stock: Mapped[float] = mapped_column(Float, nullable=True)
    location: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    hospital = relationship("Hospital", back_populates="inventory_rows")
    item = relationship("InventoryMaster", back_populates="hospital_stock")

    __table_args__ = (
        UniqueConstraint("hospital_id", "item_id", name="uq_hospital_inventory_hospital_item"),
    )
