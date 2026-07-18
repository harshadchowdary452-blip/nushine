import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, date, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.follow_up_template import FollowUpTemplate
from app.models.automation_rule import AutomationRule
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType
from app.models.patient import Patient
from app.models.communication_log import CommunicationLog, CommunicationChannel
from app.models.appointment import Appointment, AppointmentStatus
from app.models.billing import Billing
from app.services.timeline_helper import record_timeline_event

logger = logging.getLogger("crm-v2-router")

router = APIRouter(prefix="/crm", tags=["CRM V2"])


def _verify_hospital_access(entity, current_user):
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        entity_hid = getattr(entity, "hospital_id", None)
        user_hid = current_user.get("hospital_id")
        if entity_hid and user_hid and str(entity_hid) != str(user_hid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: entity belongs to another hospital")


def _hospital_filter(current_user):
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        return current_user.get("hospital_id")
    return None


# ============================================================
# Schemas
# ============================================================

class FollowUpTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    procedure: Optional[str] = None
    trigger_event: str = Field(default="TREATMENT_COMPLETED", max_length=50)
    delay_days: int = 0
    follow_up_type: str = "CUSTOM_FOLLOW_UP"
    reminder_channel: str = "WHATSAPP"
    priority: str = "MEDIUM"
    responsible_role: Optional[str] = None
    max_retries: int = 1
    escalation_days: Optional[int] = None
    escalation_role: Optional[str] = None
    notes: Optional[str] = None


class FollowUpTemplateUpdate(BaseModel):
    name: Optional[str] = None
    procedure: Optional[str] = None
    trigger_event: Optional[str] = None
    delay_days: Optional[int] = None
    follow_up_type: Optional[str] = None
    reminder_channel: Optional[str] = None
    priority: Optional[str] = None
    responsible_role: Optional[str] = None
    max_retries: Optional[int] = None
    escalation_days: Optional[int] = None
    escalation_role: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    trigger_event: str = Field(..., max_length=50)
    procedure: Optional[str] = None
    delay_days: int = 0
    channel: str = "WHATSAPP"
    priority: str = "MEDIUM"
    assigned_role: Optional[str] = None
    template_id: Optional[str] = None
    message_template: Optional[str] = None
    repeat_count: int = 1
    max_attempts: int = 3
    stop_conditions: Optional[str] = None


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    trigger_event: Optional[str] = None
    procedure: Optional[str] = None
    delay_days: Optional[int] = None
    channel: Optional[str] = None
    priority: Optional[str] = None
    assigned_role: Optional[str] = None
    template_id: Optional[str] = None
    message_template: Optional[str] = None
    repeat_count: Optional[int] = None
    max_attempts: Optional[int] = None
    stop_conditions: Optional[str] = None
    is_active: Optional[bool] = None


class EscalateFollowUpRequest(BaseModel):
    escalate_to: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


# ============================================================
# Follow-Up Templates CRUD
# ============================================================

@router.get("/templates/follow-up", tags=["CRM V2 - Templates"])
async def list_follow_up_templates(
    hospital_id: Optional[str] = Query(None),
    procedure: Optional[str] = Query(None),
    trigger_event: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    query = select(FollowUpTemplate)
    scoped_hospital = _hospital_filter(current_user)
    if scoped_hospital:
        query = query.where(FollowUpTemplate.hospital_id == scoped_hospital)
    elif hospital_id:
        query = query.where(FollowUpTemplate.hospital_id == hospital_id)
    if procedure:
        query = query.where(FollowUpTemplate.procedure.ilike(f"%{procedure}%"))
    if trigger_event:
        query = query.where(FollowUpTemplate.trigger_event == trigger_event)
    query = query.order_by(desc(FollowUpTemplate.created_at))
    result = await db.execute(query)
    items = result.scalars().all()
    return {"items": [{
        "id": str(t.id), "hospital_id": str(t.hospital_id) if t.hospital_id else None,
        "name": t.name, "procedure": t.procedure,
        "trigger_event": t.trigger_event, "delay_days": t.delay_days,
        "follow_up_type": t.follow_up_type, "reminder_channel": t.reminder_channel,
        "priority": t.priority, "responsible_role": t.responsible_role,
        "max_retries": t.max_retries, "escalation_days": t.escalation_days,
        "escalation_role": t.escalation_role, "notes": t.notes,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    } for t in items], "total": len(items)}


@router.post("/templates/follow-up", status_code=status.HTTP_201_CREATED, tags=["CRM V2 - Templates"])
async def create_follow_up_template(
    req: FollowUpTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    template = FollowUpTemplate(
        hospital_id=hospital_id,
        name=req.name, procedure=req.procedure,
        trigger_event=req.trigger_event, delay_days=req.delay_days,
        follow_up_type=req.follow_up_type, reminder_channel=req.reminder_channel,
        priority=req.priority, responsible_role=req.responsible_role,
        max_retries=req.max_retries, escalation_days=req.escalation_days,
        escalation_role=req.escalation_role, notes=req.notes,
    )
    db.add(template)
    await db.flush()
    await db.commit()
    return {"success": True, "id": str(template.id)}


@router.get("/templates/follow-up/{template_id}", tags=["CRM V2 - Templates"])
async def get_follow_up_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    template = await db.get(FollowUpTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Follow-up template not found")
    _verify_hospital_access(template, current_user)
    return {
        "id": str(template.id), "hospital_id": str(template.hospital_id) if template.hospital_id else None,
        "name": template.name, "procedure": template.procedure,
        "trigger_event": template.trigger_event, "delay_days": template.delay_days,
        "follow_up_type": template.follow_up_type, "reminder_channel": template.reminder_channel,
        "priority": template.priority, "responsible_role": template.responsible_role,
        "max_retries": template.max_retries, "escalation_days": template.escalation_days,
        "escalation_role": template.escalation_role, "notes": template.notes,
        "is_active": template.is_active,
        "created_at": template.created_at.isoformat() if template.created_at else None,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
    }


@router.put("/templates/follow-up/{template_id}", tags=["CRM V2 - Templates"])
async def update_follow_up_template(
    template_id: str,
    req: FollowUpTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    template = await db.get(FollowUpTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Follow-up template not found")
    _verify_hospital_access(template, current_user)
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    await db.commit()
    return {"success": True}


@router.delete("/templates/follow-up/{template_id}", tags=["CRM V2 - Templates"])
async def delete_follow_up_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    template = await db.get(FollowUpTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Follow-up template not found")
    _verify_hospital_access(template, current_user)
    await db.delete(template)
    await db.commit()
    return {"success": True}


# ============================================================
# Automation Rules CRUD
# ============================================================

@router.get("/automation-rules", tags=["CRM V2 - Automation"])
async def list_automation_rules(
    hospital_id: Optional[str] = Query(None),
    trigger_event: Optional[str] = Query(None),
    procedure: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    query = select(AutomationRule)
    scoped_hospital = _hospital_filter(current_user)
    if scoped_hospital:
        query = query.where(AutomationRule.hospital_id == scoped_hospital)
    elif hospital_id:
        query = query.where(AutomationRule.hospital_id == hospital_id)
    if trigger_event:
        query = query.where(AutomationRule.trigger_event == trigger_event)
    if procedure:
        query = query.where(AutomationRule.procedure.ilike(f"%{procedure}%"))
    query = query.order_by(desc(AutomationRule.created_at))
    result = await db.execute(query)
    items = result.scalars().all()
    return {"items": [{
        "id": str(r.id), "hospital_id": str(r.hospital_id) if r.hospital_id else None,
        "name": r.name, "trigger_event": r.trigger_event,
        "procedure": r.procedure, "delay_days": r.delay_days,
        "channel": r.channel, "priority": r.priority,
        "assigned_role": r.assigned_role,
        "template_id": str(r.template_id) if r.template_id else None,
        "message_template": r.message_template,
        "repeat_count": r.repeat_count, "max_attempts": r.max_attempts,
        "stop_conditions": r.stop_conditions, "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    } for r in items], "total": len(items)}


@router.post("/automation-rules", status_code=status.HTTP_201_CREATED, tags=["CRM V2 - Automation"])
async def create_automation_rule(
    req: AutomationRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    rule = AutomationRule(
        hospital_id=hospital_id,
        name=req.name, trigger_event=req.trigger_event,
        procedure=req.procedure, delay_days=req.delay_days,
        channel=req.channel, priority=req.priority,
        assigned_role=req.assigned_role,
        template_id=req.template_id, message_template=req.message_template,
        repeat_count=req.repeat_count, max_attempts=req.max_attempts,
        stop_conditions=req.stop_conditions,
    )
    db.add(rule)
    await db.flush()
    await db.commit()
    return {"success": True, "id": str(rule.id)}


@router.get("/automation-rules/{rule_id}", tags=["CRM V2 - Automation"])
async def get_automation_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    _verify_hospital_access(rule, current_user)
    return {
        "id": str(rule.id), "hospital_id": str(rule.hospital_id) if rule.hospital_id else None,
        "name": rule.name, "trigger_event": rule.trigger_event,
        "procedure": rule.procedure, "delay_days": rule.delay_days,
        "channel": rule.channel, "priority": rule.priority,
        "assigned_role": rule.assigned_role,
        "template_id": str(rule.template_id) if rule.template_id else None,
        "message_template": rule.message_template,
        "repeat_count": rule.repeat_count, "max_attempts": rule.max_attempts,
        "stop_conditions": rule.stop_conditions, "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


@router.put("/automation-rules/{rule_id}", tags=["CRM V2 - Automation"])
async def update_automation_rule(
    rule_id: str,
    req: AutomationRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    _verify_hospital_access(rule, current_user)
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await db.commit()
    return {"success": True}


@router.delete("/automation-rules/{rule_id}", tags=["CRM V2 - Automation"])
async def delete_automation_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    _verify_hospital_access(rule, current_user)
    await db.delete(rule)
    await db.commit()
    return {"success": True}


@router.post("/automation-rules/{rule_id}/toggle", tags=["CRM V2 - Automation"])
async def toggle_automation_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")
    _verify_hospital_access(rule, current_user)
    rule.is_active = not rule.is_active
    await db.commit()
    return {"success": True, "is_active": rule.is_active}


# ============================================================
# Enhanced Follow-ups
# ============================================================

@router.get("/follow-ups/dashboard", tags=["CRM V2 - Dashboard"])
async def get_crm_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = _hospital_filter(current_user)
    today = date.today()
    today_start = datetime.combine(today, time.min, tzinfo=timezone.utc)
    today_end = datetime.combine(today, time.max, tzinfo=timezone.utc)
    month_start = today.replace(day=1)

    def fu_filter(query):
        if hospital_id:
            return query.where(FollowUp.hospital_id == hospital_id)
        return query

    def appt_filter(query):
        if hospital_id:
            return query.where(
                and_(
                    Appointment.patient_id.in_(
                        select(Patient.id).where(Patient.hospital_id == hospital_id)
                    )
                )
            )
        return query

    def patient_filter(query):
        if hospital_id:
            return query.where(Patient.hospital_id == hospital_id)
        return query

    # Today's follow-ups
    q_today = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.follow_up_date == today
    ))
    today_follow_ups = (await db.execute(q_today)).scalar() or 0

    # Upcoming follow-ups (after today)
    q_upcoming = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.follow_up_date > today,
        FollowUp.status.in_(["PENDING", "CONTACTED", "RESCHEDULED", "SCHEDULED", "OPEN"])
    ))
    upcoming_follow_ups = (await db.execute(q_upcoming)).scalar() or 0

    # Overdue follow-ups (before today, still pending)
    q_overdue = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.follow_up_date < today,
        FollowUp.status.in_(["PENDING", "CONTACTED", "RESCHEDULED", "SCHEDULED", "OPEN", "NO_RESPONSE", "OVERDUE"])
    ))
    overdue_follow_ups = (await db.execute(q_overdue)).scalar() or 0

    # Completed today
    q_completed = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.status == "COMPLETED",
        FollowUp.completed_date >= today_start,
        FollowUp.completed_date <= today_end,
    ))
    completed_today = (await db.execute(q_completed)).scalar() or 0

    # Pending calls (PHONE channel + PENDING status)
    q_calls = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.contact_channel == "PHONE",
        FollowUp.status == "PENDING"
    ))
    pending_calls = (await db.execute(q_calls)).scalar() or 0

    # Pending WhatsApp
    q_wa = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.contact_channel == "WHATSAPP",
        FollowUp.status == "PENDING"
    ))
    pending_whatsapp = (await db.execute(q_wa)).scalar() or 0

    # Pending Email
    q_em = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.contact_channel == "EMAIL",
        FollowUp.status == "PENDING"
    ))
    pending_email = (await db.execute(q_em)).scalar() or 0

    # Missed appointments today
    q_missed_appt = select(func.count(Appointment.id)).where(
        Appointment.appointment_date == today,
        Appointment.status == AppointmentStatus.CANCELLED.value,
    )
    if hospital_id:
        q_missed_appt = q_missed_appt.where(
            Appointment.patient_id.in_(
                select(Patient.id).where(Patient.hospital_id == hospital_id)
            )
        )
    missed_appointments = (await db.execute(q_missed_appt)).scalar() or 0

    # Inactive patients (no visit in 90 days)
    ninety_days_ago = today - timedelta(days=90)
    q_inactive = patient_filter(select(func.count(Patient.id)).where(
        Patient.is_active == True,
        Patient.updated_at < datetime.combine(ninety_days_ago, time.min, tzinfo=timezone.utc),
    ))
    inactive_patients = (await db.execute(q_inactive)).scalar() or 0

    # Patients due for recall
    q_recall = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.follow_up_type.ilike("%RECALL%"),
        FollowUp.follow_up_date >= today,
        FollowUp.follow_up_date <= today + timedelta(days=30),
        FollowUp.status.in_(["PENDING", "SCHEDULED", "OPEN"])
    ))
    patients_due_for_recall = (await db.execute(q_recall)).scalar() or 0

    # Outstanding payments (billings with pending_amount > 0)
    q_payments = select(func.count(Billing.id)).where(Billing.pending_amount > 0)
    if hospital_id:
        q_payments = q_payments.where(
            Billing.case_id.in_(
                select("cases.id").where(
                    "cases.patient_id.in_",
                    select(Patient.id).where(Patient.hospital_id == hospital_id)
                )
            )
        )
    try:
        outstanding_payments = (await db.execute(q_payments)).scalar() or 0
    except Exception:
        outstanding_payments = 0

    # Monthly completion rate
    q_month_total = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.created_at >= datetime.combine(month_start, time.min, tzinfo=timezone.utc)
    ))
    q_month_completed = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.status == "COMPLETED",
        FollowUp.created_at >= datetime.combine(month_start, time.min, tzinfo=timezone.utc)
    ))
    month_total = (await db.execute(q_month_total)).scalar() or 0
    month_completed = (await db.execute(q_month_completed)).scalar() or 0
    monthly_completion_rate = round(month_completed / month_total * 100, 1) if month_total else 0.0

    # Recent 10 follow-ups
    q_recent = fu_filter(select(FollowUp).order_by(desc(FollowUp.created_at)).limit(10))
    recent_result = await db.execute(q_recent)
    recent_follow_ups_raw = recent_result.scalars().all()
    recent_follow_ups = []
    for fu in recent_follow_ups_raw:
        patient_name = None
        if fu.patient_id:
            pat = await db.get(Patient, fu.patient_id)
            if pat:
                patient_name = pat.full_name
        recent_follow_ups.append({
            "id": str(fu.id), "patient_id": str(fu.patient_id),
            "patient_name": patient_name,
            "follow_up_date": fu.follow_up_date.isoformat(),
            "follow_up_time": str(fu.follow_up_time) if fu.follow_up_time else None,
            "status": fu.status, "follow_up_type": fu.follow_up_type,
            "contact_channel": fu.contact_channel,
            "created_at": fu.created_at.isoformat() if fu.created_at else None,
        })

    # By status
    q_by_status = fu_filter(select(FollowUp.status, func.count(FollowUp.id)).group_by(FollowUp.status))
    by_status_result = await db.execute(q_by_status)
    by_status = {row[0]: row[1] for row in by_status_result.all()}

    # By channel
    q_by_channel = fu_filter(select(FollowUp.contact_channel, func.count(FollowUp.id)).where(
        FollowUp.contact_channel.isnot(None)
    ).group_by(FollowUp.contact_channel))
    by_channel_result = await db.execute(q_by_channel)
    by_channel = {row[0]: row[1] for row in by_channel_result.all()}

    return {
        "today_follow_ups": today_follow_ups,
        "upcoming_follow_ups": upcoming_follow_ups,
        "overdue_follow_ups": overdue_follow_ups,
        "completed_today": completed_today,
        "pending_calls": pending_calls,
        "pending_whatsapp": pending_whatsapp,
        "pending_email": pending_email,
        "missed_appointments": missed_appointments,
        "inactive_patients": inactive_patients,
        "patients_due_for_recall": patients_due_for_recall,
        "outstanding_payments": outstanding_payments,
        "monthly_completion_rate": monthly_completion_rate,
        "recent_follow_ups": recent_follow_ups,
        "by_status": by_status,
        "by_channel": by_channel,
    }


