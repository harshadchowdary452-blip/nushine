import uuid
from datetime import datetime, date, time, timezone, timedelta
from sqlalchemy import String, DateTime, Date, Time, Text, Boolean, Integer, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class AppointmentStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
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

PROCEDURE_DURATIONS: dict[str, int] = {
    "Consultation": 20,
    "Scaling": 30,
    "Root Canal": 90,
    "Root Canal Treatment": 90,
    "RCT": 90,
    "Filling": 30,
    "Dental Filling": 30,
    "Extraction": 45,
    "Tooth Extraction": 45,
    "Crown": 45,
    "Dental Crown": 45,
    "Crown and Bridge": 45,
    "Bridge": 60,
    "Implant": 120,
    "Dental Implant": 120,
    "Whitening": 60,
    "Teeth Whitening": 60,
    "Orthodontic": 60,
    "Orthodontics": 60,
    "Braces": 60,
    "Surgery": 90,
    "Oral Surgery": 90,
    "Cleaning": 30,
    "Dental Cleaning": 30,
    "Denture": 60,
    "Partial Denture": 60,
    "Full Denture": 60,
    "Veneer": 60,
    "Veneers": 60,
    "Implant Surgery": 120,
    "Bone Graft": 90,
    "Sinus Lift": 90,
    "Wisdom Tooth": 60,
    "Wisdom Tooth Removal": 60,
    "Periodontal": 60,
    "Gum Treatment": 60,
    "Pediatric": 30,
    "Endodontic": 90,
    "Prosthodontic": 60,
    "Maxillofacial": 120,
}


def resolve_duration(procedure_name: str | None, appointment_type: AppointmentType | str | None) -> int:
    if procedure_name:
        normalized = procedure_name.strip()
        if normalized in PROCEDURE_DURATIONS:
            return PROCEDURE_DURATIONS[normalized]
        lower_map = {k.lower(): v for k, v in PROCEDURE_DURATIONS.items()}
        if normalized.lower() in lower_map:
            return lower_map[normalized.lower()]
    try:
        appt_type = AppointmentType(appointment_type) if isinstance(appointment_type, str) else appointment_type
        return TREATMENT_DURATIONS.get(appt_type, 30)
    except (ValueError, TypeError):
        return 30


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

    # Reschedule tracking
    previous_date: Mapped[date] = mapped_column(Date, nullable=True)
    previous_time: Mapped[time] = mapped_column(Time, nullable=True)
    rescheduled_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    rescheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    reschedule_reason: Mapped[str] = mapped_column(Text, nullable=True)

    # Cancel tracking
    cancelled_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str] = mapped_column(Text, nullable=True)

    # Complete tracking
    completed_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("User", back_populates="appointments", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_appointments")
    updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_appointments")
    rescheduled_by = relationship("User", foreign_keys=[rescheduled_by_id], backref="rescheduled_appointments")
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_id], backref="cancelled_appointments")
    completed_by = relationship("User", foreign_keys=[completed_by_id], backref="completed_appointments")
    cases = relationship("Case", back_populates="appointment")
