"""
CRM Rules Router — CRUD for the dedicated crm_rules table.

This is the single source of truth for CRM automation rules.
Replaces the old JSON-in-crm_configs approach.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import Optional
import uuid as _uuid

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.crm_rule import CrmRule

router = APIRouter(prefix="/crm/rules", tags=["CRM Rules"])


# ─── Schemas ──────────────────────────────────────────────────────────────

class LeadRuleData(BaseModel):
    name: str
    trigger: str
    wait_time: str
    action: str
    assign_to: str
    send_whatsapp: bool = False
    send_notification: bool = False

class LeadRuleUpdateData(BaseModel):
    name: Optional[str] = None
    trigger: Optional[str] = None
    wait_time: Optional[str] = None
    action: Optional[str] = None
    assign_to: Optional[str] = None
    send_whatsapp: Optional[bool] = None
    send_notification: Optional[bool] = None
    is_active: Optional[bool] = None


class TreatmentRuleData(BaseModel):
    name: str
    treatment_type_id: Optional[str] = None
    trigger: str
    visit: Optional[str] = None
    wait_time: str
    action: str
    assign_to: str
    send_whatsapp: bool = False
    send_notification: bool = False

class TreatmentRuleUpdateData(BaseModel):
    name: Optional[str] = None
    treatment_type_id: Optional[str] = None
    trigger: Optional[str] = None
    visit: Optional[str] = None
    wait_time: Optional[str] = None
    action: Optional[str] = None
    assign_to: Optional[str] = None
    send_whatsapp: Optional[bool] = None
    send_notification: Optional[bool] = None
    is_active: Optional[bool] = None


# ─── Helpers ──────────────────────────────────────────────────────────────

# Frontend → Backend mappings
_LEAD_TRIGGER_FE2BE = {
    "NEW_ENQUIRY": "PATIENT_REGISTERED",
    "MISSED_APPOINTMENT": "APPOINTMENT_MISSED",
    "NO_ACTIVITY": "NO_ACTIVITY",
    "MANUAL": "MANUAL",
}
_LEAD_TRIGGER_BE2FE = {v: k for k, v in _LEAD_TRIGGER_FE2BE.items()}

_LEAD_ACTION_FE2BE = {
    "FOLLOW_UP_ENQUIRY": "GENERAL_FOLLOW_UP",
    "CREATE_REMINDER": "CREATE_REMINDER",
    "NOTIFY_STAFF": "NOTIFY_STAFF",
}
_LEAD_ACTION_BE2FE = {v: k for k, v in _LEAD_ACTION_FE2BE.items()}

_WAIT_TIME_FE2BE = {
    "IMMEDIATELY": (0, "IMMEDIATELY"),
    "1_DAY": (1, "DAYS"),
    "2_DAYS": (2, "DAYS"),
    "3_DAYS": (3, "DAYS"),
    "7_DAYS": (7, "DAYS"),
    "15_DAYS": (15, "DAYS"),
    "30_DAYS": (30, "DAYS"),
    "180_DAYS": (180, "DAYS"),
}
_WAIT_TIME_BE2FE = {
    (0, "IMMEDIATELY"): "IMMEDIATELY",
    (1, "DAYS"): "1_DAY",
    (2, "DAYS"): "2_DAYS",
    (3, "DAYS"): "3_DAYS",
    (7, "DAYS"): "7_DAYS",
    (15, "DAYS"): "15_DAYS",
    (30, "DAYS"): "30_DAYS",
    (180, "DAYS"): "180_DAYS",
}


def _parse_delay(wait_time: str) -> tuple[int, str]:
    """Convert frontend wait_time value like '2_DAYS' to (2, 'DAYS')."""
    if wait_time in _WAIT_TIME_FE2BE:
        return _WAIT_TIME_FE2BE[wait_time]
    parts = wait_time.strip().lower().split()
    if len(parts) < 2:
        return (0, "IMMEDIATELY")
    try:
        value = int(parts[0])
    except ValueError:
        return (0, "IMMEDIATELY")
    unit = parts[1]
    if unit in ("day", "days"):
        return (value, "DAYS")
    if unit in ("week", "weeks"):
        return (value, "WEEKS")
    if unit in ("month", "months"):
        return (value, "MONTHS")
    if unit in ("immediately", "now"):
        return (0, "IMMEDIATELY")
    return (value, "DAYS")


def _to_delay_str(delay_value: int, delay_unit: str) -> str:
    """Convert (2, 'DAYS') → frontend value '2_DAYS'."""
    return _WAIT_TIME_BE2FE.get((delay_value, delay_unit), f"{delay_value}_{delay_unit}")


def _rule_to_dict(r: CrmRule) -> dict:
    if r.rule_type == "LEAD":
        fe_trigger = _LEAD_TRIGGER_BE2FE.get(r.trigger_event, r.trigger_event)
        fe_action = _LEAD_ACTION_BE2FE.get(r.action, r.action)
    else:
        fe_trigger = r.trigger_event
        fe_action = r.action
    return {
        "id": r.id,
        "name": r.rule_name,
        "trigger": fe_trigger,
        "wait_time": _to_delay_str(r.delay_value, r.delay_unit),
        "action": fe_action,
        "assign_to": r.assign_to,
        "send_whatsapp": r.send_whatsapp,
        "send_notification": r.send_notification,
        "is_active": r.is_active,
        "treatment_type_id": r.treatment_type_id,
        "visit": r.visit_stage,
    }


# ═══════════════════════════════════════════════════════════════════════════
# LEAD RULES
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/lead")
async def get_lead_rules(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    result = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.hospital_id == hid, CrmRule.rule_type == "LEAD")
        ).order_by(CrmRule.created_at)
    )
    rules = [_rule_to_dict(r) for r in result.scalars().all()]
    return {"rules": rules}


@router.post("/lead")
async def add_lead_rule(
    data: LeadRuleData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    delay_value, delay_unit = _parse_delay(data.wait_time)
    be_trigger = _LEAD_TRIGGER_FE2BE.get(data.trigger, data.trigger)
    be_action = _LEAD_ACTION_FE2BE.get(data.action, data.action)
    rule = CrmRule(
        id=str(_uuid.uuid4()),
        hospital_id=hid,
        rule_type="LEAD",
        rule_name=data.name,
        trigger_event=be_trigger,
        delay_value=delay_value,
        delay_unit=delay_unit,
        action=be_action,
        assign_to=data.assign_to,
        send_whatsapp=data.send_whatsapp,
        send_notification=data.send_notification,
        is_active=True,
    )
    db.add(rule)
    await db.flush()
    return {"rules": [_rule_to_dict(rule)]}


@router.put("/lead/{rule_id}")
async def update_lead_rule(
    rule_id: str,
    data: LeadRuleUpdateData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    result = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.id == rule_id, CrmRule.hospital_id == hid, CrmRule.rule_type == "LEAD")
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    updates = data.model_dump(exclude_unset=True)
    if "wait_time" in updates:
        dv, du = _parse_delay(updates.pop("wait_time"))
        rule.delay_value = dv
        rule.delay_unit = du
    if "trigger" in updates:
        updates["trigger_event"] = _LEAD_TRIGGER_FE2BE.get(updates.pop("trigger"), "")
    if "action" in updates:
        updates["action"] = _LEAD_ACTION_FE2BE.get(updates["action"], updates["action"])
    for field, value in updates.items():
        setattr(rule, field, value)
    await db.flush()
    return {"rules": [_rule_to_dict(rule)]}


@router.delete("/lead/{rule_id}")
async def delete_lead_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    result = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.id == rule_id, CrmRule.hospital_id == hid, CrmRule.rule_type == "LEAD")
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.flush()
    return {"status": "deleted"}


# ═══════════════════════════════════════════════════════════════════════════
# TREATMENT RULES
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/treatment")
async def get_treatment_rules(
    treatment_type_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    q = select(CrmRule).where(
        and_(CrmRule.hospital_id == hid, CrmRule.rule_type == "TREATMENT")
    ).order_by(CrmRule.created_at)
    if treatment_type_id:
        q = q.where(
            (CrmRule.treatment_type_id == treatment_type_id)
            | (CrmRule.treatment_type_id.is_(None))
        )
    result = await db.execute(q)
    rules = [_rule_to_dict(r) for r in result.scalars().all()]
    return {"rules": rules}


@router.post("/treatment")
async def add_treatment_rule(
    data: TreatmentRuleData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    delay_value, delay_unit = _parse_delay(data.wait_time)
    rule = CrmRule(
        id=str(_uuid.uuid4()),
        hospital_id=hid,
        rule_type="TREATMENT",
        rule_name=data.name,
        trigger_event=data.trigger,
        treatment_type_id=data.treatment_type_id if data.treatment_type_id else None,
        visit_stage=data.visit if data.visit else None,
        delay_value=delay_value,
        delay_unit=delay_unit,
        action=data.action,
        assign_to=data.assign_to,
        send_whatsapp=data.send_whatsapp,
        send_notification=data.send_notification,
        is_active=True,
    )
    db.add(rule)
    await db.flush()
    return {"rules": [_rule_to_dict(rule)]}


@router.put("/treatment/{rule_id}")
async def update_treatment_rule(
    rule_id: str,
    data: TreatmentRuleUpdateData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    result = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.id == rule_id, CrmRule.hospital_id == hid, CrmRule.rule_type == "TREATMENT")
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    updates = data.model_dump(exclude_unset=True)
    if "wait_time" in updates:
        dv, du = _parse_delay(updates.pop("wait_time"))
        rule.delay_value = dv
        rule.delay_unit = du
    for field, value in updates.items():
        setattr(rule, field, value)
    await db.flush()
    return {"rules": [_rule_to_dict(rule)]}


@router.delete("/treatment/{rule_id}")
async def delete_treatment_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    result = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.id == rule_id, CrmRule.hospital_id == hid, CrmRule.rule_type == "TREATMENT")
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.flush()
    return {"status": "deleted"}


# ═══════════════════════════════════════════════════════════════════════════
# TEST / EXECUTE RULES
# ═══════════════════════════════════════════════════════════════════════════

class TestRuleRequest(BaseModel):
    rule_type: str
    trigger: str
    patient_id: str
    treatment_type_id: Optional[str] = None


@router.post("/test")
async def test_execute_rule(
    data: TestRuleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Manually execute CRM rules for testing. Creates real GeneratedEnquiry records."""
    verify_permission(current_user, Permission.MANAGE_LEADS)

    from app.models.patient import Patient
    patient = await db.get(Patient, data.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    hid = current_user.get("hospital_id") or patient.hospital_id
    if not hid:
        raise HTTPException(status_code=400, detail="No hospital_id found")

    event_data = {
        "patient_id": data.patient_id,
        "patient_name": getattr(patient, "full_name", None),
        "doctor_id": current_user.get("sub"),
        "assigned_staff_id": current_user.get("sub"),
        "treatment_type_id": data.treatment_type_id,
        "treatment_name": "",
        "visit_number": 1,
        "total_visits": 1,
        "visit_stage": "ANY",
    }

    from app.crm.services.rule_engine import execute_rules
    be_trigger = _LEAD_TRIGGER_FE2BE.get(data.trigger, data.trigger)
    created = await execute_rules(db, hid, be_trigger, event_data, data.rule_type.upper())
    await db.commit()
    return {"created": created, "count": len(created)}
