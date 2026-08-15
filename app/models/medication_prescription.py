import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MedicationPrescription(Base):
    """One normalized medication entry shared by Case Reports and Treatment Sittings.

    A row belongs to exactly ONE clinical event:
      - case-level:              case_id set, treatment_sitting_id NULL
      - treatment sitting-level: treatment_sitting_id set, case_id NULL
    This is the single source of truth for medications across the app.
    """

    __tablename__ = "medication_prescriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), nullable=True, index=True)
    treatment_sitting_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_sittings.id"), nullable=True, index=True)
    medication_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dosage: Mapped[str] = mapped_column(String(100), nullable=True)
    frequency: Mapped[str] = mapped_column(String(100), nullable=True)
    duration: Mapped[str] = mapped_column(String(100), nullable=True)
    instructions: Mapped[str] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    case = relationship("Case", back_populates="medication_prescriptions", foreign_keys=[case_id])
    treatment_sitting = relationship("TreatmentSitting", back_populates="medication_prescriptions", foreign_keys=[treatment_sitting_id])
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="selectin")
    updated_by = relationship("User", foreign_keys=[updated_by_id], lazy="selectin")

    @property
    def created_by_name(self):
        return self.created_by.full_name if self.created_by else None

    @property
    def updated_by_name(self):
        return self.updated_by.full_name if self.updated_by else None
