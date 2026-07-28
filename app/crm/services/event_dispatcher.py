"""
Centralized Event Dispatcher — SINGLE entry point for ALL ERP events.

Flow:
  Event → Validate → Identify Hospital → Rule Engine → Execute → Log → Return

ONE event → ONE rule engine → ONE decision → ONE enquiry
"""
import json
import logging
import time as _time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timezone
from typing import Optional, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger("crm.event_dispatcher")


# ============================================================
# Supported Events
# ============================================================

SUPPORTED_EVENTS = {
    "LEAD_CREATED", "LEAD_UPDATED", "LEAD_CONVERTED", "LEAD_LOST",
    "PATIENT_REGISTERED", "PATIENT_UPDATED", "PATIENT_STATUS_CHANGED",
    "PATIENT_INACTIVE", "PATIENT_DEACTIVATED",
    "OPD_CONSULTATION_COMPLETED",
    "APPOINTMENT_CREATED", "APPOINTMENT_UPDATED", "APPOINTMENT_CANCELLED",
    "APPOINTMENT_COMPLETED", "APPOINTMENT_RESCHEDULED", "APPOINTMENT_MISSED",
    "TREATMENT_CREATED", "TREATMENT_STARTED", "TREATMENT_COMPLETED", "TREATMENT_VISIT_COMPLETED",
    "CASE_CREATED", "CASE_UPDATED", "CASE_COMPLETED", "CASE_REOPENED", "CASE_APPROVED",
    "PAYMENT_CREATED", "PAYMENT_RECEIVED",
    "COMMUNICATION_SENT", "COMMUNICATION_FAILED",
    "FOLLOWUP_COMPLETED", "CAMPAIGN_COMPLETED",
    "ENQUIRY_CREATED", "ENQUIRY_CONVERTED",
    "RECALL_COMPLETED",
}


# ============================================================
# Event Payload
# ============================================================

@dataclass
class EventPayload:
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
# Decision — the output of the rule engine
# ============================================================

@dataclass
class Decision:
    """A single decision from the rule engine. Each Decision = one enquiry to create (or cancel)."""
    action: str  # "CREATE" or "CANCEL"
    enquiry_type: Optional[str] = None
    due_date: Optional[date] = None
    priority: str = "MEDIUM"
    # Entity references
    patient_id: Optional[str] = None
    lead_id: Optional[str] = None
    case_id: Optional[str] = None
    treatment_plan_id: Optional[str] = None
    treatment_type_id: Optional[str] = None
    appointment_id: Optional[str] = None
    doctor_id: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    # Metadata
    crm_rule_id: Optional[str] = None
    trigger_event: Optional[str] = None
    description: Optional[str] = None
    treatment_name: Optional[str] = None
    # For CANCEL action
    cancel_enquiry_types: Optional[list[str]] = None
    cancel_reason: Optional[str] = None
    # Recurrence fields (RECALL only)
    is_recurring: bool = False
    occurrence_number: int = 1
    recurrence_interval_days: Optional[int] = None
    chain_id: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if self.due_date and isinstance(self.due_date, date):
            d["due_date"] = self.due_date.isoformat()
        return d


# ============================================================
# Rule Evaluation Result (kept for backward compat logging)
# ============================================================

@dataclass
class RuleEvaluationResult:
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
    start_delay_days: int = 0
    auto_close: bool = False
    settings_loaded: bool = False
    crm_enabled: bool = True
    working_days: list[str] = field(default_factory=list)
    business_hours_start: str = ""
    business_hours_end: str = ""
    timezone: str = ""
    holidays: list[str] = field(default_factory=list)
    processing_time_ms: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ============================================================
# Centralized Event Dispatcher
# ============================================================

