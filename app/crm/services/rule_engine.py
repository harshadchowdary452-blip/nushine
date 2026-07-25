"""
CRM Rule Engine v2 — Decision-only automation engine.

 SINGLE source of truth for CRM rule evaluation.

This engine evaluates business rules and returns structured decisions.
NO database inserts. NO side effects. Pure evaluation.

Pipeline:
  Event → Load CRM Settings → Load Clinical Settings → Load Rules →
  Evaluate Rules → Return Decision

Phase 3.3: Decision engine only.
Phase 3.4: Will add execution layer on top of this engine.
"""
import logging
from datetime import date, timedelta, time as dt_time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

logger = logging.getLogger("crm.rule_engine_v2")


# ============================================================
# Event → TriggerEvent mapping
# ============================================================

EVENT_TO_TRIGGER = {
    "LEAD_CREATED": "PATIENT_REGISTERED",
    "LEAD_UPDATED": None,
    "PATIENT_REGISTERED": "PATIENT_REGISTERED",
    "PATIENT_STATUS_CHANGED": None,
    "PATIENT_INACTIVE": "PATIENT_INACTIVE",
    "APPOINTMENT_CREATED": "APPOINTMENT_CREATED",
    "APPOINTMENT_UPDATED": "APPOINTMENT_CREATED",
    "APPOINTMENT_CANCELLED": "APPOINTMENT_CANCELLED",
    "APPOINTMENT_COMPLETED": "APPOINTMENT_COMPLETED",
    "TREATMENT_STARTED": "TREATMENT_STARTED",
    "TREATMENT_COMPLETED": "TREATMENT_COMPLETED",
    "CASE_COMPLETED": "CASE_COMPLETED",
}

# Event → Rule Type mapping
EVENT_TO_RULE_TYPE = {
    "LEAD_CREATED": "LEAD",
    "LEAD_UPDATED": "LEAD",
    "PATIENT_REGISTERED": "LEAD",
    "PATIENT_STATUS_CHANGED": "LEAD",
    "PATIENT_INACTIVE": "LEAD",
    "APPOINTMENT_CREATED": "TREATMENT",
    "APPOINTMENT_UPDATED": "TREATMENT",
    "APPOINTMENT_CANCELLED": "TREATMENT",
    "APPOINTMENT_COMPLETED": "LEAD",
    "TREATMENT_STARTED": "TREATMENT",
    "TREATMENT_COMPLETED": "TREATMENT",
    "CASE_COMPLETED": "TREATMENT",
}

# Event → Scope mapping
EVENT_TO_SCOPE = {
    "LEAD_CREATED": "LEAD",
    "LEAD_UPDATED": "LEAD",
    "PATIENT_REGISTERED": "LEAD",
    "PATIENT_STATUS_CHANGED": "LEAD",
    "PATIENT_INACTIVE": "LEAD",
    "APPOINTMENT_CREATED": "APPOINTMENT",
    "APPOINTMENT_UPDATED": "APPOINTMENT",
    "APPOINTMENT_CANCELLED": "APPOINTMENT",
    "APPOINTMENT_COMPLETED": "APPOINTMENT",
    "TREATMENT_STARTED": "VISIT",
    "TREATMENT_COMPLETED": "VISIT",
    "CASE_COMPLETED": "CASE",
}


# ============================================================
# Rule Engine Service — Decision Only
# ============================================================

