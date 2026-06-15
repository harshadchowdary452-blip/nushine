import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class WhatsAppConfig(Base):
    __tablename__ = "whatsapp_configs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    hospital_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    clinic_whatsapp_number: Mapped[str] = mapped_column(String(20), nullable=True)
    country_code: Mapped[str] = mapped_column(String(5), default="+91")
    default_message_templates_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    broadcast_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    campaign_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
