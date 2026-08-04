import asyncio
import logging
from datetime import datetime, timedelta, date, timezone
from sqlalchemy import select, and_
from app.database import async_session_factory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.utils.whatsapp import send_appointment_reminder, send_missed_appointment, send_follow_up_reminder

logger = logging.getLogger("app.utils.scheduler")


async def _reminder_context(db, patient_id, hospital_id=None, doctor_id=None):
    hospital_name = None
    if hospital_id:
        hospital = await db.get(Hospital, hospital_id)
        if hospital:
            hospital_name = hospital.name
    doctor_name = None
    if doctor_id:
        doctor = await db.get(User, doctor_id)
        if doctor:
            doctor_name = doctor.full_name
    return hospital_name, doctor_name


async def check_appointment_reminders():
    while True:
        try:
            from app.crm.services.crm_settings import get_settings_service
            async with async_session_factory() as db:
                today = date.today()
                svc = get_settings_service()
                horizon = today + timedelta(days=30)
                query = select(Appointment).where(
                    Appointment.appointment_date >= today,
                    Appointment.appointment_date <= horizon,
                    Appointment.status == AppointmentStatus.SCHEDULED,
                    Appointment.is_active == True,
                    Appointment.reminded_at.is_(None),
                )
                result = await db.execute(query)
                appointments = result.scalars().all()
                sent = 0
                for apt in appointments:
                    hid = getattr(apt, "hospital_id", None)
                    offset = 1
                    if hid:
                        try:
                            offset = (await svc.get_settings(db, hid)).default_reminder_offset_days
                        except Exception:
                            offset = 1
                    if offset <= 0:
                        # Same-day reminders are handled by check_same_day_appointments
                        continue
                    target = apt.appointment_date - timedelta(days=offset)
                    if target != today:
                        continue
                    patient = await db.get(Patient, apt.patient_id)
                    if patient and patient.phone:
                        hospital_name, doctor_name = await _reminder_context(
                            db, patient.id, hid, getattr(apt, "doctor_id", None) or patient.doctor_id)
                        sent_ok = await send_appointment_reminder(patient.phone, patient.full_name, apt.appointment_date.isoformat(), apt.appointment_time.strftime("%H:%M"), hospital_name, doctor_name)
                        if sent_ok:
                            apt.reminder_sent = True
                            apt.reminded_at = datetime.now(timezone.utc)
                            sent += 1
                            logger.info("APPT_REMINDER_SENT: appointment %s for patient %s", apt.id, apt.patient_id)
                if sent:
                    await db.commit()
        except Exception as e:
            logger.exception("check_appointment_reminders failed: %s", e)
        await asyncio.sleep(3600)


async def check_same_day_appointments():
    while True:
        try:
            async with async_session_factory() as db:
                today = date.today()
                query = select(Appointment).where(Appointment.appointment_date == today, Appointment.status == AppointmentStatus.SCHEDULED, Appointment.is_active == True, Appointment.reminded_at.is_(None))
                result = await db.execute(query)
                appointments = result.scalars().all()
                for apt in appointments:
                    patient = await db.get(Patient, apt.patient_id)
                    if patient and patient.phone:
                        hospital_name, doctor_name = await _reminder_context(
                            db, patient.id, getattr(apt, "hospital_id", None), getattr(apt, "doctor_id", None) or patient.doctor_id)
                        sent = await send_appointment_reminder(patient.phone, patient.full_name, apt.appointment_date.isoformat(), apt.appointment_time.strftime("%H:%M"), hospital_name, doctor_name)
                        if sent:
                            apt.reminder_sent = True
                            apt.reminded_at = datetime.now(timezone.utc)
                            logger.info("APPT_SAME_DAY_REMINDER_SENT: appointment %s for patient %s", apt.id, apt.patient_id)
                await db.commit()
        except Exception as e:
            logger.exception("check_same_day_appointments failed: %s", e)
        await asyncio.sleep(1800)


async def check_overdue_treatments():
    while True:
        try:
            from app.services.overdue_detection import check_overdue_treatments as _check
            await _check()
        except Exception as e:
            logger.exception("check_overdue_treatments failed: %s", e)
        await asyncio.sleep(3600)


async def check_missed_appointments():
    while True:
        try:
            async with async_session_factory() as db:
                today = date.today()
                yesterday = today - timedelta(days=1)
                query = select(Appointment).where(Appointment.appointment_date == yesterday, Appointment.status == AppointmentStatus.SCHEDULED, Appointment.is_active == True)
                result = await db.execute(query)
                appointments = result.scalars().all()
                for apt in appointments:
                    from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
                    from app.models.treatment_plan import TreatmentPlan
                    from app.models.case import Case
                    sitting_q = await db.execute(
                        select(TreatmentSitting.id).join(
                            TreatmentPlan, TreatmentSitting.treatment_plan_id == TreatmentPlan.id
                        ).join(
                            Case, TreatmentPlan.case_id == Case.id
                        ).where(
                            Case.patient_id == apt.patient_id,
                            TreatmentSitting.status == TreatmentSittingStatus.COMPLETED.value,
                            TreatmentSitting.sitting_date == yesterday,
                        ).limit(1)
                    )
                    has_sitting = sitting_q.scalar_one_or_none()
                    if has_sitting:
                        apt.status = AppointmentStatus.COMPLETED
                        logger.info("APPT_MARKED_COMPLETED: appointment %s for patient %s (sitting completed)", apt.id, apt.patient_id)
                    else:
                        apt.status = AppointmentStatus.CANCELLED
                        patient = await db.get(Patient, apt.patient_id)
                        if patient and patient.phone:
                            hospital_name, _ = await _reminder_context(
                                db, patient.id, getattr(apt, "hospital_id", None), getattr(apt, "doctor_id", None))
                            await send_missed_appointment(patient.phone, patient.full_name, hospital_name)
                        try:
                            from app.crm.services.event_dispatcher import publish_event
                            from app.crm.enums import EventType, EventSource
                            await publish_event(
                                event_type=EventType.APPOINTMENT_MISSED,
                                source_module=EventSource.SYSTEM,
                                entity_type="APPOINTMENT",
                                entity_id=str(apt.id),
                                hospital_id=str(apt.hospital_id) if getattr(apt, 'hospital_id', None) else None,
                                patient_id=str(apt.patient_id),
                                doctor_id=str(apt.doctor_id) if getattr(apt, 'doctor_id', None) else None,
                                payload={"appointment_id": str(apt.id), "patient_id": str(apt.patient_id), "visit_date": yesterday.isoformat()},
                                db=db,
                            )
                        except Exception as e:
                            logger.warning("check_missed_appointments publish_event failed: %s", e)
                await db.commit()
        except Exception as e:
            logger.exception("check_missed_appointments failed: %s", e)
        await asyncio.sleep(43200)


