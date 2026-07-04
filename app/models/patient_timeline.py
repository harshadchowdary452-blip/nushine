import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PatientTimeline(Base):
    __tablename__ = "patient_timelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    module: Mapped[str] = mapped_column(String(50), nullable=True, index=True)
    performed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    user_name: Mapped[str] = mapped_column(String(255), nullable=True)
    user_role: Mapped[str] = mapped_column(String(50), nullable=True)
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=True)
    hospital_name: Mapped[str] = mapped_column(String(255), nullable=True)
    changes: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    patient = relationship("Patient", backref="patient_timeline_entries")
    performer = relationship("User", foreign_keys=[performed_by], lazy="select")
    hospital = relationship("Hospital", foreign_keys=[hospital_id], lazy="select")
