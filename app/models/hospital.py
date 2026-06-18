import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Hospital(Base):
    __tablename__ = "hospitals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_group_id: Mapped[str] = mapped_column(String(36), ForeignKey("admin_groups.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    registration_number: Mapped[str] = mapped_column(String(100), nullable=True)
    gst_number: Mapped[str] = mapped_column(String(50), nullable=True)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    settings: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    admin_group = relationship("AdminGroup", back_populates="hospitals")
    users = relationship("User", back_populates="hospital")
    patients = relationship("Patient", back_populates="hospital")
    consultants = relationship("Consultant", back_populates="hospital")
    expenses = relationship("HospitalMonthlyExpense", back_populates="hospital")
    consent_forms = relationship("ConsentForm", back_populates="hospital")
