import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.treatment_plan_service import TreatmentPlanService
from app.schemas.treatment_plan import TreatmentPlanCreate, TreatmentPlanUpdate, TreatmentPlanResponse
from app.schemas.common import MessageResponse
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital

router = APIRouter(prefix="/treatment-plans", tags=["Treatment Plans"])
logger = logging.getLogger(__name__)


@router.post("/", response_model=TreatmentPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_treatment_plan(data: TreatmentPlanCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    return await service.create(data.model_dump(), user_id=current_user.get("sub"))


@router.get("/", response_model=List[TreatmentPlanResponse])
async def get_treatment_plans(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
                               case_id: Optional[str] = Query(None),
                               hospital_id: Optional[str] = Query(None),
                               db: AsyncSession = Depends(get_db),
                               current_user: dict = Depends(get_current_user)):
    try:
        verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
        service = TreatmentPlanService(db)
        filters = {}
        if case_id:
            filters["case_id"] = case_id
        role = current_user.get("role")
        if role == Role.DOCTOR.value:
            if hospital_id:
                filters["hospital_id"] = hospital_id
            else:
                case_result = await db.execute(select(Case.id).where(Case.doctor_id == current_user.get("sub")))
                cids = [row[0] for row in case_result.all()]
                if not cids:
                    return []
                filters["case_id__in"] = cids
        elif role == Role.HOSPITAL_ADMIN.value:
            hid = hospital_id or current_user.get("hospital_id")
            if hid:
                filters["hospital_id"] = hid
        elif role == Role.GROUP_ADMIN.value:
            agid = current_user.get("admin_group_id")
            if agid:
                hosp_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
                hids = [row[0] for row in hosp_result.all()]
                if not hids:
                    return []
                patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))
                pids = [row[0] for row in patient_result.all()]
                if not pids:
                    return []
                case_result = await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))
                cids = [row[0] for row in case_result.all()]
                if not cids:
                    return []
                filters["case_id__in"] = cids
        elif role == Role.SUPER_ADMIN.value and hospital_id:
            filters["hospital_id"] = hospital_id
        return await service.get_all(skip=skip, limit=limit, filters=filters or None)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("GET_TREATMENT_PLANS error: %s", str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to load treatment plans: {str(e)}")


@router.get("/by-case/{case_id}", response_model=List[TreatmentPlanResponse])
async def get_plans_by_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    service = TreatmentPlanService(db)
    return await service.get_by_case(case_id)


@router.get("/{plan_id}", response_model=TreatmentPlanResponse)
async def get_treatment_plan(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    service = TreatmentPlanService(db)
    plan = await service.get(plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    return plan


@router.put("/{plan_id}", response_model=TreatmentPlanResponse)
async def update_treatment_plan(plan_id: str, data: TreatmentPlanUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    plan = await service.update(plan_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    return plan


@router.delete("/{plan_id}", response_model=MessageResponse)
async def delete_treatment_plan(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    deleted = await service.delete(plan_id, user_id=current_user.get("sub"))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    return MessageResponse(message="Treatment plan deleted successfully")
