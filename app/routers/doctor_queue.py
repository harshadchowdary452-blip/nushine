import logging
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.treatment_plan_service import TreatmentPlanService

router = APIRouter(prefix="/doctor-queue", tags=["Doctor Queue"])
logger = logging.getLogger(__name__)


@router.get("/{doctor_id}")
async def get_doctor_queue(
    doctor_id: str,
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_TREATMENT_QUEUE, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    return await service.get_doctor_queue(doctor_id, hospital_id=hospital_id)
