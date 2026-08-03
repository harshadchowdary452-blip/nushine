import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Float, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BillingItem(Base):
    """Line item on an invoice. Links a bill to a treatment plan and/or a
    treatment sitting (visit), and carries its own charge/payment figures so the
    invoice is the single source of truth for financials."""
    __tablename__ = "billing_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    billing_id: Mapped[str] = mapped_column(String(36), ForeignKey("billings.id"), nullable=False, index=True)
    treatment_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plans.id"), nullable=True, index=True)
    treatment_sitting_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_sittings.id"), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    net_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pending_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    billing = relationship("Billing", back_populates="items")
    treatment_plan = relationship("TreatmentPlan", lazy="selectin")
    treatment_sitting = relationship("TreatmentSitting", lazy="selectin")

    @property
    def treatment_plan_name(self):
        return self.treatment_plan.treatment_name if self.treatment_plan else None

    @property
    def treatment_sitting_number(self):
        return self.treatment_sitting.sitting_number if self.treatment_sitting else None
