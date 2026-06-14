import uuid
from datetime import datetime, timezone, date, time
from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean, Date, Time, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from enum import Enum


class FollowUpStatus(str, Enum):
    OPEN = "OPEN"
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class FollowUpType(str, Enum):
    ONE_DAY_POST_TREATMENT = "1_DAY_POST_TREATMENT"
    SIX_MONTH_RECALL = "6_MONTH_RECALL"
    MANUAL = "MANUAL"


class FollowUp(Base):
    __tablename__ = "follow_ups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=True)
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id"), nullable=True)
    billing_id: Mapped[str] = mapped_column(String(36), nullable=True)
    treatment_id: Mapped[str] = mapped_column(String(36), nullable=True)
    follow_up_date: Mapped[date] = mapped_column(Date, nullable=False)
    follow_up_time: Mapped[time] = mapped_column(Time, nullable=True)
    follow_up_type: Mapped[str] = mapped_column(String(20), default=FollowUpType.MANUAL.value, server_default=FollowUpType.MANUAL.value)
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    treatment_completed_date: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=FollowUpStatus.SCHEDULED.value, server_default=FollowUpStatus.SCHEDULED.value)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    completed_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[str] = mapped_column(String(36), nullable=True)
    whatsapp_message: Mapped[str] = mapped_column(Text, nullable=True)
    whatsapp_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    call_made_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    call_notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
