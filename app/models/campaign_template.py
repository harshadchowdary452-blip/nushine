import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from enum import Enum


class TemplateChannel(str, Enum):
    WHATSAPP = "WHATSAPP"
    SMS = "SMS"
    EMAIL = "EMAIL"


class TemplateCategory(str, Enum):
    APPOINTMENT_REMINDER = "APPOINTMENT_REMINDER"
    PROMOTIONAL = "PROMOTIONAL"
    FOLLOW_UP = "FOLLOW_UP"
    RECALL = "RECALL"
    FESTIVAL_GREETING = "FESTIVAL_GREETING"
    DENTAL_AWARENESS = "DENTAL_AWARENESS"
    GENERAL = "GENERAL"
    CUSTOM = "CUSTOM"


class CampaignTemplate(Base):
    __tablename__ = "campaign_templates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    channel: Mapped[TemplateChannel] = mapped_column(SAEnum(TemplateChannel, create_constraint=False), default=TemplateChannel.WHATSAPP, nullable=False)
    category: Mapped[TemplateCategory] = mapped_column(SAEnum(TemplateCategory, create_constraint=False), default=TemplateCategory.GENERAL, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
