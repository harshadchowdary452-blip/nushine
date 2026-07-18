"""Automation Rule Conditions — configurable conditions for rule matching."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutomationRuleCondition(Base):
    __tablename__ = "automation_rule_conditions"
    id = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = mapped_column(String(36), ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    field_name = mapped_column(String(100), nullable=False)  # e.g., "procedure", "patient_age", "payment_status"
    operator = mapped_column(String(20), nullable=False, default="EQUALS")  # EQUALS, NOT_EQUALS, CONTAINS, etc.
    value = mapped_column(Text, nullable=True)  # JSON value to compare against
    value_type = mapped_column(String(20), default="STRING")  # STRING, NUMBER, BOOLEAN, JSON, LIST
    group_key = mapped_column(String(50), nullable=True)  # For grouping conditions (e.g., "group1")
    sort_order = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
