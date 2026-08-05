import uuid
from enum import Enum
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Float, ForeignKey
from sqlalchemy.types import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class InventoryTransactionType(str, Enum):
    PURCHASE = "PURCHASE"
    GOODS_RECEIPT = "GOODS_RECEIPT"
    CONSUMPTION = "CONSUMPTION"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    DAMAGE = "DAMAGE"
    EXPIRY = "EXPIRY"
    CORRECTION = "CORRECTION"
    OPENING_STOCK = "OPENING_STOCK"
    TRANSFER_IN = "TRANSFER_IN"
    TRANSFER_OUT = "TRANSFER_OUT"
    RETURN = "RETURN"


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_master.id"), nullable=False, index=True)
    transaction_type: Mapped[InventoryTransactionType] = mapped_column(
        SAEnum(InventoryTransactionType, create_constraint=False),
        default=InventoryTransactionType.OPENING_STOCK,
        nullable=False,
        index=True,
    )
    previous_balance: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    current_balance: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    batch_number: Mapped[str] = mapped_column(String(100), nullable=True)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=True)
    reference_type: Mapped[str] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[str] = mapped_column(String(36), nullable=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    hospital = relationship("Hospital", back_populates="inventory_transactions")
    item = relationship("InventoryMaster", back_populates="transactions")
