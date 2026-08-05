import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class DoctorHospital(Base):
    """Per-hospital active state for a doctor.

    A doctor may belong to multiple hospitals (within an admin group). This
    membership row records whether the doctor is active at each hospital, so a
    doctor can be active in one hospital and inactive in another.
    """
    __tablename__ = "doctor_hospitals"
    __table_args__ = (
        UniqueConstraint("user_id", "hospital_id", name="uq_doctor_hospital_user_hospital"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    doctor = relationship("User", back_populates="hospital_memberships")
    hospital = relationship("Hospital", back_populates="doctor_memberships")
