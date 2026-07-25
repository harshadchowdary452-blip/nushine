"""
Centralized Event Dispatcher — SINGLE entry point for all CRM events.

Responsibilities:
  1. Receive Event
  2. Validate Event (type, hospital, entity)
  3. Identify Hospital
  4. Identify Entity
  5. Forward Event to Rule Engine
  6. Log Event
  7. Return Decision

No database inserts. No side effects. Pure decision engine.
"""
import json
import logging
import time as _time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger("crm.event_dispatcher")


# ============================================================
# Supported Events — Phase 3.3
# ============================================================

SUPPORTED_EVENTS = {
    # Lead events
    "LEAD_CREATED",
    "LEAD_UPDATED",
    # Patient events
    "PATIENT_REGISTERED",
    "PATIENT_STATUS_CHANGED",
    "PATIENT_INACTIVE",
    # Appointment events
    "APPOINTMENT_CREATED",
    "APPOINTMENT_UPDATED",
    "APPOINTMENT_CANCELLED",
    "APPOINTMENT_COMPLETED",
    # Treatment events
    "TREATMENT_STARTED",
    "TREATMENT_COMPLETED",
    # Case events
    "CASE_COMPLETED",
}


# ============================================================
# Event Payload
# ============================================================

@dataclass
class EventPayload:
    """Standard event payload — every event uses this single model."""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = ""
    source_module: str = ""
    entity_type: str = ""
    entity_id: str = ""
    hospital_id: Optional[str] = None
    group_id: Optional[str] = None
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    triggered_by: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    correlation_id: Optional[str] = None
    payload: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ============================================================
# Rule Evaluation Result
# ============================================================

@dataclass
class RuleEvaluationResult:
    """Structured result from rule evaluation. NO database records created."""
    matched: bool = False
    reason: str = ""
    rule_id: Optional[str] = None
    rule_name: Optional[str] = None
    rule_type: Optional[str] = None
    scope: Optional[str] = None
    action: Optional[str] = None
    treatment_type_id: Optional[str] = None
    treatment_type_name: Optional[str] = None
    hospital_id: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    # Configuration used
    start_delay_days: int = 0
    num_follow_ups: int = 0
    gap_days: int = 0
    auto_close: bool = False
    # Settings snapshot
    settings_loaded: bool = False
    crm_enabled: bool = True
    working_days: list[str] = field(default_factory=list)
    business_hours_start: str = ""
    business_hours_end: str = ""
    timezone: str = ""
    holidays: list[str] = field(default_factory=list)
    # Processing
    processing_time_ms: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ============================================================
# Centralized Event Dispatcher
# ============================================================

