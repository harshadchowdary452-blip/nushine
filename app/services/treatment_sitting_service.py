import logging
from typing import Optional, List
from datetime import date, time, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from fastapi import HTTPException, status
from app.repositories.treatment_sitting_repository import TreatmentSittingRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.case import Case
from app.models.patient import Patient
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.utils.whatsapp import send_appointment_reminder
from app.services.timeline_helper import record_timeline_event

logger = logging.getLogger(__name__)


class TreatmentSittingService:
    def __init__(self, db: AsyncSession):
        self.repo = TreatmentSittingRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _get_patient_id_from_plan(self, plan) -> Optional[str]:
        if not plan or not plan.case_id:
            return None
        case = await self.db.get(Case, plan.case_id)
        return str(case.patient_id) if case and case.patient_id else None

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
        appt_date = sitting.next_appointment_date
        appt_time = sitting.next_appointment_time or time(9, 0)
        existing = await self.db.execute(
            select(Appointment).where(
                Appointment.patient_id == case.patient_id,
                Appointment.appointment_date == appt_date,
                Appointment.appointment_time == appt_time,
                Appointment.status == AppointmentStatus.SCHEDULED,
                Appointment.is_active == True,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.info("Appointment already exists for patient %s on %s at %s, skipping", case.patient_id, appt_date, appt_time)
            return None
        from app.models.appointment import resolve_duration
        duration = resolve_duration(
            procedure_name=sitting.procedure_performed,
            appointment_type="TREATMENT",
            override_minutes=sitting.duration_minutes,
        )
        end_time = (datetime.combine(date.min, appt_time) + timedelta(minutes=duration)).time()
        doctor_id = sitting.next_appointment_doctor_id or case.doctor_id or ""
        appt = Appointment(
            patient_id=case.patient_id,
            doctor_id=doctor_id,
            appointment_date=appt_date,
            appointment_time=appt_time,
            duration_minutes=duration,
            end_time=end_time,
            status=AppointmentStatus.SCHEDULED,
            appointment_type=AppointmentType.TREATMENT,
            notes=f"Auto-created from treatment sitting #{sitting.sitting_number}",
        )
        self.db.add(appt)
        await self.db.flush()
        # O(1) UUID-derived display number — no full-table MAX() scan.
        appt.appointment_number = f"APPT-{appt.id[:8].upper()}"
        await self.db.flush()
        logger.info("Auto-created appointment %s for patient %s on %s", appt.id, case.patient_id, sitting.next_appointment_date)
        try:
            patient_obj = await self.db.get(Patient, case.patient_id)
            if patient_obj and patient_obj.phone:
                await send_appointment_reminder(patient_obj.phone, patient_obj.full_name, appt.appointment_date.isoformat(), appt.appointment_time.strftime("%H:%M"))
        except Exception as e:
            logger.warning("Failed to send WhatsApp for auto-created appointment: %s", e)
        try:
            from app.crm.services.event_dispatcher import publish_event
            from app.crm.enums import EventType, EventSource
            await publish_event(
                event_type=EventType.APPOINTMENT_CREATED,
                source_module=EventSource.APPOINTMENT,
                entity_type="APPOINTMENT",
                entity_id=str(appt.id),
                hospital_id=str(case.hospital_id) if getattr(case, 'hospital_id', None) else None,
                patient_id=str(case.patient_id),
                doctor_id=str(doctor_id) if doctor_id else None,
                payload={
                    "appointment_id": str(appt.id),
                    "patient_id": str(case.patient_id),
                    "treatment_plan_id": str(sitting.treatment_plan_id) if sitting.treatment_plan_id else None,
                    "doctor_id": str(doctor_id) if doctor_id else None,
                    "appointment_date": appt.appointment_date.isoformat(),
                    "status": "SCHEDULED",
                },
                db=self.db,
            )
        except Exception as e:
            logger.warning("Failed to fire APPOINTMENT_CREATED for auto-created appointment: %s", e)
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
            await self._recalculate_plan_sitting_counts(treatment_plan_id, user_id=user_id)
            if sitting.status == TreatmentSittingStatus.COMPLETED.value:
                from app.crm.services.event_dispatcher import publish_event
                plan = await self.db.get(TreatmentPlan, treatment_plan_id)
                patient_id = await self._get_patient_id_from_plan(plan)
                if plan and plan.remaining_sittings <= 0:
                    await publish_event(
                        event_type="TREATMENT_COMPLETED",
                        source_module="TREATMENT_SITTING_SERVICE",
                        entity_type="TREATMENT",
                        entity_id=treatment_plan_id,
                        patient_id=patient_id,
                        payload={
                            "patient_id": patient_id,
                            "treatment_plan_id": treatment_plan_id,
                            "case_id": str(plan.case_id) if plan.case_id else None,
                            "treatment_type_id": str(plan.treatment_type_id) if plan.treatment_type_id else None,
                            "treatment_name": plan.treatment_name,
                            "doctor_id": str(plan.assigned_doctor_id) if plan.assigned_doctor_id else None,
                            "visit_date": sitting.sitting_date.isoformat() if sitting.sitting_date else date.today().isoformat(),
                        },
                        db=self.db,
                    )
                else:
                    await publish_event(
                        event_type="TREATMENT_VISIT_COMPLETED",
                        source_module="TREATMENT_SITTING_SERVICE",
                        entity_type="TREATMENT",
                        entity_id=treatment_plan_id,
                        patient_id=patient_id,
                        payload={
                            "patient_id": patient_id,
                            "treatment_plan_id": treatment_plan_id,
                            "case_id": str(plan.case_id) if plan.case_id else None,
                            "treatment_type_id": str(plan.treatment_type_id) if plan.treatment_type_id else None,
                            "treatment_name": plan.treatment_name,
                            "doctor_id": str(plan.assigned_doctor_id) if plan.assigned_doctor_id else None,
                            "sitting_number": sitting.sitting_number,
                            "visit_date": sitting.sitting_date.isoformat() if sitting.sitting_date else date.today().isoformat(),
                        },
                        db=self.db,
                    )
            logger.info("CREATE_TREATMENT_SITTING - Success: %s", sitting.id)
            if sitting.status == TreatmentSittingStatus.COMPLETED.value:
                try:
                    from app.services.treatment_enquiry_service import TreatmentEnquiryService
                    service = TreatmentEnquiryService(self.db)
                    await service.on_sitting_completed(treatment_plan_id, sitting.sitting_number)
                except Exception as e:
                    logger.warning("Failed to record sitting completion timeline: %s", e)
            await self.audit_log_repo.create(user_id=user_id, action="CREATE_TREATMENT_SITTING", entity_type="TREATMENT_SITTING", entity_id=str(sitting.id), details=f"Sitting #{sitting.sitting_number} created")
            return sitting
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_TREATMENT_SITTING - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create treatment sitting: {str(e)}")

    async def _recalculate_plan_sitting_counts(self, plan_id: str, user_id: str = None) -> bool:
        completed = await self.db.execute(
            select(func.count(TreatmentSitting.id)).where(
                TreatmentSitting.treatment_plan_id == plan_id,
                TreatmentSitting.status == TreatmentSittingStatus.COMPLETED.value,
            )
        )
        actual_completed = completed.scalar() or 0
        plan = await self.db.get(TreatmentPlan, plan_id)
        auto_completed = False
        if plan:
            plan.completed_sittings = actual_completed
            plan.remaining_sittings = max(0, plan.total_sittings - actual_completed)
            if plan.remaining_sittings <= 0 and plan.total_sittings > 0 and plan.status != TreatmentPlanStatus.COMPLETED:
                plan.status = TreatmentPlanStatus.COMPLETED
                from datetime import datetime, timezone
                plan.completed_at = datetime.now(timezone.utc)
                auto_completed = True
            elif plan.status == TreatmentPlanStatus.COMPLETED and plan.remaining_sittings > 0:
                plan.status = TreatmentPlanStatus.IN_PROGRESS
            await self.db.flush()
        if auto_completed and plan:
            try:
                case = await self.db.get(Case, plan.case_id)
                patient_id = case.patient_id if case else None
                if patient_id:
                    await record_timeline_event(
                        db=self.db, patient_id=patient_id, user_id=user_id,
                        action="Treatment Completed",
                        description=f"Treatment '{plan.treatment_name}' completed (all visits done)",
                        module="Treatments",
                    )
            except Exception as e:
                logger.warning("Failed to record auto-completion timeline: %s", e)
            try:
                from app.services.status_automation import StatusAutomationService
                automation = StatusAutomationService(self.db)
                await automation._check_case_completion(plan.case_id)
            except Exception as e:
                logger.warning("Failed to auto-update case status after treatment completion: %s", e)
            try:
                from app.services.treatment_enquiry_service import TreatmentEnquiryService
                service = TreatmentEnquiryService(self.db)
                await service.on_treatment_plan_completed(plan.id)
            except Exception as e:
                logger.warning("Failed to create CRM recalls after treatment completion: %s", e)
        return auto_completed

    async def get(self, sitting_id: str) -> Optional[TreatmentSitting]:
        return await self.repo.get(sitting_id)

    async def get_by_plan(self, treatment_plan_id: str) -> List[TreatmentSitting]:
        return await self.repo.get_all(filters={"treatment_plan_id": treatment_plan_id})

    async def update(self, sitting_id: str, data: dict, user_id: str = None) -> Optional[TreatmentSitting]:
        try:
            old = await self.repo.get(sitting_id)
            was_completed = old and old.status == TreatmentSittingStatus.COMPLETED.value
            sitting = await self.repo.update(sitting_id, **data)
            if sitting:
                if data.get("next_appointment_date") is not None:
                    await self._auto_create_appointment_from_sitting(sitting)
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_SITTING", entity_type="TREATMENT_SITTING", entity_id=sitting_id, details="Treatment sitting updated")
                await self._recalculate_plan_sitting_counts(sitting.treatment_plan_id, user_id=user_id)
                now_completed = sitting.status == TreatmentSittingStatus.COMPLETED.value
                plan = await self.db.get(TreatmentPlan, sitting.treatment_plan_id)
                patient_id = await self._get_patient_id_from_plan(plan)
                if now_completed and not was_completed:
                    from app.crm.services.event_dispatcher import publish_event
                    if plan and plan.remaining_sittings <= 0:
                        await publish_event(
                            event_type="TREATMENT_COMPLETED",
                            source_module="TREATMENT_SITTING_SERVICE",
                            entity_type="TREATMENT",
                            entity_id=sitting.treatment_plan_id,
                            patient_id=patient_id,
                            payload={
                                "patient_id": patient_id,
                                "treatment_plan_id": sitting.treatment_plan_id,
                                "case_id": str(plan.case_id) if plan.case_id else None,
                                "treatment_type_id": str(plan.treatment_type_id) if plan.treatment_type_id else None,
                                "treatment_name": plan.treatment_name,
                                "doctor_id": str(plan.assigned_doctor_id) if plan.assigned_doctor_id else None,
                                "visit_date": sitting.sitting_date.isoformat() if sitting.sitting_date else date.today().isoformat(),
                            },
                            db=self.db,
                        )
                    else:
                        await publish_event(
                            event_type="TREATMENT_VISIT_COMPLETED",
                            source_module="TREATMENT_SITTING_SERVICE",
                            entity_type="TREATMENT",
                            entity_id=sitting.treatment_plan_id,
                            patient_id=patient_id,
                            payload={
                                "patient_id": patient_id,
                                "treatment_plan_id": sitting.treatment_plan_id,
                                "case_id": str(plan.case_id) if plan.case_id else None,
                                "treatment_type_id": str(plan.treatment_type_id) if plan.treatment_type_id else None,
                                "treatment_name": plan.treatment_name,
                                "doctor_id": str(plan.assigned_doctor_id) if plan.assigned_doctor_id else None,
                                "sitting_number": sitting.sitting_number,
                                "visit_date": sitting.sitting_date.isoformat() if sitting.sitting_date else date.today().isoformat(),
                            },
                            db=self.db,
                        )
            return sitting
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_SITTING - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment sitting: {str(e)}")

    async def delete(self, sitting_id: str, user_id: str = None) -> bool:
        try:
            sitting = await self.repo.get(sitting_id)
            plan_id = sitting.treatment_plan_id if sitting else None
            result = await self.repo.delete(sitting_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_TREATMENT_SITTING", entity_type="TREATMENT_SITTING", entity_id=sitting_id, details="Treatment sitting deleted")
                if plan_id:
                    await self._recalculate_plan_sitting_counts(plan_id, user_id=user_id)
            return result
        except Exception as e:
            logger.exception("DELETE_TREATMENT_SITTING - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete treatment sitting: {str(e)}")
