"""
CRM Rule Engine — SINGLE source of truth for all automation.

Every business event flows through this engine. No other service should
create GeneratedEnquiry records directly.

Pipeline:
  Event → Load Rules → Match → Calculate Delay → Create Enquiry → WhatsApp → Notification → Timeline → Audit
"""
import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

logger = logging.getLogger("crm.rule_engine")


# ═══════════════════════════════════════════════════════════════════════════
# DELAY CALCULATION
# ═══════════════════════════════════════════════════════════════════════════

def calculate_due_date(delay_value: int, delay_unit: str) -> date:
    today = date.today()
    if delay_unit == "IMMEDIATELY" or delay_value == 0:
        return today
    if delay_unit == "DAYS":
        return today + timedelta(days=delay_value)
    if delay_unit == "WEEKS":
        return today + timedelta(weeks=delay_value)
    if delay_unit == "MONTHS":
        return today + timedelta(days=delay_value * 30)
    return today


# ═══════════════════════════════════════════════════════════════════════════
# ASSIGNEE RESOLUTION
# ═══════════════════════════════════════════════════════════════════════════

def resolve_assignee(assign_to: str, event_data: dict) -> Optional[str]:
    if assign_to == "DOCTOR":
        return event_data.get("doctor_id")
    return event_data.get("assigned_staff_id")


# ═══════════════════════════════════════════════════════════════════════════
# DUPLICATE PREVENTION
# ═══════════════════════════════════════════════════════════════════════════

async def _is_duplicate(
    db: AsyncSession, hospital_id: str, patient_id: str,
    rule_id: str, trigger_event: str, due_date: date,
    case_id: Optional[str] = None,
) -> bool:
    """Check if a pending enquiry already exists for this rule + patient + trigger + due date.
    For CASE scope, also checks case_id to allow different patients to have separate recalls.
    """
    from app.models.generated_enquiry import GeneratedEnquiry
    conditions = [
        GeneratedEnquiry.hospital_id == hospital_id,
        GeneratedEnquiry.patient_id == patient_id,
        GeneratedEnquiry.rule_id == rule_id,
        GeneratedEnquiry.trigger_event == trigger_event,
        GeneratedEnquiry.due_date == due_date,
        GeneratedEnquiry.status == "PENDING",
    ]
    if case_id:
        conditions.append(GeneratedEnquiry.case_id == case_id)
    result = await db.execute(
        select(func.count(GeneratedEnquiry.id)).where(and_(*conditions))
    )
    return result.scalar() > 0


# ═══════════════════════════════════════════════════════════════════════════
# RULE LOADING
# ═══════════════════════════════════════════════════════════════════════════

