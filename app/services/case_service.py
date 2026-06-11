import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.case_repository import CaseRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.case import Case, CaseStatus
from app.models.patient import Patient
from app.models.user import User

logger = logging.getLogger(__name__)


class CaseService:
    def __init__(self, db: AsyncSession):
        self.repo = CaseRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Case:
        try:
            logger.info("CREATE_CASE - Request data: %s", data)

            patient_id = data.get("patient_id")
            if not patient_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="patient_id is required")

            patient_result = await self.db.execute(select(Patient).where(Patient.id == patient_id))
            patient = patient_result.scalar_one_or_none()
            if not patient:
                logger.error("CREATE_CASE - Patient not found: %s", patient_id)
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient with id {patient_id} not found")

            doctor_id = data.get("doctor_id")
            if doctor_id:
                doctor_result = await self.db.execute(select(User).where(User.id == doctor_id))
                doctor = doctor_result.scalar_one_or_none()
                if not doctor:
                    logger.error("CREATE_CASE - Doctor not found: %s", doctor_id)
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Doctor with id {doctor_id} not found")
                if doctor.hospital_id and patient.hospital_id and doctor.hospital_id != patient.hospital_id:
                    logger.error("CREATE_CASE - Doctor %s and Patient %s belong to different hospitals", doctor_id, patient_id)
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Doctor and Patient must belong to the same hospital")
            if not doctor_id and user_id:
                data["doctor_id"] = user_id

            if "status" not in data or not data.get("status"):
                data["status"] = CaseStatus.NEW

            case = await self.repo.create(**data)
            logger.info("CREATE_CASE - Success: %s", case.id)
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
            if "status" in data:
                data["status"] = CaseStatus(data["status"])
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
                await self.audit_log_repo.create(user_id=user_id, action="ASSIGN_CONSULTANT", entity_type="CASE", entity_id=case_id, details="Consultant assigned")
            return case
        except Exception as e:
            logger.exception("ASSIGN_CONSULTANT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to assign consultant: {str(e)}")

    async def complete(self, case_id: str, user_id: str = None) -> Optional[Case]:
        try:
            from app.models.post_op import PostOp
            from datetime import datetime, timezone
            post_op_result = await self.db.execute(select(PostOp).where(PostOp.case_id == case_id))
            post_ops = post_op_result.scalars().all()
            if not post_ops:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Case cannot be completed without a Post-Op image. Please upload Post-Op images first.")
            case = await self.repo.update(case_id, status=CaseStatus.COMPLETED, completion_date=datetime.now(timezone.utc))
            if case:
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
