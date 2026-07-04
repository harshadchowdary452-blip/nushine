import uuid
from datetime import datetime, timezone, date
from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Date, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from enum import Enum


class EnquiryStatus(str, Enum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    INTERESTED = "INTERESTED"
    NOT_INTERESTED = "NOT_INTERESTED"
    CONVERTED = "CONVERTED"
    LOST = "LOST"


class TreatmentInterest(str, Enum):
    IMPLANT = "IMPLANT"
    BRACES = "BRACES"
    SMILE_DESIGN = "SMILE_DESIGN"
    CROWN = "CROWN"
    BRIDGE = "BRIDGE"
    VENEER = "VENEER"
    RCT = "RCT"
    EXTRACTION = "EXTRACTION"
    DENTURE = "DENTURE"
    SCALING = "SCALING"
    FILLING = "FILLING"
    BUDGET_APPROVAL = "BUDGET_APPROVAL"
    OPD_FOLLOW_UP = "OPD_FOLLOW_UP"
    OTHER = "OTHER"


class Enquiry(Base):
    __tablename__ = "enquiries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False)
    assigned_staff_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    treatment_interest: Mapped[str] = mapped_column(String(50), nullable=False, default=TreatmentInterest.OTHER.value)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=EnquiryStatus.NEW.value)
    next_follow_up_date: Mapped[date] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    patient = relationship("Patient", backref="enquiries")
    hospital = relationship("Hospital", backref="enquiries")
    assigned_staff = relationship("User", foreign_keys=[assigned_staff_id])


class EnquiryFollowUp(Base):
    __tablename__ = "enquiry_follow_ups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    enquiry_id: Mapped[str] = mapped_column(String(36), ForeignKey("enquiries.id"), nullable=False)
    staff_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    enquiry = relationship("Enquiry", backref="follow_ups")
    staff = relationship("User", foreign_keys=[staff_id])
