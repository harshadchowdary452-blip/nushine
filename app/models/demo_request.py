import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DemoRequestStatus:
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    DEMO_SCHEDULED = "DEMO_SCHEDULED"
    COMPLETED = "COMPLETED"
    CONVERTED = "CONVERTED"
    CLOSED = "CLOSED"

    ALL = [NEW, CONTACTED, DEMO_SCHEDULED, COMPLETED, CONVERTED, CLOSED]


class DemoRequest(Base):
    __tablename__ = "demo_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    role: Mapped[str] = mapped_column(String(100), nullable=True)
    num_hospitals: Mapped[str] = mapped_column(String(50), nullable=True)
    num_doctors: Mapped[str] = mapped_column(String(50), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=True)
    preferred_date: Mapped[str] = mapped_column(String(50), nullable=True)
    preferred_time: Mapped[str] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=DemoRequestStatus.NEW)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
