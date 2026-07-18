"""Automation Rule Versions — version history for rule changes."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutomationRuleVersion(Base):
    __tablename__ = "automation_rule_versions"
    id = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = mapped_column(String(36), ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    version = mapped_column(Integer, nullable=False)
    rule_snapshot = mapped_column(Text, nullable=False)  # JSON snapshot of the full rule
    change_summary = mapped_column(Text, nullable=True)
    created_by = mapped_column(String(36), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
