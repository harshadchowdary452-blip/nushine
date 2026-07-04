import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.treatment_plan_service import TreatmentPlanService
from app.services.status_automation import StatusAutomationService
from app.services.treatment_enquiry_service import TreatmentEnquiryService
from app.schemas.treatment_plan import TreatmentPlanCreate, TreatmentPlanUpdate, TreatmentPlanResponse
from app.schemas.common import MessageResponse
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.services.timeline_helper import record_timeline_event, build_changes

router = APIRouter(prefix="/treatment-plans", tags=["Treatment Plans"])
logger = logging.getLogger(__name__)


async def _get_patient_id_from_plan(db: AsyncSession, plan_id: str) -> str:
    plan_result = await db.execute(select(Case.patient_id).join(TreatmentPlan, TreatmentPlan.case_id == Case.id).where(TreatmentPlan.id == plan_id))
    row = plan_result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Associated case/patient not found")
    return row[0]


@router.post("/", response_model=TreatmentPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_treatment_plan(data: TreatmentPlanCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    plan_data = data.model_dump()
    plan = await service.create(plan_data, user_id=current_user.get("sub"))
    svc = StatusAutomationService(db)
    await svc.on_treatment_plan_created(plan.id)
    await db.commit()
    patient_id = await _get_patient_id_from_plan(db, plan.id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Plan Created",
        description=f"Treatment plan created with status {plan.status}",
        module="Treatments",
    )
    return plan


@router.get("/", response_model=List[TreatmentPlanResponse])
async def get_treatment_plans(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
                               case_id: Optional[str] = Query(None),
                               patient_id: Optional[str] = Query(None),
                               hospital_id: Optional[str] = Query(None),
                               db: AsyncSession = Depends(get_db),
                               current_user: dict = Depends(get_current_user)):
    try:
        verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
        service = TreatmentPlanService(db)
        filters = {}
        if case_id:
            filters["case_id"] = case_id

        if patient_id:
            case_result = await db.execute(select(Case.id).where(Case.patient_id == patient_id))
            pids = [row[0] for row in case_result.all()]
            if not pids:
                return []
            if "case_id__in" in filters:
                existing = set(filters["case_id__in"])
                filters["case_id__in"] = list(existing & set(pids))
                if not filters["case_id__in"]:
                    return []
            else:
                filters["case_id__in"] = pids

        role = current_user.get("role")
        role_case_ids = None
        if role == Role.DOCTOR.value:
            if hospital_id:
                filters["hospital_id"] = hospital_id
            else:
                case_result = await db.execute(select(Case.id).where(Case.doctor_id == current_user.get("sub")))
                role_case_ids = [row[0] for row in case_result.all()]
        elif role == Role.HOSPITAL_ADMIN.value:
            hid = hospital_id or current_user.get("hospital_id")
            if hid:
                filters["hospital_id"] = hid
        elif role == Role.GROUP_ADMIN.value:
            agid = current_user.get("admin_group_id")
            if agid:
                hosp_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
                hids = [row[0] for row in hosp_result.all()]
                if hids:
                    patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))
                    pids = [row[0] for row in patient_result.all()]
                    if pids:
                        case_result = await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))
                        role_case_ids = [row[0] for row in case_result.all()]
        elif role == Role.SUPER_ADMIN.value and hospital_id:
            filters["hospital_id"] = hospital_id

        if role_case_ids is not None:
            if "case_id__in" in filters:
                existing = set(filters["case_id__in"])
                merged = list(existing & set(role_case_ids))
                if not merged:
                    return []
                filters["case_id__in"] = merged
            else:
                if not role_case_ids:
                    return []
                filters["case_id__in"] = role_case_ids
        return await service.get_all(skip=skip, limit=limit, filters=filters or None)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("GET_TREATMENT_PLANS error: %s", str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to load treatment plans: {str(e)}")


@router.get("/by-case/{case_id}", response_model=List[TreatmentPlanResponse])
async def get_plans_by_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    from app.models.case import Case
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    service = TreatmentPlanService(db)
    return await service.get_by_case(case_id)


@router.get("/{plan_id}", response_model=TreatmentPlanResponse)
async def get_treatment_plan(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    service = TreatmentPlanService(db)
    plan = await service.get(plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    await verify_tenant_access(current_user, plan, "treatment_plan", db)
    return plan


@router.put("/{plan_id}", response_model=TreatmentPlanResponse)
async def update_treatment_plan(plan_id: str, data: TreatmentPlanUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    plan = await service.get(plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    await verify_tenant_access(current_user, plan, "treatment_plan", db)
    old_data = {"plan_name": plan.plan_name, "status": plan.status.value if hasattr(plan.status, 'value') else plan.status, "notes": plan.notes}
    updated = await service.update(plan_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    await db.commit()
    new_data = {"plan_name": updated.plan_name, "status": updated.status.value if hasattr(updated.status, 'value') else updated.status, "notes": updated.notes}
    changes = build_changes(old_data, new_data)
    patient_id = await _get_patient_id_from_plan(db, plan_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Plan Updated",
        description=f"Treatment plan updated",
        module="Treatments",
        changes=changes,
    )
    return updated


@router.put("/{plan_id}/status", response_model=TreatmentPlanResponse)
async def update_treatment_plan_status(plan_id: str, status: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    plan = await service.get(plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    await verify_tenant_access(current_user, plan, "treatment_plan", db)
    old_status = plan.status.value if hasattr(plan.status, 'value') else plan.status
    updated = await service.update_status(plan_id, status, user_id=current_user.get("sub"))
    svc = StatusAutomationService(db)
    await svc.update_treatment_status(plan_id, TreatmentPlanStatus(status))
    enquiry_svc = TreatmentEnquiryService(db)
    if status == TreatmentPlanStatus.COMPLETED.value:
        await enquiry_svc.on_treatment_plan_completed(plan_id)
    await db.commit()
    patient_id = await _get_patient_id_from_plan(db, plan_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Plan Status Changed",
        description=f"Status changed from {old_status} to {status}",
        module="Treatments",
        changes=[{"field": "status", "old_value": old_status, "new_value": status}],
    )
    return updated


@router.delete("/{plan_id}", response_model=MessageResponse)
async def delete_treatment_plan(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    plan = await service.get(plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment plan not found")
    await verify_tenant_access(current_user, plan, "treatment_plan", db)
    patient_id = await _get_patient_id_from_plan(db, plan_id)
    deleted = await service.delete(plan_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Plan Deleted",
        description=f"Treatment plan deleted",
        module="Treatments",
    )
    return MessageResponse(message="Treatment plan deleted successfully")
