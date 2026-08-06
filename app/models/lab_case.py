import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Text, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LabCase(Base):
    __tablename__ = "lab_cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    treatment_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_plans.id"), nullable=False, unique=True, index=True)
    laboratory_id: Mapped[str] = mapped_column(String(36), ForeignKey("laboratories.id"), nullable=True, index=True)
    lab_status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(100), nullable=True)
    tooth_number: Mapped[str] = mapped_column(String(255), nullable=True)
    material: Mapped[str] = mapped_column(String(255), nullable=True)
    sent_date: Mapped[date] = mapped_column(Date, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=True)
    returned_date: Mapped[date] = mapped_column(Date, nullable=True)
    lab_cost: Mapped[float] = mapped_column(Float, nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    treatment_plan = relationship("TreatmentPlan", lazy="selectin")
    laboratory = relationship("Laboratory", back_populates="lab_cases", lazy="selectin")
    events = relationship("LabCaseEvent", back_populates="lab_case", cascade="all, delete-orphan", lazy="selectin", order_by="LabCaseEvent.created_at")
