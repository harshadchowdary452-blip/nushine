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
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    case = relationship("Case", back_populates="findings")


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_number: Mapped[str] = mapped_column(String(20), nullable=True, unique=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    consultant_id: Mapped[str] = mapped_column(String(36), ForeignKey("consultants.id"), nullable=True)
    appointment_id: Mapped[str] = mapped_column(String(36), ForeignKey("appointments.id"), nullable=True)
    chief_complaint: Mapped[str] = mapped_column(Text, nullable=False)
    diagnosis: Mapped[str] = mapped_column(Text, nullable=True)
    initial_treatment_plan: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[CaseStatus] = mapped_column(SAEnum(CaseStatus, create_constraint=False), default=CaseStatus.OPEN, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    completion_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    patient = relationship("Patient", back_populates="cases")
    doctor = relationship("User", back_populates="cases")
    consultant = relationship("Consultant", back_populates="cases")
    appointment = relationship("Appointment", back_populates="cases")
    treatment_plans = relationship("TreatmentPlan", back_populates="case", cascade="all, delete-orphan")
    billings = relationship("Billing", back_populates="case", cascade="all, delete-orphan")
    pre_ops = relationship("PreOp", back_populates="case", cascade="all, delete-orphan")
    post_ops = relationship("PostOp", back_populates="case", cascade="all, delete-orphan")
    consultant_notes = relationship("ConsultantNote", back_populates="case", cascade="all, delete-orphan")
    findings = relationship("ClinicalFinding", back_populates="case", cascade="all, delete-orphan", order_by="ClinicalFinding.created_at")