@router.post("/follow-ups/{follow_up_id}/escalate", tags=["CRM V2 - Follow-ups"])
async def escalate_follow_up(
    follow_up_id: str,
    req: EscalateFollowUpRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _verify_hospital_access(fu, current_user)

    if fu.status == FollowUpStatus.ESCALATED.value:
        raise HTTPException(status_code=400, detail="Follow-up is already escalated")

    previous_status = fu.status
    fu.status = FollowUpStatus.ESCALATED.value
    fu.last_contact_date = datetime.now(timezone.utc)

    if req.notes:
        fu.staff_notes = (fu.staff_notes or "") + f"\n[ESCALATION] {req.notes}"
    if req.escalate_to:
        fu.doctor_id = req.escalate_to
    if req.reason:
        fu.response_summary = f"Escalated: {req.reason}"

    patient_id = fu.patient_id
    await db.commit()

    escalation_detail = f"Follow-up escalated from {previous_status}"
    if req.reason:
        escalation_detail += f" — Reason: {req.reason}"
    if req.escalate_to:
        escalation_detail += f" — Assigned to: {req.escalate_to}"

    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Follow-Up Escalated",
        description=escalation_detail,
        module="CRM",
    )
    return {"success": True, "status": fu.status}


@router.get("/follow-ups/patient/{patient_id}", tags=["CRM V2 - Follow-ups"])
async def get_patient_crm_timeline(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    _verify_hospital_access(patient, current_user)

    patient_details = {
        "id": str(patient.id), "full_name": patient.full_name,
        "phone": patient.phone, "email": patient.email,
        "status": patient.status.value if hasattr(patient.status, 'value') else patient.status,
        "hospital_id": str(patient.hospital_id) if patient.hospital_id else None,
        "doctor_id": str(patient.doctor_id) if patient.doctor_id else None,
    }

    # All follow-ups
    q_fu = select(FollowUp).where(FollowUp.patient_id == patient_id).order_by(desc(FollowUp.follow_up_date))
    fu_result = await db.execute(q_fu)
    follow_ups_raw = fu_result.scalars().all()
    follow_ups = []
    for fu in follow_ups_raw:
        follow_ups.append({
            "id": str(fu.id),
            "follow_up_date": fu.follow_up_date.isoformat(),
            "follow_up_time": str(fu.follow_up_time) if fu.follow_up_time else None,
            "status": fu.status, "follow_up_type": fu.follow_up_type,
            "notes": fu.notes, "patient_feedback": fu.patient_feedback,
            "response_status": fu.response_status,
            "response_summary": fu.response_summary,
            "contact_channel": fu.contact_channel,
            "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
            "created_at": fu.created_at.isoformat() if fu.created_at else None,
            "type": "follow_up",
            "sort_date": fu.created_at.isoformat() if fu.created_at else fu.follow_up_date.isoformat(),
        })

    # All communication logs
    q_comm = select(CommunicationLog).where(CommunicationLog.patient_id == patient_id).order_by(desc(CommunicationLog.created_at))
    comm_result = await db.execute(q_comm)
    comms_raw = comm_result.scalars().all()
    communications = []
    for c in comms_raw:
        communications.append({
            "id": str(c.id),
            "channel": c.channel, "message_type": c.message_type,
            "subject": c.subject, "message": c.message,
            "status": c.status,
            "sent_at": c.sent_at.isoformat() if c.sent_at else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "type": "communication",
            "sort_date": c.created_at.isoformat() if c.created_at else None,
        })

    # Combined timeline
    timeline = follow_ups + communications
    timeline.sort(key=lambda x: x.get("sort_date") or "", reverse=True)

    return {
        "patient": patient_details,
        "follow_ups": follow_ups,
        "communications": communications,
        "timeline": timeline,
    }


# ============================================================
# Reports
# ============================================================

@router.get("/reports/performance", tags=["CRM V2 - Reports"])
async def get_performance_report(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    doctor_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = _hospital_filter(current_user)
    today = date.today()
    date_start = date.fromisoformat(start_date) if start_date else today.replace(day=1)
    date_end = date.fromisoformat(end_date) if end_date else today

    def fu_filter(q):
        if hospital_id:
            q = q.where(FollowUp.hospital_id == hospital_id)
        if doctor_id:
            q = q.where(FollowUp.doctor_id == doctor_id)
        return q

    # Total follow-ups in period
    q_total = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    ))
    total = (await db.execute(q_total)).scalar() or 0

    # Completed
    q_completed = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.status == "COMPLETED",
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    ))
    completed = (await db.execute(q_completed)).scalar() or 0

    # Pending
    q_pending = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.status == "PENDING",
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    ))
    pending = (await db.execute(q_pending)).scalar() or 0

    # Overdue
    q_overdue = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.follow_up_date < today,
        FollowUp.status.in_(["PENDING", "NO_RESPONSE", "OVERDUE"]),
        FollowUp.follow_up_date >= date_start,
    ))
    overdue = (await db.execute(q_overdue)).scalar() or 0

    # Escalated
    q_escalated = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.status == "ESCALATED",
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    ))
    escalated = (await db.execute(q_escalated)).scalar() or 0

    # Lost
    q_lost = fu_filter(select(func.count(FollowUp.id)).where(
        FollowUp.status == "LOST",
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    ))
    lost = (await db.execute(q_lost)).scalar() or 0

    # By type
    q_by_type = fu_filter(select(FollowUp.follow_up_type, func.count(FollowUp.id)).where(
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    ).group_by(FollowUp.follow_up_type))
    by_type_result = await db.execute(q_by_type)
    by_type = {row[0]: row[1] for row in by_type_result.all()}

    # By status
    q_by_status = fu_filter(select(FollowUp.status, func.count(FollowUp.id)).where(
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    ).group_by(FollowUp.status))
    by_status_result = await db.execute(q_by_status)
    by_status = {row[0]: row[1] for row in by_status_result.all()}

    completion_rate = round(completed / total * 100, 1) if total else 0.0

    return {
        "period": {"start_date": date_start.isoformat(), "end_date": date_end.isoformat()},
        "total_follow_ups": total,
        "completed": completed,
        "pending": pending,
        "overdue": overdue,
        "escalated": escalated,
        "lost": lost,
        "completion_rate": completion_rate,
        "by_type": by_type,
        "by_status": by_status,
    }


