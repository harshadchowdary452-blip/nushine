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
            async with async_session_factory() as db:
                tomorrow = date.today() + timedelta(days=1)
                query = select(Appointment).where(Appointment.appointment_date == tomorrow, Appointment.status == AppointmentStatus.SCHEDULED, Appointment.is_active == True)
                result = await db.execute(query)
                appointments = result.scalars().all()
                for apt in appointments:
                    patient = await db.get(Patient, apt.patient_id)
                    if patient and patient.phone:
                        hospital_name, doctor_name = await _reminder_context(
                            db, patient.id, getattr(apt, "hospital_id", None), getattr(apt, "doctor_id", None) or patient.doctor_id)
                        await send_appointment_reminder(patient.phone, patient.full_name, apt.appointment_date.isoformat(), apt.appointment_time.strftime("%H:%M"), hospital_name, doctor_name)
        except Exception as e:
            logger.exception("check_appointment_reminders failed: %s", e)
        await asyncio.sleep(3600)


async def check_same_day_appointments():
    while True:
        try:
            async with async_session_factory() as db:
                today = date.today()
                query = select(Appointment).where(Appointment.appointment_date == today, Appointment.status == AppointmentStatus.SCHEDULED, Appointment.is_active == True)
                result = await db.execute(query)
                appointments = result.scalars().all()
                for apt in appointments:
                    patient = await db.get(Patient, apt.patient_id)
                    if patient and patient.phone:
                        hospital_name, doctor_name = await _reminder_context(
                            db, patient.id, getattr(apt, "hospital_id", None), getattr(apt, "doctor_id", None) or patient.doctor_id)
                        await send_appointment_reminder(patient.phone, patient.full_name, apt.appointment_date.isoformat(), apt.appointment_time.strftime("%H:%M"), hospital_name, doctor_name)
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
                    sitting_q = await db.execute(
                        select(TreatmentSitting.id).join(
                            TreatmentPlan, TreatmentSitting.treatment_plan_id == TreatmentPlan.id
                        ).where(
                            TreatmentPlan.patient_id == apt.patient_id,
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


async def check_recurring_recalls():
    """Auto-advance recurring recall chains.

    A recurring recall (e.g. 180-day dental recall) keeps regenerating each cycle
    until a new case is created for the patient. Once the current occurrence's due
    date passes, the next occurrence is scheduled using the same chain, and the
    overdue occurrence is closed so only ONE enquiry stays active per chain.
    """
    while True:
        try:
            from app.models.generated_enquiry import GeneratedEnquiry

            async with async_session_factory() as db:
                today = date.today()

                result = await db.execute(
                    select(GeneratedEnquiry).where(
                        and_(
                            GeneratedEnquiry.enquiry_type == "RECALL",
                            GeneratedEnquiry.status == "PENDING",
                            GeneratedEnquiry.is_recurring == True,
                            GeneratedEnquiry.due_date < today,
                        )
                    ).order_by(GeneratedEnquiry.due_date.asc())
                )
                overdue_recalls = result.scalars().all()

                advanced = 0
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

                    # Read CURRENT interval from CRM settings (always fresh)
                    interval_days = recall.recurrence_interval_days or 180
                    try:
                        from app.models.crm_follow_up_config import CrmFollowUpConfig
                        res = await db.execute(
                            select(CrmFollowUpConfig.start_delay_days).where(
                                and_(
                                    CrmFollowUpConfig.hospital_id == recall.hospital_id,
                                    CrmFollowUpConfig.context_type == "CASE_RECALL",
                                )
                            ).limit(1)
                        )
                        fresh_interval = res.scalar_one_or_none()
                        if fresh_interval:
                            interval_days = fresh_interval
                    except Exception as e:
                        logger.warning("check_recurring_recalls interval lookup failed: %s", e)

                    # Anchor next due to the cycle (previous due + interval)
                    new_due = recall.due_date + timedelta(days=interval_days)

                    # Close the overdue occurrence so only one stays active
                    now = datetime.now(timezone.utc)
                    recall.status = "COMPLETED"
                    recall.cancelled_by_event = "RECURRING_RECALL_AUTO_ADVANCED"
                    recall.cancelled_at = now
                    await db.flush()

                    from app.crm.services.enquiry_executor import get_enquiry_executor

                    new_ge = GeneratedEnquiry(
                        hospital_id=recall.hospital_id,
                        patient_id=recall.patient_id,
                        case_id=recall.case_id,
                        doctor_id=recall.doctor_id,
                        treatment_type_id=recall.treatment_type_id,
                        enquiry_type="RECALL",
                        due_date=new_due,
                        priority="LOW",
                        status="PENDING",
                        notes=f"Recurring recall #{recall.occurrence_number + 1}",
                        is_recurring=True,
                        occurrence_number=recall.occurrence_number + 1,
                        recurrence_interval_days=interval_days,
                        chain_id=chain,
                        trigger_event="RECURRING_RECALL_AUTO_ADVANCED",
                        created_by_event="RECURRING_RECALL_AUTO_ADVANCED",
                        generation_reason="Recurring recall auto-advance (scheduler)",
                    )
                    new_ge.enquiry_number = await get_enquiry_executor()._generate_enquiry_number(db)
                    db.add(new_ge)
                    advanced += 1

                if advanced:
                    await db.commit()
                    logger.info("RECURRING_RECALLS_ADVANCED: %d chains advanced", advanced)
        except Exception as e:
            logger.exception("check_recurring_recalls failed: %s", e)
        await asyncio.sleep(3600)
