import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Float, Integer, Boolean, ForeignKey, Enum as SAEnum, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class CampaignStatus(str, Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class CampaignType(str, Enum):
    PROMOTIONAL = "PROMOTIONAL"
    RECALL = "RECALL"
    TREATMENT_FOLLOW_UP = "TREATMENT_FOLLOW_UP"
    FESTIVAL_GREETING = "FESTIVAL_GREETING"
    DENTAL_AWARENESS = "DENTAL_AWARENESS"
    APPOINTMENT_REMINDER = "APPOINTMENT_REMINDER"
    CUSTOM = "CUSTOM"
    SEASONAL = "SEASONAL"
    AWARENESS = "AWARENESS"
    DISCOUNT = "DISCOUNT"
    FOLLOW_UP = "FOLLOW_UP"
    GENERAL = "GENERAL"


class CampaignChannel(str, Enum):
    WHATSAPP = "WHATSAPP"
    SMS = "SMS"
    EMAIL = "EMAIL"


class CampaignTarget(str, Enum):
    ALL = "ALL"
    ACTIVE = "ACTIVE"
    COMPLETED_TREATMENT = "COMPLETED_TREATMENT"
    FOLLOW_UP = "FOLLOW_UP"
    NOT_VISITED_6M = "NOT_VISITED_6M"
    NOT_VISITED_1Y = "NOT_VISITED_1Y"
    CUSTOM = "CUSTOM"
    LEAD = "LEAD"
    TREATMENT_SPECIFIC = "TREATMENT_SPECIFIC"


class CampaignRecipientStatus(str, Enum):
    QUEUED = "QUEUED"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    READ = "READ"
    FAILED = "FAILED"
    REPLIED = "REPLIED"
    INTERESTED = "INTERESTED"
    APPOINTMENT_REQUESTED = "APPOINTMENT_REQUESTED"
    CONVERTED_TO_PATIENT = "CONVERTED_TO_PATIENT"


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    campaign_type: Mapped[CampaignType] = mapped_column(SAEnum(CampaignType, create_constraint=False), default=CampaignType.GENERAL, nullable=False)
    channel: Mapped[CampaignChannel] = mapped_column(SAEnum(CampaignChannel, create_constraint=False), default=CampaignChannel.WHATSAPP, nullable=False)
    target: Mapped[CampaignTarget] = mapped_column(SAEnum(CampaignTarget, create_constraint=False), default=CampaignTarget.ALL, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[CampaignStatus] = mapped_column(SAEnum(CampaignStatus, create_constraint=False), default=CampaignStatus.DRAFT, nullable=False)
    campaign_cost: Mapped[float] = mapped_column(Float, default=0.0)
    patients_targeted: Mapped[int] = mapped_column(Integer, default=0)
    messages_sent: Mapped[int] = mapped_column(Integer, default=0)
    messages_delivered: Mapped[int] = mapped_column(Integer, default=0)
    messages_failed: Mapped[int] = mapped_column(Integer, default=0)
    messages_read: Mapped[int] = mapped_column(Integer, default=0)
    responses_count: Mapped[int] = mapped_column(Integer, default=0)
    interested_count: Mapped[int] = mapped_column(Integer, default=0)
    appointments_generated: Mapped[int] = mapped_column(Integer, default=0)
    patients_converted: Mapped[int] = mapped_column(Integer, default=0)
    revenue_generated: Mapped[float] = mapped_column(Float, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    hospital = relationship("Hospital")
    creator = relationship("User")
    recipients = relationship("CampaignRecipient", back_populates="campaign", cascade="all, delete-orphan")
    responses = relationship("CampaignResponse", back_populates="campaign", cascade="all, delete-orphan")
    timeline_entries = relationship("CampaignTimeline", back_populates="campaign", cascade="all, delete-orphan")


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=True)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id"), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[CampaignRecipientStatus] = mapped_column(SAEnum(CampaignRecipientStatus, create_constraint=False), default=CampaignRecipientStatus.QUEUED, nullable=False)
    response_message: Mapped[str] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    campaign = relationship("Campaign", back_populates="recipients")
    patient = relationship("Patient")
    lead = relationship("Lead")


class CampaignResponse(Base):
    __tablename__ = "campaign_responses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id"), nullable=False)
    recipient_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaign_recipients.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=True)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id"), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(255), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(30), default="INCOMING")
    response_to: Mapped[str] = mapped_column(String(36), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False)
    converted_to_patient: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    campaign = relationship("Campaign", back_populates="responses")
    recipient = relationship("CampaignRecipient")


class CampaignTimeline(Base):
    __tablename__ = "campaign_timelines"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=True)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id"), nullable=True)
    recipient_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaign_recipients.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    campaign = relationship("Campaign", back_populates="timeline_entries")
    patient = relationship("Patient")
    lead = relationship("Lead")
