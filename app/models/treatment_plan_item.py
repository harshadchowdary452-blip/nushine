import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Float, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class TreatmentPlanItem(Base):
    __tablename__ = "treatment_plan_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    treatment_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_types.id"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    procedure_name: Mapped[str] = mapped_column(String(255), nullable=False)
    tooth_numbers: Mapped[str] = mapped_column(Text, nullable=True)
    estimated_visits: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    sequence_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dependency_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plan_items.id"), nullable=True)
    reason_for_change: Mapped[str] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), nullable=True, default=None)
    generated_treatment_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plans.id"), nullable=True)
    assigned_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    assistant_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    case = relationship("Case", back_populates="treatment_plan_items", lazy="selectin")
    treatment_type = relationship("TreatmentType", foreign_keys=[treatment_type_id], lazy="selectin")
    dependency_item = relationship("TreatmentPlanItem", remote_side="TreatmentPlanItem.id", foreign_keys=[dependency_item_id], lazy="selectin")
    generated_treatment = relationship("TreatmentPlan", foreign_keys=[generated_treatment_id], lazy="selectin")
    assigned_doctor = relationship("User", foreign_keys=[assigned_doctor_id], lazy="selectin")
    assistant_doctor = relationship("User", foreign_keys=[assistant_doctor_id], lazy="selectin")
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="selectin")
