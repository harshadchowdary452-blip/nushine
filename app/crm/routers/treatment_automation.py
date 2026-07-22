"""
Treatment-Driven CRM Automation Router

Provides:
- CRUD for Treatment CRM Rules (per treatment type)
- Generated Enquiries listing and dashboard
- Manual trigger endpoints for testing
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from typing import Optional
from datetime import date, timedelta
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission

router = APIRouter(prefix="/crm/treatment-automation", tags=["Treatment Automation"])


# ─── Schemas ──────────────────────────────────────────────────────────────

class TreatmentRuleUpdate(BaseModel):
    # Legacy
    follow_up_1_day: Optional[bool] = None
    follow_up_7_day: Optional[bool] = None
    recall_6_month: Optional[bool] = None
    recall_12_month: Optional[bool] = None
    custom_recall_days: Optional[int] = None
    enquiry_enabled: Optional[bool] = None
    auto_appointment_enabled: Optional[bool] = None
    assigned_doctor_id: Optional[str] = None
    is_active: Optional[bool] = None
    # Visit Rules
    visit_enabled: Optional[bool] = None
    visit_trigger: Optional[str] = None
    visit_specific_number: Optional[int] = None
    visit_delay_days: Optional[int] = None
    visit_enquiry_type: Optional[str] = None
    visit_whatsapp_enabled: Optional[bool] = None
    visit_whatsapp_template_id: Optional[str] = None
    visit_notes: Optional[str] = None
    # Appointment Reminder Rules
    reminder_enabled: Optional[bool] = None
    reminder_days_before: Optional[str] = None
    reminder_whatsapp_enabled: Optional[bool] = None
    reminder_whatsapp_template_id: Optional[str] = None
    reminder_notes: Optional[str] = None
    # Completion Rules
    completion_enabled: Optional[bool] = None
    completion_delay_days: Optional[int] = None
    completion_enquiry_type: Optional[str] = None
    completion_whatsapp_enabled: Optional[bool] = None
    completion_whatsapp_template_id: Optional[str] = None
    completion_notes: Optional[str] = None
    # Recall Rules
    recall_enabled: Optional[bool] = None
    recall_days: Optional[int] = None
    recall_enquiry_type: Optional[str] = None
    recall_whatsapp_enabled: Optional[bool] = None
    recall_whatsapp_template_id: Optional[str] = None
    recall_notes: Optional[str] = None
    # Missed Appointment Rules
    missed_enabled: Optional[bool] = None
    missed_delay_days: Optional[int] = None
    missed_whatsapp_enabled: Optional[bool] = None
    missed_whatsapp_template_id: Optional[str] = None
    missed_notes: Optional[str] = None
    # Auto-Assignment
    auto_assign_role: Optional[str] = None
    priority: Optional[str] = None
    # Templates
    whatsapp_template_id: Optional[str] = None
    email_template_id: Optional[str] = None
    sms_template_id: Optional[str] = None


class TreatmentRuleCreate(BaseModel):
    treatment_type_id: str
    hospital_id: Optional[str] = None
    treatment_name: Optional[str] = None


# ─── Treatment Rules CRUD ─────────────────────────────────────────────────

@router.get("/rules")
async def list_treatment_rules(
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS, Permission.VIEW_LEADS)
    from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
    q = select(TreatmentFollowUpRule)
    hid = hospital_id or current_user.get("hospital_id")
    if hid:
        q = q.where(TreatmentFollowUpRule.hospital_id == hid)
    q = q.order_by(TreatmentFollowUpRule.treatment_name)
    result = await db.execute(q)
    rules = result.scalars().all()
    return [rule_to_dict(r) for r in rules]


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_or_get_treatment_rule(
    data: TreatmentRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
    from app.models.treatment_type import TreatmentType
    hid = data.hospital_id or current_user.get("hospital_id")
    if not hid:
        raise HTTPException(status_code=400, detail="hospital_id is required")

    # Check if rule already exists for this treatment type + hospital
    existing = (await db.execute(
        select(TreatmentFollowUpRule).where(
            and_(
                TreatmentFollowUpRule.treatment_type_id == data.treatment_type_id,
                TreatmentFollowUpRule.hospital_id == hid,
            )
        ).limit(1)
    )).scalar_one_or_none()
    if existing:
        return rule_to_dict(existing)

    # Get treatment name from master
    tt = await db.get(TreatmentType, data.treatment_type_id)
    name = data.treatment_name or (tt.name if tt else "Unknown Treatment")

    rule = TreatmentFollowUpRule(
        hospital_id=hid,
        treatment_type_id=data.treatment_type_id,
        treatment_name=name,
        is_active=True,
    )
    db.add(rule)
    await db.flush()
    return rule_to_dict(rule)


@router.put("/rules/{rule_id}")
async def update_treatment_rule(
    rule_id: str,
    data: TreatmentRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
    rule = await db.get(TreatmentFollowUpRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await db.flush()
    return rule_to_dict(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_treatment_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
    rule = await db.get(TreatmentFollowUpRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.flush()


@router.post("/rules/{rule_id}/toggle")
async def toggle_treatment_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
    rule = await db.get(TreatmentFollowUpRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.is_active = not rule.is_active
    await db.flush()
    return rule_to_dict(rule)


# ─── Generated Enquiries ──────────────────────────────────────────────────

@router.get("/generated-enquiries")
async def list_generated_enquiries(
    hospital_id: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    enquiry_type: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from app.models.generated_enquiry import GeneratedEnquiry
    q = select(GeneratedEnquiry)
    hid = hospital_id or current_user.get("hospital_id")
    if hid:
        q = q.where(GeneratedEnquiry.hospital_id == hid)
    if patient_id:
        q = q.where(GeneratedEnquiry.patient_id == patient_id)
    if status_filter:
        q = q.where(GeneratedEnquiry.status == status_filter)
    if enquiry_type:
        q = q.where(GeneratedEnquiry.enquiry_type == enquiry_type)
    if from_date:
        q = q.where(GeneratedEnquiry.due_date >= from_date)
    if to_date:
        q = q.where(GeneratedEnquiry.due_date <= to_date)
    q = q.order_by(desc(GeneratedEnquiry.due_date)).offset(skip).limit(limit)
    result = await db.execute(q)
    items = result.scalars().all()
    return [enquiry_to_dict(e) for e in items]


@router.get("/generated-enquiries/dashboard")
async def generated_enquiries_dashboard(
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from app.models.generated_enquiry import GeneratedEnquiry
    hid = hospital_id or current_user.get("hospital_id")
    base_q = select(GeneratedEnquiry)
    if hid:
        base_q = base_q.where(GeneratedEnquiry.hospital_id == hid)

    today = date.today()

    # Counts by status
    status_q = select(GeneratedEnquiry.status, func.count()).group_by(GeneratedEnquiry.status)
    if hid:
        status_q = status_q.where(GeneratedEnquiry.hospital_id == hid)
    status_result = await db.execute(status_q)
    by_status = {row[0]: row[1] for row in status_result.all()}

    # Today's due
    today_q = select(func.count()).select_from(GeneratedEnquiry).where(
        and_(GeneratedEnquiry.due_date == today, GeneratedEnquiry.status == "PENDING")
    )
    if hid:
        today_q = today_q.where(GeneratedEnquiry.hospital_id == hid)
    today_count = (await db.execute(today_q)).scalar() or 0

    # Overdue
    overdue_q = select(func.count()).select_from(GeneratedEnquiry).where(
        and_(GeneratedEnquiry.due_date < today, GeneratedEnquiry.status == "PENDING")
    )
    if hid:
        overdue_q = overdue_q.where(GeneratedEnquiry.hospital_id == hid)
    overdue_count = (await db.execute(overdue_q)).scalar() or 0

    # By enquiry type
    type_q = select(GeneratedEnquiry.enquiry_type, func.count()).group_by(GeneratedEnquiry.enquiry_type)
    if hid:
        type_q = type_q.where(GeneratedEnquiry.hospital_id == hid)
    type_result = await db.execute(type_q)
    by_type = {row[0]: row[1] for row in type_result.all()}

    # By trigger event
    trigger_q = select(GeneratedEnquiry.trigger_event, func.count()).group_by(GeneratedEnquiry.trigger_event)
    if hid:
        trigger_q = trigger_q.where(GeneratedEnquiry.hospital_id == hid)
    trigger_result = await db.execute(trigger_q)
    by_trigger = {row[0]: row[1] for row in trigger_result.all()}

    return {
        "by_status": by_status,
        "today_due": today_count,
        "overdue": overdue_count,
        "by_enquiry_type": by_type,
        "by_trigger_event": by_trigger,
        "total": sum(by_status.values()),
    }


# ─── Helpers ──────────────────────────────────────────────────────────────

def rule_to_dict(rule) -> dict:
    return {
        "id": rule.id,
        "hospital_id": rule.hospital_id,
        "treatment_name": rule.treatment_name,
        "treatment_type_id": rule.treatment_type_id,
        "is_active": rule.is_active,
        # Legacy
        "follow_up_1_day": rule.follow_up_1_day,
        "follow_up_7_day": rule.follow_up_7_day,
        "recall_6_month": rule.recall_6_month,
        "recall_12_month": rule.recall_12_month,
        "custom_recall_days": rule.custom_recall_days,
        "enquiry_enabled": rule.enquiry_enabled,
        "auto_appointment_enabled": rule.auto_appointment_enabled,
        "assigned_doctor_id": rule.assigned_doctor_id,
        # Visit Rules
        "visit_enabled": rule.visit_enabled,
        "visit_trigger": rule.visit_trigger,
        "visit_specific_number": rule.visit_specific_number,
        "visit_delay_days": rule.visit_delay_days,
        "visit_enquiry_type": rule.visit_enquiry_type,
        "visit_whatsapp_enabled": rule.visit_whatsapp_enabled,
        "visit_whatsapp_template_id": rule.visit_whatsapp_template_id,
        "visit_notes": rule.visit_notes,
        # Appointment Reminder
        "reminder_enabled": rule.reminder_enabled,
        "reminder_days_before": rule.reminder_days_before,
        "reminder_whatsapp_enabled": rule.reminder_whatsapp_enabled,
        "reminder_whatsapp_template_id": rule.reminder_whatsapp_template_id,
        "reminder_notes": rule.reminder_notes,
        # Completion
        "completion_enabled": rule.completion_enabled,
        "completion_delay_days": rule.completion_delay_days,
        "completion_enquiry_type": rule.completion_enquiry_type,
        "completion_whatsapp_enabled": rule.completion_whatsapp_enabled,
        "completion_whatsapp_template_id": rule.completion_whatsapp_template_id,
        "completion_notes": rule.completion_notes,
        # Recall
        "recall_enabled": rule.recall_enabled,
        "recall_days": rule.recall_days,
        "recall_enquiry_type": rule.recall_enquiry_type,
        "recall_whatsapp_enabled": rule.recall_whatsapp_enabled,
        "recall_whatsapp_template_id": rule.recall_whatsapp_template_id,
        "recall_notes": rule.recall_notes,
        # Missed
        "missed_enabled": rule.missed_enabled,
        "missed_delay_days": rule.missed_delay_days,
        "missed_whatsapp_enabled": rule.missed_whatsapp_enabled,
        "missed_whatsapp_template_id": rule.missed_whatsapp_template_id,
        "missed_notes": rule.missed_notes,
        # Assignment
        "auto_assign_role": rule.auto_assign_role,
        "priority": rule.priority,
        # Templates
        "whatsapp_template_id": rule.whatsapp_template_id,
        "email_template_id": rule.email_template_id,
        "sms_template_id": rule.sms_template_id,
        # Audit
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


def enquiry_to_dict(e) -> dict:
    return {
        "id": e.id,
        "hospital_id": e.hospital_id,
        "patient_id": e.patient_id,
        "treatment_plan_id": e.treatment_plan_id,
        "treatment_type_id": e.treatment_type_id,
        "appointment_id": e.appointment_id,
        "doctor_id": e.doctor_id,
        "assigned_staff_id": e.assigned_staff_id,
        "rule_id": e.rule_id,
        "trigger_event": e.trigger_event,
        "treatment_name": e.treatment_name,
        "visit_number": e.visit_number,
        "total_visits": e.total_visits,
        "visit_stage": e.visit_stage,
        "enquiry_type": e.enquiry_type,
        "notes": e.notes,
        "due_date": e.due_date.isoformat() if e.due_date else None,
        "priority": e.priority,
        "follow_up_id": e.follow_up_id,
        "status": e.status,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
