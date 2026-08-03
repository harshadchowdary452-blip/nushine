import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Integer, DateTime, Date, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CrmAutomationLog(Base):
    """Audit trail for every CRM automation decision (CREATE / CANCEL / SKIP)."""
    __tablename__ = "crm_automation_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    case_id: Mapped[str] = mapped_column(String(36), nullable=True)
    event: Mapped[str] = mapped_column(String(50), nullable=True)
    rule: Mapped[str] = mapped_column(String(100), nullable=True)
    enquiry_type: Mapped[str] = mapped_column(String(50), nullable=True)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # CREATE | CANCEL | SKIP
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    occurrence_number: Mapped[int] = mapped_column(Integer, nullable=True)
    chain_id: Mapped[str] = mapped_column(String(36), nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=True)
    config_snapshot: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
