import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, String as SAString
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.treatment_plan_service import TreatmentPlanService
from app.services.status_automation import StatusAutomationService
from app.services.treatment_notification import (
    notify_treatment_completed, notify_treatment_overdue,
    notify_treatment_assigned, notify_pending_assignment,
)
from app.schemas.treatment_plan import TreatmentPlanUpdate, TreatmentPlanResponse
from app.schemas.common import MessageResponse
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.user import User
from app.services.timeline_helper import record_timeline_event, build_changes

router = APIRouter(prefix="/treatment-plans", tags=["Treatment Plans"])
logger = logging.getLogger(__name__)


class CompleteTreatmentBody(BaseModel):
    outcome: Optional[str] = None
    notes: Optional[str] = None


class SetWaitingBody(BaseModel):
    reason: Optional[str] = None
    expected_followup: Optional[str] = None
    lab_name: Optional[str] = None
    lab_order_number: Optional[str] = None
    lab_sent_date: Optional[str] = None
    lab_return_date: Optional[str] = None
    lab_cost: Optional[float] = None
    lab_tracking_notes: Optional[str] = None


async def _get_patient_id_from_plan(db: AsyncSession, plan_id: str) -> str:
    plan_result = await db.execute(select(Case.patient_id).join(TreatmentPlan, TreatmentPlan.case_id == Case.id).where(TreatmentPlan.id == plan_id))
    row = plan_result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Associated case/patient not found")
    return row[0]



@router.get("/")
async def get_treatment_plans(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    case_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    hospital_id: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.MANAGE_CASES)

        query = (
            select(TreatmentPlan)
            .join(Case, TreatmentPlan.case_id == Case.id)
            .outerjoin(Patient, Case.patient_id == Patient.id)
            .outerjoin(User, TreatmentPlan.assigned_doctor_id == User.id)
            .options(
                selectinload(TreatmentPlan.sittings),
                joinedload(TreatmentPlan.case).joinedload(Case.patient).selectinload(Patient.hospital),
                joinedload(TreatmentPlan.case).joinedload(Case.doctor),
                joinedload(TreatmentPlan.assigned_doctor),
                joinedload(TreatmentPlan.assistant_doctor),
                joinedload(TreatmentPlan.treatment_type),
            )
        )

        query = query.where(TreatmentPlan.is_active == True)

        role = current_user.get("role")
        uid = current_user.get("sub")
        if role == Role.DOCTOR.value:
            query = query.where(Case.doctor_id == uid)
        elif role == Role.HOSPITAL_ADMIN.value:
            hid = hospital_id or current_user.get("hospital_id")
            if hid:
                query = query.where(Patient.hospital_id == hid)
        elif role == Role.GROUP_ADMIN.value:
            agid = current_user.get("admin_group_id")
            if agid:
                hosp_r = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
                hids = [r[0] for r in hosp_r.all()]
                if hids:
                    pat_r = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))
                    pids = [r[0] for r in pat_r.all()]
                    if pids:
                        cas_r = await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))
                        cids = [r[0] for r in cas_r.all()]
                        query = query.where(TreatmentPlan.case_id.in_(cids))
                    else:
                        query = query.where(TreatmentPlan.id == "__none__")
                else:
                    query = query.where(TreatmentPlan.id == "__none__")
        elif role == Role.SUPER_ADMIN.value and hospital_id:
            query = query.where(Patient.hospital_id == hospital_id)

        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                or_(
                    Patient.full_name.ilike(term),
                    Patient.op_no.ilike(term),
                    Case.case_number.ilike(term),
                    TreatmentPlan.treatment_number.ilike(term),
                    TreatmentPlan.treatment_name.ilike(term),
                    User.full_name.ilike(term),
                    TreatmentPlan.status.cast(SAString).ilike(term),
                )
            )

        if status_filter and status_filter != "all":
            query = query.where(TreatmentPlan.status == status_filter)

        if doctor_id:
            query = query.where(TreatmentPlan.assigned_doctor_id == doctor_id)

        if case_id:
            query = query.where(TreatmentPlan.case_id == case_id)

        if patient_id:
            query = query.where(Case.patient_id == patient_id)

        if date_from:
            query = query.where(TreatmentPlan.created_at >= date_from)

        if date_to:
            from datetime import datetime as dt
            try:
                end = dt.fromisoformat(date_to).replace(hour=23, minute=59, second=59)
                query = query.where(TreatmentPlan.created_at <= end)
            except Exception:
                query = query.where(TreatmentPlan.created_at <= date_to)

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(TreatmentPlan.created_at.desc())
        query = query.offset(skip).limit(limit)

        result = await db.execute(query)
        plans = list(result.unique().scalars().all())

        from app.services.treatment_plan_service import _enrich_plan
        for p in plans:
            _enrich_plan(p)

        serialized = [TreatmentPlanResponse.model_validate(p).model_dump() for p in plans]
        return {"items": serialized, "total": total, "skip": skip, "limit": limit}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("GET_TREATMENT_PLANS error: %s", str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load treatment plans")


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
    old_data = {"plan_name": plan.treatment_name, "status": plan.status.value if hasattr(plan.status, 'value') else plan.status, "notes": plan.notes}
    updated = await service.update(plan_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    await db.commit()
    new_data = {"plan_name": updated.treatment_name, "status": updated.status.value if hasattr(updated.status, 'value') else updated.status, "notes": updated.notes}
    changes = build_changes(new_data, old_data)
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
    try:
        from app.services.clinical_followups import create_treatment_completed_followups, create_overdue_followup
        if status == TreatmentPlanStatus.COMPLETED.value:
            await create_treatment_completed_followups(db, plan_id)
        elif status == "OVERDUE":
            await create_overdue_followup(db, plan_id)
    except Exception as e:
        logger.warning("CRM status task failed: %s", e)
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


@router.get("/{plan_id}/suggest-appointment")
async def suggest_appointment(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.VIEW_TREATMENT_QUEUE)
    service = TreatmentPlanService(db)
    return await service.suggest_next_appointment(plan_id)


@router.get("/{plan_id}/check-dependency")
async def check_dependency(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN, Permission.VIEW_TREATMENT_QUEUE)
    service = TreatmentPlanService(db)
    return await service.check_dependency_met(plan_id)


@router.post("/{plan_id}/start")
async def start_treatment(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    result = await service.update_status(plan_id, "IN_PROGRESS", user_id=current_user.get("sub"))
    patient_id = await _get_patient_id_from_plan(db, plan_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Started",
        description=f"Treatment started",
        module="Treatments",
    )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.TREATMENT_STARTED,
            source_module=EventSource.TREATMENT,
            entity_type="TREATMENT",
            entity_id=plan_id,
            hospital_id=getattr(result, 'hospital_id', None),
            patient_id=patient_id,
            doctor_id=getattr(result, 'assigned_doctor_id', None),
            db=db,
        )
    except Exception:
        pass
    await db.commit()
    return result


@router.post("/{plan_id}/complete")
async def complete_treatment(plan_id: str, body: CompleteTreatmentBody = Body(default=None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    update_data = {"status": "COMPLETED"}
    if body:
        if body.outcome:
            update_data["notes"] = f"Outcome: {body.outcome}" + (f" — {body.notes}" if body.notes else "")
        elif body.notes:
            update_data["notes"] = body.notes
    result = await service.update(plan_id, update_data, user_id=current_user.get("sub"))
    patient_id = await _get_patient_id_from_plan(db, plan_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Completed",
        description=f"Treatment completed",
        module="Treatments",
    )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.TREATMENT_COMPLETED,
            source_module=EventSource.TREATMENT,
            entity_type="TREATMENT",
            entity_id=plan_id,
            hospital_id=getattr(result, 'hospital_id', None),
            patient_id=patient_id,
            doctor_id=getattr(result, 'assigned_doctor_id', None),
            payload={
                "treatment_plan_id": plan_id,
                "patient_id": patient_id,
                "case_id": str(result.case_id) if result.case_id else None,
                "treatment_type_id": str(result.treatment_type_id) if result.treatment_type_id else None,
                "doctor_id": str(result.assigned_doctor_id) if result.assigned_doctor_id else None,
            },
            db=db,
        )
    except Exception:
        pass
    try:
        svc = StatusAutomationService(db)
        await svc.update_treatment_status(plan_id, TreatmentPlanStatus.COMPLETED)
        await db.commit()
    except Exception as e:
        logger.warning("StatusAutomation on complete failed: %s", e)
    try:
        plan_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.id == plan_id))
        plan = plan_result.scalar_one_or_none()
        if plan:
            await notify_treatment_completed(db, plan)
    except Exception as e:
        logger.warning("Notification failed: %s", e)
    return result


@router.post("/{plan_id}/report-overdue")
async def report_overdue(plan_id: str, reason: str = Query(...), delay_type: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    result = await service.update(plan_id, {"status": "OVERDUE", "overdue_reason": reason, "overdue_delay_type": delay_type}, user_id=current_user.get("sub"))
    await db.commit()
    patient_id = await _get_patient_id_from_plan(db, plan_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Treatment Reported Overdue",
        description=f"Treatment marked overdue: {reason} ({delay_type})",
        module="Treatments",
    )
    try:
        plan_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.id == plan_id))
        plan = plan_result.scalar_one_or_none()
        if plan:
            await notify_treatment_overdue(db, plan)
    except Exception as e:
        logger.warning("Notification failed: %s", e)
    return result


