import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class FollowUpResponseStatus(str, Enum):
    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    NEEDS_ATTENTION = "NEEDS_ATTENTION"
    COMPLAINT = "COMPLAINT"
    EMERGENCY = "EMERGENCY"
    NO_RESPONSE = "NO_RESPONSE"
    NOT_INTERESTED = "NOT_INTERESTED"


class FollowUpResponse(Base):
    __tablename__ = "follow_up_responses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    follow_up_id: Mapped[str] = mapped_column(String(36), ForeignKey("follow_ups.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True)
    response_message: Mapped[str] = mapped_column(Text, nullable=True)
    response_status: Mapped[FollowUpResponseStatus] = mapped_column(SAEnum(FollowUpResponseStatus, create_constraint=False), default=FollowUpResponseStatus.NO_RESPONSE, nullable=False)
    feedback: Mapped[str] = mapped_column(String(20), nullable=True)
    follow_up_required: Mapped[bool] = mapped_column(Boolean, default=False)
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id"), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    follow_up = relationship("FollowUp")
    patient = relationship("Patient")
