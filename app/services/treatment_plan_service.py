import logging
from typing import Optional, List
from datetime import date, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from fastapi import HTTPException, status
from app.repositories.treatment_plan_repository import TreatmentPlanRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_type import TreatmentType
from app.models.case import Case
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital
from app.models.appointment import Appointment, AppointmentStatus

logger = logging.getLogger(__name__)


def _enrich_plan(plan: TreatmentPlan):
    try:
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
        setattr(plan, "assigned_doctor_name", plan.assigned_doctor.full_name if plan.assigned_doctor else None)
        setattr(plan, "assistant_doctor_name", plan.assistant_doctor.full_name if plan.assistant_doctor else None)

        case = plan.case
        if case:
            setattr(plan, "case_number", f"CASE-{case.id[:8].upper()}")
            setattr(plan, "case_status", case.status.value if hasattr(case.status, 'value') else str(case.status))
            patient = case.patient
            if patient:
                setattr(plan, "patient_id", patient.id)
                setattr(plan, "patient_name", patient.full_name)
                setattr(plan, "patient_op_no", getattr(patient, "op_no", None))
                setattr(plan, "patient", patient)
                try:
                    hosp = patient.hospital
                    if hosp:
                        setattr(plan, "hospital_name", hosp.name)
                except Exception:
                    pass
            if hasattr(case, 'doctor') and case.doctor:
                setattr(plan, "doctor_name", case.doctor.full_name)
    except Exception as e:
        logger.warning("Error enriching plan %s: %s", getattr(plan, 'id', '?'), e)
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
                data["status"] = "GENERATED"
            total = data.get("total_sittings", 1) or 1
            data["total_sittings"] = total
            data["completed_sittings"] = 0
            data["remaining_sittings"] = total
            plan = await self.repo.create(**data)
            # Display number derived from the plan's UUID — O(1) and unique, instead
            # of a full-table COUNT() on every create (which also reused numbers
            # after deletions and silently violated the UNIQUE constraint).
            plan.treatment_number = f"TRT-{plan.id[:8].upper()}"
            await self.db.flush()
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
                Appointment.status == AppointmentStatus.SCHEDULED,
                Appointment.is_active == True,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.info("Appointment already exists for patient %s on %s, skipping", case.patient_id, plan.next_appointment_date)
            return None
        from app.models.appointment import resolve_duration
        from datetime import datetime, timedelta
        appt_time = time(9, 0)
        duration = resolve_duration(
            procedure_name=plan.treatment_name,
            override_minutes=plan.duration_minutes,
        )
        appt = Appointment(
            patient_id=case.patient_id,
            doctor_id=case.doctor_id or "",
            appointment_date=plan.next_appointment_date,
            appointment_time=appt_time,
            duration_minutes=duration,
            end_time=(datetime.combine(date.min, appt_time) + timedelta(minutes=duration)).time(),
            status=AppointmentStatus.SCHEDULED,
            notes=f"Auto-created from treatment plan '{plan.treatment_name}'",
        )
        self.db.add(appt)
        await self.db.flush()
        # Same O(1) UUID-derived scheme as treatment_number; avoids a MAX() scan
        # and is safe against duplicate/reused numbers.
        appt.appointment_number = f"APPT-{appt.id[:8].upper()}"
        await self.db.flush()
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
                new_status = data["status"]
                if new_status in ("IN_PROGRESS", "SCHEDULED"):
                    dep_check = await self.check_dependency_met(plan_id)
                    if not dep_check["can_start"]:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=dep_check["reason"],
                        )
                data["status"] = TreatmentPlanStatus(new_status)
            plan = await self.repo.update(plan_id, **data)
            if plan:
                from datetime import datetime, timezone
                if data.get("status") == TreatmentPlanStatus.IN_PROGRESS and not plan.started_at:
                    plan.started_at = datetime.now(timezone.utc)
                elif data.get("status") == TreatmentPlanStatus.COMPLETED and not plan.completed_at:
                    plan.completed_at = datetime.now(timezone.utc)
                await self.db.flush()
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_PLAN", entity_type="TREATMENT_PLAN", entity_id=plan_id, details="Treatment plan updated")
                _enrich_plan(plan)
                if "next_appointment_date" in data:
                    await self._auto_create_appointment(plan)
            return plan
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_PLAN - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment plan: {str(e)}")

    async def _sync_billing_on_completion(self, plan: TreatmentPlan):
        """When a treatment is completed, update the linked billing's pending calculation."""
        from app.models.billing import Billing, PaymentStatus
        billing_result = await self.db.execute(
            select(Billing).where(Billing.treatment_plan_id == plan.id)
        )
        billing = billing_result.scalars().first()
        if not billing:
            return
        billing.pending_amount = max(0, billing.total_amount - billing.paid_amount - billing.discount_amount)
        if billing.pending_amount <= 0 and billing.payment_status != PaymentStatus.PAID:
            billing.payment_status = PaymentStatus.PAID
            from datetime import datetime, timezone
            billing.paid_at = datetime.now(timezone.utc)
        await self.db.flush()
        logger.info("Synced billing %s for completed treatment %s", billing.id, plan.id)

    async def suggest_next_appointment(self, plan_id: str) -> dict:
        """Suggest the next appointment date based on last sitting, doctor availability, and treatment type."""
        from datetime import date, timedelta
        from sqlalchemy import select as sa_select

        plan = await self.repo.get(plan_id)
        if not plan:
            return {"suggested_date": None, "reason": "Treatment not found"}

        case = plan.case
        if not case:
            return {"suggested_date": None, "reason": "Case not found"}

        # Get last sitting's next_appointment_date if available
        sitting_result = await self.db.execute(
            sa_select(TreatmentSitting).where(
                TreatmentSitting.treatment_plan_id == plan_id
            ).order_by(TreatmentSitting.sitting_number.desc())
        )
        last_sitting = sitting_result.scalars().first()
        if last_sitting and last_sitting.next_appointment_date:
            suggested = last_sitting.next_appointment_date
        elif plan.expected_completion_date and plan.completed_sittings and plan.total_sittings:
            remaining = plan.total_sittings - (plan.completed_sittings or 0)
            if remaining > 0:
                days_until_completion = (plan.expected_completion_date - date.today()).days
                interval = max(1, days_until_completion // remaining) if days_until_completion > 0 else 7
                suggested = date.today() + timedelta(days=interval)
            else:
                suggested = date.today() + timedelta(days=30)
        else:
            suggested = date.today() + timedelta(days=7)

        # Check doctor availability
        doctor_id = plan.assigned_doctor_id
        if doctor_id and suggested:
            from app.models.doctor_working_hours import DoctorWorkingHours
            day_name = suggested.strftime("%A").lower()
            wh_result = await self.db.execute(
                sa_select(DoctorWorkingHours).where(
                    DoctorWorkingHours.doctor_id == doctor_id,
                    DoctorWorkingHours.day_of_week == day_name,
                    DoctorWorkingHours.is_active == True,
                )
            )
            wh = wh_result.scalars().first()
            if not wh:
                # Doctor not working on this day, try next day
                for offset in range(1, 8):
                    next_day = suggested + timedelta(days=offset)
                    next_day_name = next_day.strftime("%A").lower()
                    wh_check = await self.db.execute(
                        sa_select(DoctorWorkingHours).where(
                            DoctorWorkingHours.doctor_id == doctor_id,
                            DoctorWorkingHours.day_of_week == next_day_name,
                            DoctorWorkingHours.is_active == True,
                        )
                    )
                    if wh_check.scalars().first():
                        suggested = next_day
                        break

        return {
            "suggested_date": suggested.isoformat() if suggested else None,
            "last_sitting_date": last_sitting.next_appointment_date.isoformat() if last_sitting and last_sitting.next_appointment_date else None,
            "remaining_sittings": (plan.total_sittings or 0) - (plan.completed_sittings or 0),
        }

    async def check_dependency_met(self, plan_id: str) -> dict:
        """Check if all dependencies for starting a treatment are met."""
        plan = await self.repo.get(plan_id)
        if not plan:
            return {"can_start": False, "reason": "Treatment not found"}

        if not plan.dependency_treatment_id:
            return {"can_start": True, "reason": None}

        dep_plan = await self.repo.get(plan.dependency_treatment_id)
        if not dep_plan:
            return {"can_start": True, "reason": None}

        dep_status = dep_plan.status.value if hasattr(dep_plan.status, 'value') else str(dep_plan.status)
        if dep_status == "COMPLETED":
            return {"can_start": True, "reason": None}

        return {
            "can_start": False,
            "reason": f"Dependent treatment '{dep_plan.treatment_name}' is {dep_status}. Must be completed first.",
            "dependency_status": dep_status,
            "dependency_name": dep_plan.treatment_name,
        }

    async def update_status(self, plan_id: str, status: str, user_id: str = None) -> Optional[TreatmentPlan]:
        try:
            if status in ("IN_PROGRESS", "SCHEDULED"):
                dep_check = await self.check_dependency_met(plan_id)
                if not dep_check["can_start"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=dep_check["reason"],
                    )

            plan = await self.repo.update(plan_id, status=TreatmentPlanStatus(status))
            if plan:
                from datetime import datetime, timezone
                if status == "IN_PROGRESS" and not plan.started_at:
                    plan.started_at = datetime.now(timezone.utc)
                elif status == "COMPLETED" and not plan.completed_at:
                    plan.completed_at = datetime.now(timezone.utc)
                await self.db.flush()
                if status == "COMPLETED":
                    await self._sync_billing_on_completion(plan)
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_STATUS", entity_type="TREATMENT_PLAN", entity_id=plan_id, details=f"Status changed to {status}")
                _enrich_plan(plan)
            return plan
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_STATUS - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment status: {str(e)}")

    async def get_doctor_queue(self, doctor_id: str, hospital_id: str = None) -> dict:
        from datetime import date, datetime, timezone
        from sqlalchemy import and_, case

        base_filters = [
            TreatmentPlan.assigned_doctor_id == doctor_id,
            TreatmentPlan.is_active == True,
        ]
        if hospital_id:
            base_filters.append(Case.patient_id == Patient.id)
            base_filters.append(Patient.hospital_id == hospital_id)

        today = date.today()

        # Use SQL-level categorization instead of loading all and filtering in Python
        status_category = case(
            (TreatmentPlan.status == TreatmentPlanStatus.OVERDUE, "overdue"),
            (TreatmentPlan.status == TreatmentPlanStatus.WAITING_PATIENT, "waiting_patient"),
            (TreatmentPlan.status == TreatmentPlanStatus.WAITING_LAB, "waiting_lab"),
            (TreatmentPlan.status == TreatmentPlanStatus.ON_HOLD, "on_hold"),
            (TreatmentPlan.status == TreatmentPlanStatus.IN_PROGRESS, "in_progress"),
            (TreatmentPlan.status.in_([TreatmentPlanStatus.GENERATED, TreatmentPlanStatus.ASSIGNED]), "today"),
            (and_(TreatmentPlan.status == TreatmentPlanStatus.SCHEDULED, TreatmentPlan.next_appointment_date <= today), "today"),
            (and_(TreatmentPlan.status == TreatmentPlanStatus.SCHEDULED, TreatmentPlan.next_appointment_date > today), "upcoming"),
            (and_(TreatmentPlan.status == TreatmentPlanStatus.COMPLETED, TreatmentPlan.completed_at >= datetime.combine(today, datetime.min.time())), "completed_today"),
            else_="other",
        ).label("queue_category")

        result = await self.db.execute(
            select(TreatmentPlan, status_category).where(and_(*base_filters))
        )
        rows = result.unique().all()

        today_plans = []
        upcoming_plans = []
        in_progress_plans = []
        waiting_patient_plans = []
        waiting_lab_plans = []
        on_hold_plans = []
        overdue_plans = []
        completed_today_plans = []

        for plan, category in rows:
            _enrich_plan(plan)
            if category == "overdue":
                overdue_plans.append(plan)
            elif category == "waiting_patient":
                waiting_patient_plans.append(plan)
            elif category == "waiting_lab":
                waiting_lab_plans.append(plan)
            elif category == "on_hold":
                on_hold_plans.append(plan)
            elif category == "in_progress":
                in_progress_plans.append(plan)
            elif category == "today":
                today_plans.append(plan)
            elif category == "upcoming":
                upcoming_plans.append(plan)
            elif category == "completed_today":
                completed_today_plans.append(plan)

        priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        for lst in [today_plans, in_progress_plans, waiting_patient_plans, waiting_lab_plans, overdue_plans, upcoming_plans, on_hold_plans]:
            lst.sort(key=lambda p: (priority_order.get(p.priority or "MEDIUM", 1), p.sequence_order or 0))

        stats = {
            "today": len(today_plans) + len(in_progress_plans),
            "in_progress": len(in_progress_plans),
            "waiting_patient": len(waiting_patient_plans),
            "waiting_lab": len(waiting_lab_plans),
            "overdue": len(overdue_plans),
            "completed_today": len(completed_today_plans),
        }

        return {
            "today_queue": today_plans,
            "in_progress": in_progress_plans,
            "upcoming_queue": upcoming_plans,
            "waiting_for_patient": waiting_patient_plans,
            "waiting_for_lab": waiting_lab_plans,
            "on_hold": on_hold_plans,
            "overdue": overdue_plans,
            "completed_today": completed_today_plans,
            "stats": stats,
        }

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