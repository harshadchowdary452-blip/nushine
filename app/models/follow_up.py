import uuid
from datetime import datetime, timezone, date, time
from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean, Date, Time
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from enum import Enum


class FollowUpStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    MISSED = "MISSED"
    CANCELLED = "CANCELLED"
    RESCHEDULED = "RESCHEDULED"


class FollowUp(Base):
    __tablename__ = "follow_ups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=True)
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id"), nullable=True)
    follow_up_date: Mapped[date] = mapped_column(Date, nullable=False)
    follow_up_time: Mapped[time] = mapped_column(Time, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=FollowUpStatus.SCHEDULED.value)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
