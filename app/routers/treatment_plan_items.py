import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission
from app.services.treatment_plan_item_service import TreatmentPlanItemService
from app.schemas.treatment_plan_item import (
    TreatmentPlanItemCreate, TreatmentPlanItemUpdate, TreatmentPlanItemResponse,
    TreatmentPlanItemBulkCreate, TreatmentPlanItemBulkAssignDoctor,
)
from app.schemas.common import MessageResponse
from app.models.case import Case
from app.models.patient import Patient
from sqlalchemy import select
from app.services.timeline_helper import record_timeline_event

router = APIRouter(prefix="/treatment-plan-items", tags=["Treatment Plan Items"])
logger = logging.getLogger(__name__)


async def _verify_case_accessible(db: AsyncSession, case_id: str, current_user: dict):
    from app.core.permissions import Role
    from app.models.patient import Patient
    from app.models.hospital import Hospital
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    role = current_user.get("role")
    if role == Role.GROUP_ADMIN.value:
        patient_result = await db.execute(select(Patient).where(Patient.id == case.patient_id))
        patient = patient_result.scalar_one_or_none()
        if patient:
            hosp_result = await db.execute(select(Hospital).where(Hospital.id == patient.hospital_id))
            hosp = hosp_result.scalar_one_or_none()
            if hosp and str(hosp.admin_group_id) != current_user.get("admin_group_id"):
                raise HTTPException(status_code=403, detail="Access denied")
    return case


@router.get("/by-case/{case_id}", response_model=List[TreatmentPlanItemResponse])
async def get_items_by_case(case_id: str, version: Optional[int] = Query(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    await _verify_case_accessible(db, case_id, current_user)
    service = TreatmentPlanItemService(db)
    if version is not None:
        items = await service.repo.get_all(filters={"case_id": case_id, "version": version})
        from app.services.treatment_plan_item_service import _enrich_item
        return [_enrich_item(i) for i in items]
    return await service.get_current_items(case_id)


@router.get("/versions/{case_id}")
async def get_versions(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)
    await _verify_case_accessible(db, case_id, current_user)
    service = TreatmentPlanItemService(db)
    versions = await service.get_all_versions(case_id)
    from app.schemas.treatment_plan_item import TreatmentPlanItemResponse
    result = []
    for v_items in versions:
        result.append([TreatmentPlanItemResponse.model_validate(i) for i in v_items])
    return result


@router.post("/", response_model=List[TreatmentPlanItemResponse], status_code=status.HTTP_201_CREATED)
async def create_items(data: TreatmentPlanItemBulkCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    case = await _verify_case_accessible(db, data.case_id, current_user)
    service = TreatmentPlanItemService(db)
    items = await service.create_items(data.case_id, [i.model_dump() for i in data.items], user_id=current_user.get("sub"))
    await db.commit()
    patient_result = await db.execute(select(Patient.id).where(Patient.id == case.patient_id))
    patient_row = patient_result.one_or_none()
    if patient_row:
        await record_timeline_event(
            db, current_user=current_user, patient_id=patient_row[0],
            action="Treatment Plan Items Created",
            description=f"{len(items)} treatment plan item(s) added to case",
            module="Treatments",
        )
    return items


@router.put("/{item_id}", response_model=TreatmentPlanItemResponse)
async def update_item(item_id: str, data: TreatmentPlanItemUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanItemService(db)
    item = await service.update_item(item_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not item:
        raise HTTPException(status_code=404, detail="Treatment plan item not found")
    await db.commit()
    case_result = await db.execute(select(Case.patient_id).where(Case.id == item.case_id))
    case_row = case_result.one_or_none()
    if case_row:
        await record_timeline_event(
            db, current_user=current_user, patient_id=case_row[0],
            action="Treatment Plan Item Updated",
            description=f"Treatment plan item '{item.procedure_name}' updated",
            module="Treatments",
        )
    return item


@router.delete("/{item_id}", response_model=MessageResponse)
async def delete_item(item_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanItemService(db)
    item = await service.repo.get(item_id)
    deleted = await service.delete_item(item_id, user_id=current_user.get("sub"))
    if not deleted:
        raise HTTPException(status_code=404, detail="Treatment plan item not found")
    await db.commit()
    if item:
        case_result = await db.execute(select(Case.patient_id).where(Case.id == item.case_id))
        case_row = case_result.one_or_none()
        if case_row:
            await record_timeline_event(
                db, current_user=current_user, patient_id=case_row[0],
                action="Treatment Plan Item Deleted",
                description=f"Treatment plan item '{item.procedure_name}' deleted",
                module="Treatments",
            )
    return MessageResponse(message="Treatment plan item deleted")


@router.post("/assign-doctors", response_model=List[TreatmentPlanItemResponse])
async def bulk_assign_doctors(data: TreatmentPlanItemBulkAssignDoctor, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_TREATMENT_DOCTOR)
    service = TreatmentPlanItemService(db)
    updated = []
    for assignment in data.assignments:
        item = await service.repo.get(assignment.item_id)
        if not item:
            continue
        update_data = {}
        if assignment.assigned_doctor_id is not None:
            update_data["assigned_doctor_id"] = assignment.assigned_doctor_id
        if assignment.assistant_doctor_id is not None:
            update_data["assistant_doctor_id"] = assignment.assistant_doctor_id
        if update_data:
            updated_item = await service.repo.update(assignment.item_id, **update_data)
            if updated_item:
                updated.append(updated_item)
    await db.commit()
    if updated:
        case_result = await db.execute(select(Case.patient_id).where(Case.id == updated[0].case_id))
        case_row = case_result.one_or_none()
        if case_row:
            from app.services.treatment_plan_item_service import _enrich_item
            await record_timeline_event(
                db, current_user=current_user, patient_id=case_row[0],
                action="Doctors Assigned to Treatment Items",
                description=f"Doctors assigned to {len(updated)} treatment plan item(s)",
                module="Treatments",
            )
    return updated
