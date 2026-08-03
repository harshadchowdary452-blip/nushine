from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import logging
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.treatment_sitting_service import TreatmentSittingService
from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
from app.schemas.treatment_sitting import TreatmentSittingCreate, TreatmentSittingUpdate, TreatmentSittingResponse
from app.models.treatment_plan import TreatmentPlan
from app.models.case import Case
from app.schemas.common import MessageResponse
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.services.timeline_helper import record_timeline_event, build_changes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/treatment-sittings", tags=["Treatment Sittings"])


async def _get_patient_id_from_sitting(db: AsyncSession, sitting_id: str) -> str:
    q = select(Case.patient_id).select_from(TreatmentSitting).join(TreatmentPlan, TreatmentSitting.treatment_plan_id == TreatmentPlan.id).join(Case, TreatmentPlan.case_id == Case.id).where(TreatmentSitting.id == sitting_id)
    r = await db.execute(q)
    row = r.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Associated patient not found")
    return row[0]


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
    sitting = await service.create(data.model_dump(), user_id=current_user.get("sub"))
    plan_name = sitting.treatment_plan.treatment_name if sitting.treatment_plan else "N/A"
    await db.commit()
    patient_id = await _get_patient_id_from_sitting(db, sitting.id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Sitting Added",
        description=f"Treatment sitting #{sitting.sitting_number} added (treatment: {plan_name})",
        module="Treatments",
    )
    return sitting


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
    await verify_tenant_access(current_user, sitting, "sitting", db)
    return sitting


@router.put("/{sitting_id}", response_model=TreatmentSittingResponse)
async def update_sitting(sitting_id: str, data: TreatmentSittingUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    old = await db.get(TreatmentSitting, sitting_id)
    if not old:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment sitting not found")
    service = TreatmentSittingService(db)
    old_data = {"sitting_number": old.sitting_number, "work_done": old.work_done, "status": old.status.value if hasattr(old.status, 'value') else old.status, "doctor_notes": old.doctor_notes}
    sitting = await service.update(sitting_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not sitting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment sitting not found")
    new_data = {"sitting_number": sitting.sitting_number, "work_done": sitting.work_done, "status": sitting.status.value if hasattr(sitting.status, 'value') else sitting.status, "doctor_notes": sitting.doctor_notes}
    changes = build_changes(new_data, old_data)
    patient_id = await _get_patient_id_from_sitting(db, sitting_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Sitting Updated",
        description=f"Treatment sitting updated",
        module="Treatments",
        changes=changes,
    )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        sitting_status = sitting.status.value if hasattr(sitting.status, 'value') else sitting.status
        if sitting_status == "COMPLETED":
            plan_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.id == sitting.treatment_plan_id))
            plan = plan_result.scalar_one_or_none()
            await publish_event(
                event_type=EventType.TREATMENT_VISIT_COMPLETED,
                source_module=EventSource.TREATMENT,
                entity_type="TREATMENT",
                entity_id=sitting.treatment_plan_id,
                hospital_id=getattr(plan, 'hospital_id', None) if plan else None,
                patient_id=patient_id,
                doctor_id=getattr(plan, 'assigned_doctor_id', None) if plan else None,
                db=db,
            )

    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    await db.commit()
    return sitting


@router.delete("/{sitting_id}", response_model=MessageResponse)
async def delete_sitting(sitting_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentSittingService(db)
    sitting = await service.get(sitting_id)
    if not sitting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Treatment sitting not found")
    await verify_tenant_access(current_user, sitting, "sitting", db)
    patient_id = await _get_patient_id_from_sitting(db, sitting_id)
    deleted = await service.delete(sitting_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Sitting Deleted",
        description=f"Treatment sitting deleted",
        module="Treatments",
    )
    return MessageResponse(message="Treatment sitting deleted successfully")
