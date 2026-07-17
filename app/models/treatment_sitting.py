import uuid
from datetime import datetime, date, time, timezone
from sqlalchemy import String, DateTime, Date, Time, Text, JSON, Integer, Boolean, Float, ForeignKey, Enum as SAEnum
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
    procedure_performed: Mapped[str] = mapped_column(Text, nullable=True)
    clinical_notes: Mapped[str] = mapped_column(Text, nullable=True)
    prescription: Mapped[str] = mapped_column(Text, nullable=True)
    next_appointment_date: Mapped[date] = mapped_column(Date, nullable=True)
    next_appointment_time: Mapped[time] = mapped_column(Time, nullable=True)
    next_appointment_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    next_visit_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    materials_used: Mapped[str] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=True)
    attachments_json: Mapped[str] = mapped_column(Text, nullable=True)
    images_json: Mapped[str] = mapped_column(Text, nullable=True)
    digital_signature_url: Mapped[str] = mapped_column(String(500), nullable=True)
    lab_tracking_status: Mapped[str] = mapped_column(String(50), nullable=True)
    lab_tracking_notes: Mapped[str] = mapped_column(Text, nullable=True)
    lab_tracking_due_date: Mapped[date] = mapped_column(Date, nullable=True)
    lab_name: Mapped[str] = mapped_column(String(255), nullable=True)
    lab_order_number: Mapped[str] = mapped_column(String(100), nullable=True)
    lab_sent_date: Mapped[date] = mapped_column(Date, nullable=True)
    lab_return_date: Mapped[date] = mapped_column(Date, nullable=True)
    lab_cost: Mapped[float] = mapped_column(Float, nullable=True)
    completed_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    treatment_plan = relationship("TreatmentPlan", back_populates="sittings", lazy="selectin")
    doctor = relationship("User", foreign_keys=[doctor_id], lazy="selectin")
    next_appointment_doctor = relationship("User", foreign_keys=[next_appointment_doctor_id], lazy="selectin")
    completed_by = relationship("User", foreign_keys=[completed_by_id], lazy="selectin")

    @property
    def doctor_name(self):
        return self.doctor.full_name if self.doctor else None

    @property
    def next_appointment_doctor_name(self):
        return self.next_appointment_doctor.full_name if self.next_appointment_doctor else None

    @property
    def completed_by_name(self):
        return self.completed_by.full_name if self.completed_by else None