@router.get("/reports/recall-effectiveness", tags=["CRM V2 - Reports"])
async def get_recall_effectiveness_report(
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = _hospital_filter(current_user)
    today = date.today()
    date_start = date.fromisoformat(start_date) if start_date else today.replace(day=1)
    date_end = date.fromisoformat(end_date) if end_date else today

    base_q = select(FollowUp).where(
        FollowUp.follow_up_type.ilike("%RECALL%"),
        FollowUp.follow_up_date >= date_start,
        FollowUp.follow_up_date <= date_end,
    )
    if hospital_id:
        base_q = base_q.where(FollowUp.hospital_id == hospital_id)

    result = await db.execute(base_q)
    recall_items = result.scalars().all()
    total = len(recall_items)

    completed = sum(1 for r in recall_items if r.status == "COMPLETED")
    appointment_booked = sum(1 for r in recall_items if r.status == "APPOINTMENT_BOOKED")
    pending = sum(1 for r in recall_items if r.status == "PENDING")
    no_response = sum(1 for r in recall_items if r.status == "NO_RESPONSE")
    lost = sum(1 for r in recall_items if r.status == "LOST")

    appointment_rate = round(appointment_booked / total * 100, 1) if total else 0.0
    completion_rate = round(completed / total * 100, 1) if total else 0.0
    response_rate = round((completed + appointment_booked) / total * 100, 1) if total else 0.0

    # By type breakdown
    six_month = sum(1 for r in recall_items if r.follow_up_type == "6_MONTH_RECALL")
    twelve_month = sum(1 for r in recall_items if r.follow_up_type == "12_MONTH_RECALL")
    custom = sum(1 for r in recall_items if r.follow_up_type == "CUSTOM_RECALL")

    # By channel
    by_channel = {}
    for r in recall_items:
        ch = r.contact_channel or "UNKNOWN"
        by_channel[ch] = by_channel.get(ch, 0) + 1

    return {
        "period": {"start_date": date_start.isoformat(), "end_date": date_end.isoformat()},
        "total_recalls": total,
        "completed": completed,
        "appointment_booked": appointment_booked,
        "pending": pending,
        "no_response": no_response,
        "lost": lost,
        "completion_rate": completion_rate,
        "appointment_booking_rate": appointment_rate,
        "response_rate": response_rate,
        "by_type": {
            "6_MONTH_RECALL": six_month,
            "12_MONTH_RECALL": twelve_month,
            "CUSTOM_RECALL": custom,
        },
        "by_channel": by_channel,
    }
