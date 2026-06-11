import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.treatment_sitting_repository import TreatmentSittingRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.treatment_sitting import TreatmentSitting
from app.models.treatment_plan import TreatmentPlan

logger = logging.getLogger(__name__)


class TreatmentSittingService:
    def __init__(self, db: AsyncSession):
        self.repo = TreatmentSittingRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

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
            sitting = await self.repo.update(sitting_id, **data)
            if sitting:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TREATMENT_SITTING", entity_type="TREATMENT_SITTING", entity_id=sitting_id, details="Treatment sitting updated")
            return sitting
        except Exception as e:
            logger.exception("UPDATE_TREATMENT_SITTING - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update treatment sitting: {str(e)}")
