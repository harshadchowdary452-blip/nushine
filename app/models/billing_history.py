import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class BillingHistory(Base):
    __tablename__ = "billing_histories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    billing_id: Mapped[str] = mapped_column(String(36), ForeignKey("billings.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    previous_data: Mapped[str] = mapped_column(Text, nullable=True)
    new_data: Mapped[str] = mapped_column(Text, nullable=True)
    changes_summary: Mapped[str] = mapped_column(String(500), nullable=True)
    performed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    billing = relationship("Billing", backref="history_entries")
