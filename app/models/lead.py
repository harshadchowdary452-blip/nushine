import uuid
import enum
from datetime import datetime, timezone, date
from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Date, Float, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LeadSource(str, enum.Enum):
    GOOGLE_SEARCH = "GOOGLE_SEARCH"
    GOOGLE_MAPS = "GOOGLE_MAPS"
    INSTAGRAM = "INSTAGRAM"
    FACEBOOK = "FACEBOOK"
    WHATSAPP = "WHATSAPP"
    WEBSITE = "WEBSITE"
    WALK_IN = "WALK_IN"
    REFERRAL = "REFERRAL"
    DOCTOR_REFERRAL = "DOCTOR_REFERRAL"
    CLINIC_REFERRAL = "CLINIC_REFERRAL"
    CAMPAIGN = "CAMPAIGN"
    ADVERTISEMENT = "ADVERTISEMENT"
    BANNER = "BANNER"
    NEWSPAPER = "NEWSPAPER"
    YOUTUBE = "YOUTUBE"
    EVENT = "EVENT"
    OTHER = "OTHER"


class LeadStatus(str, enum.Enum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    INTERESTED = "INTERESTED"
    FOLLOW_UP_REQUIRED = "FOLLOW_UP_REQUIRED"
    APPOINTMENT_BOOKED = "APPOINTMENT_BOOKED"
    VISITED = "VISITED"
    CONVERTED = "CONVERTED"
    LOST = "LOST"
    NOT_INTERESTED = "NOT_INTERESTED"
    NO_RESPONSE = "NO_RESPONSE"


class LeadCallOutcome(str, enum.Enum):
    INTERESTED = "INTERESTED"
    NOT_INTERESTED = "NOT_INTERESTED"
    NO_ANSWER = "NO_ANSWER"
    BUSY = "BUSY"
    CALL_BACK_LATER = "CALL_BACK_LATER"
    APPOINTMENT_REQUESTED = "APPOINTMENT_REQUESTED"
    CONVERTED = "CONVERTED"


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False)
    assigned_staff_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    assigned_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    converted_patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=True)

    lead_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile: Mapped[str] = mapped_column(String(50), nullable=False)
    alternate_mobile: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    age: Mapped[int] = mapped_column(Integer, nullable=True)
    gender: Mapped[str] = mapped_column(String(20), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default=LeadSource.OTHER.value)
    interested_treatment: Mapped[str] = mapped_column(String(255), nullable=True)
    budget: Mapped[float] = mapped_column(Float, nullable=True)
    preferred_visit_date: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=LeadStatus.NEW.value)
    lead_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_contacted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    next_follow_up_date: Mapped[date] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)

    # --- Synced feedback summary (updated by FeedbackService) ---
    latest_response_status: Mapped[str] = mapped_column(String(30), nullable=True)
    latest_feedback_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    latest_feedback_notes: Mapped[str] = mapped_column(Text, nullable=True)
    latest_call_outcome: Mapped[str] = mapped_column(String(30), nullable=True)
    latest_follow_up_requirement: Mapped[str] = mapped_column(String(20), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    hospital = relationship("Hospital", backref="leads")
    assigned_staff = relationship("User", foreign_keys=[assigned_staff_id])
    assigned_doctor = relationship("User", foreign_keys=[assigned_doctor_id])
    converted_patient = relationship("Patient", backref="lead_source_link")


class LeadCommunication(Base):
    __tablename__ = "lead_communications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id"), nullable=False)
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True)
    sent_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="WHATSAPP")
    message_type: Mapped[str] = mapped_column(String(40), nullable=False, default="GENERAL")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    provider_response: Mapped[str] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    lead = relationship("Lead", backref="communications")


class LeadCall(Base):
    __tablename__ = "lead_calls"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id"), nullable=False)
    called_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    outcome: Mapped[str] = mapped_column(String(30), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    follow_up_date: Mapped[date] = mapped_column(Date, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    lead = relationship("Lead", backref="calls")
