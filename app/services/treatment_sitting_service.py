import logging
from typing import Optional, List
from datetime import date, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from fastapi import HTTPException, status
from app.repositories.treatment_sitting_repository import TreatmentSittingRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
from app.models.treatment_plan import TreatmentPlan
from app.models.case import Case
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.utils.whatsapp import send_appointment_reminder

logger = logging.getLogger(__name__)


class TreatmentSittingService:
    def __init__(self, db: AsyncSession):
        self.repo = TreatmentSittingRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _auto_create_appointment_from_sitting(self, sitting: TreatmentSitting) -> Optional[Appointment]:
        if not sitting.next_appointment_date:
            return None
        plan_result = await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.id == sitting.treatment_plan_id))
        plan = plan_result.scalar_one_or_none()
        if not plan:
            return None
        case = await self.db.get(Case, plan.case_id)
        if not case:
            return None
        existing = await self.db.execute(
            select(Appointment).where(
                Appointment.patient_id == case.patient_id,
                Appointment.appointment_date == sitting.next_appointment_date,
                Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]),
                Appointment.is_active == True,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.info("Appointment already exists for patient %s on %s, skipping", case.patient_id, sitting.next_appointment_date)
            return None
        appt = Appointment(
            patient_id=case.patient_id,
            doctor_id=case.doctor_id or "",
            appointment_date=sitting.next_appointment_date,
            appointment_time=time(9, 0),
            status=AppointmentStatus.SCHEDULED,
            appointment_type=AppointmentType.TREATMENT,
            notes=f"Auto-created from treatment sitting #{sitting.sitting_number}",
        )
        self.db.add(appt)
        await self.db.flush()
        try:
            cnt = await self.db.execute(select(func.count(Appointment.id)))
            appt.appointment_number = f"APPT-{cnt.scalar():04d}"
            await self.db.flush()
        except Exception:
            pass
        logger.info("Auto-created appointment %s for patient %s on %s", appt.id, case.patient_id, sitting.next_appointment_date)
        try:
            patient_obj = await self.db.get(Patient, case.patient_id)
            if patient_obj and patient_obj.phone:
                await send_appointment_reminder(patient_obj.phone, patient_obj.full_name, appt.appointment_date.isoformat(), appt.appointment_time.strftime("%H:%M"))
        except Exception as e:
            logger.warning("Failed to send WhatsApp for auto-created appointment: %s", e)
        return appt

    async def create(self, data: dict, user_id: str = None) -> TreatmentSitting:
        try:
            logger.info("CREATE_TREATMENT_SITTING - Request data: %s", data)

            treatment_plan_id = data.get("treatment_plan_id")
            if not treatment_plan_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="treatment_plan_id is required")

            plan_result = await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.id == treatment_plan_id))
            plan = plan_result.scalar_one_or_none()
            if not plan:
                logger.error("CREATE_TREATMENT_SITTING - Treatment plan not found: %s", treatment_plan_id)
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Treatment plan with id {treatment_plan_id} not found")

            if "status" not in data or not data.get("status"):
                data["status"] = "PLANNED"
            sitting = await self.repo.create(**data)
            await self._auto_create_appointment_from_sitting(sitting)
            logger.info("CREATE_TREATMENT_SITTING - Success: %s", sitting.id)
            await self.audit_log_repo.create(user_id=user_id, action="CREATE_TREATMENT_SITTING", entity_type="TREATMENT_SITTING", entity_id=str(sitting.id), details=f"Sitting #{sitting.sitting_number} created")
            return sitting
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_TREATMENT_SITTING - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create treatment sitting: {str(e)}")

    async def get(self, sitting_id: str) -> Optional[TreatmentSitting]:
        return await self.repo.get(sitting_id)

    async def get_by_plan(self, treatment_plan_id: str) -> List[TreatmentSitting]:
        return await self.repo.get_all(filters={"treatment_plan_id": treatment_plan_id})

    async def update(self, sitting_id: str, data: dict, user_id: str = None) -> Optional[TreatmentSitting]:
        try:
            old = await self.repo.get(sitting_id)
            was_completed = old is not None and old.status != TreatmentSittingStatus.COMPLETED.value and data.get("status") == TreatmentSittingStatus.COMPLETED.value
            has_next_date = data.get("next_appointment_date") is not None
            sitting = await self.repo.update(sitting_id, **data)
            if sitting:
                if has_next_date:
                    await self._auto_create_appointment_from_sitting(sitting)
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_SITTING", entity_type="TREATMENT_SITTING", entity_id=sitting_id, details="Treatment sitting updated")

                if was_completed and sitting.treatment_plan_id:
                    plan_result = await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.id == sitting.treatment_plan_id))
                    plan = plan_result.scalar_one_or_none()
                    if plan:
                        plan.completed_sittings = (plan.completed_sittings or 0) + 1
                        plan.remaining_sittings = max(0, (plan.total_sittings or 1) - plan.completed_sittings)
                        if plan.remaining_sittings <= 0:
                            plan.status = "COMPLETED"
                            await self.db.flush()
                            await self.audit_log_repo.create(
                                user_id=user_id, action="COMPLETE_TREATMENT_PLAN",
                                entity_type="TREATMENT_PLAN", entity_id=str(plan.id),
                                details=f"Treatment plan auto-completed: all {plan.total_sittings} sittings done"
                            )
            return sitting
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_SITTING - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment sitting: {str(e)}")