async def load_rules(
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
    return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════════════════
# ENQUIRY CREATION
# ═══════════════════════════════════════════════════════════════════════════

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
    db: AsyncSession,
    rule,
    event_data: dict,
    hospital_id: str,
    trigger_event: str,
) -> Optional[dict]:
    """Create a GeneratedEnquiry record with full duplicate prevention."""
    patient_id = event_data.get("patient_id")
    if not patient_id:
        return None

    due_date = calculate_due_date(rule.delay_value, rule.delay_unit)
    enquiry_type = ACTION_ENQUIRY_MAP.get(rule.action, "GENERAL_CHECK")
    assigned_staff_id = resolve_assignee(rule.assign_to, event_data)

    case_id = event_data.get("case_id")

    if await _is_duplicate(db, hospital_id, patient_id, rule.id, trigger_event, due_date, case_id=case_id):
        logger.info("DUPLICATE_PREVENTED: rule=%s patient=%s trigger=%s", rule.rule_name, patient_id, trigger_event)
        return None

    from app.models.generated_enquiry import GeneratedEnquiry
    treatment_type_id = event_data.get("treatment_type_id") or (rule.treatment_type_id if hasattr(rule, 'treatment_type_id') else None)
    ge = GeneratedEnquiry(
        hospital_id=hospital_id,
        patient_id=patient_id,
        rule_id=rule.id,
        treatment_type_id=treatment_type_id,
        case_id=case_id,
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
    )
    db.add(ge)
    await db.flush()

    logger.info(
        "ENQUIRY_CREATED: rule=%s trigger=%s patient=%s due=%s case=%s",
        rule.rule_name, trigger_event, patient_id, due_date, case_id,
    )

    # WhatsApp
    if rule.send_whatsapp:
        from app.models.communication_log import CommunicationLog
        patient_name = event_data.get("patient_name", "Patient")
        db.add(CommunicationLog(
            hospital_id=hospital_id,
            patient_id=patient_id,
            channel="WHATSAPP",
            message_type="FOLLOW_UP",
            message=f"Automated follow-up: {rule.rule_name} for {patient_name}",
            status="PENDING",
        ))
        logger.info("WHATSAPP_QUEUED: patient=%s rule=%s", patient_id, rule.rule_name)

    # Staff notification
    if rule.send_notification and assigned_staff_id:
        from app.models.notification import Notification
        patient_name = event_data.get("patient_name", "Patient")
        treatment_name = event_data.get("treatment_name", "")
        context = f" for {treatment_name}" if treatment_name else ""
        db.add(Notification(
            hospital_id=hospital_id,
            user_id=assigned_staff_id,
            title=f"CRM Follow-up: {patient_name}{context}",
            description=f"Rule \"{rule.rule_name}\" requires follow-up with {patient_name}.",
            type="CRM_FOLLOW_UP",
            entity_type="GeneratedEnquiry",
            entity_id=patient_id,
        ))
        logger.info("NOTIFICATION_CREATED: staff=%s patient=%s", assigned_staff_id, patient_id)

    # Patient timeline
    try:
        from app.models.patient_timeline import PatientTimeline
        db.add(PatientTimeline(
            patient_id=patient_id,
            hospital_id=hospital_id,
            event_type="CRM_RULE_EXECUTED",
            title=f"Follow-up Enquiry Created",
            description=f"Rule \"{rule.rule_name}\" triggered ({trigger_event}). Due: {due_date}",
            module="CRM",
        ))
    except Exception:
        pass

    # Audit log
    try:
        from app.models.audit_log import AuditLog
        db.add(AuditLog(
            user_id=assigned_staff_id,
            action="CRM_RULE_EXECUTED",
            entity_type="GeneratedEnquiry",
            entity_id=ge.id,
            details=f"Rule: {rule.rule_name} | Trigger: {trigger_event} | Patient: {patient_id} | Due: {due_date}",
        ))
    except Exception:
        pass

    return {
        "enquiry_id": ge.id,
        "rule_name": rule.rule_name,
        "enquiry_type": enquiry_type,
        "due_date": due_date.isoformat(),
        "assigned_staff_id": assigned_staff_id,
    }


# ═══════════════════════════════════════════════════════════════════════════
# CANCELLATION FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

async def cancel_lead_followups(
    db: AsyncSession,
    hospital_id: str,
    patient_id: str,
) -> int:
    """Cancel all pending LEAD-scope enquiries for a patient (called on lead conversion)."""
    from app.models.generated_enquiry import GeneratedEnquiry
    from app.models.crm_rule import CrmRule

    result = await db.execute(
        select(GeneratedEnquiry).where(
            and_(
                GeneratedEnquiry.hospital_id == hospital_id,
                GeneratedEnquiry.patient_id == patient_id,
                GeneratedEnquiry.status == "PENDING",
            )
        ).join(CrmRule, GeneratedEnquiry.rule_id == CrmRule.id).where(
            CrmRule.scope == "LEAD"
        )
    )
    cancelled = 0
    for ge in result.scalars().all():
        ge.status = "CANCELLED"
        cancelled += 1
    if cancelled:
        await db.flush()
        logger.info("LEAD_FOLLOWUPS_CANCELLED: patient=%s count=%d", patient_id, cancelled)
    return cancelled


async def cancel_case_pending_enquiries(
    db: AsyncSession,
    case_id: str,
) -> int:
    """Cancel all pending enquiries for a case before creating new case-level ones."""
    from app.models.generated_enquiry import GeneratedEnquiry

    result = await db.execute(
        select(GeneratedEnquiry).where(
            and_(
                GeneratedEnquiry.case_id == case_id,
                GeneratedEnquiry.status == "PENDING",
            )
        )
    )
    cancelled = 0
    for ge in result.scalars().all():
        ge.status = "CANCELLED"
        cancelled += 1
    if cancelled:
        await db.flush()
        logger.info("CASE_ENQUIRIES_CANCELLED: case=%s count=%d", case_id, cancelled)
    return cancelled


# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC API — Single entry point
# ═══════════════════════════════════════════════════════════════════════════

