"""Event Log — persistent audit trail for all CRM events."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class EventLog(Base):
    __tablename__ = "event_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    source_module: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    group_id: Mapped[str] = mapped_column(String(36), nullable=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    doctor_id: Mapped[str] = mapped_column(String(36), nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(36), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING", index=True)
    processing_time_ms: Mapped[float] = mapped_column(Float, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