async def _run_recurring_recall_pass(factory):
    """Single deterministic pass over recurring recall chains.

    Task A (advance):  an overdue PENDING occurrence is closed and its successor is
                       scheduled (next due = previous due + current interval).
    Task B (heal):     a chain whose latest occurrence was completed WITHOUT a
                       successor (e.g. the completion event path never ran) is
                       re-scheduled. Both tasks use the same idempotent primitive so
                       they can never double-create or resurrect an old chain.

    Only ONE enquiry stays active per chain; a new case cancels old chains.
    """
    from app.models.generated_enquiry import GeneratedEnquiry
    from app.crm.services.crm_settings import get_settings_service
    from app.crm.services.recurring_recalls import schedule_next_recurring_recall

    # Automation always reads FRESH settings — never a stale in-process cache
    get_settings_service().invalidate_cache()

    advanced = 0
    healed = 0

    async with factory() as db:
        today = date.today()

        # ── Task A: advance overdue PENDING occurrences ──────────────────────
        result = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.enquiry_type == "RECALL",
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.is_recurring == True,
                    GeneratedEnquiry.due_date < today,
                    GeneratedEnquiry.patient_id.is_not(None),
                )
            ).order_by(GeneratedEnquiry.due_date.asc())
        )
        overdue_recalls = result.scalars().all()
        processed_chains = set()

        for recall in overdue_recalls:
            chain = recall.chain_id or recall.id
            if chain in processed_chains:
                continue

            # Skip if this chain already has a newer PENDING occurrence
            newer = await db.execute(
                select(GeneratedEnquiry.id).where(
                    and_(
                        GeneratedEnquiry.chain_id == chain,
                        GeneratedEnquiry.enquiry_type == "RECALL",
                        GeneratedEnquiry.status == "PENDING",
                        GeneratedEnquiry.due_date > recall.due_date,
                    )
                ).limit(1)
            )
            if newer.scalar_one_or_none():
                continue

            processed_chains.add(chain)

            # Close the overdue occurrence so only one stays active
            now = datetime.now(timezone.utc)
            recall.status = "COMPLETED"
            recall.cancelled_by_event = "RECURRING_RECALL_AUTO_ADVANCED"
            recall.cancelled_at = now
            await db.flush()

            new_ge = await schedule_next_recurring_recall(
                db, recall.hospital_id, recall,
                trigger_event="RECURRING_RECALL_AUTO_ADVANCED",
                reason="Recurring recall auto-advance (scheduler)",
            )
            if new_ge:
                advanced += 1

        # ── Task B: heal completed chains with no successor ───────────────────
        chain_ids = (await db.execute(
            select(GeneratedEnquiry.chain_id).where(
                and_(
                    GeneratedEnquiry.enquiry_type == "RECALL",
                    GeneratedEnquiry.is_recurring == True,
                    GeneratedEnquiry.chain_id.is_not(None),
                    GeneratedEnquiry.patient_id.is_not(None),
                )
            ).distinct()
        )).scalars().all()

        for chain in chain_ids:
            members = (await db.execute(
                select(GeneratedEnquiry).where(
                    and_(
                        GeneratedEnquiry.chain_id == chain,
                        GeneratedEnquiry.enquiry_type == "RECALL",
                    )
                ).order_by(GeneratedEnquiry.occurrence_number.desc())
            )).scalars().all()
            if not members:
                continue
            latest = members[0]
            if latest.status != "COMPLETED":
                continue
            new_ge = await schedule_next_recurring_recall(
                db, latest.hospital_id, latest,
                trigger_event="RECURRING_RECALL_AUTO_ADVANCED",
                reason="Recovered recurring recall chain (scheduler heal)",
            )
            if new_ge:
                healed += 1

        if advanced or healed:
            await db.commit()
            logger.info("RECURRING_RECALLS_ADVANCED: %d advanced, %d healed", advanced, healed)

    return {"advanced": advanced, "healed": healed}


async def check_recurring_recalls():
    """Auto-advance + self-heal recurring recall chains (runs every hour)."""
    while True:
        try:
            await _run_recurring_recall_pass(async_session_factory)
        except Exception as e:
            logger.exception("check_recurring_recalls failed: %s", e)
        await asyncio.sleep(3600)