async def execute_rules(
    db: AsyncSession,
    hospital_id: str,
    trigger_event: str,
    event_data: dict,
    rule_type: Optional[str] = None,
    scope: Optional[str] = None,
) -> list[dict]:
    """Execute all matching CRM rules for a given event.

    This is the ONLY function that should create GeneratedEnquiry records.
    Called by TreatmentAutomationService which acts as the event publisher.

    scope: optional filter to load only rules with this scope (LEAD/VISIT/APPOINTMENT/CASE).
    """
    if not hospital_id:
        logger.warning("NO_HOSPITAL_ID: Skipping rule execution for trigger=%s", trigger_event)
        return []

    treatment_type_id = event_data.get("treatment_type_id")
    rules = await load_rules(db, hospital_id, trigger_event, rule_type, treatment_type_id, scope=scope)
    if not rules:
        return []

    # Sort: rules with specific treatment_type_id first, then global (None) rules
    rules.sort(key=lambda r: (0 if r.treatment_type_id else 1, 0 if r.visit_stage else 1))

    created = []
    for rule in rules:
        # Visit stage filtering (for TREATMENT rules)
        if rule.visit_stage and rule.visit_stage != "ANY":
            event_visit = event_data.get("visit_stage", "ANY")
            if rule.visit_stage != event_visit:
                continue

        # If rule has treatment_type_id, check it matches (unless rule is global)
        if rule.treatment_type_id and treatment_type_id and rule.treatment_type_id != treatment_type_id:
            continue

        result = await _create_enquiry(db, rule, event_data, hospital_id, trigger_event)
        if result:
            created.append(result)

    return created


# ═══════════════════════════════════════════════════════════════════════════
# CONVENIENCE ALIASES (called by TreatmentAutomationService)
# ═══════════════════════════════════════════════════════════════════════════

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
    if patient_id:
        await cancel_lead_followups(db, hospital_id, patient_id)
    return await execute_rules(db, hospital_id, "LEAD_CONVERTED", event_data, "LEAD")

async def on_case_completed(db, hospital_id, event_data):
    return await execute_rules(db, hospital_id, "CASE_COMPLETED", event_data, "TREATMENT", scope="CASE")

async def on_manual_trigger(db, hospital_id, event_data, rule_type=None):
    return await execute_rules(db, hospital_id, "MANUAL", event_data, rule_type)


# ═══════════════════════════════════════════════════════════════════════════
# FOLLOWUP CREATION (migrated from CRMRuleEngine)
# ═══════════════════════════════════════════════════════════════════════════

WAITING_PATIENT_TASK_DAYS = 7
WAITING_LAB_TASK_DAYS = 5


