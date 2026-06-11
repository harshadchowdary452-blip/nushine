import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.treatment_plan_repository import TreatmentPlanRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.treatment_plan import TreatmentPlan
from app.models.case import Case
from app.models.patient import Patient

logger = logging.getLogger(__name__)


class TreatmentPlanService:
    def __init__(self, db: AsyncSession):
        self.repo = TreatmentPlanRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> TreatmentPlan:
        try:
            logger.info("CREATE_TREATMENT_PLAN - Request data: %s", data)

            case_id = data.get("case_id")
            if not case_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="case_id is required")

            case_result = await self.db.execute(select(Case).where(Case.id == case_id))
            case = case_result.scalar_one_or_none()
            if not case:
                logger.error("CREATE_TREATMENT_PLAN - Case not found: %s", case_id)
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Case with id {case_id} not found")

            if case.patient_id:
                patient_result = await self.db.execute(select(Patient).where(Patient.id == case.patient_id))
                patient = patient_result.scalar_one_or_none()
                if not patient:
                    logger.error("CREATE_TREATMENT_PLAN - Patient not found for case: %s", case_id)
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient for case {case_id} not found")

            if "status" not in data or not data.get("status"):
                data["status"] = "PLANNED"
            plan = await self.repo.create(**data)
            logger.info("CREATE_TREATMENT_PLAN - Success: %s", plan.id)
            await self.audit_log_repo.create(user_id=user_id, action="CREATE_TREATMENT_PLAN", entity_type="TREATMENT_PLAN", entity_id=str(plan.id), details=f"Treatment plan '{plan.treatment_name}' created")
            return plan
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_TREATMENT_PLAN - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create treatment plan: {str(e)}")

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[TreatmentPlan]:
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters)

    async def get(self, plan_id: str) -> Optional[TreatmentPlan]:
        return await self.repo.get(plan_id)

    async def get_by_case(self, case_id: str) -> List[TreatmentPlan]:
        return await self.repo.get_all(filters={"case_id": case_id})

    async def update(self, plan_id: str, data: dict, user_id: str = None) -> Optional[TreatmentPlan]:
        try:
            from app.models.treatment_plan import TreatmentPlanStatus
            if "status" in data and data["status"]:
                data["status"] = TreatmentPlanStatus(data["status"])
            plan = await self.repo.update(plan_id, **data)
            if plan:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_PLAN", entity_type="TREATMENT_PLAN", entity_id=plan_id, details="Treatment plan updated")
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
                if status == TreatmentPlanStatus.COMPLETED.value:
                    from app.services.case_service import CaseService
                    from app.models.case import CaseStatus
                    case_svc = CaseService(self.db)
                    all_treatments = await self.repo.get_all(filters={"case_id": plan.case_id})
                    all_done = all(t.status == TreatmentPlanStatus.COMPLETED for t in all_treatments)
                    if all_done:
                        await case_svc.update(plan.case_id, {"status": CaseStatus.IN_PROGRESS.value}, user_id=user_id)
            return plan
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_STATUS - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment status: {str(e)}")

    async def delete(self, plan_id: str, user_id: str = None) -> bool:
        try:
            result = await self.repo.delete(plan_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_TREATMENT_PLAN", entity_type="TREATMENT_PLAN", entity_id=plan_id, details="Treatment plan deleted")
            return result
        except Exception as e:
            logger.exception("DELETE_TREATMENT_PLAN - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete treatment plan: {str(e)}")