class RuleEngineService:
    """
    Decision-only CRM rule engine.

    Evaluates business rules and returns structured decisions.
    NO database inserts. NO side effects.
    """

    def __init__(self):
        pass

    async def evaluate(
        self,
        db: AsyncSession,
        hospital_id: str,
        event_type: str,
        entity_type: str,
        entity_id: str,
        payload: Optional[dict] = None,
    ):
        """
        Evaluate CRM rules for a given event.

        Returns RuleEvaluationResult with:
          - matched: bool
          - reason: str
          - rule details
          - configuration used
          - settings snapshot
        """
        from app.crm.services.event_dispatcher import RuleEvaluationResult

        payload = payload or {}
        result = RuleEvaluationResult(
            hospital_id=hospital_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )

        # 1. Load CRM Settings
        settings = await self._load_crm_settings(db, hospital_id, result)
        if not settings:
            return result

        # 2. Check if CRM is enabled
        if not settings.enabled:
            result.reason = "CRM is disabled for this hospital"
            result.matched = False
            return result

        # 3. Map event to trigger
        trigger_event = EVENT_TO_TRIGGER.get(event_type)
        if trigger_event is None:
            result.reason = f"No trigger mapping for event_type: {event_type}"
            result.matched = False
            return result

        # 4. Determine rule type and scope
        rule_type = EVENT_TO_RULE_TYPE.get(event_type)
        scope = EVENT_TO_SCOPE.get(event_type)

        # 5. Load treatment type from payload (if applicable)
        treatment_type_id = payload.get("treatment_type_id")
        treatment_type_name = None

        # 6. Load matching rules from database
        rules = await self._load_rules(db, hospital_id, trigger_event, rule_type, treatment_type_id, scope)
        if not rules:
            result.reason = f"No active rules found for trigger={trigger_event}, type={rule_type}, scope={scope}"
            result.matched = False
            return result

        # 7. Sort by priority (treatment_type > category > global)
        rules = self._sort_rules_by_priority(rules)

        # 8. Evaluate rules — find first match
        for rule in rules:
            # Visit stage filtering
            if rule.visit_stage and rule.visit_stage != "ANY":
                event_visit = payload.get("visit_stage", "ANY")
                if rule.visit_stage != event_visit:
                    continue

            # Treatment type filtering
            if rule.treatment_type_id and treatment_type_id and rule.treatment_type_id != treatment_type_id:
                continue

            # Load follow-up config for this rule
            follow_up_config = await self._load_follow_up_config(
                db, hospital_id, rule, treatment_type_id
            )

            # Build result
            result.matched = True
            result.rule_id = rule.id
            result.rule_name = rule.rule_name
            result.rule_type = rule.rule_type
            result.scope = rule.scope
            result.action = rule.action
            result.treatment_type_id = rule.treatment_type_id or treatment_type_id

            # Load treatment type name if available
            if result.treatment_type_id and not treatment_type_name:
                treatment_type_name = await self._load_treatment_type_name(db, result.treatment_type_id)
            result.treatment_type_name = treatment_type_name

            # Apply follow-up config
            if follow_up_config:
                result.start_delay_days = follow_up_config.start_delay_days
                result.num_follow_ups = follow_up_config.num_follow_ups
                result.gap_days = follow_up_config.gap_days
                result.auto_close = follow_up_config.auto_close_on_completion
            else:
                # Use rule defaults
                result.start_delay_days = rule.delay_value if rule.delay_unit == "DAYS" else 0
                result.num_follow_ups = 3
                result.gap_days = 2
                result.auto_close = False

            # Calculate due date
            result.reason = (
                f"Matched rule '{rule.rule_name}' for trigger '{trigger_event}' | "
                f"Delay: {result.start_delay_days} days | "
                f"Follow-ups: {result.num_follow_ups} | "
                f"Gap: {result.gap_days} days"
            )

            logger.info(
                "RULE_MATCHED: hospital=%s rule=%s trigger=%s entity=%s/%s",
                hospital_id, rule.rule_name, trigger_event, entity_type, entity_id,
            )
            return result

        # No rule matched after filtering
        result.reason = (
            f"Loaded {len(rules)} rules for trigger={trigger_event} but none matched | "
            f"treatment_type_id={treatment_type_id} scope={scope}"
        )
        result.matched = False
        return result

    # ============================================================
    # Settings Loading
    # ============================================================

    async def _load_crm_settings(self, db: AsyncSession, hospital_id: str, result) -> Optional[object]:
        """Load CRM settings from CRMSettingsService (cached)."""
        try:
            from app.crm.services.crm_settings import get_settings_service
            settings_svc = get_settings_service()
            settings = await settings_svc.get_settings(db, hospital_id)

            # Populate result with settings snapshot
            result.settings_loaded = True
            result.crm_enabled = settings.enabled
            result.working_days = settings.working_days
            result.business_hours_start = settings.business_hours_start.strftime("%H:%M") if settings.business_hours_start else ""
            result.business_hours_end = settings.business_hours_end.strftime("%H:%M") if settings.business_hours_end else ""
            result.timezone = settings.timezone
            result.holidays = settings.holidays

            return settings
        except Exception as exc:
            logger.error("CRM_SETTINGS_LOAD_FAILED: hospital=%s error=%s", hospital_id, str(exc))
            result.error = f"Failed to load CRM settings: {str(exc)}"
            result.reason = "CRM settings unavailable"
            return None

    # ============================================================
    # Rule Loading
    # ============================================================

    async def _load_rules(
        self,
        db: AsyncSession,
        hospital_id: str,
        trigger_event: str,
        rule_type: Optional[str] = None,
        treatment_type_id: Optional[str] = None,
        scope: Optional[str] = None,
    ) -> list:
        """Load active rules matching hospital, trigger, and optionally treatment type / scope."""
        from app.models.crm_rule import CrmRule

        q = select(CrmRule).where(
            and_(
                CrmRule.hospital_id == hospital_id,
                CrmRule.trigger_event == trigger_event,
                CrmRule.is_active == True,
            )
        )
        if rule_type:
            q = q.where(CrmRule.rule_type == rule_type)
        if scope:
            q = q.where(CrmRule.scope == scope)
        if treatment_type_id:
            q = q.where(
                (CrmRule.treatment_type_id == treatment_type_id)
                | (CrmRule.treatment_type_id.is_(None))
            )

        result = await db.execute(q)
        rules = list(result.scalars().all())

        logger.debug(
            "RULES_LOADED: hospital=%s trigger=%s type=%s scope=%s count=%d",
            hospital_id, trigger_event, rule_type, scope, len(rules),
        )
        return rules

    def _sort_rules_by_priority(self, rules: list) -> list:
        """Sort rules: treatment_type > treatment_category > global."""
        def priority_key(r):
            if r.treatment_type_id:
                return (0, r.rule_name)
            if hasattr(r, 'treatment_category') and r.treatment_category:
                return (1, r.rule_name)
            return (2, r.rule_name)
        return sorted(rules, key=priority_key)

    # ============================================================
    # Follow-up Config Loading
    # ============================================================

    async def _load_follow_up_config(
        self,
        db: AsyncSession,
        hospital_id: str,
        rule,
        treatment_type_id: Optional[str] = None,
    ):
        """Load follow-up configuration for a rule's context type."""
        try:
            from app.crm.services.crm_settings import get_settings_service
            settings_svc = get_settings_service()
            settings = await settings_svc.get_settings(db, hospital_id)

            # Map rule scope to follow-up context
            context_map = {
                "LEAD": "LEAD",
                "VISIT": "OPD",
                "APPOINTMENT": "OPD",
                "CASE": "CASE_RECOVERY",
            }
            context_type = context_map.get(rule.scope)

            if context_type == "TREATMENT" and treatment_type_id:
                return settings.treatment_follow_ups.get(f"TREATMENT:{treatment_type_id}")
            elif context_type == "LEAD":
                return settings.lead_follow_up
            elif context_type == "OPD":
                return settings.opd_follow_up
            elif context_type == "CASE_RECOVERY":
                return settings.case_recovery
            elif context_type == "CASE_RECALL":
                return settings.case_recall

            return None
        except Exception as exc:
            logger.warning("FOLLOWUP_CONFIG_LOAD_FAILED: hospital=%s error=%s", hospital_id, str(exc))
            return None

    # ============================================================
    # Treatment Type Loading
    # ============================================================

    async def _load_treatment_type_name(self, db: AsyncSession, treatment_type_id: str) -> Optional[str]:
        """Load treatment type name from Clinical Settings."""
        try:
            from app.models.treatment_type import TreatmentType
            result = await db.execute(
                select(TreatmentType.name).where(TreatmentType.id == treatment_type_id)
            )
            return result.scalar_one_or_none()
        except Exception:
            return None

    # ============================================================
    # Due Date Calculation
    # ============================================================

    async def calculate_due_date(
        self,
        db: AsyncSession,
        hospital_id: str,
        delay_value: int,
        delay_unit: str,
    ) -> date:
        """Calculate due date respecting hospital working days and holidays."""
        from app.crm.services.crm_settings import get_settings_service
        settings_svc = get_settings_service()
        settings = await settings_svc.get_settings(db, hospital_id)

        today = date.today()
        if delay_unit == "IMMEDIATELY" or delay_value == 0:
            raw = today
        elif delay_unit == "DAYS":
            raw = today + timedelta(days=delay_value)
        elif delay_unit == "WEEKS":
            raw = today + timedelta(weeks=delay_value)
        elif delay_unit == "MONTHS":
            raw = today + timedelta(days=delay_value * 30)
        else:
            raw = today

        # Skip to next working day if weekend_policy is SKIP
        if settings.weekend_policy == "SKIP":
            raw = await settings_svc.next_working_day(db, hospital_id, raw)

        return raw


