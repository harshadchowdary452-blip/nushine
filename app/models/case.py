import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class CaseStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    ON_HOLD = "ON_HOLD"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ClinicalFinding(Base):
    __tablename__ = "clinical_findings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False)
    finding_type: Mapped[str] = mapped_column(String(50), nullable=False)
    tooth_number: Mapped[str] = mapped_column(String(10), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=True)
    dentition_type: Mapped[str] = mapped_column(String(5), nullable=True)
    surface: Mapped[str] = mapped_column(String(50), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    case = relationship("Case", back_populates="findings")


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_number: Mapped[str] = mapped_column(String(20), nullable=True, unique=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    consultant_id: Mapped[str] = mapped_column(String(36), ForeignKey("consultants.id"), nullable=True)
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id"), nullable=True)
    # Chief Complaint
    chief_complaint: Mapped[str] = mapped_column(Text, nullable=False)
    chief_complaint_duration: Mapped[str] = mapped_column(String(100), nullable=True)
    chief_complaint_severity: Mapped[str] = mapped_column(String(50), nullable=True)
    chief_complaint_associated_symptoms: Mapped[str] = mapped_column(Text, nullable=True)
    # History of Present Illness
    hpi: Mapped[str] = mapped_column(Text, nullable=True)
    # Personal History
    personal_history: Mapped[str] = mapped_column(Text, nullable=True)
    # Family History
    family_history: Mapped[str] = mapped_column(Text, nullable=True)
    # Medical History
    medical_history: Mapped[str] = mapped_column(Text, nullable=True)
    # Dental History
    dental_history: Mapped[str] = mapped_column(Text, nullable=True)
    # Extra Oral Examination
    extra_oral_examination: Mapped[str] = mapped_column(Text, nullable=True)
    # Intra Oral Examination
    intra_oral_examination: Mapped[str] = mapped_column(Text, nullable=True)
    # Clinical Findings Summary (auto-generated, editable)
    clinical_findings_summary: Mapped[str] = mapped_column(Text, nullable=True)
    # Periodontal Examination
    periodontal_examination: Mapped[str] = mapped_column(Text, nullable=True)
    # Investigations
    investigations: Mapped[str] = mapped_column(Text, nullable=True)
    # Diagnosis
    provisional_diagnosis: Mapped[str] = mapped_column(Text, nullable=True)
    final_diagnosis: Mapped[str] = mapped_column(Text, nullable=True)
    # Keep old diagnosis field for backward compat
    diagnosis: Mapped[str] = mapped_column(Text, nullable=True)
    # Initial Treatment Plan
    initial_treatment_plan: Mapped[str] = mapped_column(Text, nullable=True)
    treatment_plan_estimated_cost: Mapped[float] = mapped_column(nullable=True)
    treatment_plan_estimated_visits: Mapped[int] = mapped_column(nullable=True)
    # Doctor Info
    doctor_registration_number: Mapped[str] = mapped_column(String(50), nullable=True)
    doctor_specialization: Mapped[str] = mapped_column(String(100), nullable=True)
    # Patient Instructions
    patient_instructions: Mapped[str] = mapped_column(Text, nullable=True)
    # Medicines Prescribed
    medicines_prescribed: Mapped[str] = mapped_column(Text, nullable=True)
    # Follow-up
    follow_up_instructions: Mapped[str] = mapped_column(Text, nullable=True)
    next_review_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Status
    status: Mapped[CaseStatus] = mapped_column(SAEnum(CaseStatus, create_constraint=False), default=CaseStatus.OPEN, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    completion_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    patient = relationship("Patient", back_populates="cases")
    doctor = relationship("User", back_populates="cases", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_cases")
    updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_cases")
    consultant = relationship("Consultant", back_populates="cases")
    appointment = relationship("Appointment", back_populates="cases")
    treatment_plans = relationship("TreatmentPlan", back_populates="case", cascade="all, delete-orphan")
    billings = relationship("Billing", back_populates="case", cascade="all, delete-orphan")
    pre_ops = relationship("PreOp", back_populates="case", cascade="all, delete-orphan")
    post_ops = relationship("PostOp", back_populates="case", cascade="all, delete-orphan")
    consultant_notes = relationship("ConsultantNote", back_populates="case", cascade="all, delete-orphan")
    findings = relationship("ClinicalFinding", back_populates="case", cascade="all, delete-orphan", order_by="ClinicalFinding.created_at")
    timeline_entries = relationship("CaseTimeline", back_populates="case", cascade="all, delete-orphan", order_by="CaseTimeline.created_at")
