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
                    # CRM Rule Engine — single entry through TreatmentAutomationService
                    try:
                        from app.crm.services.treatment_automation_service import TreatmentAutomationService
                        ta = TreatmentAutomationService(db)
                        await ta.on_appointment_missed(
                            appointment_id=apt.id,
                            patient_id=apt.patient_id,
                            hospital_id=getattr(apt, 'hospital_id', None),
                            doctor_id=getattr(apt, 'doctor_id', None),
                        )
                    except Exception:
                        pass
                await db.commit()
        except Exception:
            pass
        await asyncio.sleep(43200)
