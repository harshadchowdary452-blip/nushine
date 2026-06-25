import logging
from typing import Optional, List
from datetime import date, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from fastapi import HTTPException, status
from app.repositories.treatment_plan_repository import TreatmentPlanRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_type import TreatmentType
from app.models.case import Case
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType

logger = logging.getLogger(__name__)


def _enrich_plan(plan: TreatmentPlan):
    total = plan.total_sittings or 0
    completed = plan.completed_sittings or 0
    remaining = plan.remaining_sittings or 0
    sittings_data = {
        "total_sittings": total,
        "completed_sittings": completed,
        "remaining_sittings": remaining,
        "progress": round((completed / total * 100) if total > 0 else 0, 1),
        "pending_amount": max(0, (plan.cost or 0) - (plan.paid_amount or 0)),
    }
    for k, v in sittings_data.items():
        setattr(plan, k, v)

    setattr(plan, "treatment_type_name", plan.treatment_type.name if plan.treatment_type else None)

    case = plan.case
    if case:
        setattr(plan, "case_number", f"CASE-{case.id[:8].upper()}")
        setattr(plan, "case_status", case.status.value if hasattr(case.status, 'value') else str(case.status))
        patient = case.patient
        if patient:
            setattr(plan, "patient_id", patient.id)
            setattr(plan, "patient_name", patient.full_name)
        if hasattr(case, 'doctor') and case.doctor:
            setattr(plan, "doctor_name", case.doctor.full_name)
    return plan


class TreatmentPlanService:
    def __init__(self, db: AsyncSession):
        self.repo = TreatmentPlanRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> TreatmentPlan:
        try:
            case_id = data.get("case_id")
            if not case_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="case_id is required")

            case_result = await self.db.execute(select(Case).where(Case.id == case_id))
            case = case_result.scalar_one_or_none()
            if not case:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Case with id {case_id} not found")

            if case.patient_id:
                patient_result = await self.db.execute(select(Patient).where(Patient.id == case.patient_id))
                patient = patient_result.scalar_one_or_none()
                if not patient:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient for case {case_id} not found")

            if "status" not in data or not data.get("status"):
                data["status"] = "PLANNED"
            total = data.get("total_sittings", 1) or 1
            data["total_sittings"] = total
            data["completed_sittings"] = 0
            data["remaining_sittings"] = total
            plan = await self.repo.create(**data)
            try:
                cnt = await self.db.execute(select(func.count(TreatmentPlan.id)))
                plan.treatment_number = f"TRT-{cnt.scalar():04d}"
                await self.db.flush()
            except Exception:
                pass
            await self.audit_log_repo.create(user_id=user_id, action="CREATE_TREATMENT_PLAN", entity_type="TREATMENT_PLAN", entity_id=str(plan.id), details=f"Treatment plan '{plan.treatment_name}' created")
            return plan
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_TREATMENT_PLAN - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create treatment plan: {str(e)}")

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[TreatmentPlan]:
        plans = await self.repo.get_all(skip=skip, limit=limit, filters=filters)
        for p in plans:
            _enrich_plan(p)
        return plans

    async def get(self, plan_id: str) -> Optional[TreatmentPlan]:
        plan = await self.repo.get(plan_id)
        if plan:
            _enrich_plan(plan)
        return plan

    async def get_by_case(self, case_id: str) -> List[TreatmentPlan]:
        plans = await self.repo.get_all(filters={"case_id": case_id})
        for p in plans:
            _enrich_plan(p)
        return plans

    async def _auto_create_appointment(self, plan: TreatmentPlan) -> Optional[Appointment]:
        if not plan.next_appointment_date:
            return None
        case = await self.db.get(Case, plan.case_id)
        if not case or not case.patient_id:
            return None
        existing = await self.db.execute(
            select(Appointment).where(
                Appointment.patient_id == case.patient_id,
                Appointment.appointment_date == plan.next_appointment_date,
                Appointment.status.in_([AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED]),
                Appointment.is_active == True,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.info("Appointment already exists for patient %s on %s, skipping", case.patient_id, plan.next_appointment_date)
            return None
        appt = Appointment(
            patient_id=case.patient_id,
            doctor_id=case.doctor_id or "",
            appointment_date=plan.next_appointment_date,
            appointment_time=time(9, 0),
            status=AppointmentStatus.SCHEDULED,
            appointment_type=AppointmentType.TREATMENT,
            notes=f"Auto-created from treatment plan '{plan.treatment_name}'",
        )
        self.db.add(appt)
        await self.db.flush()
        try:
            max_num = await self.db.execute(select(func.max(Appointment.appointment_number)))
            max_val = max_num.scalar()
            next_num = (int(max_val.split("-")[1]) + 1) if max_val else 1
            appt.appointment_number = f"APPT-{next_num:04d}"
            await self.db.flush()
        except Exception:
            pass
        logger.info("Auto-created appointment %s for patient %s on %s", appt.id, case.patient_id, plan.next_appointment_date)
        try:
            patient_obj = await self.db.get(Patient, case.patient_id)
            if patient_obj and patient_obj.phone:
                from app.utils.whatsapp import send_appointment_reminder
                await send_appointment_reminder(patient_obj.phone, patient_obj.full_name, appt.appointment_date.isoformat(), appt.appointment_time.strftime("%H:%M"))
        except Exception as e:
            logger.warning("Failed to send WhatsApp for auto-created appointment: %s", e)
        return appt

    async def update(self, plan_id: str, data: dict, user_id: str = None) -> Optional[TreatmentPlan]:
        try:
            from app.models.treatment_plan import TreatmentPlanStatus
            if "status" in data and data["status"]:
                data["status"] = TreatmentPlanStatus(data["status"])
            plan = await self.repo.update(plan_id, **data)
            if plan:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_PLAN", entity_type="TREATMENT_PLAN", entity_id=plan_id, details="Treatment plan updated")
                _enrich_plan(plan)
                if "next_appointment_date" in data:
                    await self._auto_create_appointment(plan)
            return plan
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_PLAN - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment plan: {str(e)}")

    async def update_status(self, plan_id: str, status: str, user_id: str = None) -> Optional[TreatmentPlan]:
        try:
            from app.models.treatment_plan import TreatmentPlanStatus
            plan = await self.repo.update(plan_id, status=TreatmentPlanStatus(status))
            if plan:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_STATUS", entity_type="TREATMENT_PLAN", entity_id=plan_id, details=f"Status changed to {status}")
                _enrich_plan(plan)
            return plan
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_STATUS - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment status: {str(e)}")

    async def delete(self, plan_id: str, user_id: str = None) -> bool:
        try:
            from sqlalchemy import delete as sa_delete
            from app.models.treatment_sitting import TreatmentSitting
            await self.db.execute(sa_delete(TreatmentSitting).where(TreatmentSitting.treatment_plan_id == plan_id))
            result = await self.repo.delete(plan_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_TREATMENT_PLAN", entity_type="TREATMENT_PLAN", entity_id=plan_id, details="Treatment plan deleted")
            return result
        except Exception as e:
            logger.exception("DELETE_TREATMENT_PLAN - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete treatment plan: {str(e)}")