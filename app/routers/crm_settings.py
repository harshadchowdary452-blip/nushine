from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from typing import Optional
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
from app.models.treatment_template import TreatmentTemplate
from app.models.treatment_type import TreatmentType

router = APIRouter(prefix="/crm/settings", tags=["CRM Settings"])


def _verify_hospital_access(current_user):
    role = current_user.get("role")
    if role not in ("SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied")
    hospital_id = current_user.get("hospital_id")
    if not hospital_id and role == "HOSPITAL_ADMIN":
        raise HTTPException(status_code=400, detail="Hospital admin must have a hospital")
    return hospital_id


class RuleCreate(BaseModel):
    treatment_type_id: str
    treatment_name: Optional[str] = None
    treatment_template_id: Optional[str] = None
    follow_up_1_day: bool = True
    follow_up_7_day: bool = True
    recall_6_month: bool = True
    recall_12_month: bool = True
    custom_recall_days: Optional[int] = None
    enquiry_enabled: bool = False
    auto_appointment_enabled: bool = False
    assigned_doctor_id: Optional[str] = None


class RuleUpdate(BaseModel):
    treatment_type_id: Optional[str] = None
    treatment_name: Optional[str] = None
    treatment_template_id: Optional[str] = None
    follow_up_1_day: Optional[bool] = None
    follow_up_7_day: Optional[bool] = None
    recall_6_month: Optional[bool] = None
    recall_12_month: Optional[bool] = None
    custom_recall_days: Optional[int] = None
    enquiry_enabled: Optional[bool] = None
    auto_appointment_enabled: Optional[bool] = None
    assigned_doctor_id: Optional[str] = None
    is_active: Optional[bool] = None


# --- List all rules for the hospital ---
@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = _verify_hospital_access(current_user)
    if hospital_id:
        q = select(TreatmentFollowUpRule).where(TreatmentFollowUpRule.hospital_id == hospital_id)
    else:
        q = select(TreatmentFollowUpRule).where(TreatmentFollowUpRule.hospital_id.is_(None))
    rows = (await db.execute(q)).scalars().all()
    result = []
    for r in rows:
        tt_name = None
        if r.treatment_type_id:
            tt = await db.get(TreatmentType, r.treatment_type_id)
            tt_name = tt.name if tt else None
        result.append({
            "id": str(r.id), "treatment_name": r.treatment_name,
            "treatment_type_id": str(r.treatment_type_id) if r.treatment_type_id else None,
            "treatment_type_name": tt_name,
            "treatment_template_id": str(r.treatment_template_id) if r.treatment_template_id else None,
            "follow_up_1_day": r.follow_up_1_day, "follow_up_7_day": r.follow_up_7_day,
            "recall_6_month": r.recall_6_month, "recall_12_month": r.recall_12_month,
            "custom_recall_days": r.custom_recall_days,
            "enquiry_enabled": r.enquiry_enabled, "auto_appointment_enabled": r.auto_appointment_enabled,
            "assigned_doctor_id": str(r.assigned_doctor_id) if r.assigned_doctor_id else None,
            "is_active": r.is_active,
        })
    return result


