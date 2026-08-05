import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class InventoryCategory(Base):
    __tablename__ = "inventory_categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=True, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    parent_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_categories.id"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    parent = relationship("InventoryCategory", remote_side=[id], back_populates="children")
    children = relationship("InventoryCategory", back_populates="parent", cascade="all, delete-orphan")
    items = relationship("InventoryMaster", foreign_keys="InventoryMaster.category_id", back_populates="category")
