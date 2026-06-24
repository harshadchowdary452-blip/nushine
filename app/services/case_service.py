import logging
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete
from fastapi import HTTPException, status
from app.repositories.case_repository import CaseRepository
from app.repositories.case_timeline_repository import CaseTimelineRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.case import Case, CaseStatus, ClinicalFinding
from app.models.case_timeline import CaseTimeline
from app.models.patient import Patient
from app.models.user import User
from app.models.appointment import Appointment, AppointmentStatus
from app.models.billing import Billing
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_sitting import TreatmentSitting
from app.models.pre_op import PreOp
from app.models.post_op import PostOp
from app.models.consultant_note import ConsultantNote

logger = logging.getLogger(__name__)


class CaseService:
    def __init__(self, db: AsyncSession):
        self.repo = CaseRepository(db)
        self.timeline_repo = CaseTimelineRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _add_timeline(self, case_id: str, action: str, field_name: str = None, old_value: str = None, new_value: str = None, user_id: str = None):
        await self.timeline_repo.create_entry(
            case_id=case_id, action=action,
            field_name=field_name, old_value=old_value,
            new_value=new_value, performed_by=user_id,
        )

    async def create(self, data: dict, user_id: str = None) -> Case:
        try:
            patient_id = data.get("patient_id")
            if not patient_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id is required")

            patient_result = await self.db.execute(select(Patient).where(Patient.id == patient_id))
            patient = patient_result.scalar_one_or_none()
            if not patient:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient with id {patient_id} not found")

            doctor_id = data.get("doctor_id")
            if doctor_id:
                doctor_result = await self.db.execute(select(User).where(User.id == doctor_id))
                doctor = doctor_result.scalar_one_or_none()
                if not doctor:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Doctor with id {doctor_id} not found")
                # Patient-hospital and doctor-admin-group validation handled in router tenant isolation
            if not doctor_id and user_id:
                data["doctor_id"] = user_id

            appointment_id = data.get("appointment_id")
            if appointment_id:
                appt_result = await self.db.execute(select(Appointment).where(Appointment.id == appointment_id))
                appointment = appt_result.scalar_one_or_none()
                if not appointment:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
                if appointment.status != AppointmentStatus.COMPLETED:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cases can only be created from COMPLETED appointments")

            if "status" not in data or not data.get("status"):
                data["status"] = CaseStatus.OPEN

            findings_data = data.pop("findings", None)

            case = await self.repo.create(**data)
            case.case_number = f"CASE-{case.id[:8].upper()}"

            if findings_data:
                for f in findings_data:
                    finding = ClinicalFinding(case_id=case.id, **f)
                    self.db.add(finding)
                await self.db.flush()

            await self._add_timeline(case.id, "Case Created", user_id=user_id)
            if findings_data:
                for f in findings_data:
                    detail = f"{f['finding_type']}" + (f" - Tooth {f['tooth_number']}" if f.get('tooth_number') else "")
                    await self._add_timeline(case.id, "Clinical Finding Added", new_value=detail, user_id=user_id)

            await self.audit_log_repo.create(user_id=user_id, action="CREATE_CASE", entity_type="CASE", entity_id=str(case.id), details="Case created")
            return case
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_CASE - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create case: {str(e)}")

    async def _attach_names(self, case: Case):
        if case.patient:
            case.patient_name = case.patient.full_name
        elif case.patient_id:
            p_result = await self.db.execute(select(Patient).where(Patient.id == case.patient_id))
            p = p_result.scalar_one_or_none()
            case.patient_name = p.full_name if p else None
        if case.doctor:
            case.doctor_name = case.doctor.full_name
        elif case.doctor_id:
            d_result = await self.db.execute(select(User).where(User.id == case.doctor_id))
            d = d_result.scalar_one_or_none()
            case.doctor_name = d.full_name if d else None
        return case

    async def get(self, case_id: str) -> Optional[Case]:
        case = await self.repo.get(case_id)
        if case:
            await self._attach_names(case)
        return case

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Case]:
        cases = await self.repo.get_all(skip=skip, limit=limit, filters=filters)
        for c in cases:
            await self._attach_names(c)
        return cases

    async def update(self, case_id: str, data: dict, user_id: str = None) -> Optional[Case]:
        try:
            old_case = await self.repo.get(case_id)
            if not old_case:
                return None

            if "status" in data and data["status"] is not None:
                new_status = CaseStatus(data["status"])
                if old_case.status != new_status:
                    await self._add_timeline(case_id, "Case Status Changed",
                        old_value=old_case.status.value, new_value=new_status.value, user_id=user_id)
                data["status"] = new_status

            if "doctor_id" in data and data["doctor_id"] is not None and old_case.doctor_id != data["doctor_id"]:
                old_doctor_name = old_case.doctor_name or old_case.doctor_id or "None"
                await self._add_timeline(case_id, "Assigned Doctor Changed",
                    old_value=old_doctor_name, new_value=data["doctor_id"], user_id=user_id)

            tracked_fields = {
                "chief_complaint": "Chief Complaint Updated",
                "diagnosis": "Diagnosis Updated",
                "initial_treatment_plan": "Treatment Plan Updated",
                "notes": "Notes Updated",
            }
            for field, action in tracked_fields.items():
                if field in data and data[field] is not None:
                    old_val = getattr(old_case, field, None)
                    if old_val != data[field]:
                        await self._add_timeline(case_id, action,
                            field_name=field, old_value=str(old_val) if old_val else None,
                            new_value=data[field], user_id=user_id)

            findings_data = data.pop("findings", None)
            if findings_data is not None:
                old_findings = old_case.findings or []
                old_finding_strs = {(f.finding_type, f.tooth_number or "") for f in old_findings}
                new_finding_strs = {(f["finding_type"], f.get("tooth_number") or "") for f in findings_data}

                removed = old_finding_strs - new_finding_strs
                added = new_finding_strs - old_finding_strs

                for ft, tn in removed:
                    detail = f"{ft}" + (f" - Tooth {tn}" if tn else "")
                    await self._add_timeline(case_id, "Clinical Finding Removed", old_value=detail, user_id=user_id)
                for ft, tn in added:
                    detail = f"{ft}" + (f" - Tooth {tn}" if tn else "")
                    await self._add_timeline(case_id, "Clinical Finding Added", new_value=detail, user_id=user_id)

                await self.db.execute(sa_delete(ClinicalFinding).where(ClinicalFinding.case_id == case_id))
                for f in findings_data:
                    finding = ClinicalFinding(case_id=case_id, **f)
                    self.db.add(finding)
                await self.db.flush()

            case = await self.repo.update(case_id, **data)
            if case:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_CASE", entity_type="CASE", entity_id=case_id, details="Case updated")
            return case
        except Exception as e:
            logger.exception("UPDATE_CASE - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update case: {str(e)}")

    async def assign_consultant(self, case_id: str, consultant_id: str, user_id: str = None) -> Optional[Case]:
        try:
            case = await self.repo.update(case_id, consultant_id=consultant_id)
            if case:
                await self._add_timeline(case_id, "Consultant Assigned", user_id=user_id)
                await self.audit_log_repo.create(user_id=user_id, action="ASSIGN_CONSULTANT", entity_type="CASE", entity_id=case_id, details="Consultant assigned")
            return case
        except Exception as e:
            logger.exception("ASSIGN_CONSULTANT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to assign consultant: {str(e)}")

    async def complete(self, case_id: str, user_id: str = None) -> Optional[Case]:
        try:
            from app.models.post_op import PostOp
            post_op_result = await self.db.execute(select(PostOp).where(PostOp.case_id == case_id))
            post_ops = post_op_result.scalars().all()
            if not post_ops:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Case cannot be completed without a Post-Op image. Please upload Post-Op images first.")
            case = await self.repo.update(case_id, status=CaseStatus.COMPLETED, completion_date=datetime.now(timezone.utc))
            if case:
                await self._add_timeline(case_id, "Case Closed", new_value="COMPLETED", user_id=user_id)
                await self.audit_log_repo.create(user_id=user_id, action="COMPLETE_CASE", entity_type="CASE", entity_id=case_id, details="Case completed")
                from app.services.patient_service import PatientService
                patient_svc = PatientService(self.db)
                await patient_svc.auto_update_patient_status(case.patient_id, user_id=user_id)
            return case
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("COMPLETE_CASE - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to complete case: {str(e)}")

    async def get_timeline(self, case_id: str, skip: int = 0, limit: int = 100) -> List[CaseTimeline]:
        entries = await self.timeline_repo.get_by_case(case_id, skip=skip, limit=limit)
        for e in entries:
            if e.performer:
                e.performer_name = e.performer.full_name
        return entries

    async def delete(self, case_id: str, user_id: str = None) -> bool:
        try:
            await self.db.execute(sa_delete(ClinicalFinding).where(ClinicalFinding.case_id == case_id))
            await self.db.execute(sa_delete(CaseTimeline).where(CaseTimeline.case_id == case_id))
            await self.db.execute(sa_delete(PreOp).where(PreOp.case_id == case_id))
            await self.db.execute(sa_delete(PostOp).where(PostOp.case_id == case_id))
            await self.db.execute(sa_delete(ConsultantNote).where(ConsultantNote.case_id == case_id))
            tps = (await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.case_id == case_id))).scalars().all()
            for tp in tps:
                await self.db.execute(sa_delete(TreatmentSitting).where(TreatmentSitting.treatment_plan_id == tp.id))
            await self.db.execute(sa_delete(TreatmentPlan).where(TreatmentPlan.case_id == case_id))
            await self.db.execute(sa_delete(Billing).where(Billing.case_id == case_id))
            result = await self.repo.delete(case_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_CASE", entity_type="CASE", entity_id=case_id, details="Case deleted")
            return result
        except Exception as e:
            logger.exception("DELETE_CASE - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete case: {str(e)}")
