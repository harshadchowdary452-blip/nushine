import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.core.permissions import Role


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True)
    admin_group_id: Mapped[str] = mapped_column(String(36), ForeignKey("admin_groups.id"), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    role: Mapped[Role] = mapped_column(SAEnum(Role, create_constraint=False), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    qualification: Mapped[str] = mapped_column(String(255), nullable=True)
    specialization: Mapped[str] = mapped_column(String(255), nullable=True)
    license_number: Mapped[str] = mapped_column(String(100), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    hospital = relationship("Hospital", back_populates="users")
    admin_group = relationship("AdminGroup", back_populates="users")
    patients = relationship("Patient", back_populates="doctor")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    cases = relationship("Case", foreign_keys="Case.doctor_id", back_populates="doctor")
    appointments = relationship("Appointment", back_populates="doctor")
    created_expenses = relationship("HospitalMonthlyExpense", back_populates="creator")
    working_hours = relationship("DoctorWorkingHour", back_populates="doctor", cascade="all, delete-orphan")
    availability_overrides = relationship("DoctorAvailability", back_populates="doctor", cascade="all, delete-orphan")
    leaves = relationship("DoctorLeave", back_populates="doctor", cascade="all, delete-orphan")
    blocked_slots = relationship("DoctorBlockedSlot", back_populates="doctor", cascade="all, delete-orphan")
    consent_forms = relationship("ConsentForm", foreign_keys="ConsentForm.doctor_id", back_populates="doctor")
