from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_, or_
from typing import Optional
from datetime import datetime, timezone, date, timedelta
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType, FollowUpOutcome
from app.models.treatment_sitting import TreatmentSitting
from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
from app.models.treatment_plan import TreatmentPlan
from app.models.patient import Patient
from app.models.user import User
from app.models.hospital import Hospital

router = APIRouter(prefix="/crm/treatment-follow-ups", tags=["CRM Treatment Follow-Ups"])


def _verify_hospital_access(entity, current_user):
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        ehid = getattr(entity, "hospital_id", None)
        uhid = current_user.get("hospital_id")
        if ehid and uhid and str(ehid) != str(uhid):
            raise HTTPException(status_code=403, detail="Access denied")


class CompleteFollowUpRequest(BaseModel):
    outcome: str
    notes: Optional[str] = None


class FollowUpResponse(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    patient_phone: Optional[str] = None
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None
    case_id: Optional[str] = None
    treatment_name: Optional[str] = None
    treatment_completed_date: Optional[str] = None
    follow_up_date: str
    follow_up_type: str
    outcome: Optional[str] = None
    notes: Optional[str] = None
    status: str
    created_at: str


def _follow_up_to_dict(fu: FollowUp, patient=None, doctor=None) -> dict:
    return {
        "id": str(fu.id),
        "patient_id": str(fu.patient_id),
        "patient_name": patient.full_name if patient else "Unknown",
        "patient_phone": patient.phone if patient else None,
        "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
        "doctor_name": doctor.full_name if doctor else None,
        "case_id": str(fu.case_id) if fu.case_id else None,
        "treatment_name": fu.treatment_name,
        "treatment_completed_date": fu.treatment_completed_date.isoformat() if fu.treatment_completed_date else None,
        "follow_up_date": fu.follow_up_date.isoformat(),
        "follow_up_type": fu.follow_up_type,
        "outcome": fu.outcome,
        "notes": fu.notes,
        "status": fu.status,
        "created_at": fu.created_at.isoformat() if fu.created_at else None,
    }


@router.post("/auto-create/{treatment_id}")
async def auto_create_treatment_follow_ups(treatment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    from app.models.treatment_plan import TreatmentPlan
    from app.models.case import Case
    from app.models.patient import Patient
    sitting = await db.get(TreatmentSitting, treatment_id)
    if not sitting:
        raise HTTPException(status_code=404, detail="Treatment sitting not found")
    plan = await db.get(TreatmentPlan, sitting.treatment_plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    case = await db.get(Case, plan.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    patient = await db.get(Patient, case.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    hospital_id = patient.hospital_id
    treatment_name = plan.treatment_name
    patient_id = case.patient_id
    doctor_id = case.doctor_id
    case_id = case.id
    # Resolve treatment_type_id from treatment_name if needed
    if not plan.treatment_type_id and treatment_name:
        from app.models.treatment_type import TreatmentType as TT
        tt_q = select(TT.id).where(TT.name == treatment_name, TT.hospital_id.is_(None))
        tt_result = await db.execute(tt_q.limit(1))
        resolved_tt_id = tt_result.scalar_one_or_none()
        if not resolved_tt_id and hospital_id:
            tt_result = await db.execute(
                select(TT.id).where(TT.name == treatment_name, TT.hospital_id == hospital_id).limit(1)
            )
            resolved_tt_id = tt_result.scalar_one_or_none()
        if resolved_tt_id:
            plan.treatment_type_id = resolved_tt_id
            await db.flush()
    q_rules = select(TreatmentFollowUpRule).where(
        TreatmentFollowUpRule.hospital_id.in_([hospital_id, None]),
        TreatmentFollowUpRule.is_active == True,
    )
    filters = []
    if plan.treatment_template_id:
        filters.append(TreatmentFollowUpRule.treatment_template_id == plan.treatment_template_id)
    if plan.treatment_type_id:
        filters.append(TreatmentFollowUpRule.treatment_type_id == plan.treatment_type_id)
        filters.append(
            TreatmentFollowUpRule.treatment_type_id.in_(
                select(TT.id).where(TT.name == plan.treatment_name)
            )
        )
    if filters:
        q_rules = q_rules.where(or_(*filters))
    rules = (await db.execute(q_rules)).scalars().all()
    if not rules:
        raise HTTPException(status_code=400, detail="No active follow-up rules found for this treatment. Configure rules in CRM settings.")
    created = []
    completed_date = sitting.sitting_date if sitting.sitting_date else date.today()
    for rule in rules:
        if rule.follow_up_1_day:
            fu_date_1 = completed_date + timedelta(days=1)
            fu = FollowUp(
                patient_id=patient_id, hospital_id=hospital_id,
                doctor_id=doctor_id, case_id=case_id,
                treatment_id=treatment_id, treatment_name=treatment_name,
                treatment_completed_date=completed_date, follow_up_date=fu_date_1,
                follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
                status=FollowUpStatus.PENDING.value,
            )
            db.add(fu); created.append(fu)
        if rule.follow_up_7_day:
            fu_date_7 = completed_date + timedelta(days=7)
            fu = FollowUp(
                patient_id=patient_id, hospital_id=hospital_id,
                doctor_id=doctor_id, case_id=case_id,
                treatment_id=treatment_id, treatment_name=treatment_name,
                treatment_completed_date=completed_date, follow_up_date=fu_date_7,
                follow_up_type=FollowUpType.SEVEN_DAY_FOLLOW_UP.value,
                status=FollowUpStatus.PENDING.value,
            )
            db.add(fu); created.append(fu)
        if rule.recall_6_month:
            fu_date_6m = completed_date + timedelta(days=180)
            fu = FollowUp(
                patient_id=patient_id, hospital_id=hospital_id,
                doctor_id=doctor_id, case_id=case_id,
                treatment_id=treatment_id, treatment_name=treatment_name,
                treatment_completed_date=completed_date, follow_up_date=fu_date_6m,
                follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                status=FollowUpStatus.PENDING.value,
            )
            db.add(fu); created.append(fu)
        if rule.recall_12_month:
            fu_date_12m = completed_date + timedelta(days=365)
            fu = FollowUp(
                patient_id=patient_id, hospital_id=hospital_id,
                doctor_id=doctor_id, case_id=case_id,
                treatment_id=treatment_id, treatment_name=treatment_name,
                treatment_completed_date=completed_date, follow_up_date=fu_date_12m,
                follow_up_type=FollowUpType.TWELVE_MONTH_RECALL.value,
                status=FollowUpStatus.PENDING.value,
            )
            db.add(fu); created.append(fu)
        if rule.custom_recall_days and rule.custom_recall_days > 0:
            fu_date_custom = completed_date + timedelta(days=rule.custom_recall_days)
            fu = FollowUp(
                patient_id=patient_id, hospital_id=hospital_id,
                doctor_id=doctor_id, case_id=case_id,
                treatment_id=treatment_id, treatment_name=treatment_name,
                treatment_completed_date=completed_date, follow_up_date=fu_date_custom,
                follow_up_type=FollowUpType.CUSTOM_FOLLOW_UP.value,
                status=FollowUpStatus.PENDING.value,
            )
            db.add(fu); created.append(fu)
    await db.commit()
    ids = [str(f.id) for f in created]
    return {"created": len(ids), "follow_up_ids": ids}


@router.get("/")
async def list_treatment_follow_ups(
    type_filter: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    doctor_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    treatment_types = [FollowUpType.ONE_DAY_FOLLOW_UP.value, FollowUpType.SEVEN_DAY_FOLLOW_UP.value,
                       FollowUpType.SIX_MONTH_RECALL.value, FollowUpType.TWELVE_MONTH_RECALL.value,
                       FollowUpType.CUSTOM_FOLLOW_UP.value]
    q = select(FollowUp).where(FollowUp.follow_up_type.in_(treatment_types))
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    if type_filter:
        q = q.where(FollowUp.follow_up_type == type_filter)
    if status_filter:
        q = q.where(FollowUp.status == status_filter)
    if doctor_id:
        q = q.where(FollowUp.doctor_id == doctor_id)
    if patient_id:
        q = q.where(FollowUp.patient_id == patient_id)
    q = q.order_by(desc(FollowUp.follow_up_date), desc(FollowUp.created_at))
    rows = (await db.execute(q)).scalars().all()
    result = []
    for fu in rows:
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        result.append(_follow_up_to_dict(fu, patient, doctor))
    return result


@router.put("/{follow_up_id}/complete")
async def complete_follow_up(follow_up_id: str, data: CompleteFollowUpRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)
    fu.status = FollowUpStatus.COMPLETED.value
    fu.outcome = data.outcome
    if data.notes:
        fu.notes = data.notes
    fu.completed_date = datetime.now(timezone.utc)
    fu.completed_by = current_user.get("sub")
    await db.flush()
    appointment_result = None
    if fu.outcome == FollowUpOutcome.NEEDS_APPOINTMENT.value:
        from app.services.treatment_enquiry_service import TreatmentEnquiryService
        svc = TreatmentEnquiryService(db)
        plan = await db.get(TreatmentPlan, fu.treatment_id) if fu.treatment_id else None
        rule = None
        if plan:
            ctx = await svc._get_plan_context(fu.treatment_id)
            hospital_id = ctx["hospital_id"] if ctx else fu.hospital_id
            rule = await svc._find_matching_rule(plan, hospital_id)
        appointment_result = await svc.auto_create_appointment(fu, rule)
    await db.commit()
    return {
        "success": True, "status": fu.status, "outcome": fu.outcome,
        "appointment": appointment_result,
    }


@router.get("/doctor")
async def get_doctor_follow_ups(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    doctor_id = current_user.get("sub")
    hospital_id = current_user.get("hospital_id")
    treatment_types = [FollowUpType.ONE_DAY_FOLLOW_UP.value, FollowUpType.SEVEN_DAY_FOLLOW_UP.value]
    q = select(FollowUp).where(
        FollowUp.doctor_id == doctor_id,
        FollowUp.follow_up_type.in_(treatment_types),
        FollowUp.status != FollowUpStatus.COMPLETED.value,
    )
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    q = q.order_by(FollowUp.follow_up_date)
    rows = (await db.execute(q)).scalars().all()
    result = []
    for fu in rows:
        patient = await db.get(Patient, fu.patient_id)
        result.append(_follow_up_to_dict(fu, patient))
    return result


@router.get("/doctor/recall-patients")
async def get_doctor_recall_patients(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    doctor_id = current_user.get("sub")
    hospital_id = current_user.get("hospital_id")
    recall_types = [FollowUpType.SIX_MONTH_RECALL.value, FollowUpType.TWELVE_MONTH_RECALL.value, FollowUpType.CUSTOM_FOLLOW_UP.value]
    q = select(FollowUp).where(
        FollowUp.doctor_id == doctor_id,
        FollowUp.follow_up_type.in_(recall_types),
        FollowUp.status.in_([FollowUpStatus.PENDING.value]),
    )
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    q = q.order_by(FollowUp.follow_up_date)
    rows = (await db.execute(q)).scalars().all()
    result = []
    for fu in rows:
        patient = await db.get(Patient, fu.patient_id)
        result.append(_follow_up_to_dict(fu, patient))
    return result


@router.get("/stats")
async def get_treatment_follow_up_stats(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    treatment_types = [FollowUpType.ONE_DAY_FOLLOW_UP.value, FollowUpType.SEVEN_DAY_FOLLOW_UP.value,
                       FollowUpType.SIX_MONTH_RECALL.value, FollowUpType.TWELVE_MONTH_RECALL.value,
                       FollowUpType.CUSTOM_FOLLOW_UP.value]
    q = select(FollowUp).where(FollowUp.follow_up_type.in_(treatment_types))
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    rows = (await db.execute(q)).scalars().all()
    total = len(rows)
    open_count = sum(1 for r in rows if r.status in (FollowUpStatus.PENDING.value))
    completed = sum(1 for r in rows if r.status == FollowUpStatus.COMPLETED.value)
    overdue = sum(1 for r in rows if r.status in (FollowUpStatus.PENDING.value) and r.follow_up_date < date.today())
    return {"total": total, "open": open_count, "completed": completed, "overdue": overdue}
