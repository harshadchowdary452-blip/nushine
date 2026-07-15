import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.notification import Notification
from app.models.user import User
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus

logger = logging.getLogger(__name__)


async def _create_notification(
    db: AsyncSession,
    user_id: str,
    ntype: str,
    title: str,
    description: str,
    entity_type: str = None,
    entity_id: str = None,
    hospital_id: str = None,
):
    try:
        n = Notification(
            user_id=user_id,
            type=ntype,
            title=title,
            description=description,
            entity_type=entity_type,
            entity_id=entity_id,
            hospital_id=hospital_id,
        )
        db.add(n)
        await db.flush()
    except Exception as e:
        logger.warning("Failed to create notification for user %s: %s", user_id, e)


async def _get_admin_user_ids_for_hospital(db: AsyncSession, hospital_id: str) -> list[str]:
    result = await db.execute(
        select(User.id).where(
            User.hospital_id == hospital_id,
            User.role.in_(["HOSPITAL_ADMIN", "GROUP_ADMIN"]),
            User.is_active == True,
        )
    )
    return [row[0] for row in result.all()]


async def _get_reception_user_ids_for_hospital(db: AsyncSession, hospital_id: str) -> list[str]:
    result = await db.execute(
        select(User.id).where(
            User.hospital_id == hospital_id,
            User.role == "DOCTOR",
            User.is_active == True,
        )
    )
    return [row[0] for row in result.all()]


async def notify_treatment_overdue(db: AsyncSession, plan: TreatmentPlan, days_overdue: int = 1):
    """Notify admins when a treatment becomes overdue."""
    case = await db.get(Case, plan.case_id)
    patient_name = "Unknown"
    if case and case.patient_id:
        patient = await db.get(Patient, case.patient_id)
        if patient:
            patient_name = patient.full_name

    admin_ids = []
    if case and case.patient_id:
        patient = await db.get(Patient, case.patient_id)
        if patient:
            admin_ids = await _get_admin_user_ids_for_hospital(db, patient.hospital_id)

    for uid in admin_ids:
        await _create_notification(
            db, uid, "treatment_overdue",
            f"Treatment Overdue: {plan.treatment_name}",
            f"Treatment '{plan.treatment_name}' for {patient_name} is {days_overdue} day(s) overdue.",
            "treatment_plan", str(plan.id),
        )
    logger.info("Overdue notification sent for treatment %s (%d admins)", plan.id, len(admin_ids))


async def notify_treatment_completed(db: AsyncSession, plan: TreatmentPlan):
    """Notify admins and assigned doctor when treatment completes."""
    case = await db.get(Case, plan.case_id)
    patient_name = "Unknown"
    hospital_id = None
    if case and case.patient_id:
        patient = await db.get(Patient, case.patient_id)
        if patient:
            patient_name = patient.full_name
            hospital_id = patient.hospital_id

    admin_ids = []
    if hospital_id:
        admin_ids = await _get_admin_user_ids_for_hospital(db, hospital_id)

    for uid in admin_ids:
        await _create_notification(
            db, uid, "treatment_completed",
            f"Treatment Completed: {plan.treatment_name}",
            f"Treatment '{plan.treatment_name}' for {patient_name} has been completed.",
            "treatment_plan", str(plan.id),
        )

    if plan.assigned_doctor_id:
        await _create_notification(
            db, plan.assigned_doctor_id, "treatment_completed",
            f"Treatment Completed: {plan.treatment_name}",
            f"Your treatment '{plan.treatment_name}' for {patient_name} has been completed.",
            "treatment_plan", str(plan.id),
        )

    logger.info("Completion notification sent for treatment %s", plan.id)


async def notify_waiting_lab_expired(db: AsyncSession, plan: TreatmentPlan, days_waiting: int):
    """Notify admins when waiting for lab exceeds threshold."""
    case = await db.get(Case, plan.case_id)
    patient_name = "Unknown"
    hospital_id = None
    if case and case.patient_id:
        patient = await db.get(Patient, case.patient_id)
        if patient:
            patient_name = patient.full_name
            hospital_id = patient.hospital_id

    admin_ids = []
    if hospital_id:
        admin_ids = await _get_admin_user_ids_for_hospital(db, hospital_id)

    for uid in admin_ids:
        await _create_notification(
            db, uid, "lab_delay",
            f"Lab Delay: {plan.treatment_name}",
            f"Lab delay for {patient_name} — treatment '{plan.treatment_name}' has been waiting {days_waiting} days.",
            "treatment_plan", str(plan.id),
        )
    logger.info("Lab delay notification sent for treatment %s", plan.id)


async def notify_waiting_patient_expired(db: AsyncSession, plan: TreatmentPlan, days_waiting: int):
    """Notify admins when waiting for patient exceeds threshold."""
    case = await db.get(Case, plan.case_id)
    patient_name = "Unknown"
    hospital_id = None
    if case and case.patient_id:
        patient = await db.get(Patient, case.patient_id)
        if patient:
            patient_name = patient.full_name
            hospital_id = patient.hospital_id

    admin_ids = []
    if hospital_id:
        admin_ids = await _get_admin_user_ids_for_hospital(db, hospital_id)

    for uid in admin_ids:
        await _create_notification(
            db, uid, "patient_waiting",
            f"Patient Waiting: {plan.treatment_name}",
            f"Patient {patient_name} has been waiting {days_waiting} days for treatment '{plan.treatment_name}'.",
            "treatment_plan", str(plan.id),
        )
    logger.info("Patient waiting notification sent for treatment %s", plan.id)


async def notify_treatment_assigned(db: AsyncSession, plan: TreatmentPlan):
    """Notify assigned doctor when a treatment is assigned."""
    if not plan.assigned_doctor_id:
        return

    case = await db.get(Case, plan.case_id)
    patient_name = "Unknown"
    if case and case.patient_id:
        patient = await db.get(Patient, case.patient_id)
        if patient:
            patient_name = patient.full_name

    await _create_notification(
        db, plan.assigned_doctor_id, "treatment_assigned",
        f"New Treatment Assigned: {plan.treatment_name}",
        f"You have been assigned treatment '{plan.treatment_name}' for {patient_name}.",
        "treatment_plan", str(plan.id),
    )
    logger.info("Assignment notification sent to doctor %s for treatment %s", plan.assigned_doctor_id, plan.id)


async def notify_doctor_today_queue(db: AsyncSession, doctor_id: str, count: int):
    """Notify doctor of today's queue count."""
    if count > 0:
        await _create_notification(
            db, doctor_id, "daily_queue",
            "Today's Treatment Queue",
            f"You have {count} treatment(s) scheduled for today.",
        )


async def notify_pending_assignment(db: AsyncSession, plan: TreatmentPlan):
    """Notify admins when a treatment needs doctor assignment."""
    case = await db.get(Case, plan.case_id)
    hospital_id = None
    if case and case.patient_id:
        patient = await db.get(Patient, case.patient_id)
        if patient:
            hospital_id = patient.hospital_id

    admin_ids = []
    if hospital_id:
        admin_ids = await _get_admin_user_ids_for_hospital(db, hospital_id)

    for uid in admin_ids:
        await _create_notification(
            db, uid, "pending_assignment",
            f"Needs Doctor Assignment: {plan.treatment_name}",
            f"Treatment '{plan.treatment_name}' needs a doctor assignment.",
            "treatment_plan", str(plan.id),
        )
