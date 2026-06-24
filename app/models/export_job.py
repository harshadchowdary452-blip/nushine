import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ExportJob(Base):
    __tablename__ = "export_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=True)
    module: Mapped[str] = mapped_column(String(100), nullable=False)
    format: Mapped[str] = mapped_column(String(10), nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=True, default="this_month")
    start_date: Mapped[str] = mapped_column(String(20), nullable=True)
    end_date: Mapped[str] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    file_path: Mapped[str] = mapped_column(Text, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
