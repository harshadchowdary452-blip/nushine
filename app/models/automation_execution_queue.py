"""Automation Execution Queue — delayed action execution."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutomationExecutionQueue(Base):
    __tablename__ = "automation_execution_queue"
    id = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = mapped_column(String(36), ForeignKey("automation_rules.id", ondelete="SET NULL"), nullable=True, index=True)
    action_id = mapped_column(String(36), ForeignKey("automation_rule_actions.id", ondelete="SET NULL"), nullable=True)
    event_type = mapped_column(String(50), nullable=False)
    entity_type = mapped_column(String(50), nullable=True)
    entity_id = mapped_column(String(36), nullable=True)
    hospital_id = mapped_column(String(36), nullable=True, index=True)
    patient_id = mapped_column(String(36), nullable=True)
    action_type = mapped_column(String(50), nullable=False)
    action_config = mapped_column(Text, nullable=True)  # JSON config
    scheduled_at = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    execute_after = mapped_column(DateTime(timezone=True), nullable=True)
    status = mapped_column(String(20), nullable=False, default="QUEUED", index=True)
    priority = mapped_column(String(10), default="MEDIUM")
    retry_count = mapped_column(Integer, default=0)
    max_retries = mapped_column(Integer, default=3)
    retry_delay_hours = mapped_column(Integer, default=24)
    error_message = mapped_column(Text, nullable=True)
    result = mapped_column(Text, nullable=True)  # JSON result
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    processed_at = mapped_column(DateTime(timezone=True), nullable=True)
