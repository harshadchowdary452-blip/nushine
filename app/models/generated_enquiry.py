import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class GeneratedEnquiry(Base):
    __tablename__ = "generated_enquiries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)

    # Entity relationships — at least one of patient_id or lead_id must be present
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=True, index=True)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id"), nullable=True, index=True)
    treatment_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plans.id"), nullable=True)
    treatment_plan_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plan_items.id"), nullable=True)
    treatment_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_types.id"), nullable=True)
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id"), nullable=True)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    assigned_staff_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    # Rule provenance
    crm_rule_id: Mapped[str] = mapped_column(String(36), ForeignKey("crm_rules.id"), nullable=True)
    rule_id: Mapped[str] = mapped_column(String(36), nullable=True)  # legacy compat
    trigger_event: Mapped[str] = mapped_column(String(50), nullable=False)

    # Human-readable enquiry number (ENQ-2026-000001)
    enquiry_number: Mapped[str] = mapped_column(String(20), nullable=True, unique=True)

    # Treatment context
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    visit_number: Mapped[int] = mapped_column(Integer, nullable=True)
    total_visits: Mapped[int] = mapped_column(Integer, nullable=True)
    visit_stage: Mapped[str] = mapped_column(String(20), nullable=True)

    # Enquiry details
    enquiry_type: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="MEDIUM", nullable=False)

    # Follow-up linkage
    follow_up_id: Mapped[str] = mapped_column(String(36), ForeignKey("follow_ups.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)

    # Audit trail
    created_by_event: Mapped[str] = mapped_column(String(50), nullable=True)
    generation_reason: Mapped[str] = mapped_column(Text, nullable=True)
    cancelled_by_event: Mapped[str] = mapped_column(String(50), nullable=True)
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    source_entity_type: Mapped[str] = mapped_column(String(30), nullable=True)
    source_entity_id: Mapped[str] = mapped_column(String(36), nullable=True)

    # Recurrence fields (RECALL only)
    is_recurring: Mapped[bool] = mapped_column(default=False)
    occurrence_number: Mapped[int] = mapped_column(Integer, default=1)
    recurrence_interval_days: Mapped[int] = mapped_column(Integer, nullable=True)
    chain_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    hospital = relationship("Hospital", lazy="selectin")
    patient = relationship("Patient", lazy="selectin")
    lead = relationship("Lead", lazy="selectin")
    treatment_plan = relationship("TreatmentPlan", lazy="selectin")
    treatment_plan_item = relationship("TreatmentPlanItem", lazy="selectin")
    treatment_type = relationship("TreatmentType", lazy="selectin")
    appointment = relationship("Appointment", lazy="selectin")
    case = relationship("Case", lazy="selectin")
    doctor = relationship("User", foreign_keys=[doctor_id], lazy="selectin")
    assigned_staff = relationship("User", foreign_keys=[assigned_staff_id], lazy="selectin")
    follow_up = relationship("FollowUp", lazy="selectin")
    crm_rule = relationship("CrmRule", lazy="selectin")