@router.post("/{plan_id}/set-waiting")
async def set_waiting(plan_id: str, waiting_type: str = Query(...), body: SetWaitingBody = Body(default=None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = TreatmentPlanService(db)
    if waiting_type not in ("WAITING_PATIENT", "WAITING_LAB"):
        raise HTTPException(status_code=400, detail="waiting_type must be WAITING_PATIENT or WAITING_LAB")
    update_data = {"status": waiting_type}
    if body and body.reason:
        update_data["overdue_reason"] = body.reason
    result = await service.update(plan_id, update_data, user_id=current_user.get("sub"))
    await db.commit()

    plan_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.id == plan_id))
    plan = plan_result.scalar_one_or_none()

    if waiting_type == "WAITING_LAB" and body and plan:
        from datetime import datetime as dt, timezone
        if body.lab_name:
            plan.overdue_reason = f"Lab: {body.lab_name}" + (f" (Order: {body.lab_order_number})" if body.lab_order_number else "")
        if body.expected_followup:
            plan.overdue_delay_type = body.expected_followup
        await db.flush()

    patient_id = await _get_patient_id_from_plan(db, plan_id)
    label = "Waiting for Patient" if waiting_type == "WAITING_PATIENT" else "Waiting for Lab"
    desc = f"Treatment set to {label}"
    if body and body.reason:
        desc += f": {body.reason}"
    if waiting_type == "WAITING_LAB" and body:
        if body.lab_name:
            desc += f" — Lab: {body.lab_name}"
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action=f"Treatment Set to {label}",
        description=desc,
        module="Treatments",
    )
    try:
        from app.services.clinical_followups import create_waiting_patient_followup, create_waiting_lab_followup
        if waiting_type == "WAITING_PATIENT":
            await create_waiting_patient_followup(db, plan_id)
        elif waiting_type == "WAITING_LAB":
            await create_waiting_lab_followup(db, plan_id)
    except Exception as e:
        logger.warning("CRM waiting task failed: %s", e)
    return result


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
