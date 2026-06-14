import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class TreatmentSittingStatus(str, Enum):
    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class TreatmentSitting(Base):
    __tablename__ = "treatment_sittings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    treatment_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plans.id"), nullable=False)
    sitting_number: Mapped[int] = mapped_column(Integer, nullable=False)
    sitting_date: Mapped[date] = mapped_column(Date, nullable=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    work_done: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[TreatmentSittingStatus] = mapped_column(SAEnum(TreatmentSittingStatus, create_constraint=False), default=TreatmentSittingStatus.PLANNED, nullable=False)
    doctor_notes: Mapped[str] = mapped_column(Text, nullable=True)
    next_appointment_date: Mapped[date] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    treatment_plan = relationship("TreatmentPlan", back_populates="sittings")
