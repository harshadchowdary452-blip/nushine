import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Integer, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CrmFollowUpConfig(Base):
    __tablename__ = "crm_follow_up_configs"
    __table_args__ = (
        UniqueConstraint("hospital_id", "context_type", "treatment_type_id", name="uq_follow_up_config_context"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospitals.id"), nullable=False, index=True)
    context_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    treatment_type_id: Mapped[str] = mapped_column(String(36), ForeignKey("treatment_types.id"), nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    start_delay_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    auto_close_on_completion: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    skip_wellness_if_appointment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    days_between_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    auto_close_after_final: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_close_action: Mapped[str] = mapped_column(String(30), default="KEEP_OPEN", nullable=False)
    stop_automation_on: Mapped[str] = mapped_column(String(100), default="CONVERTED,NOT_INTERESTED,LOST", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