# --- Create a new rule ---
@router.post("/rules")
async def create_rule(data: RuleCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = _verify_hospital_access(current_user)
    if hospital_id:
        dup_filter = select(TreatmentFollowUpRule).where(
            TreatmentFollowUpRule.hospital_id == hospital_id,
            TreatmentFollowUpRule.treatment_type_id == data.treatment_type_id,
        )
    else:
        dup_filter = select(TreatmentFollowUpRule).where(
            TreatmentFollowUpRule.hospital_id.is_(None),
            TreatmentFollowUpRule.treatment_type_id == data.treatment_type_id,
        )
    existing = (await db.execute(dup_filter)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Rule for this treatment type already exists")
    treatment_name = data.treatment_name
    if not treatment_name and data.treatment_type_id:
        tt = await db.get(TreatmentType, data.treatment_type_id)
        if tt:
            treatment_name = tt.name
    rule = TreatmentFollowUpRule(
        hospital_id=hospital_id, treatment_type_id=data.treatment_type_id,
        treatment_name=treatment_name,
        treatment_template_id=data.treatment_template_id,
        follow_up_1_day=data.follow_up_1_day, follow_up_7_day=data.follow_up_7_day,
        recall_6_month=data.recall_6_month, recall_12_month=data.recall_12_month,
        custom_recall_days=data.custom_recall_days,
        enquiry_enabled=data.enquiry_enabled, auto_appointment_enabled=data.auto_appointment_enabled,
        assigned_doctor_id=data.assigned_doctor_id,
    )
    db.add(rule)
    await db.commit()
    return {"id": str(rule.id), "treatment_type_id": rule.treatment_type_id}


# --- Update a rule ---
@router.put("/rules/{rule_id}")
async def update_rule(rule_id: str, data: RuleUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = _verify_hospital_access(current_user)
    rule = await db.get(TreatmentFollowUpRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if str(rule.hospital_id or "") != str(hospital_id or ""):
        raise HTTPException(status_code=403, detail="Access denied")
    if data.treatment_type_id is not None:
        rule.treatment_type_id = data.treatment_type_id
        if not data.treatment_name:
            tt = await db.get(TreatmentType, data.treatment_type_id)
            if tt:
                rule.treatment_name = tt.name
    if data.treatment_name is not None: rule.treatment_name = data.treatment_name
    if data.treatment_template_id is not None: rule.treatment_template_id = data.treatment_template_id
    if data.follow_up_1_day is not None: rule.follow_up_1_day = data.follow_up_1_day
    if data.follow_up_7_day is not None: rule.follow_up_7_day = data.follow_up_7_day
    if data.recall_6_month is not None: rule.recall_6_month = data.recall_6_month
    if data.recall_12_month is not None: rule.recall_12_month = data.recall_12_month
    if data.custom_recall_days is not None: rule.custom_recall_days = data.custom_recall_days
    if data.enquiry_enabled is not None: rule.enquiry_enabled = data.enquiry_enabled
    if data.auto_appointment_enabled is not None: rule.auto_appointment_enabled = data.auto_appointment_enabled
    if data.assigned_doctor_id is not None: rule.assigned_doctor_id = data.assigned_doctor_id
    if data.is_active is not None: rule.is_active = data.is_active
    await db.commit()
    return {"success": True}


# --- Delete a rule ---
@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = _verify_hospital_access(current_user)
    rule = await db.get(TreatmentFollowUpRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if str(rule.hospital_id or "") != str(hospital_id or ""):
        raise HTTPException(status_code=403, detail="Access denied")
    await db.delete(rule)
    await db.commit()
    return {"success": True}


# --- Get complete CRM settings summary for dashboard ---
@router.get("/summary")
async def get_crm_settings_summary(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = _verify_hospital_access(current_user)
    if hospital_id:
        q = select(TreatmentFollowUpRule).where(TreatmentFollowUpRule.hospital_id == hospital_id)
    else:
        q = select(TreatmentFollowUpRule).where(TreatmentFollowUpRule.hospital_id.is_(None))
    rules = (await db.execute(q)).scalars().all()
    return {
        "total_treatments_with_rules": len(rules),
        "active_rules": sum(1 for r in rules if r.is_active),
        "treatments_with_1_day": sum(1 for r in rules if r.follow_up_1_day),
        "treatments_with_7_day": sum(1 for r in rules if r.follow_up_7_day),
        "treatments_with_6m_recall": sum(1 for r in rules if r.recall_6_month),
        "treatments_with_12m_recall": sum(1 for r in rules if r.recall_12_month),
        "treatments_with_enquiry": sum(1 for r in rules if r.enquiry_enabled),
        "treatments_with_auto_appointment": sum(1 for r in rules if r.auto_appointment_enabled),
    }


# --- Treatment Templates ---

class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/templates")
async def list_templates(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hospital_id = _verify_hospital_access(current_user)
    if hospital_id:
        q = select(TreatmentTemplate).where(TreatmentTemplate.hospital_id == hospital_id)
    else:
        q = select(TreatmentTemplate).where(TreatmentTemplate.hospital_id.is_(None))
    rows = (await db.execute(q)).scalars().all()
    return [{"id": str(r.id), "name": r.name, "description": r.description, "is_active": r.is_active} for r in rows]


@router.post("/templates")
async def create_template(data: TemplateCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = _verify_hospital_access(current_user)
    tpl = TreatmentTemplate(hospital_id=hospital_id, name=data.name, description=data.description)
    db.add(tpl)
    await db.commit()
    return {"id": str(tpl.id), "name": tpl.name}


@router.put("/templates/{template_id}")
async def update_template(template_id: str, data: TemplateUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = _verify_hospital_access(current_user)
    tpl = await db.get(TreatmentTemplate, template_id)
    if not tpl or str(tpl.hospital_id or "") != str(hospital_id or ""):
        raise HTTPException(status_code=404, detail="Template not found")
    if data.name is not None: tpl.name = data.name
    if data.description is not None: tpl.description = data.description
    if data.is_active is not None: tpl.is_active = data.is_active
    await db.commit()
    return {"success": True}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = _verify_hospital_access(current_user)
    tpl = await db.get(TreatmentTemplate, template_id)
    if not tpl or str(tpl.hospital_id or "") != str(hospital_id or ""):
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tpl)
    await db.commit()
    return {"success": True}
