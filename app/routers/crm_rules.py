"""
CRM Rules Router — Policy-based CRM configuration.

Hospital administrators configure TIMELINE POLICIES, not technical rules.
The rule engine reads CrmRule rows; this router manages them at policy level.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, not_
from pydantic import BaseModel
from typing import Optional
import uuid as _uuid

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.crm_rule import CrmRule

router = APIRouter(prefix="/crm/rules", tags=["CRM Rules"])


async def _safe_delete_rule(db: AsyncSession, rule) -> None:
    """Delete a CrmRule after nullifying FK references in GeneratedEnquiry."""
    from app.models.generated_enquiry import GeneratedEnquiry
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(GeneratedEnquiry)
        .where(GeneratedEnquiry.crm_rule_id == rule.id)
        .values(crm_rule_id=None)
    )
    await db.delete(rule)


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
        "scope": getattr(r, "scope", "VISIT"),
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
        scope="LEAD",
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
    await _safe_delete_rule(db, rule)
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
    trigger = data.trigger
    scope = "VISIT"
    if trigger == "APPOINTMENT_CREATED":
        scope = "APPOINTMENT"
    elif trigger in ("TREATMENT_COMPLETED", "TREATMENT_COMPLETED_RECALL"):
        scope = "CASE"
    rule = CrmRule(
        id=str(_uuid.uuid4()),
        hospital_id=hid,
        rule_type="TREATMENT",
        scope=scope,
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
    await _safe_delete_rule(db, rule)
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

    from app.crm.services.event_dispatcher import publish_event
    be_trigger = _LEAD_TRIGGER_FE2BE.get(data.trigger, data.trigger)
    result = await publish_event(
        event_type=be_trigger,
        source_module="CRM_RULES",
        entity_type="PATIENT",
        entity_id=data.patient_id,
        hospital_id=hid,
        patient_id=data.patient_id,
        doctor_id=current_user.get("sub"),
        triggered_by=str(current_user.get("sub")),
        payload=event_data,
        db=db,
    )
    await db.commit()
    return {"created": result.get("decisions", []), "count": len(result.get("decisions", []))}


# ═══════════════════════════════════════════════════════════════════════════
# POLICY ENDPOINTS — Hospital admin configures policies, not rules
# ═══════════════════════════════════════════════════════════════════════════

class LeadFollowUpStep(BaseModel):
    delay_days: int = 2
    enabled: bool = True
    send_whatsapp: bool = True
    send_notification: bool = True

class LeadPolicyData(BaseModel):
    follow_ups: list[LeadFollowUpStep] = []
    auto_close_days: int = 30


class TreatmentJourneyStep(BaseModel):
    milestone: str
    delay_days: int = 2
    enabled: bool = True
    send_whatsapp: bool = True
    send_notification: bool = True
    label: str = ""
    visit_stage: Optional[str] = "ANY"
    action: Optional[str] = None

class TreatmentJourneyData(BaseModel):
    steps: list[TreatmentJourneyStep] = []
    notes: str = ""


def _get_hid(current_user: dict) -> str:
    """Get hospital_id from user. Returns empty string for SUPER_ADMIN (who has none)."""
    hid = current_user.get("hospital_id")
    if hid:
        return hid
    return ""


def _delay_to_days(delay_value: int, delay_unit: str) -> int:
    if delay_unit == "IMMEDIATELY" or delay_value == 0:
        return 0
    if delay_unit == "DAYS":
        return delay_value
    if delay_unit == "WEEKS":
        return delay_value * 7
    if delay_unit == "MONTHS":
        return delay_value * 30
    return delay_value


# ── Lead Follow-up Policy ──────────────────────────────────────────────

@router.get("/policies/lead")
async def get_lead_policy(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = _get_hid(current_user)
    if not hid:
        return {"policy": {"follow_ups": [], "auto_close_days": 30}}
    result = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.hospital_id == hid, CrmRule.rule_type == "LEAD")
        ).order_by(CrmRule.delay_value)
    )
    rules = list(result.scalars().all())

    steps: list[dict] = []
    auto_close = 30
    for r in rules:
        if r.rule_name.startswith("LEAD_AUTO_CLOSE"):
            auto_close = _delay_to_days(r.delay_value, r.delay_unit)
            continue
        if r.rule_name.startswith("LEAD_FOLLOWUP_"):
            steps.append({
                "id": r.id,
                "delay_days": _delay_to_days(r.delay_value, r.delay_unit),
                "enabled": r.is_active,
                "send_whatsapp": r.send_whatsapp,
                "send_notification": r.send_notification,
            })

    steps.sort(key=lambda s: s["delay_days"])

    return {"policy": {"follow_ups": steps, "auto_close_days": auto_close}}


@router.put("/policies/lead")
async def save_lead_policy(
    data: LeadPolicyData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _get_hid(current_user)
    if not hid:
        return {"success": True, "count": 0}

    # Remove old lead policy rules
    old = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.hospital_id == hid, CrmRule.rule_type == "LEAD")
        )
    )
    old_rules = list(old.scalars().all())
    if old_rules:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import update as sa_update
        rule_ids = [r.id for r in old_rules]
        await db.execute(
            sa_update(GeneratedEnquiry)
            .where(GeneratedEnquiry.crm_rule_id.in_(rule_ids))
            .values(crm_rule_id=None)
        )
    for r in old_rules:
        await db.delete(r)
    await db.flush()

    created_ids: list[str] = []

    for idx, step in enumerate(data.follow_ups, 1):
        rule = CrmRule(
            id=str(_uuid.uuid4()),
            hospital_id=hid,
            rule_type="LEAD",
            scope="LEAD",
            rule_name=f"LEAD_FOLLOWUP_{idx}",
            trigger_event="PATIENT_REGISTERED",
            delay_value=step.delay_days,
            delay_unit="DAYS" if step.delay_days > 0 else "IMMEDIATELY",
            action="GENERAL_FOLLOW_UP",
            assign_to="RECEPTION",
            send_whatsapp=step.send_whatsapp,
            send_notification=step.send_notification,
            is_active=step.enabled,
        )
        db.add(rule)
        created_ids.append(rule.id)

    # Auto-close rule
    if data.auto_close_days > 0:
        rule = CrmRule(
            id=str(_uuid.uuid4()),
            hospital_id=hid,
            rule_type="LEAD",
            scope="LEAD",
            rule_name="LEAD_AUTO_CLOSE",
            trigger_event="NO_ACTIVITY",
            delay_value=data.auto_close_days,
            delay_unit="DAYS",
            action="CLOSE_ENQUIRY",
            assign_to="RECEPTION",
            send_whatsapp=False,
            send_notification=False,
            is_active=True,
        )
        db.add(rule)
        created_ids.append(rule.id)

    await db.flush()
    return {"success": True, "count": len(created_ids)}


# ── Treatment Journey Policies ──────────────────────────────────────────

@router.get("/policies/treatment-journeys")
async def get_treatment_journeys(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = _get_hid(current_user)

    from app.models.treatment_type import TreatmentType
    tt_q = select(TreatmentType).where(TreatmentType.is_active == True)
    if hid:
        hosp_names = (
            select(TreatmentType.name).where(
                TreatmentType.hospital_id == hid,
                TreatmentType.is_active == True,
            )
        )
        tt_q = tt_q.where(
            or_(
                TreatmentType.hospital_id == hid,
                and_(
                    TreatmentType.hospital_id.is_(None),
                    not_(TreatmentType.name.in_(hosp_names)),
                ),
            )
        )
    else:
        tt_q = tt_q.where(TreatmentType.hospital_id.is_(None))
    tt_result = await db.execute(tt_q.order_by(TreatmentType.name))
    treatment_types = list(tt_result.scalars().all())

    if hid:
        rule_result = await db.execute(
            select(CrmRule).where(
                and_(
                    CrmRule.hospital_id == hid,
                    CrmRule.rule_type == "TREATMENT",
                    CrmRule.scope.in_(["VISIT", "APPOINTMENT"]),
                )
            ).order_by(CrmRule.treatment_type_id, CrmRule.delay_value)
        )
        all_rules = list(rule_result.scalars().all())
    else:
        all_rules = []

    rules_by_tt: dict[str, list] = {}
    for r in all_rules:
        key = r.treatment_type_id or "__global__"
        rules_by_tt.setdefault(key, []).append(r)

    journeys: list[dict] = []
    for tt in treatment_types:
        tt_rules = rules_by_tt.get(tt.id, [])
        steps: list[dict] = []
        for r in tt_rules:
            steps.append({
                "id": r.id,
                "milestone": r.trigger_event,
                "delay_days": _delay_to_days(r.delay_value, r.delay_unit),
                "enabled": r.is_active,
                "send_whatsapp": r.send_whatsapp,
                "send_notification": r.send_notification,
                "label": r.rule_name,
                "visit_stage": r.visit_stage,
                "action": r.action,
            })
        journeys.append({
            "treatment_type_id": tt.id,
            "treatment_name": tt.name,
            "steps": steps,
            "step_count": len(steps),
            "active_count": sum(1 for s in steps if s["enabled"]),
        })

    journeys.sort(key=lambda j: (-j["step_count"], j["treatment_name"]))
    return {"journeys": journeys}


@router.put("/policies/treatment-journeys/{treatment_type_id}")
async def save_treatment_journey(
    treatment_type_id: str,
    data: TreatmentJourneyData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _get_hid(current_user)
    if not hid:
        return {"success": True, "count": 0}

    # Remove old VISIT/APPOINTMENT rules for this treatment type (not CASE scope)
    old = await db.execute(
        select(CrmRule).where(
            and_(
                CrmRule.hospital_id == hid,
                CrmRule.rule_type == "TREATMENT",
                CrmRule.treatment_type_id == treatment_type_id,
                CrmRule.scope.in_(["VISIT", "APPOINTMENT"]),
            )
        )
    )
    old_rules = list(old.scalars().all())
    # Nullify FK references in GeneratedEnquiry before deleting rules
    if old_rules:
        from app.models.generated_enquiry import GeneratedEnquiry
        rule_ids = [r.id for r in old_rules]
        await db.execute(
            select(GeneratedEnquiry).where(GeneratedEnquiry.crm_rule_id.in_(rule_ids))
        )
        from sqlalchemy import update as sa_update
        await db.execute(
            sa_update(GeneratedEnquiry)
            .where(GeneratedEnquiry.crm_rule_id.in_(rule_ids))
            .values(crm_rule_id=None)
        )
    for r in old_rules:
        await db.delete(r)
    await db.flush()

    from app.models.treatment_type import TreatmentType
    tt = await db.get(TreatmentType, treatment_type_id)
    treatment_name = tt.name if tt else "Treatment"

    created_ids: list[str] = []
    for step in data.steps:
        delay = step.delay_days
        unit = "DAYS" if delay > 0 else "IMMEDIATELY"
        if delay >= 30 and delay % 30 == 0:
            unit = "MONTHS"
            delay = delay // 30
        elif delay >= 7 and delay % 7 == 0:
            unit = "WEEKS"
            delay = delay // 7

        label = step.label or f"{step.milestone.replace('_', ' ').title()} — {treatment_name}"

        step_scope = "VISIT"
        if step.milestone == "APPOINTMENT_CREATED":
            step_scope = "APPOINTMENT"

        rule = CrmRule(
            id=str(_uuid.uuid4()),
            hospital_id=hid,
            rule_type="TREATMENT",
            scope=step_scope,
            rule_name=label,
            trigger_event=step.milestone,
            treatment_type_id=treatment_type_id,
            visit_stage=step.visit_stage or "ANY",
            delay_value=delay,
            delay_unit=unit,
            action=step.action or _milestone_to_action(step.milestone),
            assign_to="RECEPTION",
            send_whatsapp=step.send_whatsapp,
            send_notification=step.send_notification,
            is_active=step.enabled,
        )
        db.add(rule)
        created_ids.append(rule.id)

    await db.flush()
    return {"success": True, "count": len(created_ids)}


def _milestone_to_action(milestone: str) -> str:
    mapping = {
        "VISIT_COMPLETED": "WELLNESS_ENQUIRY",
        "APPOINTMENT_CREATED": "APPOINTMENT_REMINDER",
    }
    return mapping.get(milestone, "GENERAL_FOLLOW_UP")


# ═══════════════════════════════════════════════════════════════════════════
# CASE JOURNEY POLICY — Recovery + Recall (scope=CASE, no treatment_type)
# ═══════════════════════════════════════════════════════════════════════════

CASE_JOURNEY_MILESTONES = {
    "CASE_RECOVERY": {
        "label": "Recovery Follow-up",
        "description": "After case is completed — check healing progress",
        "default_delay": 3,
        "default_action": "RECOVERY_FOLLOW_UP",
    },
    "CASE_RECALL": {
        "label": "6-Month Recall",
        "description": "Periodic recall checkup after case completion",
        "default_delay": 180,
        "default_action": "RECALL",
    },
}


class CaseJourneyStep(BaseModel):
    milestone: str
    delay_days: int = 3
    enabled: bool = True
    send_whatsapp: bool = True
    send_notification: bool = True
    label: str = ""


class CaseJourneyData(BaseModel):
    steps: list[CaseJourneyStep] = []


@router.get("/policies/case-journey")
async def get_case_journey(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = _get_hid(current_user)
    if not hid:
        steps = []
        for key, meta in CASE_JOURNEY_MILESTONES.items():
            steps.append({
                "milestone": key,
                "delay_days": meta["default_delay"],
                "enabled": True,
                "send_whatsapp": True,
                "send_notification": True,
                "label": meta["label"],
            })
        return {"policy": {"steps": steps}}

    result = await db.execute(
        select(CrmRule).where(
            and_(
                CrmRule.hospital_id == hid,
                CrmRule.scope == "CASE",
            )
        ).order_by(CrmRule.delay_value)
    )
    rules = list(result.scalars().all())

    steps: list[dict] = []
    for r in rules:
        milestone_key = _action_to_case_milestone(r.action, r.trigger_event)
        steps.append({
            "id": r.id,
            "milestone": milestone_key,
            "delay_days": _delay_to_days(r.delay_value, r.delay_unit),
            "enabled": r.is_active,
            "send_whatsapp": r.send_whatsapp,
            "send_notification": r.send_notification,
            "label": r.rule_name,
        })

    return {"policy": {"steps": steps}}


@router.put("/policies/case-journey")
async def save_case_journey(
    data: CaseJourneyData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _get_hid(current_user)
    if not hid:
        return {"success": True, "count": 0}

    old = await db.execute(
        select(CrmRule).where(
            and_(CrmRule.hospital_id == hid, CrmRule.scope == "CASE")
        )
    )
    old_rules = list(old.scalars().all())
    if old_rules:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import update as sa_update
        rule_ids = [r.id for r in old_rules]
        await db.execute(
            sa_update(GeneratedEnquiry)
            .where(GeneratedEnquiry.crm_rule_id.in_(rule_ids))
            .values(crm_rule_id=None)
        )
    for r in old_rules:
        await db.delete(r)
    await db.flush()

    created_ids: list[str] = []
    for step in data.steps:
        meta = CASE_JOURNEY_MILESTONES.get(step.milestone)
        if not meta:
            continue

        delay = step.delay_days
        unit = "DAYS" if delay > 0 else "IMMEDIATELY"
        if delay >= 30 and delay % 30 == 0:
            unit = "MONTHS"
            delay = delay // 30
        elif delay >= 7 and delay % 7 == 0:
            unit = "WEEKS"
            delay = delay // 7

        label = step.label or meta["label"]

        rule = CrmRule(
            id=str(_uuid.uuid4()),
            hospital_id=hid,
            rule_type="TREATMENT",
            scope="CASE",
            rule_name=label,
            trigger_event="CASE_COMPLETED",
            treatment_type_id=None,
            visit_stage=None,
            delay_value=delay,
            delay_unit=unit,
            action=meta["default_action"],
            assign_to="RECEPTION",
            send_whatsapp=step.send_whatsapp,
            send_notification=step.send_notification,
            is_active=step.enabled,
        )
        db.add(rule)
        created_ids.append(rule.id)

    await db.flush()
    return {"success": True, "count": len(created_ids)}


def _action_to_case_milestone(action: str, trigger_event: str) -> str:
    if action in ("RECOVERY_FOLLOW_UP",):
        return "CASE_RECOVERY"
    if action in ("RECALL", "RECALL_REMINDER"):
        return "CASE_RECALL"
    if trigger_event == "CASE_COMPLETED":
        return "CASE_RECOVERY"
    return "CASE_RECOVERY"
