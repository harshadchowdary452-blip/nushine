import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Float, Integer, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class TreatmentPlanStatus(str, Enum):
    PLANNED = "PLANNED"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    FOLLOW_UP = "FOLLOW_UP"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class TreatmentPlan(Base):
    __tablename__ = "treatment_plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    treatment_number: Mapped[str] = mapped_column(String(20), nullable=True, unique=True)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False)
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=False)
    treatment_template_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_templates.id"), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    cost: Mapped[float] = mapped_column(Float, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_sittings: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    completed_sittings: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    remaining_sittings: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=True)
    expected_completion_date: Mapped[date] = mapped_column(Date, nullable=True)
    next_appointment_date: Mapped[date] = mapped_column(Date, nullable=True)
    status: Mapped[TreatmentPlanStatus] = mapped_column(SAEnum(TreatmentPlanStatus, create_constraint=False), default=TreatmentPlanStatus.PLANNED, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    case = relationship("Case", back_populates="treatment_plans")
    sittings = relationship("TreatmentSitting", back_populates="treatment_plan", cascade="all, delete-orphan")