async def _has_followup(db: AsyncSession, plan_id: str, follow_up_type: str) -> bool:
    from app.models.follow_up import FollowUp, FollowUpStatus
    result = await db.execute(
        select(FollowUp).where(
            FollowUp.treatment_id == plan_id,
            FollowUp.follow_up_type == follow_up_type,
            FollowUp.status != FollowUpStatus.LOST.value,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _has_custom_recall(db: AsyncSession, plan_id: str, days: int) -> bool:
    from app.models.follow_up import FollowUp, FollowUpStatus
    result = await db.execute(
        select(FollowUp).where(
            FollowUp.treatment_id == plan_id,
            FollowUp.notes.ilike(f"%{days}-day recall%"),
            FollowUp.status != FollowUpStatus.LOST.value,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def create_treatment_assigned_followup(db: AsyncSession, plan_id: str) -> None:
    """When treatment is first assigned — create a 'schedule first visit' task."""
    from datetime import time as dt_time
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
        select(FollowUp).where(
            FollowUp.treatment_id == plan_id,
            FollowUp.follow_up_type == FollowUpType.ONE_DAY_FOLLOW_UP.value,
            FollowUp.status != FollowUpStatus.LOST.value,
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        return
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today() + timedelta(days=1),
        follow_up_time=dt_time(10, 0),
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"Auto: Schedule first visit for treatment '{plan.treatment_name}'",
    )
    db.add(fu)
    await db.flush()
    logger.info("CRM: Assigned task created for plan %s", plan_id)


async def create_treatment_completed_followups(db: AsyncSession, plan_id: str) -> None:
    """When treatment is completed — create follow-up + recall tasks per rule."""
    from datetime import time as dt_time
    from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
    from app.models.case import Case
    from app.models.patient import Patient
    from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
    from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus

    plan = await db.get(TreatmentPlan, plan_id)
    if not plan or plan.status != TreatmentPlanStatus.COMPLETED:
        return
    case = await db.get(Case, plan.case_id)
    if not case or not case.patient_id:
        return
    patient = await db.get(Patient, case.patient_id)
    hospital_id = patient.hospital_id if patient else None

    from sqlalchemy import or_ as sql_or

    rule = None
    for scope_hid in (None, hospital_id):
        clauses = []
        if plan.treatment_type_id:
            clauses.append(TreatmentFollowUpRule.treatment_type_id == plan.treatment_type_id)
        if plan.treatment_template_id:
            clauses.append(TreatmentFollowUpRule.treatment_template_id == plan.treatment_template_id)
        if plan.treatment_name:
            clauses.append(TreatmentFollowUpRule.treatment_name == plan.treatment_name)
        if not clauses:
            continue
        q = select(TreatmentFollowUpRule).where(
            TreatmentFollowUpRule.hospital_id == scope_hid,
            TreatmentFollowUpRule.is_active == True,
            sql_or(*clauses),
        )
        result = await db.execute(q.limit(1))
        rule = result.scalar_one_or_none()
        if rule:
            break

    if not rule:
        logger.info("CRM: No rule found for plan %s", plan_id)
        return

    today = date.today()
    created_count = 0

    if rule.follow_up_1_day:
        if not await _has_followup(db, plan_id, FollowUpType.ONE_DAY_FOLLOW_UP.value):
            db.add(FollowUp(
                patient_id=patient.id, hospital_id=hospital_id,
                doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                treatment_id=plan_id, treatment_name=plan.treatment_name,
                follow_up_date=today + timedelta(days=1), follow_up_time=dt_time(10, 0),
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
                follow_up_date=today + timedelta(days=7), follow_up_time=dt_time(10, 0),
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
                follow_up_date=today + timedelta(days=180), follow_up_time=dt_time(10, 0),
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
                follow_up_date=today + timedelta(days=365), follow_up_time=dt_time(10, 0),
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
                follow_up_date=today + timedelta(days=rule.custom_recall_days), follow_up_time=dt_time(10, 0),
                follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                status=FollowUpStatus.PENDING.value,
                treatment_completed_date=today,
                notes=f"Auto: {rule.custom_recall_days}-day recall for '{plan.treatment_name}'",
            ))
            created_count += 1

    await db.flush()
    logger.info("CRM: Completed — created %d tasks for plan %s", created_count, plan_id)


async def create_waiting_patient_followup(db: AsyncSession, plan_id: str) -> None:
    """When treatment is set to WAITING_PATIENT — create a follow-up task for 7 days later."""
    from datetime import time as dt_time
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
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today() + timedelta(days=WAITING_PATIENT_TASK_DAYS),
        follow_up_time=dt_time(10, 0),
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"Auto: Patient follow-up after {WAITING_PATIENT_TASK_DAYS} days for '{plan.treatment_name}'",
    )
    db.add(fu)
    await db.flush()
    logger.info("CRM: Waiting patient task created for plan %s", plan_id)


async def create_waiting_lab_followup(db: AsyncSession, plan_id: str) -> None:
    """When treatment is set to WAITING_LAB — create a follow-up task for 5 days later."""
    from datetime import time as dt_time
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
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today() + timedelta(days=WAITING_LAB_TASK_DAYS),
        follow_up_time=dt_time(10, 0),
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"Auto: Lab follow-up after {WAITING_LAB_TASK_DAYS} days for '{plan.treatment_name}'",
    )
    db.add(fu)
    await db.flush()
    logger.info("CRM: Waiting lab task created for plan %s", plan_id)


async def create_overdue_followup(db: AsyncSession, plan_id: str, reason: str = "", delay_type: str = "") -> None:
    """When treatment is marked overdue — create a high-priority task."""
    from datetime import time as dt_time
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
    fu = FollowUp(
        patient_id=patient.id, hospital_id=patient.hospital_id,
        doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
        treatment_id=plan_id, treatment_name=plan.treatment_name,
        follow_up_date=date.today(), follow_up_time=dt_time(9, 0),
        follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
        status=FollowUpStatus.PENDING.value,
        notes=f"URGENT: Treatment '{plan.treatment_name}' overdue. Reason: {reason} ({delay_type})",
    )
    db.add(fu)
    await db.flush()
    logger.info("CRM: Overdue task created for plan %s", plan_id)
