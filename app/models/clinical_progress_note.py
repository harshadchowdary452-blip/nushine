import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Date, Time, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ClinicalProgressNote(Base):
    __tablename__ = "clinical_progress_notes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=False, index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    note_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    clinical_note: Mapped[str] = mapped_column(Text, nullable=False)
    attachments_json: Mapped[str] = mapped_column(Text, nullable=True)
    digital_signature_url: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    case = relationship("Case", back_populates="clinical_progress_notes")
    doctor = relationship("User", foreign_keys=[doctor_id], lazy="selectin")