class CentralEventDispatcher:
    """
    SINGLE centralized dispatcher for ALL ERP events.

    Flow: Event → Validate → Identify Hospital → Rule Engine → Execute → Log → Return
    """

    def __init__(self):
        self._rule_engine = None
        self._executor = None

    def set_rule_engine(self, rule_engine):
        self._rule_engine = rule_engine

    def set_executor(self, executor):
        self._executor = executor

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
        start = _time.monotonic()

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

        if not event_type or event_type not in SUPPORTED_EVENTS:
            elapsed = (_time.monotonic() - start) * 1000
            return {"event": event.to_dict(), "decision": None, "execution_results": [], "processing_time_ms": elapsed}

        resolved_hospital_id = await self._resolve_hospital_id(db, event)
        if not resolved_hospital_id:
            elapsed = (_time.monotonic() - start) * 1000
            await self._log_event(db, event, None, elapsed, "No hospital_id")
            return {"event": event.to_dict(), "decision": None, "execution_results": [], "processing_time_ms": elapsed}

        event.hospital_id = resolved_hospital_id

        # Merge top-level params into payload so rule engine handlers can access them
        merged_payload = dict(payload or {})
        if patient_id and "patient_id" not in merged_payload:
            merged_payload["patient_id"] = patient_id
        if doctor_id and "doctor_id" not in merged_payload:
            merged_payload["doctor_id"] = doctor_id
        if entity_id and "entity_id" not in merged_payload:
            merged_payload["entity_id"] = entity_id

        # Rule Engine — the SINGLE decision maker
        decisions = []
        if self._rule_engine:
            try:
                decisions = await self._rule_engine.evaluate(
                    db=db, hospital_id=resolved_hospital_id,
                    event_type=event_type, entity_type=entity_type,
                    entity_id=entity_id, payload=merged_payload,
                )
            except Exception as exc:
                logger.error("RULE_ENGINE_FAILED: event=%s error=%s", event.event_id, str(exc), exc_info=True)

        # Execute — each Decision creates/cancels one enquiry
        execution_results = []
        if decisions and self._executor:
            for decision in decisions:
                try:
                    result = await self._executor.execute(
                        db=db,
                        hospital_id=resolved_hospital_id,
                        decision=decision,
                        event_data=merged_payload,
                    )
                    execution_results.append(result)
                    logger.info(
                        "ENQUIRY_EXECUTED: event=%s action=%s type=%s created=%d skipped=%d",
                        event.event_id, decision.action, decision.enquiry_type,
                        result.enquiries_created, result.enquiries_skipped,
                    )
                except Exception as exc:
                    logger.error("ENQUIRY_EXECUTION_FAILED: event=%s error=%s", event.event_id, str(exc), exc_info=True)

        elapsed = (_time.monotonic() - start) * 1000
        await self._log_event(db, event, decisions, elapsed)

        logger.info(
            "EVENT_DISPATCHED: type=%s entity=%s/%s hospital=%s decisions=%d elapsed=%.1fms",
            event_type, entity_type, entity_id, resolved_hospital_id,
            len(decisions), elapsed,
        )

        return {
            "event": event.to_dict(),
            "decisions": [d.to_dict() for d in decisions],
            "execution_results": [asdict(r) if hasattr(r, '__dataclass_fields__') else r for r in execution_results],
            "processing_time_ms": elapsed,
        }

    async def _resolve_hospital_id(self, db: Optional[AsyncSession], event: EventPayload) -> Optional[str]:
        if event.hospital_id:
            return event.hospital_id
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
                from app.models.patient import Patient
                case_q = await db.execute(select(Case.patient_id).where(Case.id == event.entity_id))
                case_row = case_q.scalar_one_or_none()
                if case_row:
                    hosp_q = await db.execute(select(Patient.hospital_id).where(Patient.id == case_row))
                    return hosp_q.scalar_one_or_none()
            if event.entity_type == "APPOINTMENT":
                from app.models.appointment import Appointment
                from app.models.patient import Patient
                appt_q = await db.execute(select(Appointment.patient_id).where(Appointment.id == event.entity_id))
                appt_row = appt_q.scalar_one_or_none()
                if appt_row:
                    hosp_q = await db.execute(select(Patient.hospital_id).where(Patient.id == appt_row))
                    return hosp_q.scalar_one_or_none()
            if event.entity_type == "TREATMENT":
                from app.models.treatment_plan import TreatmentPlan
                from app.models.case import Case
                from app.models.patient import Patient
                tp_q = await db.execute(select(TreatmentPlan.case_id).where(TreatmentPlan.id == event.entity_id))
                tp_row = tp_q.scalar_one_or_none()
                if tp_row:
                    case_q = await db.execute(select(Case.patient_id).where(Case.id == tp_row))
                    case_row = case_q.scalar_one_or_none()
                    if case_row:
                        hosp_q = await db.execute(select(Patient.hospital_id).where(Patient.id == case_row))
                        return hosp_q.scalar_one_or_none()
        except Exception as exc:
            logger.warning("HOSPITAL_RESOLVE_FAILED: entity=%s/%s error=%s", event.entity_type, event.entity_id, str(exc))
        return None

    async def _log_event(self, db, event, decisions, processing_time_ms, error=None):
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
                    "decisions_count": len(decisions) if decisions else 0,
                    "decision_types": [d.enquiry_type for d in decisions] if decisions else [],
                    "reason": error,
                }),
                status="COMPLETED" if not error else "FAILED",
                processing_time_ms=processing_time_ms,
                error_message=error,
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
    global _dispatcher_instance
    if _dispatcher_instance is None:
        _dispatcher_instance = CentralEventDispatcher()
    return _dispatcher_instance


# ============================================================
# Public convenience function — SINGLE entry point for all callers
# ============================================================

async def publish_event(
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
    """Publish an event. SINGLE entry point for ALL callers."""
    dispatcher = get_central_dispatcher()
    return await dispatcher.dispatch(
        event_type=event_type, source_module=source_module,
        entity_type=entity_type, entity_id=entity_id,
        hospital_id=hospital_id, patient_id=patient_id,
        doctor_id=doctor_id, triggered_by=triggered_by,
        payload=payload, db=db,
    )
