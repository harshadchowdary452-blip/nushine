import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CrmRule(Base):
    """Single source of truth for all CRM automation rules."""
    __tablename__ = "crm_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)

    # Rule identity
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(20), nullable=False, default="TREATMENT")
    # LEAD | TREATMENT
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="VISIT")
    # LEAD | VISIT | APPOINTMENT | CASE
    description: Mapped[str] = mapped_column(Text, nullable=True)

    # Trigger configuration
    trigger_event: Mapped[str] = mapped_column(String(50), nullable=False)
    # VISIT_COMPLETED | TREATMENT_COMPLETED | APPOINTMENT_MISSED | APPOINTMENT_COMPLETED
    # APPOINTMENT_CREATED | PATIENT_REGISTERED | LEAD_CREATED | LEAD_CONVERTED | MANUAL
    treatment_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_types.id"), nullable=True)
    treatment_category: Mapped[str] = mapped_column(String(50), nullable=True)
    # For priority matching: treatment_type > treatment_category > global
    visit_stage: Mapped[str] = mapped_column(String(20), nullable=True)
    # ANY | FIRST | MIDDLE | FINAL

    # Delay
    delay_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delay_unit: Mapped[str] = mapped_column(String(20), default="DAYS", nullable=False)
    # IMMEDIATELY | MINUTES | HOURS | DAYS | WEEKS | MONTHS

    # Action
    action: Mapped[str] = mapped_column(String(50), nullable=False, default="GENERAL_FOLLOW_UP")
    assign_to: Mapped[str] = mapped_column(String(30), nullable=False, default="RECEPTION")
    # RECEPTION | TREATMENT_COORDINATOR | DOCTOR | HOSPITAL_ADMIN | SPECIFIC_STAFF

    # Notifications
    send_whatsapp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    whatsapp_template_id: Mapped[str] = mapped_column(String(36), ForeignKey("whatsapp_templates.id"), nullable=True)
    send_notification: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Audit
    created_by: Mapped[str] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
