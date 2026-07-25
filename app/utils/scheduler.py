import asyncio
from datetime import datetime, timedelta, date, timezone
from sqlalchemy import select
from app.database import async_session_factory
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.utils.whatsapp import send_appointment_reminder, send_missed_appointment, send_follow_up_reminder


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
                        await send_appointment_reminder(patient.phone, patient.full_name, apt.appointment_date.isoformat(), apt.appointment_time.strftime("%H:%M"))
        except Exception:
            pass
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
                        await send_appointment_reminder(patient.phone, patient.full_name, apt.appointment_date.isoformat(), apt.appointment_time.strftime("%H:%M"))
        except Exception:
            pass
        await asyncio.sleep(1800)


async def check_overdue_treatments():
    while True:
        try:
            from app.services.overdue_detection import check_overdue_treatments as _check
            await _check()
        except Exception:
            pass
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
                    apt.status = AppointmentStatus.CANCELLED
                    patient = await db.get(Patient, apt.patient_id)
                    if patient and patient.phone:
                        await send_missed_appointment(patient.phone, patient.full_name)
                    # Publish APPOINTMENT_MISSED event — dispatcher handles CRM automation
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
                            payload={"appointment_id": str(apt.id), "patient_id": str(apt.patient_id)},
                            db=db,
                        )
                    except Exception:
                        pass
                await db.commit()
        except Exception:
            pass
        await asyncio.sleep(43200)
