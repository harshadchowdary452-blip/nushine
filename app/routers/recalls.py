from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional
from datetime import datetime, timezone, date, timedelta
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType, FollowUpOutcome
from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
from app.models.treatment_plan import TreatmentPlan
from app.models.patient import Patient
from app.models.user import User

router = APIRouter(prefix="/crm/recalls", tags=["CRM Recalls"])


def _verify_hospital_access(entity, current_user):
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        ehid = getattr(entity, "hospital_id", None)
        uhid = current_user.get("hospital_id")
        if ehid and uhid and str(ehid) != str(uhid):
            raise HTTPException(status_code=403, detail="Access denied")


class CompleteRecallRequest(BaseModel):
    outcome: str
    notes: Optional[str] = None
    next_recall_date: Optional[str] = None


def _recall_to_dict(fu: FollowUp, patient=None, doctor=None) -> dict:
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
        "completed_date": fu.completed_date.isoformat() if fu.completed_date else None,
        "created_at": fu.created_at.isoformat() if fu.created_at else None,
    }


@router.get("/")
async def list_recalls(
    type_filter: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    overdue_only: Optional[bool] = Query(False),
    patient_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    recall_types = [FollowUpType.SIX_MONTH_RECALL.value, FollowUpType.TWELVE_MONTH_RECALL.value, FollowUpType.CUSTOM_RECALL.value]
    q = select(FollowUp).where(FollowUp.follow_up_type.in_(recall_types))
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    if type_filter:
        q = q.where(FollowUp.follow_up_type == type_filter)
    if status_filter:
        q = q.where(FollowUp.status == status_filter)
    else:
        q = q.where(FollowUp.status.in_([FollowUpStatus.PENDING.value]))
    if overdue_only:
        q = q.where(FollowUp.follow_up_date < date.today())
    if patient_id:
        q = q.where(FollowUp.patient_id == patient_id)
    q = q.order_by(FollowUp.follow_up_date)
    rows = (await db.execute(q)).scalars().all()
    result = []
    for fu in rows:
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        result.append(_recall_to_dict(fu, patient, doctor))
    return result


@router.put("/{recall_id}/complete")
async def complete_recall(recall_id: str, data: CompleteRecallRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    fu = await db.get(FollowUp, recall_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Recall not found")
    _verify_hospital_access(fu, current_user)
    fu.status = FollowUpStatus.COMPLETED.value
    fu.outcome = data.outcome
    if data.notes:
        fu.notes = data.notes
    fu.completed_date = datetime.now(timezone.utc)
    fu.completed_by = current_user.get("sub")
    # If next recall date specified, create a new recall
    if data.next_recall_date:
        next_date = date.fromisoformat(data.next_recall_date)
        new_recall = FollowUp(
            patient_id=fu.patient_id, hospital_id=fu.hospital_id,
            doctor_id=fu.doctor_id, case_id=fu.case_id,
            treatment_id=fu.treatment_id, treatment_name=fu.treatment_name,
            treatment_completed_date=fu.treatment_completed_date,
            follow_up_date=next_date,
            follow_up_type=fu.follow_up_type,
            status=FollowUpStatus.PENDING.value,
        )
        db.add(new_recall)
        await db.flush()
        new_id = str(new_recall.id)
    else:
        new_id = None
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
    return {"success": True, "status": fu.status, "next_recall_id": new_id, "appointment": appointment_result}


@router.get("/stats")
async def get_recall_stats(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    recall_types = [FollowUpType.SIX_MONTH_RECALL.value, FollowUpType.TWELVE_MONTH_RECALL.value, FollowUpType.CUSTOM_RECALL.value]
    q = select(FollowUp).where(FollowUp.follow_up_type.in_(recall_types))
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    rows = (await db.execute(q)).scalars().all()
    total = len(rows)
    open_count = sum(1 for r in rows if r.status in (FollowUpStatus.PENDING.value))
    completed = sum(1 for r in rows if r.status == FollowUpStatus.COMPLETED.value)
    overdue = sum(1 for r in rows if r.status in (FollowUpStatus.PENDING.value) and r.follow_up_date < date.today())
    six_month = sum(1 for r in rows if r.follow_up_type == FollowUpType.SIX_MONTH_RECALL.value)
    twelve_month = sum(1 for r in rows if r.follow_up_type == FollowUpType.TWELVE_MONTH_RECALL.value)
    return {
        "total": total, "open": open_count, "completed": completed, "overdue": overdue,
        "six_month": six_month, "twelve_month": twelve_month,
    }


@router.get("/calendar")
async def get_recall_calendar(
    start_date: str = Query(...), end_date: str = Query(...),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = current_user.get("hospital_id")
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    result = []
    seen_patients = set()

    # 1. New CRM pipeline — GeneratedEnquiry RECALL (PENDING only, earliest per patient)
    from app.models.generated_enquiry import GeneratedEnquiry
    ge_q = select(GeneratedEnquiry).where(
        GeneratedEnquiry.enquiry_type == "RECALL",
        GeneratedEnquiry.status == "PENDING",
        GeneratedEnquiry.due_date >= start,
        GeneratedEnquiry.due_date <= end,
    )
    if hospital_id:
        ge_q = ge_q.where(GeneratedEnquiry.hospital_id == hospital_id)
    ge_q = ge_q.order_by(GeneratedEnquiry.due_date.asc())
    ge_rows = (await db.execute(ge_q)).scalars().all()
    for ge in ge_rows:
        pid = ge.patient_id
        if pid in seen_patients:
            continue
        seen_patients.add(pid)
        patient = await db.get(Patient, pid)
        doctor = await db.get(User, ge.doctor_id) if ge.doctor_id else None
        result.append({
            "id": str(ge.id), "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_name": doctor.full_name if doctor else None,
            "treatment_name": ge.treatment_name,
            "follow_up_date": ge.due_date.isoformat(),
            "follow_up_type": "RECALL",
            "status": ge.status,
            "outcome": None,
            "occurrence_number": ge.occurrence_number,
            "is_recurring": ge.is_recurring,
            "source": "crm_pipeline",
        })

    # 2. Legacy system — FollowUp recalls
    recall_types = [FollowUpType.SIX_MONTH_RECALL.value, FollowUpType.TWELVE_MONTH_RECALL.value, FollowUpType.CUSTOM_RECALL.value]
    q = select(FollowUp).where(
        FollowUp.follow_up_type.in_(recall_types),
        FollowUp.follow_up_date >= start, FollowUp.follow_up_date <= end,
        FollowUp.status == FollowUpStatus.PENDING.value,
    )
    if hospital_id:
        q = q.where(FollowUp.hospital_id == hospital_id)
    q = q.order_by(FollowUp.follow_up_date)
    rows = (await db.execute(q)).scalars().all()
    for fu in rows:
        if fu.patient_id in seen_patients:
            continue
        seen_patients.add(fu.patient_id)
        patient = await db.get(Patient, fu.patient_id)
        doctor = await db.get(User, fu.doctor_id) if fu.doctor_id else None
        result.append({
            "id": str(fu.id), "patient_name": patient.full_name if patient else "Unknown",
            "patient_phone": patient.phone if patient else None,
            "doctor_name": doctor.full_name if doctor else None,
            "treatment_name": fu.treatment_name,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "follow_up_type": fu.follow_up_type,
            "status": fu.status,
            "outcome": fu.outcome,
            "occurrence_number": None,
            "is_recurring": False,
            "source": "legacy",
        })

    result.sort(key=lambda x: x["follow_up_date"])
    return result


@router.post("/generate")
async def generate_recalls(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    six_months_ago = today - timedelta(days=180)
    twelve_months_ago = today - timedelta(days=365)
    rules_q = select(TreatmentFollowUpRule).where(
        TreatmentFollowUpRule.hospital_id == hospital_id,
        TreatmentFollowUpRule.is_active == True,
    )
    rules = (await db.execute(rules_q)).scalars().all()
    if not rules:
        raise HTTPException(status_code=400, detail="No active recall rules configured")
    from app.models.treatment_sitting import TreatmentSitting
    from app.models.treatment_plan import TreatmentPlan
    from app.models.case import Case
    from app.models.patient import Patient
    from sqlalchemy import not_, join
    existing_types = [FollowUpType.SIX_MONTH_RECALL.value, FollowUpType.TWELVE_MONTH_RECALL.value, FollowUpType.CUSTOM_RECALL.value]
    existing_q = select(FollowUp.treatment_id).where(
        FollowUp.hospital_id == hospital_id,
        FollowUp.follow_up_type.in_(existing_types),
        FollowUp.status != FollowUpStatus.LOST.value,
    )
    existing_ids = set((await db.execute(existing_q)).scalars().all())
    sittings_q = select(
        TreatmentSitting, TreatmentPlan.treatment_name, TreatmentPlan.treatment_template_id,
        Case.patient_id, Case.doctor_id, Patient.hospital_id,
    ).select_from(
        TreatmentSitting
    ).join(TreatmentPlan, TreatmentSitting.treatment_plan_id == TreatmentPlan.id
    ).join(Case, TreatmentPlan.case_id == Case.id
    ).join(Patient, Case.patient_id == Patient.id
    ).where(
        TreatmentSitting.status == "COMPLETED",
        not_(TreatmentSitting.id.in_(existing_ids)),
    )
    if hospital_id:
        sittings_q = sittings_q.where(Patient.hospital_id == hospital_id)
    rows = (await db.execute(sittings_q)).all()
    created = []
    for row in rows:
        sitting = row[0]
        tx_name = row.treatment_name
        tx_template_id = row.treatment_template_id
        pt_id = row.patient_id
        doc_id = row.doctor_id
        cs_id = sitting.case_id or row.case_id
        hosp_id = row.hospital_id or hospital_id
        for rule in rules:
            if rule.treatment_template_id and tx_template_id and str(rule.treatment_template_id) == str(tx_template_id):
                pass
            elif rule.treatment_type_id:
                # Match by treatment_type_id — resolve from plan if needed
                from app.models.treatment_type import TreatmentType as TT
                tt_result = await db.execute(
                    select(TT.id).where(TT.id == rule.treatment_type_id, TT.name == tx_name).limit(1)
                )
                if not tt_result.scalar_one_or_none():
                    continue
            elif rule.treatment_name and rule.treatment_name != tx_name:
                continue
            else:
                continue
            completed_date = sitting.sitting_date
            if not completed_date:
                continue
            if rule.recall_6_month and completed_date <= six_months_ago:
                fu = FollowUp(
                    patient_id=pt_id, hospital_id=hosp_id,
                    doctor_id=doc_id, case_id=cs_id,
                    treatment_id=sitting.id, treatment_name=tx_name,
                    treatment_completed_date=completed_date, follow_up_date=today,
                    follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                    status=FollowUpStatus.PENDING.value,
                )
                db.add(fu); created.append(fu)
            if rule.recall_12_month and completed_date <= twelve_months_ago:
                fu = FollowUp(
                    patient_id=pt_id, hospital_id=hosp_id,
                    doctor_id=doc_id, case_id=cs_id,
                    treatment_id=sitting.id, treatment_name=tx_name,
                    treatment_completed_date=completed_date, follow_up_date=today,
                    follow_up_type=FollowUpType.TWELVE_MONTH_RECALL.value,
                    status=FollowUpStatus.PENDING.value,
                )
                db.add(fu); created.append(fu)
            if rule.custom_recall_days and rule.custom_recall_days > 0:
                custom_date = completed_date + timedelta(days=rule.custom_recall_days)
                if custom_date <= today:
                    fu = FollowUp(
                        patient_id=pt_id, hospital_id=hosp_id,
                        doctor_id=doc_id, case_id=cs_id,
                        treatment_id=sitting.id, treatment_name=tx_name,
                        treatment_completed_date=completed_date, follow_up_date=today,
                        follow_up_type=FollowUpType.CUSTOM_RECALL.value,
                        status=FollowUpStatus.PENDING.value,
                    )
                    db.add(fu); created.append(fu)
    await db.commit()
    return {"created": len(created)}
