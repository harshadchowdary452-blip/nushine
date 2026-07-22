import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TreatmentFollowUpRule(Base):
    __tablename__ = "treatment_follow_up_rules"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    treatment_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_types.id"), nullable=True)
    treatment_template_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_templates.id"), nullable=True)

    # --- Legacy fields (preserved for backward compatibility) ---
    follow_up_1_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    follow_up_7_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recall_6_month: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recall_12_month: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    custom_recall_days: Mapped[int] = mapped_column(Integer, nullable=True)
    enquiry_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_appointment_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assigned_doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # --- Phase 3.2: Visit-Aware Rules ---
    visit_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    visit_trigger: Mapped[str] = mapped_column(String(20), default="EVERY", nullable=False)
    # EVERY | FIRST | MIDDLE | FINAL | SPECIFIC | NEVER
    visit_specific_number: Mapped[int] = mapped_column(Integer, nullable=True)
    visit_delay_days: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    visit_enquiry_type: Mapped[str] = mapped_column(String(50), default="WELLNESS", nullable=False)
    # WELLNESS | PAIN_ASSESSMENT | HEALING_PROGRESS | MEDICATION_REMINDER | TREATMENT_PROGRESS
    # GENERAL_CHECK | NEED_ASSISTANCE | TREATMENT_QUESTIONS
    visit_whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    visit_whatsapp_template_id: Mapped[str] = mapped_column(String(36), nullable=True)
    visit_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # --- Phase 3.2: Appointment Reminder Rules ---
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_days_before: Mapped[str] = mapped_column(String(50), default="1", nullable=False)
    # Comma-separated: "1,3,7"
    reminder_whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_whatsapp_template_id: Mapped[str] = mapped_column(String(36), nullable=True)
    reminder_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # --- Phase 3.2: Post-Treatment Completion Rules ---
    completion_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completion_delay_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    completion_enquiry_type: Mapped[str] = mapped_column(String(50), default="TREATMENT_COMPLETION", nullable=False)
    # TREATMENT_COMPLETION | HEALING_PROGRESS | GENERAL_CHECK
    completion_whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completion_whatsapp_template_id: Mapped[str] = mapped_column(String(36), nullable=True)
    completion_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # --- Phase 3.2: Recall Rules ---
    recall_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recall_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    recall_enquiry_type: Mapped[str] = mapped_column(String(50), default="RECALL_REMINDER", nullable=False)
    recall_whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recall_whatsapp_template_id: Mapped[str] = mapped_column(String(36), nullable=True)
    recall_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # --- Phase 3.2: Missed Appointment Rules ---
    missed_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    missed_delay_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    missed_whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    missed_whatsapp_template_id: Mapped[str] = mapped_column(String(36), nullable=True)
    missed_notes: Mapped[str] = mapped_column(Text, nullable=True)

    # --- Phase 3.2: Auto-Assignment ---
    auto_assign_role: Mapped[str] = mapped_column(String(30), default="ASSIGNED_DOCTOR", nullable=False)
    # ASSIGNED_DOCTOR | ASSIGNED_STAFF | TREATMENT_COORDINATOR | HOSPITAL_ADMIN | ROUND_ROBIN
    priority: Mapped[str] = mapped_column(String(10), default="MEDIUM", nullable=False)
    # HIGH | MEDIUM | LOW

    # --- Phase 3.2: Template Overrides (per-rule) ---
    whatsapp_template_id: Mapped[str] = mapped_column(String(36), nullable=True)
    email_template_id: Mapped[str] = mapped_column(String(36), nullable=True)
    sms_template_id: Mapped[str] = mapped_column(String(36), nullable=True)

    # --- Audit ---
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
