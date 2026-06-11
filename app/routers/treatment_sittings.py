from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.treatment_sitting_service import TreatmentSittingService
from app.schemas.treatment_sitting import TreatmentSittingCreate, TreatmentSittingUpdate, TreatmentSittingResponse
from app.models.treatment_plan import TreatmentPlan
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital

router = APIRouter(prefix="/treatment-sittings", tags=["Treatment Sittings"])


async def _verify_plan_accessible(db: AsyncSession, plan_id: str, current_user: dict):
    plan_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.id == plan_id))
    plan = plan_result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    case_result = await db.execute(select(Case).where(Case.id == plan.case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    patient_result = await db.execute(select(Patient).where(Patient.id == case.patient_id))
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    role = current_user.get("role")
    uid = current_user.get("sub")
    if role == Role.DOCTOR.value and case.doctor_id != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if role == Role.HOSPITAL_ADMIN.value and patient.hospital_id != current_user.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if role == Role.GROUP_ADMIN.value:
        hosp_result = await db.execute(select(Hospital).where(Hospital.id == patient.hospital_id))
        hosp = hosp_result.scalar_one_or_none()
        if not hosp or str(hosp.admin_group_id) != current_user.get("admin_group_id"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


@router.post("/", response_model=TreatmentSittingResponse, status_code=status.HTTP_201_CREATED)
async def create_sitting(data: TreatmentSittingCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    await _verify_plan_accessible(db, data.treatment_plan_id, current_user)
    service = TreatmentSittingService(db)
    return await service.create(data.model_dump(), user_id=current_user.get("sub"))


@router.get("/by-plan/{plan_id}", response_model=List[TreatmentSittingResponse])
async def get_sittings_by_plan(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    await _verify_plan_accessible(db, plan_id, current_user)
    service = TreatmentSittingService(db)
    return await service.get_by_plan(plan_id)


@router.get("/{sitting_id}", response_model=TreatmentSittingResponse)
async def get_sitting(sitting_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    service = TreatmentSittingService(db)
    sitting = await service.get(sitting_id)
    if not sitting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment sitting not found")
    return sitting


@router.put("/{sitting_id}", response_model=TreatmentSittingResponse)
async def update_sitting(sitting_id: str, data: TreatmentSittingUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentSittingService(db)
    sitting = await service.update(sitting_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not sitting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment sitting not found")
    return sitting
