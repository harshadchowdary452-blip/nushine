import uuid
from datetime import datetime, timezone, date, time
from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean, Date, Time, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from enum import Enum


class FollowUpStatus(str, Enum):
    PENDING = "PENDING"
    CONTACTED = "CONTACTED"
    INTERESTED = "INTERESTED"
    APPOINTMENT_REQUIRED = "APPOINTMENT_REQUIRED"
    APPOINTMENT_BOOKED = "APPOINTMENT_BOOKED"
    COMPLETED = "COMPLETED"
    NO_RESPONSE = "NO_RESPONSE"
    LOST = "LOST"
    SCHEDULED = "SCHEDULED"  # backward compat
    OPEN = "OPEN"  # backward compat
    CANCELLED = "CANCELLED"  # backward compat


class FollowUpType(str, Enum):
    ONE_DAY_FOLLOW_UP = "1_DAY_FOLLOW_UP"
    ONE_DAY_POST_TREATMENT = "1_DAY_POST_TREATMENT"  # backward compat
    SEVEN_DAY_FOLLOW_UP = "7_DAY_FOLLOW_UP"
    SEVEN_DAY_POST_TREATMENT = "7_DAY_POST_TREATMENT"  # backward compat
    SIX_MONTH_RECALL = "6_MONTH_RECALL"
    TWELVE_MONTH_RECALL = "12_MONTH_RECALL"
    CUSTOM_FOLLOW_UP = "CUSTOM_FOLLOW_UP"
    CUSTOM_RECALL = "CUSTOM_RECALL"  # backward compat
    ENQUIRY = "ENQUIRY"
    TREATMENT_FOLLOW_UP = "TREATMENT_FOLLOW_UP"  # backward compat
    MANUAL = "MANUAL"


class FollowUpOutcome(str, Enum):
    DOING_WELL = "DOING_WELL"
    MINOR_SENSITIVITY = "MINOR_SENSITIVITY"
    NEEDS_CLEANING = "NEEDS_CLEANING"
    INTERESTED_IN_CROWN = "INTERESTED_IN_CROWN"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    NEEDS_APPOINTMENT = "NEEDS_APPOINTMENT"
    TREATMENT_SUCCESSFUL = "TREATMENT_SUCCESSFUL"
    NO_RESPONSE = "NO_RESPONSE"


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
    treatment_type_id: Mapped[str] = mapped_column(String(36), nullable=True)
    follow_up_date: Mapped[date] = mapped_column(Date, nullable=False)
    follow_up_time: Mapped[time] = mapped_column(Time, nullable=True)
    follow_up_type: Mapped[str] = mapped_column(String(30), default=FollowUpType.ONE_DAY_FOLLOW_UP.value, server_default=FollowUpType.ONE_DAY_FOLLOW_UP.value)
    outcome: Mapped[str] = mapped_column(String(30), nullable=True)
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    treatment_completed_date: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=FollowUpStatus.PENDING.value, server_default=FollowUpStatus.PENDING.value)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    completed_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by: Mapped[str] = mapped_column(String(36), nullable=True)
    whatsapp_message: Mapped[str] = mapped_column(Text, nullable=True)
    whatsapp_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    call_made_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    call_notes: Mapped[str] = mapped_column(Text, nullable=True)
    patient_feedback: Mapped[str] = mapped_column(Text, nullable=True)
    staff_notes: Mapped[str] = mapped_column(Text, nullable=True)
    response_summary: Mapped[str] = mapped_column(String(100), nullable=True)
    response_status: Mapped[str] = mapped_column(String(30), nullable=True)
    next_action: Mapped[str] = mapped_column(String(30), nullable=True)
    contact_channel: Mapped[str] = mapped_column(String(20), nullable=True)
    last_contact_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
