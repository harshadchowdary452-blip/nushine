"""Automation Rule Logs — audit trail for rule execution."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutomationRuleLog(Base):
    __tablename__ = "automation_rule_logs"
    id = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = mapped_column(String(36), ForeignKey("automation_rules.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = mapped_column(String(50), nullable=False)
    entity_type = mapped_column(String(50), nullable=True)
    entity_id = mapped_column(String(36), nullable=True)
    hospital_id = mapped_column(String(36), nullable=True, index=True)
    patient_id = mapped_column(String(36), nullable=True)
    triggered_by = mapped_column(String(36), nullable=True)
    action_type = mapped_column(String(50), nullable=True)
    action_result = mapped_column(Text, nullable=True)  # JSON result
    execution_status = mapped_column(String(20), nullable=False, default="COMPLETED")
    execution_time_ms = mapped_column(Float, nullable=True)
    error_message = mapped_column(Text, nullable=True)
    conditions_matched = mapped_column(Text, nullable=True)  # JSON of matched conditions
    is_test = mapped_column(String(1), default="N")  # Y = test execution, N = real
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