# ============================================================
# Singleton
# ============================================================

_rule_engine_instance: Optional[RuleEngineService] = None


def get_rule_engine() -> RuleEngineService:
    """Get or create the rule engine singleton."""
    global _rule_engine_instance
    if _rule_engine_instance is None:
        _rule_engine_instance = RuleEngineService()
    return _rule_engine_instance


# ═══════════════════════════════════════════════════════════════════════════
# BACKWARD-COMPATIBILITY LAYER — Phase 3.4 execution functions
# ═══════════════════════════════════════════════════════════════════════════
# These functions are still used by ERP modules (treatment_plans, leads, etc.)
# They create GeneratedEnquiry records and follow-ups.
# Phase 3.4 will migrate these to the new dispatcher-based architecture.
# ═══════════════════════════════════════════════════════════════════════════

import json
import logging as _logging
from datetime import date, timedelta, time as _dt_time
from typing import Optional as _Optional

from sqlalchemy.ext.asyncio import AsyncSession as _AsyncSession
from sqlalchemy import select as _select, and_ as _and_, func as _func

_compat_logger = _logging.getLogger("crm.rule_engine.compat")


# --- Enquiry Number Generation ---

async def _generate_enquiry_number(db: _AsyncSession) -> str:
    """Generate human-readable enquiry number: ENQ-YYYY-NNNNNN."""
    from app.models.generated_enquiry import GeneratedEnquiry
    year = date.today().year
    prefix = f"ENQ-{year}-"
    result = await db.execute(
        _select(GeneratedEnquiry.enquiry_number)
        .where(GeneratedEnquiry.enquiry_number.like(f"{prefix}%"))
        .order_by(GeneratedEnquiry.enquiry_number.desc())
        .limit(1)
    )
    last = result.scalar_one_or_none()
    if last:
        try:
            seq = int(last.split("-")[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:06d}"


# --- Due Date Calculation ---

async def calculate_due_date(
    db: _AsyncSession,
    hospital_id: str,
    delay_value: int,
    delay_unit: str,
) -> date:
    """Calculate due date respecting hospital working days and holidays."""
    from app.crm.services.crm_settings import get_settings_service
    settings_svc = get_settings_service()
    settings = await settings_svc.get_settings(db, hospital_id)

    today = date.today()
    if delay_unit == "IMMEDIATELY" or delay_value == 0:
        raw = today
    elif delay_unit == "DAYS":
        raw = today + timedelta(days=delay_value)
    elif delay_unit == "WEEKS":
        raw = today + timedelta(weeks=delay_value)
    elif delay_unit == "MONTHS":
        raw = today + timedelta(days=delay_value * 30)
    else:
        raw = today

    if settings.weekend_policy == "SKIP":
        raw = await settings_svc.next_working_day(db, hospital_id, raw)

    return raw


def _get_reminder_time_sync(settings) -> _dt_time:
    """Get reminder time from settings synchronously."""
    return settings.reminder_time if settings else _dt_time(9, 0)


def resolve_assignee(assign_to: str, event_data: dict) -> _Optional[str]:
    if assign_to == "DOCTOR":
        return event_data.get("doctor_id")
    return event_data.get("assigned_staff_id")


# --- Duplicate Prevention ---

async def _is_duplicate(
    db: _AsyncSession, hospital_id: str,
    patient_id: _Optional[str], lead_id: _Optional[str],
    rule_id: str, trigger_event: str, due_date: date,
    case_id: _Optional[str] = None,
    treatment_plan_item_id: _Optional[str] = None,
) -> bool:
    from app.models.generated_enquiry import GeneratedEnquiry
    conditions = [
        GeneratedEnquiry.hospital_id == hospital_id,
        GeneratedEnquiry.rule_id == rule_id,
        GeneratedEnquiry.trigger_event == trigger_event,
        GeneratedEnquiry.due_date == due_date,
        GeneratedEnquiry.status == "PENDING",
    ]
    if patient_id:
        conditions.append(GeneratedEnquiry.patient_id == patient_id)
    elif lead_id:
        conditions.append(GeneratedEnquiry.lead_id == lead_id)
    if case_id:
        conditions.append(GeneratedEnquiry.case_id == case_id)
    if treatment_plan_item_id:
        conditions.append(GeneratedEnquiry.treatment_plan_item_id == treatment_plan_item_id)
    result = await db.execute(
        _select(_func.count(GeneratedEnquiry.id)).where(_and_(*conditions))
    )
    return result.scalar() > 0


async def _is_duplicate_business_key(
    db: _AsyncSession,
    hospital_id: str,
    patient_id: _Optional[str],
    case_id: _Optional[str],
    treatment_id: _Optional[str],
    enquiry_type: str,
    scheduled_date: date,
) -> bool:
    """Enterprise idempotency: prevent duplicate enquiries by business uniqueness key.
    
    Business Uniqueness Key:
        hospital_id + patient_id + case_id + treatment_id + enquiry_type + scheduled_date
    
    No two enquiries may exist with the same business key and PENDING status.
    """
    from app.models.generated_enquiry import GeneratedEnquiry
    conditions = [
        GeneratedEnquiry.hospital_id == hospital_id,
        GeneratedEnquiry.enquiry_type == enquiry_type,
        GeneratedEnquiry.due_date == scheduled_date,
        GeneratedEnquiry.status == "PENDING",
    ]
    if patient_id:
        conditions.append(GeneratedEnquiry.patient_id == patient_id)
    else:
        conditions.append(GeneratedEnquiry.patient_id.is_(None))
    if case_id:
        conditions.append(GeneratedEnquiry.case_id == case_id)
    else:
        conditions.append(GeneratedEnquiry.case_id.is_(None))
    if treatment_id:
        conditions.append(GeneratedEnquiry.treatment_type_id == treatment_id)
    else:
        conditions.append(GeneratedEnquiry.treatment_type_id.is_(None))
    result = await db.execute(
        _select(_func.count(GeneratedEnquiry.id)).where(_and_(*conditions))
    )
    return result.scalar() > 0


# --- Rule Loading (compat) ---

async def load_rules(
    db: _AsyncSession,
    hospital_id: str,
    trigger_event: str,
    rule_type: _Optional[str] = None,
    treatment_type_id: _Optional[str] = None,
    scope: _Optional[str] = None,
) -> list:
    from app.models.crm_rule import CrmRule
    q = _select(CrmRule).where(
        _and_(
            CrmRule.hospital_id == hospital_id,
            CrmRule.trigger_event == trigger_event,
            CrmRule.is_active == True,
        )
    )
    if rule_type:
        q = q.where(CrmRule.rule_type == rule_type)
    if scope:
        q = q.where(CrmRule.scope == scope)
    if treatment_type_id:
        q = q.where(
            (CrmRule.treatment_type_id == treatment_type_id)
            | (CrmRule.treatment_type_id.is_(None))
        )
    result = await db.execute(q)
    return list(result.scalars().all())


def _sort_rules_by_priority(rules: list) -> list:
    def priority_key(r):
        if r.treatment_type_id:
            return (0, r.rule_name)
        if hasattr(r, 'treatment_category') and r.treatment_category:
            return (1, r.rule_name)
        return (2, r.rule_name)
    return sorted(rules, key=priority_key)


# --- Enquiry Creation (compat) ---

ACTION_ENQUIRY_MAP = {
    "GENERAL_FOLLOW_UP": "GENERAL_CHECK",
    "WELLNESS_ENQUIRY": "WELLNESS",
    "PAIN_ASSESSMENT": "PAIN_ASSESSMENT",
    "MEDICATION_REMINDER": "MEDICATION_REMINDER",
    "RECOVERY_FOLLOW_UP": "HEALING_PROGRESS",
    "RECALL": "RECALL_REMINDER",
    "RECALL_REMINDER": "RECALL_REMINDER",
    "APPOINTMENT_REMINDER": "NEXT_APPOINTMENT_REMINDER",
}


async def _create_enquiry(
    db: _AsyncSession,
    rule,
    event_data: dict,
    hospital_id: str,
    trigger_event: str,
) -> _Optional[dict]:
    patient_id = event_data.get("patient_id")
    lead_id = event_data.get("lead_id")

    if not patient_id and not lead_id:
        return None

    due_date = await calculate_due_date(db, hospital_id, rule.delay_value, rule.delay_unit)
    enquiry_type = ACTION_ENQUIRY_MAP.get(rule.action, "GENERAL_CHECK")
    assigned_staff_id = resolve_assignee(rule.assign_to, event_data)

    case_id = event_data.get("case_id")
    treatment_plan_item_id = event_data.get("treatment_plan_item_id")

    if await _is_duplicate(
        db, hospital_id, patient_id, lead_id, rule.id,
        trigger_event, due_date, case_id=case_id,
        treatment_plan_item_id=treatment_plan_item_id,
    ):
        _compat_logger.info("DUPLICATE_PREVENTED: rule=%s entity=%s trigger=%s",
                     rule.rule_name, patient_id or lead_id, trigger_event)
        return None

    treatment_type_id = event_data.get("treatment_type_id") or getattr(rule, 'treatment_type_id', None)

    if await _is_duplicate_business_key(
        db, hospital_id, patient_id, case_id, treatment_type_id,
        enquiry_type, due_date,
    ):
        _compat_logger.info("DUPLICATE_ENQUIRY_PREVENTED: business_key=hospital=%s patient=%s case=%s treatment=%s type=%s date=%s",
                     hospital_id, patient_id, case_id, treatment_type_id, enquiry_type, due_date)
        return None

    from app.models.generated_enquiry import GeneratedEnquiry

    if lead_id:
        source_entity_type = "LEAD"
        source_entity_id = lead_id
    elif case_id:
        source_entity_type = "CASE"
        source_entity_id = case_id
    elif event_data.get("appointment_id"):
        source_entity_type = "APPOINTMENT"
        source_entity_id = event_data["appointment_id"]
    elif patient_id:
        source_entity_type = "PATIENT"
        source_entity_id = patient_id
    else:
        source_entity_type = None
        source_entity_id = None

    gen_reason = f"Rule: {rule.rule_name} | Trigger: {trigger_event}"
    if treatment_type_id:
        gen_reason += f" | Treatment: {treatment_type_id}"

    ge = GeneratedEnquiry(
        hospital_id=hospital_id,
        patient_id=patient_id,
        lead_id=lead_id,
        crm_rule_id=rule.id,
        rule_id=rule.id,
        treatment_type_id=treatment_type_id,
        treatment_plan_item_id=treatment_plan_item_id,
        case_id=case_id,
        appointment_id=event_data.get("appointment_id"),
        assigned_staff_id=assigned_staff_id,
        trigger_event=trigger_event,
        treatment_name=event_data.get("treatment_name", ""),
        visit_number=event_data.get("visit_number"),
        total_visits=event_data.get("total_visits"),
        visit_stage=event_data.get("visit_stage"),
        enquiry_type=enquiry_type,
        notes=f"[Rule: {rule.rule_name}]",
        due_date=due_date,
        priority="MEDIUM",
        status="PENDING",
        created_by_event=trigger_event,
        generation_reason=gen_reason,
        source_entity_type=source_entity_type,
        source_entity_id=source_entity_id,
    )

    ge.enquiry_number = await _generate_enquiry_number(db)

    db.add(ge)
    await db.flush()

    if rule.send_whatsapp:
        try:
            async with db.begin_nested():
                await _queue_whatsapp(db, rule, ge, hospital_id, patient_id, lead_id, event_data, enquiry_type)
        except Exception as e:
            _compat_logger.warning("WHATSAPP_SAVEPOINT_FAILED (non-fatal): %s", str(e))

    if rule.send_notification and assigned_staff_id:
        try:
            async with db.begin_nested():
                await _create_notification(db, rule, hospital_id, assigned_staff_id, patient_id, lead_id, event_data)
        except Exception as e:
            _compat_logger.warning("NOTIFICATION_SAVEPOINT_FAILED (non-fatal): %s", str(e))

    try:
        async with db.begin_nested():
            await _create_timeline_entry(db, rule, hospital_id, patient_id, lead_id, trigger_event, due_date)
    except Exception as e:
        _compat_logger.warning("TIMELINE_SAVEPOINT_FAILED (non-fatal): %s", str(e))

    try:
        async with db.begin_nested():
            await _create_audit_log(db, rule, assigned_staff_id, ge.id, trigger_event, patient_id or lead_id, due_date)
    except Exception as e:
        _compat_logger.warning("AUDIT_SAVEPOINT_FAILED (non-fatal): %s", str(e))

    return {
        "enquiry_id": ge.id,
        "enquiry_number": ge.enquiry_number,
        "rule_name": rule.rule_name,
        "enquiry_type": enquiry_type,
        "due_date": due_date.isoformat(),
        "assigned_staff_id": assigned_staff_id,
    }


async def _queue_whatsapp(db, rule, ge, hospital_id, patient_id, lead_id, event_data, enquiry_type):
    try:
        from app.crm.services.template_resolver import get_template_resolver
        from app.models.communication_log import CommunicationLog
        resolver = get_template_resolver()
        template = await resolver.resolve_template_for_enquiry(db, hospital_id, enquiry_type)
        if template:
            message = await resolver.resolve(
                db, template.message,
                patient_id=patient_id, lead_id=lead_id,
                hospital_id=hospital_id,
                doctor_id=event_data.get("doctor_id"),
                appointment_id=event_data.get("appointment_id"),
                treatment_type_id=event_data.get("treatment_type_id"),
                case_id=event_data.get("case_id"),
            )
        else:
            patient_name = event_data.get("patient_name") or event_data.get("lead_name") or "Patient"
            message = f"Follow-up: {rule.rule_name} for {patient_name}"
        db.add(CommunicationLog(
            hospital_id=hospital_id,
            patient_id=patient_id,
            channel="WHATSAPP",
            message_type="FOLLOW_UP",
            message=message,
            status="PENDING",
        ))
    except Exception as e:
        _compat_logger.warning("WHATSAPP_QUEUE_FAILED (non-fatal): %s", str(e))


async def _create_notification(db, rule, hospital_id, assigned_staff_id, patient_id, lead_id, event_data):
    try:
        from app.models.notification import Notification
        entity_name = event_data.get("patient_name") or event_data.get("lead_name") or "Patient"
        treatment_name = event_data.get("treatment_name", "")
        context = f" for {treatment_name}" if treatment_name else ""
        entity_id = patient_id or lead_id or "unknown"
        db.add(Notification(
            hospital_id=hospital_id,
            user_id=assigned_staff_id,
            title=f"CRM Follow-up: {entity_name}{context}",
            description=f"Rule \"{rule.rule_name}\" requires follow-up with {entity_name}.",
            type="CRM_FOLLOW_UP",
            entity_type="GeneratedEnquiry",
            entity_id=entity_id,
        ))
    except Exception as e:
        _compat_logger.warning("NOTIFICATION_FAILED: %s", str(e))


async def _create_timeline_entry(db, rule, hospital_id, patient_id, lead_id, trigger_event, due_date):
    try:
        if patient_id:
            from app.models.patient_timeline import PatientTimeline
            db.add(PatientTimeline(
                patient_id=patient_id,
                hospital_id=hospital_id,
                event_type="CRM_RULE_EXECUTED",
                title="Follow-up Enquiry Created",
                description=f"Rule \"{rule.rule_name}\" triggered ({trigger_event}). Due: {due_date}",
                module="CRM",
            ))
    except Exception:
        pass


async def _create_audit_log(db, rule, assigned_staff_id, ge_id, trigger_event, entity_id, due_date):
    try:
        from app.models.audit_log import AuditLog
        db.add(AuditLog(
            user_id=assigned_staff_id,
            action="CRM_RULE_EXECUTED",
            entity_type="GeneratedEnquiry",
            entity_id=ge_id,
            details=f"Rule: {rule.rule_name} | Trigger: {trigger_event} | Entity: {entity_id} | Due: {due_date}",
        ))
    except Exception:
        pass


# --- Cancellation Functions (compat) ---

async def cancel_lead_followups(
    db: _AsyncSession, hospital_id: str, lead_id: str,
    cancelled_by_event: _Optional[str] = None,
) -> int:
    from app.models.generated_enquiry import GeneratedEnquiry
    from app.models.crm_rule import CrmRule
    from datetime import datetime, timezone
    result = await db.execute(
        _select(GeneratedEnquiry).where(
            _and_(
                GeneratedEnquiry.hospital_id == hospital_id,
                GeneratedEnquiry.lead_id == lead_id,
                GeneratedEnquiry.status == "PENDING",
            )
        ).join(CrmRule, GeneratedEnquiry.crm_rule_id == CrmRule.id).where(
            CrmRule.scope == "LEAD"
        )
    )
    cancelled = 0
    now = datetime.now(timezone.utc)
    for ge in result.scalars().all():
        ge.status = "CANCELLED"
        ge.cancelled_by_event = cancelled_by_event
        ge.cancelled_at = now
        cancelled += 1
    if cancelled:
        await db.flush()
        _compat_logger.info("LEAD_FOLLOWUPS_CANCELLED: lead=%s count=%d", lead_id, cancelled)
    return cancelled


async def cancel_lead_followups_by_patient(
    db: _AsyncSession, hospital_id: str, patient_id: str,
    cancelled_by_event: _Optional[str] = None,
) -> int:
    from app.models.generated_enquiry import GeneratedEnquiry
    from app.models.crm_rule import CrmRule
    from datetime import datetime, timezone
    result = await db.execute(
        _select(GeneratedEnquiry).where(
            _and_(
                GeneratedEnquiry.hospital_id == hospital_id,
                GeneratedEnquiry.patient_id == patient_id,
                GeneratedEnquiry.status == "PENDING",
            )
        ).join(CrmRule, GeneratedEnquiry.crm_rule_id == CrmRule.id).where(
            CrmRule.scope == "LEAD"
        )
    )
    cancelled = 0
    now = datetime.now(timezone.utc)
    for ge in result.scalars().all():
        ge.status = "CANCELLED"
        ge.cancelled_by_event = cancelled_by_event
        ge.cancelled_at = now
        cancelled += 1
    if cancelled:
        await db.flush()
        _compat_logger.info("LEAD_FOLLOWUPS_CANCELLED: patient=%s count=%d", patient_id, cancelled)
    return cancelled


async def cancel_case_pending_enquiries(
    db: _AsyncSession, case_id: str,
    cancelled_by_event: _Optional[str] = None,
) -> int:
    from app.models.generated_enquiry import GeneratedEnquiry
    from datetime import datetime, timezone
    result = await db.execute(
        _select(GeneratedEnquiry).where(
            _and_(
                GeneratedEnquiry.case_id == case_id,
                GeneratedEnquiry.status == "PENDING",
            )
        )
    )
    cancelled = 0
    now = datetime.now(timezone.utc)
    for ge in result.scalars().all():
        ge.status = "CANCELLED"
        ge.cancelled_by_event = cancelled_by_event
        ge.cancelled_at = now
        cancelled += 1
    if cancelled:
        await db.flush()
        _compat_logger.info("CASE_ENQUIRIES_CANCELLED: case=%s count=%d", case_id, cancelled)
    return cancelled


# --- Public API (compat) ---

async def execute_rules(
    db: _AsyncSession,
    hospital_id: str,
    trigger_event: str,
    event_data: dict,
    rule_type: _Optional[str] = None,
    scope: _Optional[str] = None,
) -> list[dict]:
    """Execute all matching CRM rules for a given event. Creates GeneratedEnquiry records."""
    if not hospital_id:
        return []

    from app.crm.services.crm_settings import get_settings_service
    settings_svc = get_settings_service()
    settings = await settings_svc.get_settings(db, hospital_id)
    if not settings.enabled:
        return []

    treatment_type_id = event_data.get("treatment_type_id")
    rules = await load_rules(db, hospital_id, trigger_event, rule_type, treatment_type_id, scope=scope)
    if not rules:
        return []

    rules = _sort_rules_by_priority(rules)
    created = []
    seen_treatment_types = set()

    for rule in rules:
        if rule.visit_stage and rule.visit_stage != "ANY":
            event_visit = event_data.get("visit_stage", "ANY")
            if rule.visit_stage != event_visit:
                continue
        if rule.treatment_type_id and treatment_type_id and rule.treatment_type_id != treatment_type_id:
            continue
        rule_tt = rule.treatment_type_id or "__global__"
        if rule_tt in seen_treatment_types:
            continue
        result = await _create_enquiry(db, rule, event_data, hospital_id, trigger_event)
        if result:
            created.append(result)
            seen_treatment_types.add(rule_tt)

    return created


# --- Convenience Aliases (compat) ---

async def on_visit_completed(db, hospital_id, event_data):
    return await execute_rules(db, hospital_id, "VISIT_COMPLETED", event_data, "TREATMENT")

async def on_treatment_completed(db, hospital_id, event_data):
    return await execute_rules(db, hospital_id, "TREATMENT_COMPLETED", event_data, "TREATMENT")

async def on_appointment_missed(db, hospital_id, event_data):
    lead_result = await execute_rules(db, hospital_id, "APPOINTMENT_MISSED", event_data, "LEAD")
    tx_result = await execute_rules(db, hospital_id, "APPOINTMENT_MISSED", event_data, "TREATMENT")
    return lead_result + tx_result

async def on_appointment_completed(db, hospital_id, event_data):
    return await execute_rules(db, hospital_id, "APPOINTMENT_COMPLETED", event_data, "LEAD")

async def on_appointment_created(db, hospital_id, event_data):
    return await execute_rules(db, hospital_id, "APPOINTMENT_CREATED", event_data, "TREATMENT")

async def on_lead_created(db, hospital_id, event_data):
    return await execute_rules(db, hospital_id, "PATIENT_REGISTERED", event_data, "LEAD")

async def on_lead_converted(db, hospital_id, event_data):
    patient_id = event_data.get("patient_id")
    lead_id = event_data.get("lead_id")
    if lead_id:
        await cancel_lead_followups(db, hospital_id, lead_id, cancelled_by_event="LEAD_CONVERTED")
    elif patient_id:
        await cancel_lead_followups_by_patient(db, hospital_id, patient_id, cancelled_by_event="LEAD_CONVERTED")
    return await execute_rules(db, hospital_id, "LEAD_CONVERTED", event_data, "LEAD")

async def on_case_completed(db, hospital_id, event_data):
    return await execute_rules(db, hospital_id, "CASE_COMPLETED", event_data, "TREATMENT", scope="CASE")

async def on_manual_trigger(db, hospital_id, event_data, rule_type=None):
    return await execute_rules(db, hospital_id, "MANUAL", event_data, rule_type)


# --- Follow-up Creation (compat) ---

WAITING_PATIENT_TASK_DAYS = 7
WAITING_LAB_TASK_DAYS = 5


async def _get_default_followup_time(db: _AsyncSession, hospital_id: str) -> _dt_time:
    try:
        from app.crm.services.crm_settings import get_settings_service
        settings_svc = get_settings_service()
        return await settings_svc.get_reminder_time(db, hospital_id)
    except Exception:
        return _dt_time(9, 0)


async def _has_followup(db, plan_id, follow_up_type):
    from app.models.follow_up import FollowUp, FollowUpStatus
    result = await db.execute(
        _select(FollowUp).where(
            FollowUp.treatment_id == plan_id,
            FollowUp.follow_up_type == follow_up_type,
            FollowUp.status != FollowUpStatus.LOST.value,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _has_custom_recall(db, plan_id, days):
    from app.models.follow_up import FollowUp, FollowUpStatus
    result = await db.execute(
        _select(FollowUp).where(
            FollowUp.treatment_id == plan_id,
            FollowUp.notes.ilike(f"%{days}-day recall%"),
            FollowUp.status != FollowUpStatus.LOST.value,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def create_treatment_assigned_followup(db: _AsyncSession, plan_id: str) -> None:
    from app.models.treatment_plan import TreatmentPlan
    from app.models.case import Case
    from app.models.patient import Patient
    from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus

    plan = await db.get(TreatmentPlan, plan_id)
    if not plan:
        return
    case = await db.get(Case, plan.case_id)
    if not case or not case.patient_id:
        return
    patient = await db.get(Patient, case.patient_id)
    if not patient:
        return
    existing = await db.execute(
        _select(FollowUp).where(
            FollowUp.treatment_id == plan_id,
            FollowUp.follow_up_type == FollowUpType.ONE_DAY_FOLLOW_UP.value,
            FollowUp.status != FollowUpStatus.LOST.value,
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        return
    reminder_time = await _get_default_followup_time(db, patient.hospital_id)
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today() + timedelta(days=1),
        follow_up_time=reminder_time,
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"Auto: Schedule first visit for treatment '{plan.treatment_name}'",
    )
    db.add(fu)
    await db.flush()


async def create_treatment_completed_followups(db: _AsyncSession, plan_id: str) -> None:
    from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
    from app.models.case import Case
    from app.models.patient import Patient
    from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
    from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus
    from sqlalchemy import or_ as sql_or

    plan = await db.get(TreatmentPlan, plan_id)
    if not plan or plan.status != TreatmentPlanStatus.COMPLETED:
        return
    case = await db.get(Case, plan.case_id)
    if not case or not case.patient_id:
        return
    patient = await db.get(Patient, case.patient_id)
    hospital_id = patient.hospital_id if patient else None

    reminder_time = await _get_default_followup_time(db, hospital_id) if hospital_id else _dt_time(9, 0)

    rule = None
    for scope_hid in (None, hospital_id):
        clauses = []
        if plan.treatment_type_id:
            clauses.append(TreatmentFollowUpRule.treatment_type_id == plan.treatment_type_id)
        if plan.treatment_template_id:
            clauses.append(TreatmentFollowUpRule.treatment_template_id == plan.treatment_template_id)
        if not clauses:
            continue
        q = _select(TreatmentFollowUpRule).where(
            TreatmentFollowUpRule.hospital_id == scope_hid,
            TreatmentFollowUpRule.is_active == True,
            sql_or(*clauses),
        )
        result = await db.execute(q.limit(1))
        rule = result.scalar_one_or_none()
        if rule:
            break

    if not rule:
        return

    today = date.today()
    created_count = 0

    if rule.follow_up_1_day:
        if not await _has_followup(db, plan_id, FollowUpType.ONE_DAY_FOLLOW_UP.value):
            db.add(FollowUp(
                patient_id=patient.id, hospital_id=hospital_id,
                doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                treatment_id=plan_id, treatment_name=plan.treatment_name,
                follow_up_date=today + timedelta(days=1), follow_up_time=reminder_time,
                follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
                status=FollowUpStatus.PENDING.value,
                treatment_completed_date=today,
                notes=f"Auto: 1-day follow-up for '{plan.treatment_name}'",
            ))
            created_count += 1

    if rule.follow_up_7_day:
        if not await _has_followup(db, plan_id, FollowUpType.SEVEN_DAY_FOLLOW_UP.value):
            db.add(FollowUp(
                patient_id=patient.id, hospital_id=hospital_id,
                doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                treatment_id=plan_id, treatment_name=plan.treatment_name,
                follow_up_date=today + timedelta(days=7), follow_up_time=reminder_time,
                follow_up_type=FollowUpType.SEVEN_DAY_FOLLOW_UP.value,
                status=FollowUpStatus.PENDING.value,
                treatment_completed_date=today,
                notes=f"Auto: 7-day follow-up for '{plan.treatment_name}'",
            ))
            created_count += 1

    if rule.recall_6_month:
        if not await _has_followup(db, plan_id, FollowUpType.SIX_MONTH_RECALL.value):
            db.add(FollowUp(
                patient_id=patient.id, hospital_id=hospital_id,
                doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                treatment_id=plan_id, treatment_name=plan.treatment_name,
                follow_up_date=today + timedelta(days=180), follow_up_time=reminder_time,
                follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                status=FollowUpStatus.PENDING.value,
                treatment_completed_date=today,
                notes=f"Auto: 6-month recall for '{plan.treatment_name}'",
            ))
            created_count += 1

    if rule.recall_12_month:
        if not await _has_followup(db, plan_id, FollowUpType.TWELVE_MONTH_RECALL.value):
            db.add(FollowUp(
                patient_id=patient.id, hospital_id=hospital_id,
                doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                treatment_id=plan_id, treatment_name=plan.treatment_name,
                follow_up_date=today + timedelta(days=365), follow_up_time=reminder_time,
                follow_up_type=FollowUpType.TWELVE_MONTH_RECALL.value,
                status=FollowUpStatus.PENDING.value,
                treatment_completed_date=today,
                notes=f"Auto: 12-month recall for '{plan.treatment_name}'",
            ))
            created_count += 1

    if rule.custom_recall_days and rule.custom_recall_days > 0:
        if not await _has_custom_recall(db, plan_id, rule.custom_recall_days):
            db.add(FollowUp(
                patient_id=patient.id, hospital_id=hospital_id,
                doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                treatment_id=plan_id, treatment_name=plan.treatment_name,
                follow_up_date=today + timedelta(days=rule.custom_recall_days), follow_up_time=reminder_time,
                follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                status=FollowUpStatus.PENDING.value,
                treatment_completed_date=today,
                notes=f"Auto: {rule.custom_recall_days}-day recall for '{plan.treatment_name}'",
            ))
            created_count += 1

    await db.flush()


async def create_waiting_patient_followup(db: _AsyncSession, plan_id: str) -> None:
    from app.models.treatment_plan import TreatmentPlan
    from app.models.case import Case
    from app.models.patient import Patient
    from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus

    plan = await db.get(TreatmentPlan, plan_id)
    if not plan:
        return
    case = await db.get(Case, plan.case_id)
    if not case or not case.patient_id:
        return
    patient = await db.get(Patient, case.patient_id)
    if not patient:
        return
    if await _has_followup(db, plan_id, FollowUpType.ONE_DAY_FOLLOW_UP.value):
        return
    reminder_time = await _get_default_followup_time(db, patient.hospital_id)
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today() + timedelta(days=WAITING_PATIENT_TASK_DAYS),
        follow_up_time=reminder_time,
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"Auto: Patient follow-up after {WAITING_PATIENT_TASK_DAYS} days for '{plan.treatment_name}'",
    )
    db.add(fu)
    await db.flush()


async def create_waiting_lab_followup(db: _AsyncSession, plan_id: str) -> None:
    from app.models.treatment_plan import TreatmentPlan
    from app.models.case import Case
    from app.models.patient import Patient
    from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus

    plan = await db.get(TreatmentPlan, plan_id)
    if not plan:
        return
    case = await db.get(Case, plan.case_id)
    if not case or not case.patient_id:
        return
    patient = await db.get(Patient, case.patient_id)
    if not patient:
        return
    if await _has_followup(db, plan_id, FollowUpType.ONE_DAY_FOLLOW_UP.value):
        return
    reminder_time = await _get_default_followup_time(db, patient.hospital_id)
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today() + timedelta(days=WAITING_LAB_TASK_DAYS),
        follow_up_time=reminder_time,
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"Auto: Lab follow-up after {WAITING_LAB_TASK_DAYS} days for '{plan.treatment_name}'",
    )
    db.add(fu)
    await db.flush()


async def create_overdue_followup(db: _AsyncSession, plan_id: str, reason: str = "", delay_type: str = "") -> None:
    from app.models.treatment_plan import TreatmentPlan
    from app.models.case import Case
    from app.models.patient import Patient
    from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus

    plan = await db.get(TreatmentPlan, plan_id)
    if not plan:
        return
    case = await db.get(Case, plan.case_id)
    if not case or not case.patient_id:
        return
    patient = await db.get(Patient, case.patient_id)
    if not patient:
        return
    reminder_time = await _get_default_followup_time(db, patient.hospital_id)
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today(), follow_up_time=reminder_time,
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"URGENT: Treatment '{plan.treatment_name}' overdue. Reason: {reason} ({delay_type})",
    )
    db.add(fu)
    await db.flush()
