import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.user import User

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

            # ===== STEP 5: Create Appointment =====
            logger.warning("STEP 5: Creating appointment...")
            appointment = await self.repo.create(**data)
            logger.warning(f"✓ Appointment created: {appointment.id}")

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
