import logging
import json
from datetime import time, datetime, date, timedelta
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract, and_
from fastapi import HTTPException, status
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType, TREATMENT_DURATIONS, Appointment as ApptModel
from app.models.patient import Patient
from app.models.user import User
from app.models.notification import Notification
from app.models.hospital import Hospital
from app.models.doctor_working_hour import DoctorWorkingHour, WEEKDAYS
from app.models.doctor_leave import DoctorLeave, LeaveStatus
from app.models.doctor_blocked_slot import DoctorBlockedSlot
from app.models.doctor_availability import DoctorAvailability

logger = logging.getLogger(__name__)


def compute_end_time(start: time, duration_minutes: int) -> time:
    start_dt = datetime.combine(date.today(), start)
    end_dt = start_dt + timedelta(minutes=duration_minutes)
    return end_dt.time()


def time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def times_overlap(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    return time_to_minutes(a_start) < time_to_minutes(b_end) and time_to_minutes(b_start) < time_to_minutes(a_end)


def generate_slots(start: time, end: time, slot_duration: int = 30) -> list[time]:
    slots = []
    start_mins = time_to_minutes(start)
    end_mins = time_to_minutes(end)
    cur = start_mins
    while cur + slot_duration <= end_mins:
        h, m = divmod(cur, 60)
        slots.append(time(h, m))
        cur += slot_duration
    return slots


class AppointmentService:
    def __init__(self, db: AsyncSession):
        self.repo = AppointmentRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _ensure_working_hours_defaults(self, doctor_id: str, hospital_id: str):
        result = await self.db.execute(
            select(func.count()).select_from(DoctorWorkingHour).where(
                DoctorWorkingHour.doctor_id == doctor_id
            )
        )
        if result.scalar() > 0:
            return
        import uuid
        from datetime import time as dtime
        from sqlalchemy import insert
        await self.db.execute(
            insert(DoctorWorkingHour),
            [
                {
                    "id": str(uuid.uuid4()),
                    "doctor_id": doctor_id,
                    "hospital_id": hospital_id,
                    "day_of_week": i,
                    "start_time": dtime(9, 0),
                    "end_time": dtime(21, 0),
                    "lunch_start": dtime(13, 0),
                    "lunch_end": dtime(14, 0),
                    "is_available": (i < 5),
                }
                for i in range(7)
            ]
        )

    async def _get_doctor_schedule(self, doctor_id: str, appointment_date: date):
        dow = appointment_date.weekday()
        override_result = await self.db.execute(
            select(DoctorAvailability).where(
                DoctorAvailability.doctor_id == doctor_id,
                DoctorAvailability.date == appointment_date,
            )
        )
        override = override_result.scalar_one_or_none()
        if override:
            if not override.is_available:
                return None
            if override.start_time and override.end_time:
                return override
        result = await self.db.execute(
            select(DoctorWorkingHour).where(
                DoctorWorkingHour.doctor_id == doctor_id,
                DoctorWorkingHour.day_of_week == dow,
                DoctorWorkingHour.is_available == True,
            )
        )
        return result.scalar_one_or_none()

    async def _is_on_leave(self, doctor_id: str, appointment_date: date) -> bool:
        result = await self.db.execute(
            select(func.count()).select_from(DoctorLeave).where(
                DoctorLeave.doctor_id == doctor_id,
                DoctorLeave.status == LeaveStatus.APPROVED,
                DoctorLeave.start_date <= appointment_date,
                DoctorLeave.end_date >= appointment_date,
            )
        )
        return result.scalar() > 0

    async def _get_blocked_slots(self, doctor_id: str, appointment_date: date) -> list[DoctorBlockedSlot]:
        result = await self.db.execute(
            select(DoctorBlockedSlot).where(
                DoctorBlockedSlot.doctor_id == doctor_id,
                DoctorBlockedSlot.date == appointment_date,
            )
        )
        return result.scalars().all()

    async def _get_existing_appointments(self, doctor_id: str, appointment_date: date) -> list[Appointment]:
        excluded_statuses = [AppointmentStatus.CANCELLED]
        result = await self.db.execute(
            select(Appointment).where(
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date == appointment_date,
                ~Appointment.status.in_(excluded_statuses),
            )
        )
        return result.scalars().all()

    async def _get_appointment_with_names(self, a: Appointment, slot_time: str = None) -> dict:
        patient_name = None
        if a.patient_id:
            p_res = await self.db.execute(select(Patient.full_name).where(Patient.id == a.patient_id))
            row = p_res.one_or_none()
            patient_name = row[0] if row else None
        return {
            "time": slot_time or a.appointment_time.strftime("%H:%M"),
            "available": False,
            "status": "booked",
            "patient_name": patient_name,
            "appointment_type": a.appointment_type.value if hasattr(a.appointment_type, 'value') else a.appointment_type,
            "duration_minutes": a.duration_minutes,
            "appointment_id": a.id,
        }

    async def get_doctor_slots(self, doctor_id: str, appointment_date: date, duration_minutes: int = 30) -> dict:
        doctor_result = await self.db.execute(
            select(User.full_name, User.hospital_id, User.admin_group_id).where(User.id == doctor_id)
        )
        doctor_row = doctor_result.one_or_none()
        doctor_name = doctor_row[0] if doctor_row else "Unknown"
        hospital_id = doctor_row[1] if doctor_row else ""
        admin_group_id = doctor_row[2] if doctor_row else ""

        # Auto-create default working hours if none exist
        if hospital_id:
            await self._ensure_working_hours_defaults(doctor_id, hospital_id)
        elif admin_group_id:
            # Doctor has no hospital_id but belongs to a group; resolve hospital via service
            from app.services.doctor_working_hour_service import DoctorWorkingHourService
            wh_service = DoctorWorkingHourService(self.db)
            await wh_service.ensure_defaults(doctor_id, admin_group_id)

        is_on_leave = await self._is_on_leave(doctor_id, appointment_date)
        if is_on_leave:
            leave_result = await self.db.execute(
                select(DoctorLeave.reason).where(
                    DoctorLeave.doctor_id == doctor_id,
                    DoctorLeave.status == LeaveStatus.APPROVED,
                    DoctorLeave.start_date <= appointment_date,
                    DoctorLeave.end_date >= appointment_date,
                )
            )
            leave_row = leave_result.one_or_none()
            return {
                "doctor_id": doctor_id,
                "doctor_name": doctor_name,
                "date": appointment_date,
                "slots": [],
                "is_on_leave": True,
                "leave_reason": leave_row[0] if leave_row else None,
                "working_hours": None,
            }

        schedule = await self._get_doctor_schedule(doctor_id, appointment_date)
        if not schedule:
            return {
                "doctor_id": doctor_id,
                "doctor_name": doctor_name,
                "date": appointment_date,
                "slots": [],
                "is_on_leave": False,
                "working_hours": None,
            }

        working_hours = f"{schedule.start_time.strftime('%I:%M %p')} - {schedule.end_time.strftime('%I:%M %p')}"
        if schedule.lunch_start and schedule.lunch_end:
            working_hours += f" | Lunch: {schedule.lunch_start.strftime('%I:%M %p')} - {schedule.lunch_end.strftime('%I:%M %p')}"

        blocked_slots = await self._get_blocked_slots(doctor_id, appointment_date)
        existing_appts = await self._get_existing_appointments(doctor_id, appointment_date)

        all_slots = generate_slots(schedule.start_time, schedule.end_time, 30)
        today = date.today()
        now = datetime.now().time()

        slots_result = []
        for slot_time in all_slots:
            slot_end = compute_end_time(slot_time, duration_minutes)
            slot_str = slot_time.strftime("%H:%M")

            is_past = appointment_date == today and time_to_minutes(slot_time) <= time_to_minutes(now)

            blocked = any(
                times_overlap(slot_time, slot_end, bs.start_time, bs.end_time)
                for bs in blocked_slots
            )

            booked = None
            for appt in existing_appts:
                appt_end = appt.end_time or compute_end_time(appt.appointment_time, appt.duration_minutes)
                if times_overlap(slot_time, slot_end, appt.appointment_time, appt_end):
                    booked = appt
                    break

            in_lunch = False
            if schedule.lunch_start and schedule.lunch_end:
                if times_overlap(slot_time, slot_end, schedule.lunch_start, schedule.lunch_end):
                    in_lunch = True

            if blocked:
                slots_result.append({
                    "time": slot_str, "available": False, "status": "blocked",
                    "patient_name": None, "appointment_type": None, "duration_minutes": None, "appointment_id": None,
                })
            elif booked:
                slots_result.append(await self._get_appointment_with_names(booked, slot_str))
            elif in_lunch:
                slots_result.append({
                    "time": slot_str, "available": False, "status": "blocked",
                    "patient_name": None, "appointment_type": None, "duration_minutes": None, "appointment_id": None,
                })
            elif is_past:
                slots_result.append({
                    "time": slot_str, "available": False, "status": "past",
                    "patient_name": None, "appointment_type": None, "duration_minutes": None, "appointment_id": None,
                })
            else:
                slots_result.append({
                    "time": slot_str, "available": True, "status": "available",
                    "patient_name": None, "appointment_type": None, "duration_minutes": None, "appointment_id": None,
                })

        return {
            "doctor_id": doctor_id,
            "doctor_name": doctor_name,
            "date": appointment_date,
            "slots": slots_result,
            "is_on_leave": False,
            "working_hours": working_hours,
        }

    async def _validate_appointment_slot(self, doctor_id: str, appointment_date: date, appointment_time: time, duration_minutes: int):
        if await self._is_on_leave(doctor_id, appointment_date):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor is on leave on this date")

        schedule = await self._get_doctor_schedule(doctor_id, appointment_date)
        if not schedule:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor is not available on this day")

        end_time = compute_end_time(appointment_time, duration_minutes)
        if time_to_minutes(appointment_time) < time_to_minutes(schedule.start_time) or time_to_minutes(end_time) > time_to_minutes(schedule.end_time):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Appointment time is outside doctor's working hours")

        if schedule.lunch_start and schedule.lunch_end:
            if times_overlap(appointment_time, end_time, schedule.lunch_start, schedule.lunch_end):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Appointment time overlaps with lunch break")

        blocked = await self._get_blocked_slots(doctor_id, appointment_date)
        for bs in blocked:
            if times_overlap(appointment_time, end_time, bs.start_time, bs.end_time):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Appointment time overlaps with a blocked slot")

        existing = await self._get_existing_appointments(doctor_id, appointment_date)
        for appt in existing:
            appt_end = appt.end_time or compute_end_time(appt.appointment_time, appt.duration_minutes)
            if times_overlap(appointment_time, end_time, appt.appointment_time, appt_end):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This time slot conflicts with an existing appointment")

    async def create(self, data: dict, user_id: str = None) -> Appointment:
        try:
            patient_id = data.get("patient_id")
            doctor_id = data.get("doctor_id")
            appointment_date = data.get("appointment_date")
            appointment_time = data.get("appointment_time")
            appointment_type_str = data.get("appointment_type", "CONSULTATION")
            duration_minutes = data.get("duration_minutes")

            if not duration_minutes:
                try:
                    appt_type_enum = AppointmentType(appointment_type_str)
                    duration_minutes = TREATMENT_DURATIONS.get(appt_type_enum, 30)
                except (ValueError, KeyError):
                    duration_minutes = 30

            end_time = compute_end_time(appointment_time, duration_minutes)

            patient_result = await self.db.execute(select(Patient).where(Patient.id == patient_id))
            patient = patient_result.scalar_one_or_none()
            if not patient:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

            doctor_result = await self.db.execute(select(User).where(User.id == doctor_id))
            doctor = doctor_result.scalar_one_or_none()
            if not doctor:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

            # Patient-hospital and doctor-admin-group validation handled in router tenant isolation

            if doctor.role not in ("DOCTOR", "CONSULTANT"):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"User {doctor_id} is not a doctor")

            await self._validate_appointment_slot(doctor_id, appointment_date, appointment_time, duration_minutes)
            await self._check_doctor_capacity(doctor_id, appointment_date, appointment_time)

            create_data = {
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "appointment_date": appointment_date,
                "appointment_time": appointment_time,
                "duration_minutes": duration_minutes,
                "end_time": end_time,
                "appointment_type": AppointmentType(appointment_type_str),
                "notes": data.get("notes"),
            }
            appointment = await self.repo.create(**create_data)

            try:
                max_num = await self.db.execute(select(func.max(ApptModel.appointment_number)))
                max_val = max_num.scalar()
                next_num = (int(max_val.split("-")[1]) + 1) if max_val else 1
                appointment.appointment_number = f"APPT-{next_num:04d}"
                await self.db.flush()
            except Exception:
                pass

            try:
                notification = Notification(
                    user_id=appointment.doctor_id,
                    type="appointment",
                    title="New Appointment Scheduled",
                    description=f"{patient.full_name} - {appointment.appointment_date} at {appointment.appointment_time}",
                    entity_type="appointment",
                    entity_id=str(appointment.id),
                )
                self.db.add(notification)
                await self.db.flush()
            except Exception:
                pass

            await self.audit_log_repo.create(user_id=user_id, action="CREATE_APPOINTMENT", entity_type="APPOINTMENT", entity_id=str(appointment.id), details="Appointment created")
            return appointment
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_APPOINTMENT - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create appointment: {str(e)}")

    async def _attach_names(self, appointment: Appointment):
        if appointment.patient:
            appointment.patient_name = appointment.patient.full_name
        elif appointment.patient_id:
            from sqlalchemy import select
            p_result = await self.db.execute(select(Patient).where(Patient.id == appointment.patient_id))
            p = p_result.scalar_one_or_none()
            appointment.patient_name = p.full_name if p else None
        if appointment.doctor:
            appointment.doctor_name = appointment.doctor.full_name
        elif appointment.doctor_id:
            d_result = await self.db.execute(select(User).where(User.id == appointment.doctor_id))
            d = d_result.scalar_one_or_none()
            appointment.doctor_name = d.full_name if d else None
        return appointment

    async def _check_doctor_capacity(self, doctor_id: str, appointment_date, appointment_time, raise_on_full=True):
        max_per_hour, count = await self._get_capacity_and_count(doctor_id, appointment_date, appointment_time)
        if count >= max_per_hour and raise_on_full:
            hour_end = appointment_time.hour + 1
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Doctor appointment capacity reached for {appointment_time.hour:02d}:00 - {hour_end:02d}:00. Maximum {max_per_hour} appointments allowed per hour."
            )
        return max_per_hour, count

    async def _get_capacity_and_count(self, doctor_id: str, appointment_date, appointment_time):
        if not appointment_date or not appointment_time:
            return 4, 0
        hour = appointment_time.hour
        max_per_hour = 4
        doctor_result = await self.db.execute(select(User.hospital_id, User.admin_group_id).where(User.id == doctor_id))
        doctor_row = doctor_result.one_or_none()
        hospital_id_for_capacity = doctor_row[0] if doctor_row else None
        admin_group_id_for_capacity = doctor_row[1] if doctor_row else None
        if not hospital_id_for_capacity and admin_group_id_for_capacity:
            any_hosp = await self.db.execute(
                select(Hospital.id).where(Hospital.admin_group_id == admin_group_id_for_capacity).limit(1)
            )
            any_hosp_row = any_hosp.one_or_none()
            hospital_id_for_capacity = any_hosp_row[0] if any_hosp_row else None
        if hospital_id_for_capacity:
            hosp_result = await self.db.execute(select(Hospital.settings).where(Hospital.id == doctor_row[0]))
            hosp_row = hosp_result.one_or_none()
            if hosp_row and hosp_row[0]:
                try:
                    settings = json.loads(hosp_row[0])
                    max_per_hour = settings.get("doctor_max_appointments_per_hour", 4)
                except (json.JSONDecodeError, TypeError):
                    pass
        excluded_statuses = [AppointmentStatus.CANCELLED.value]
        count_result = await self.db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date == appointment_date,
                ~Appointment.status.in_(excluded_statuses),
                extract('hour', Appointment.appointment_time) == hour,
            )
        )
        count = count_result.scalar() or 0
        return max_per_hour, count

    async def check_availability(self, doctor_id: str, appointment_date, appointment_time):
        max_per_hour, count = await self._get_capacity_and_count(doctor_id, appointment_date, appointment_time)
        available = count < max_per_hour
        if not available:
            return {"available": False, "current_count": count, "max_allowed": max_per_hour, "message": "Doctor capacity reached"}
        try:
            await self._validate_appointment_slot(doctor_id, appointment_date, appointment_time, 30)
            return {"available": True, "current_count": count, "max_allowed": max_per_hour}
        except HTTPException as e:
            return {"available": False, "current_count": count, "max_allowed": max_per_hour, "message": e.detail}

    async def get(self, appointment_id: str) -> Optional[Appointment]:
        appointment = await self.repo.get(appointment_id)
        if appointment:
            await self._attach_names(appointment)
        return appointment

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Appointment]:
        sort_by = None
        descending = False
        if filters:
            sort_by = filters.pop("sort_by", None)
            descending = filters.get("sort_order") == "desc" if filters.get("sort_order") else False
            filters.pop("sort_order", None)
        appointments = await self.repo.get_all(skip=skip, limit=limit, filters=filters, order_by=sort_by, descending=descending)
        for a in appointments:
            await self._attach_names(a)
        return appointments

    async def update(self, appointment_id: str, data: dict, user_id: str = None) -> Optional[Appointment]:
        try:
            if "status" in data:
                data["status"] = AppointmentStatus(data["status"])
            if "appointment_type" in data:
                data["appointment_type"] = AppointmentType(data["appointment_type"])
            if "appointment_time" in data or "duration_minutes" in data:
                appt = await self.get(appointment_id)
                if appt:
                    new_time = data.get("appointment_time", appt.appointment_time)
                    new_duration = data.get("duration_minutes", appt.duration_minutes)
                    data["end_time"] = compute_end_time(new_time, new_duration)
            appointment = await self.repo.update(appointment_id, **data)
            if appointment:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_APPOINTMENT", entity_type="APPOINTMENT", entity_id=appointment_id, details="Appointment updated")
            return appointment
        except Exception as e:
            logger.exception("UPDATE_APPOINTMENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update appointment: {str(e)}")

    async def get_upcoming(self, filters: dict = None) -> List[Appointment]:
        combined = {"status": AppointmentStatus.SCHEDULED.value}
        if filters:
            combined.update(filters)
        return await self.repo.get_all(filters=combined)

    async def cancel(self, appointment_id: str, user_id: str = None) -> Optional[Appointment]:
        return await self.update(appointment_id, {"status": AppointmentStatus.CANCELLED.value}, user_id)

    async def delete(self, appointment_id: str, user_id: str = None) -> bool:
        try:
            from app.models.follow_up import FollowUp
            from app.models.case import Case
            from app.models.follow_up_response import FollowUpResponse
            for fup in (await self.db.execute(select(FollowUp).where(FollowUp.appointment_id == appointment_id))).scalars():
                fup.appointment_id = None
            for c in (await self.db.execute(select(Case).where(Case.appointment_id == appointment_id))).scalars():
                c.appointment_id = None
            for fur in (await self.db.execute(select(FollowUpResponse).where(FollowUpResponse.appointment_id == appointment_id))).scalars():
                fur.appointment_id = None
            await self.db.flush()
            result = await self.repo.delete(appointment_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_APPOINTMENT", entity_type="APPOINTMENT", entity_id=appointment_id, details="Appointment deleted")
            return result
        except Exception as e:
            logger.exception("DELETE_APPOINTMENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete appointment: {str(e)}")
