import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class CaseStatus(str, Enum):
    NEW = "NEW"
    DIAGNOSIS_PENDING = "DIAGNOSIS_PENDING"
    TREATMENT_PLANNED = "TREATMENT_PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    FOLLOW_UP = "FOLLOW_UP"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    consultant_id: Mapped[str] = mapped_column(String(36), ForeignKey("consultants.id"), nullable=True)
    chief_complaint: Mapped[str] = mapped_column(Text, nullable=False)
    diagnosis: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[CaseStatus] = mapped_column(SAEnum(CaseStatus, create_constraint=False), default=CaseStatus.NEW, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    patient = relationship("Patient", back_populates="cases")
    doctor = relationship("User", back_populates="cases")
    consultant = relationship("Consultant", back_populates="cases")
    treatment_plans = relationship("TreatmentPlan", back_populates="case", cascade="all, delete-orphan")
    billings = relationship("Billing", back_populates="case", cascade="all, delete-orphan")
    pre_ops = relationship("PreOp", back_populates="case", cascade="all, delete-orphan")
    post_ops = relationship("PostOp", back_populates="case", cascade="all, delete-orphan")
    consultant_notes = relationship("ConsultantNote", back_populates="case", cascade="all, delete-orphan")