class CentralEventDispatcher:
    """
    SINGLE centralized dispatcher for all CRM events.

    Flow: Event → Validate → Identify Hospital → Identify Entity → Rule Engine → Log → Return
    """

    def __init__(self):
        self._rule_engine = None

    def set_rule_engine(self, rule_engine):
        """Inject the rule engine (avoids circular imports)."""
        self._rule_engine = rule_engine

    async def dispatch(
        self,
        event_type: str,
        source_module: str,
        entity_type: str,
        entity_id: str,
        hospital_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        triggered_by: Optional[str] = None,
        payload: Optional[dict] = None,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """
        Central entry point for all CRM events.

        Returns a dict with:
          - event: EventPayload details
          - evaluation: RuleEvaluationResult
          - processing_time_ms: float
        """
        start = _time.monotonic()

        # 1. Build event
        event = EventPayload(
            event_type=event_type,
            source_module=source_module,
            entity_type=entity_type,
            entity_id=entity_id,
            hospital_id=hospital_id,
            patient_id=patient_id,
            doctor_id=doctor_id,
            triggered_by=triggered_by,
            correlation_id=str(uuid.uuid4()),
            payload=payload or {},
        )

        # 2. Validate event
        validation_error = self._validate_event(event)
        if validation_error:
            elapsed = (_time.monotonic() - start) * 1000
            result = RuleEvaluationResult(
                matched=False,
                reason=f"Validation failed: {validation_error}",
                hospital_id=hospital_id,
                entity_type=entity_type,
                entity_id=entity_id,
                processing_time_ms=elapsed,
                error=validation_error,
            )
            await self._log_event(db, event, result, elapsed)
            return {"event": event.to_dict(), "evaluation": result.to_dict(), "processing_time_ms": elapsed}

        # 3. Identify hospital (from event or entity lookup)
        resolved_hospital_id = await self._resolve_hospital_id(db, event)
        if not resolved_hospital_id:
            elapsed = (_time.monotonic() - start) * 1000
            result = RuleEvaluationResult(
                matched=False,
                reason="Could not resolve hospital_id",
                hospital_id=None,
                entity_type=entity_type,
                entity_id=entity_id,
                processing_time_ms=elapsed,
                error="No hospital_id found",
            )
            await self._log_event(db, event, result, elapsed)
            return {"event": event.to_dict(), "evaluation": result.to_dict(), "processing_time_ms": elapsed}

        event.hospital_id = resolved_hospital_id

        # 4. Forward to Rule Engine
        evaluation = RuleEvaluationResult(
            hospital_id=resolved_hospital_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )

        if self._rule_engine:
            try:
                evaluation = await self._rule_engine.evaluate(
                    db=db,
                    hospital_id=resolved_hospital_id,
                    event_type=event_type,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    payload=payload or {},
                )
            except Exception as exc:
                logger.error("RULE_ENGINE_FAILED: event=%s error=%s", event.event_id, str(exc), exc_info=True)
                evaluation.error = str(exc)
                evaluation.reason = f"Rule engine error: {str(exc)}"
        else:
            evaluation.reason = "No rule engine configured"
            evaluation.matched = False

        elapsed = (_time.monotonic() - start) * 1000
        evaluation.processing_time_ms = elapsed

        # 5. Log event
        await self._log_event(db, event, evaluation, elapsed)

        logger.info(
            "EVENT_DISPATCHED: type=%s entity=%s/%s hospital=%s matched=%s elapsed=%.1fms",
            event_type, entity_type, entity_id, resolved_hospital_id, evaluation.matched, elapsed,
        )

        return {"event": event.to_dict(), "evaluation": evaluation.to_dict(), "processing_time_ms": elapsed}

    def _validate_event(self, event: EventPayload) -> Optional[str]:
        """Validate event structure. Returns error message or None."""
        if not event.event_type:
            return "event_type is required"
        if event.event_type not in SUPPORTED_EVENTS:
            return f"Unsupported event_type: {event.event_type}. Supported: {', '.join(sorted(SUPPORTED_EVENTS))}"
        if not event.entity_type:
            return "entity_type is required"
        if not event.entity_id:
            return "entity_id is required"
        return None

    async def _resolve_hospital_id(self, db: Optional[AsyncSession], event: EventPayload) -> Optional[str]:
        """Resolve hospital_id from event or entity lookup."""
        # 1. Direct from event
        if event.hospital_id:
            return event.hospital_id

        # 2. Lookup from entity
        if not db:
            return None

        try:
            if event.entity_type == "PATIENT" and event.patient_id:
                from app.models.patient import Patient
                result = await db.execute(select(Patient.hospital_id).where(Patient.id == event.patient_id))
                return result.scalar_one_or_none()

            if event.entity_type == "LEAD":
                from app.models.lead import Lead
                result = await db.execute(select(Lead.hospital_id).where(Lead.id == event.entity_id))
                return result.scalar_one_or_none()

            if event.entity_type == "CASE":
                from app.models.case import Case
                result = await db.execute(select(Case.hospital_id).where(Case.id == event.entity_id))
                return result.scalar_one_or_none()

            if event.entity_type == "APPOINTMENT":
                from app.models.appointment import Appointment
                result = await db.execute(select(Appointment.hospital_id).where(Appointment.id == event.entity_id))
                return result.scalar_one_or_none()

            if event.entity_type == "TREATMENT":
                from app.models.treatment_plan import TreatmentPlan
                result = await db.execute(select(TreatmentPlan.hospital_id).where(TreatmentPlan.id == event.entity_id))
                return result.scalar_one_or_none()
        except Exception as exc:
            logger.warning("HOSPITAL_RESOLVE_FAILED: entity=%s/%s error=%s", event.entity_type, event.entity_id, str(exc))

        return None

    async def _log_event(
        self,
        db: Optional[AsyncSession],
        event: EventPayload,
        evaluation: RuleEvaluationResult,
        processing_time_ms: float,
    ) -> None:
        """Log event to event_log table for auditing and debugging."""
        if not db:
            return
        try:
            from app.models.event_log import EventLog
            log = EventLog(
                event_id=event.event_id,
                event_type=event.event_type,
                source_module=event.source_module or "CRM_DISPATCHER",
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                hospital_id=event.hospital_id,
                group_id=event.group_id,
                patient_id=event.patient_id,
                doctor_id=event.doctor_id,
                triggered_by=event.triggered_by,
                correlation_id=event.correlation_id,
                payload_json=json.dumps(event.payload) if event.payload else None,
                metadata_json=json.dumps({
                    "matched": evaluation.matched,
                    "rule_id": evaluation.rule_id,
                    "rule_name": evaluation.rule_name,
                    "reason": evaluation.reason,
                }) if evaluation else None,
                status="COMPLETED" if not evaluation.error else "FAILED",
                processing_time_ms=processing_time_ms,
                error_message=evaluation.error,
                created_at=datetime.now(timezone.utc),
                processed_at=datetime.now(timezone.utc),
            )
            db.add(log)
            await db.flush()
        except Exception as exc:
            logger.warning("EVENT_LOG_FAILED (non-fatal): %s", str(exc))


# ============================================================
# Singleton
# ============================================================

_dispatcher_instance: Optional[CentralEventDispatcher] = None


def get_central_dispatcher() -> CentralEventDispatcher:
    """Get or create the centralized dispatcher singleton."""
    global _dispatcher_instance
    if _dispatcher_instance is None:
        _dispatcher_instance = CentralEventDispatcher()
    return _dispatcher_instance
