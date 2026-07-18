"""Automation Rule Actions — configurable actions to execute when rules match."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutomationRuleAction(Base):
    __tablename__ = "automation_rule_actions"
    id = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = mapped_column(String(36), ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = mapped_column(String(50), nullable=False)  # CREATE_FOLLOW_UP, SEND_WHATSAPP, etc.
    action_config = mapped_column(Text, nullable=True)  # JSON config for the action
    delay_days = mapped_column(Integer, default=0)
    delay_hours = mapped_column(Integer, default=0)
    responsible_role = mapped_column(String(30), nullable=True)
    priority = mapped_column(String(10), default="MEDIUM")
    max_retries = mapped_column(Integer, default=1)
    retry_delay_hours = mapped_column(Integer, default=24)
    business_hours_only = mapped_column(Boolean, default=False)
    is_active = mapped_column(Boolean, default=True)
    sort_order = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
