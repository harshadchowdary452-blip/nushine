"""Clinical FollowUp creation — creates FollowUp records for treatment lifecycle events."""
import logging
from datetime import date, timedelta, time as dt_time

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger("services.clinical_followups")

WAITING_PATIENT_TASK_DAYS = 7
WAITING_LAB_TASK_DAYS = 5


async def _get_default_followup_time(db: AsyncSession, hospital_id: str) -> dt_time:
    try:
        from app.crm.services.crm_settings import get_settings_service
        settings_svc = get_settings_service()
        return await settings_svc.get_reminder_time(db, hospital_id)
    except Exception:
        return dt_time(9, 0)


async def _has_followup(db, plan_id, follow_up_type):
    from app.models.follow_up import FollowUp, FollowUpStatus
    result = await db.execute(
        select(FollowUp).where(
            FollowUp.treatment_id == plan_id,
            FollowUp.follow_up_type == follow_up_type,
            FollowUp.status != FollowUpStatus.LOST.value,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _has_custom_recall(db, plan_id, days):
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


async def create_treatment_completed_followups(db: AsyncSession, plan_id: str) -> None:
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

    reminder_time = await _get_default_followup_time(db, hospital_id) if hospital_id else dt_time(9, 0)

    rule = None
    for scope_hid in (None, hospital_id):
        clauses = []
        if plan.treatment_type_id:
            clauses.append(TreatmentFollowUpRule.treatment_type_id == plan.treatment_type_id)
        if plan.treatment_template_id:
            clauses.append(TreatmentFollowUpRule.treatment_template_id == plan.treatment_template_id)
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


async def create_waiting_patient_followup(db: AsyncSession, plan_id: str) -> None:
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


async def create_waiting_lab_followup(db: AsyncSession, plan_id: str) -> None:
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


async def create_overdue_followup(db: AsyncSession, plan_id: str, reason: str = "", delay_type: str = "") -> None:
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
