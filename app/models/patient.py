import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class PatientStatus(str, Enum):
    NEW = "NEW"
    ACTIVE = "ACTIVE"
    UNDER_TREATMENT = "UNDER_TREATMENT"
    FOLLOW_UP = "FOLLOW_UP"
    COMPLETED = "COMPLETED"
    INACTIVE = "INACTIVE"


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=True)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=True)
    age: Mapped[int] = mapped_column(nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    patient_source: Mapped[str] = mapped_column(String(100), index=True, nullable=True)
    original_source: Mapped[str] = mapped_column(String(100), nullable=True)
    source_campaign_name: Mapped[str] = mapped_column(String(255), nullable=True)
    source_campaign_id: Mapped[str] = mapped_column(String(100), nullable=True)
    source_campaign_date: Mapped[date] = mapped_column(Date, nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    medical_history: Mapped[str] = mapped_column(Text, nullable=True)
    diagnosis: Mapped[str] = mapped_column(Text, nullable=True)
    emergency_contact: Mapped[str] = mapped_column(String(255), nullable=True)
    photo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    status: Mapped[PatientStatus] = mapped_column(SAEnum(PatientStatus, create_constraint=False), default=PatientStatus.NEW, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    hospital = relationship("Hospital", back_populates="patients")
    doctor = relationship("User", back_populates="patients")
    cases = relationship("Case", back_populates="patient", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="patient", cascade="all, delete-orphan")
