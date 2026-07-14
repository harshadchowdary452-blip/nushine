import uuid
from datetime import datetime, date, time, timezone, timedelta
from sqlalchemy import String, DateTime, Date, Time, Text, Boolean, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class AppointmentStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    CONFIRMED = "CONFIRMED"
    CHECKED_IN = "CHECKED_IN"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"
    RESCHEDULED = "RESCHEDULED"


class AppointmentType(str, Enum):
    CONSULTATION = "CONSULTATION"
    FOLLOW_UP = "FOLLOW_UP"
    TREATMENT = "TREATMENT"
    EMERGENCY = "EMERGENCY"
    REVIEW = "REVIEW"


TREATMENT_DURATIONS = {
    AppointmentType.CONSULTATION: 30,
    AppointmentType.FOLLOW_UP: 30,
    AppointmentType.TREATMENT: 60,
    AppointmentType.EMERGENCY: 30,
    AppointmentType.REVIEW: 30,
}


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    appointment_number: Mapped[str] = mapped_column(String(20), nullable=True, unique=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    appointment_date: Mapped[date] = mapped_column(Date, nullable=False)
    appointment_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[AppointmentStatus] = mapped_column(SAEnum(AppointmentStatus, create_constraint=False), default=AppointmentStatus.SCHEDULED, nullable=False)
    appointment_type: Mapped[AppointmentType] = mapped_column(SAEnum(AppointmentType, create_constraint=False), default=AppointmentType.CONSULTATION, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("User", back_populates="appointments", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_appointments")
    updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_appointments")
    cases = relationship("Case", back_populates="appointment")
