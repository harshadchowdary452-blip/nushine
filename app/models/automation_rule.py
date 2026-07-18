"""CRM automation rules — event-driven follow-up engine configuration."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutomationRule(Base):
    __tablename__ = "automation_rules"
    id = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True, index=True)
    name = mapped_column(String(255), nullable=False)
    trigger_event = mapped_column(String(50), nullable=False)  # Same events as FollowUpTemplate
    procedure = mapped_column(String(255), nullable=True)  # NULL = applies to all procedures
    delay_days = mapped_column(Integer, default=0)
    channel = mapped_column(String(20), nullable=False, default="WHATSAPP")
    priority = mapped_column(String(10), nullable=False, default="MEDIUM")
    assigned_role = mapped_column(String(30), nullable=True)
    template_id = mapped_column(String(36), ForeignKey("follow_up_templates.id"), nullable=True)
    message_template = mapped_column(Text, nullable=True)  # Direct message template override
    repeat_count = mapped_column(Integer, default=1)
    max_attempts = mapped_column(Integer, default=3)
    stop_conditions = mapped_column(Text, nullable=True)  # JSON: e.g., ["APPOINTMENT_BOOKED", "TREATMENT_COMPLETED"]
    is_active = mapped_column(Boolean, default=True, nullable=False)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    # Enhanced fields
    description = mapped_column(Text, nullable=True)
    group_id = mapped_column(String(36), nullable=True, index=True)
    version = mapped_column(Integer, default=1)
    created_by = mapped_column(String(36), nullable=True)
    modified_by = mapped_column(String(36), nullable=True)
    is_system_rule = mapped_column(Boolean, default=False)
    allow_override = mapped_column(Boolean, default=True)
    condition_logic = mapped_column(String(10), default="AND")
    escalation_enabled = mapped_column(Boolean, default=False)
    escalation_days_1 = mapped_column(Integer, nullable=True)
    escalation_role_1 = mapped_column(String(30), nullable=True)
    escalation_days_2 = mapped_column(Integer, nullable=True)
    escalation_role_2 = mapped_column(String(30), nullable=True)
    escalation_days_3 = mapped_column(Integer, nullable=True)
    escalation_role_3 = mapped_column(String(30), nullable=True)
    business_hours_only = mapped_column(Boolean, default=False)
    weekend_handling = mapped_column(String(20), default="SKIP")
    timezone = mapped_column(String(50), default="UTC")
    execution_count = mapped_column(Integer, default=0)
    success_count = mapped_column(Integer, default=0)
    failure_count = mapped_column(Integer, default=0)
    last_executed_at = mapped_column(DateTime(timezone=True), nullable=True)
