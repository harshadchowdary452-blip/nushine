import logging
import json
from datetime import time
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from fastapi import HTTPException, status
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.appointment import Appointment, AppointmentStatus, Appointment as ApptModel
from app.models.patient import Patient
from app.models.user import User
from app.models.notification import Notification
from app.models.hospital import Hospital

logger = logging.getLogger(__name__)


class AppointmentService:
    def __init__(self, db: AsyncSession):
        self.repo = AppointmentRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Appointment:
        try:
            logger.info("CREATE_APPOINTMENT - Request data: %s", data)

            patient_id = data.get("patient_id")
            doctor_id = data.get("doctor_id")
            appointment_date = data.get("appointment_date")
            appointment_time = data.get("appointment_time")

            # ===== STRUCTURED LOGGING: Input Validation =====
            logger.warning("=" * 60)
            logger.warning("Appointment Create Validation - START")
            logger.warning("=" * 60)
            logger.warning(f"Current User: {user_id}")
            logger.warning(f"Patient: {patient_id}")
            logger.warning(f"Doctor: {doctor_id}")

            if not patient_id:
                logger.warning("VALIDATION FAILED: patient_id is required")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id is required")
            if not doctor_id:
                logger.warning("VALIDATION FAILED: doctor_id is required")
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="doctor_id is required")

            # ===== STEP 1: Validate Patient Exists =====
            logger.warning("STEP 1: Validating patient exists...")
            patient_result = await self.db.execute(select(Patient).where(Patient.id == patient_id))
            patient = patient_result.scalar_one_or_none()
            if not patient:
                logger.warning(f"VALIDATION FAILED: Patient not found - {patient_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Patient not found"
                )
            logger.warning(f"✓ Patient exists: {patient_id}, Hospital: {patient.hospital_id}")

            # ===== STEP 2: Validate Doctor Exists =====
            logger.warning("STEP 2: Validating doctor exists...")
            doctor_result = await self.db.execute(select(User).where(User.id == doctor_id))
            doctor = doctor_result.scalar_one_or_none()
            if not doctor:
                logger.warning(f"VALIDATION FAILED: Doctor not found - {doctor_id}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Doctor not found"
                )
            logger.warning(f"✓ Doctor exists: {doctor_id}, Hospital: {doctor.hospital_id}, Role: {doctor.role}")

            # ===== STEP 3: Validate Hospital Mismatch =====
            logger.warning("STEP 3: Checking hospital isolation...")
            if doctor.hospital_id and patient.hospital_id and doctor.hospital_id != patient.hospital_id:
                logger.warning(f"VALIDATION FAILED: Hospital mismatch - Patient hospital: {patient.hospital_id}, Doctor hospital: {doctor.hospital_id}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Doctor and Patient must belong to the same hospital"
                )
            logger.warning(f"✓ Hospital isolation check passed - Same hospital: {patient.hospital_id}")

            # ===== STEP 4: Validate Doctor is in the DOCTOR role =====
            logger.warning("STEP 4: Checking doctor role...")
            if doctor.role not in ("DOCTOR", "CONSULTANT"):
                logger.warning(f"VALIDATION FAILED: User is not a doctor - Role: {doctor.role}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"User {doctor_id} is not a doctor"
                )
            logger.warning(f"✓ Doctor role valid: {doctor.role}")

            # ===== STEP 4b: Check Doctor Appointment Capacity =====
            logger.warning("STEP 4b: Checking doctor appointment capacity...")
            await self._check_doctor_capacity(doctor_id, appointment_date, appointment_time)
            logger.warning("✓ Appointment capacity check passed")

            # ===== STEP 5: Create Appointment =====
            logger.warning("STEP 5: Creating appointment...")
            appointment = await self.repo.create(**data)
            logger.warning(f"✓ Appointment created: {appointment.id}")

            # ===== Generate appointment number =====
            try:
                cnt = await self.db.execute(select(func.count(ApptModel.id)))
                appointment.appointment_number = f"APPT-{cnt.scalar():04d}"
                await self.db.flush()
            except Exception:
                pass

            # ===== STEP 6: Generate notification for doctor =====
            try:
                patient_name = patient.full_name if patient else "Unknown"
                notification = Notification(
                    user_id=appointment.doctor_id,
                    type="appointment",
                    title="New Appointment Scheduled",
                    description=f"{patient_name} - {appointment.appointment_date} at {appointment.appointment_time}",
                    entity_type="appointment",
                    entity_id=str(appointment.id),
                )
                self.db.add(notification)
                await self.db.flush()
            except Exception as e:
                logger.exception("Failed to create notification: %s", str(e))

            logger.warning("=" * 60)
            logger.warning("Appointment Create Validation - SUCCESS")
            logger.warning("=" * 60)

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
        doctor_result = await self.db.execute(select(User.hospital_id).where(User.id == doctor_id))
        doctor_row = doctor_result.one_or_none()
        if doctor_row and doctor_row[0]:
            hosp_result = await self.db.execute(
                select(Hospital.settings).where(Hospital.id == doctor_row[0])
            )
            hosp_row = hosp_result.one_or_none()
            if hosp_row and hosp_row[0]:
                try:
                    settings = json.loads(hosp_row[0])
                    max_per_hour = settings.get("doctor_max_appointments_per_hour", 4)
                except (json.JSONDecodeError, TypeError):
                    pass
        excluded_statuses = [AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]
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
        result = {
            "available": available,
            "current_count": count,
            "max_allowed": max_per_hour,
        }
        if not available:
            result["message"] = "Doctor capacity reached"
        return result

    async def get(self, appointment_id: str) -> Optional[Appointment]:
        appointment = await self.repo.get(appointment_id)
        if appointment:
            await self._attach_names(appointment)
        return appointment

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Appointment]:
        appointments = await self.repo.get_all(skip=skip, limit=limit, filters=filters)
        for a in appointments:
            await self._attach_names(a)
        return appointments

    async def update(self, appointment_id: str, data: dict, user_id: str = None) -> Optional[Appointment]:
        try:
            if "status" in data:
                data["status"] = AppointmentStatus(data["status"])
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
            result = await self.repo.delete(appointment_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_APPOINTMENT", entity_type="APPOINTMENT", entity_id=appointment_id, details="Appointment deleted")
            return result
        except Exception as e:
            logger.exception("DELETE_APPOINTMENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete appointment: {str(e)}")
