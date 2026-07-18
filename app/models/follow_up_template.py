"""Follow-up templates for procedure-specific CRM workflows."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, Integer, ForeignKey, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class FollowUpTemplate(Base):
    __tablename__ = "follow_up_templates"
    id = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True, index=True)
    name = mapped_column(String(255), nullable=False)
    procedure = mapped_column(String(255), nullable=True)  # e.g., "Root Canal", "Scaling", "Implant"
    trigger_event = mapped_column(String(50), nullable=False, default="TREATMENT_COMPLETED")
    # Trigger events: PATIENT_REGISTERED, APPOINTMENT_COMPLETED, APPOINTMENT_MISSED,
    # TREATMENT_STARTED, VISIT_COMPLETED, TREATMENT_COMPLETED, BILL_GENERATED,
    # PAYMENT_OVERDUE, PATIENT_INACTIVE, PATIENT_BIRTHDAY, MANUAL
    delay_days = mapped_column(Integer, default=0)  # Days after trigger to create follow-up
    follow_up_type = mapped_column(String(30), nullable=False, default="CUSTOM_FOLLOW_UP")
    reminder_channel = mapped_column(String(20), nullable=False, default="WHATSAPP")  # WHATSAPP, SMS, EMAIL, PHONE, TASK, NOTIFICATION
    priority = mapped_column(String(10), nullable=False, default="MEDIUM")  # HIGH, MEDIUM, LOW
    responsible_role = mapped_column(String(30), nullable=True)  # RECEPTION, DOCTOR, CRM_EXECUTIVE
    max_retries = mapped_column(Integer, default=1)
    escalation_days = mapped_column(Integer, nullable=True)  # Days before escalating
    escalation_role = mapped_column(String(30), nullable=True)
    notes = mapped_column(Text, nullable=True)
    is_active = mapped_column(Boolean, default=True, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
