import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class GeneratedEnquiry(Base):
    __tablename__ = "generated_enquiries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    treatment_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plans.id"), nullable=True)
    treatment_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_types.id"), nullable=True)
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id"), nullable=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    assigned_staff_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    # Rule provenance — stores CrmRule.id (no FK constraint to allow both old and new rule tables)
    rule_id: Mapped[str] = mapped_column(String(36), nullable=True)
    trigger_event: Mapped[str] = mapped_column(String(50), nullable=False)
    # VISIT_COMPLETED | APPOINTMENT_COMPLETED | APPOINTMENT_MISSED | TREATMENT_COMPLETED | RECALL_DUE | REMINDER_DUE

    # Treatment context
    treatment_name: Mapped[str] = mapped_column(String(255), nullable=True)
    visit_number: Mapped[int] = mapped_column(Integer, nullable=True)
    total_visits: Mapped[int] = mapped_column(Integer, nullable=True)
    visit_stage: Mapped[str] = mapped_column(String(20), nullable=True)
    # FIRST | MIDDLE | FINAL | SINGLE

    # Enquiry details
    enquiry_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # WELLNESS | PAIN_ASSESSMENT | HEALING_PROGRESS | MEDICATION_REMINDER
    # TREATMENT_PROGRESS | TREATMENT_COMPLETION | RECALL_REMINDER
    # NEXT_APPOINTMENT_REMINDER | MISSED_APPOINTMENT | PAYMENT_FOLLOW_UP
    # GENERAL_CHECK | CUSTOM
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="MEDIUM", nullable=False)

    # Follow-up linkage
    follow_up_id: Mapped[str] = mapped_column(String(36), ForeignKey("follow_ups.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    # PENDING | CONTACTED | COMPLETED | CANCELLED | OVERDUE

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    hospital = relationship("Hospital", lazy="selectin")
    patient = relationship("Patient", lazy="selectin")
    treatment_plan = relationship("TreatmentPlan", lazy="selectin")
    treatment_type = relationship("TreatmentType", lazy="selectin")
    appointment = relationship("Appointment", lazy="selectin")
    doctor = relationship("User", foreign_keys=[doctor_id], lazy="selectin")
    assigned_staff = relationship("User", foreign_keys=[assigned_staff_id], lazy="selectin")
    follow_up = relationship("FollowUp", lazy="selectin")
