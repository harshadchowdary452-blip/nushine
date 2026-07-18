"""Template + Automation Rule router — thin controller."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.crm.services.template_service import TemplateService
from app.crm.utils import get_hospital_filter
from app.crm.schemas import success_response, paginated_response

router = APIRouter(tags=["CRM Templates V2"])


class FollowUpTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    procedure: Optional[str] = None
    trigger_event: str = "TREATMENT_COMPLETED"
    delay_days: int = 0
    follow_up_type: str = "CUSTOM_FOLLOW_UP"
    reminder_channel: str = "WHATSAPP"
    priority: str = "MEDIUM"
    responsible_role: Optional[str] = None
    max_retries: int = 1
    notes: Optional[str] = None
    is_active: bool = True


class FollowUpTemplateUpdate(BaseModel):
    name: Optional[str] = None
    procedure: Optional[str] = None
    trigger_event: Optional[str] = None
    delay_days: Optional[int] = None
    reminder_channel: Optional[str] = None
    priority: Optional[str] = None
    responsible_role: Optional[str] = None
    max_retries: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    trigger_event: str
    procedure: Optional[str] = None
    delay_days: int = 0
    channel: str = "WHATSAPP"
    priority: str = "MEDIUM"
    assigned_role: Optional[str] = None
    message_template: Optional[str] = None
    repeat_count: int = 1
    max_attempts: int = 3
    stop_conditions: Optional[str] = None
    is_active: bool = True


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    trigger_event: Optional[str] = None
    procedure: Optional[str] = None
    delay_days: Optional[int] = None
    channel: Optional[str] = None
    priority: Optional[str] = None
    assigned_role: Optional[str] = None
    message_template: Optional[str] = None
    repeat_count: Optional[int] = None
    max_attempts: Optional[int] = None
    stop_conditions: Optional[str] = None
    is_active: Optional[bool] = None


# --- Follow-Up Templates ---

@router.get("/templates/follow-up")
async def list_templates(
    procedure: Optional[str] = None,
    trigger_event: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    svc = TemplateService(db)
    result = await svc.list_templates(hospital_id, procedure, trigger_event, skip, limit)
    return paginated_response(result["items"], result["total"], 1, 1)


@router.post("/templates/follow-up")
async def create_template(
    req: FollowUpTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = TemplateService(db)
    data = req.model_dump()
    data["hospital_id"] = get_hospital_filter(current_user)
    template = await svc.create_template(data)
    return success_response(template, "Template created successfully")


@router.put("/templates/follow-up/{template_id}")
async def update_template(
    template_id: str,
    req: FollowUpTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = TemplateService(db)
    template = await svc.update_template(template_id, req.model_dump(exclude_unset=True))
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return success_response(template, "Template updated successfully")


@router.delete("/templates/follow-up/{template_id}")
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = TemplateService(db)
    deleted = await svc.delete_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")
    return success_response(None, "Template deleted successfully")


# --- Automation Rules ---

@router.get("/automation-rules")
async def list_rules(
    trigger_event: Optional[str] = None,
    procedure: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    svc = TemplateService(db)
    result = await svc.list_rules(hospital_id, trigger_event, procedure, skip, limit)
    return paginated_response(result["items"], result["total"], 1, 1)


@router.post("/automation-rules")
async def create_rule(
    req: AutomationRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = TemplateService(db)
    data = req.model_dump()
    data["hospital_id"] = get_hospital_filter(current_user)
    rule = await svc.create_rule(data)
    return success_response(rule, "Rule created successfully")


@router.put("/automation-rules/{rule_id}")
async def update_rule(
    rule_id: str,
    req: AutomationRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = TemplateService(db)
    rule = await svc.update_rule(rule_id, req.model_dump(exclude_unset=True))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return success_response(rule, "Rule updated successfully")


@router.delete("/automation-rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = TemplateService(db)
    deleted = await svc.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return success_response(None, "Rule deleted successfully")


@router.post("/automation-rules/{rule_id}/toggle")
async def toggle_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = TemplateService(db)
    rule = await svc.toggle_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return success_response(rule, f"Rule {'activated' if rule.get('is_active') else 'deactivated'}")
