"""Automation Rule Management API — CRUD, conditions, actions, testing, monitoring."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.dependencies import get_current_user
from app.crm.utils import get_hospital_filter
from app.crm.schemas import success_response, paginated_response
from app.models.automation_rule import AutomationRule
from app.models.automation_rule_condition import AutomationRuleCondition
from app.models.automation_rule_action import AutomationRuleAction
from app.models.automation_rule_version import AutomationRuleVersion
from app.models.automation_rule_log import AutomationRuleLog
from app.models.automation_execution_queue import AutomationExecutionQueue
import json

router = APIRouter(prefix="/automation", tags=["CRM Automation"])


# --- Schemas ---

class RuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    trigger_event: str
    procedure: Optional[str] = None
    channel: str = "WHATSAPP"
    priority: str = "MEDIUM"
    assigned_role: Optional[str] = None
    condition_logic: str = "AND"
    delay_days: int = 0
    stop_conditions: Optional[str] = None
    escalation_enabled: bool = False
    escalation_days_1: Optional[int] = None
    escalation_role_1: Optional[str] = None
    escalation_days_2: Optional[int] = None
    escalation_role_2: Optional[str] = None
    escalation_days_3: Optional[int] = None
    escalation_role_3: Optional[str] = None
    business_hours_only: bool = False
    weekend_handling: str = "SKIP"
    timezone: str = "UTC"
    conditions: list[dict] = []
    actions: list[dict] = []


class RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_event: Optional[str] = None
    procedure: Optional[str] = None
    channel: Optional[str] = None
    priority: Optional[str] = None
    assigned_role: Optional[str] = None
    condition_logic: Optional[str] = None
    delay_days: Optional[int] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    escalation_enabled: Optional[bool] = None
    conditions: Optional[list[dict]] = None
    actions: Optional[list[dict]] = None


class TestRuleRequest(BaseModel):
    event_type: str
    payload: Optional[dict] = None


# --- Rule CRUD ---

@router.get("/rules")
async def list_rules(
    status: Optional[str] = None,
    trigger_event: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    query = select(AutomationRule)
    count_query = select(func.count()).select_from(AutomationRule)

    if hospital_id:
        from sqlalchemy import or_
        query = query.where(or_(AutomationRule.hospital_id == None, AutomationRule.hospital_id == hospital_id))
        count_query = count_query.where(or_(AutomationRule.hospital_id == None, AutomationRule.hospital_id == hospital_id))
    if status:
        query = query.where(AutomationRule.status == status)
        count_query = count_query.where(AutomationRule.status == status)
    if trigger_event:
        query = query.where(AutomationRule.trigger_event == trigger_event)
        count_query = count_query.where(AutomationRule.trigger_event == trigger_event)

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(AutomationRule.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    items = []
    for r in result.scalars().all():
        items.append(_rule_to_dict(r))
    return paginated_response(items, total, (skip // limit) + 1, limit)


@router.post("/rules")
async def create_rule(
    req: RuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    rule = AutomationRule(
        name=req.name,
        description=req.description,
        trigger_event=req.trigger_event,
        procedure=req.procedure,
        channel=req.channel,
        priority=req.priority,
        assigned_role=req.assigned_role,
        condition_logic=req.condition_logic,
        delay_days=req.delay_days,
        stop_conditions=req.stop_conditions,
        escalation_enabled=req.escalation_enabled,
        escalation_days_1=req.escalation_days_1,
        escalation_role_1=req.escalation_role_1,
        escalation_days_2=req.escalation_days_2,
        escalation_role_2=req.escalation_role_2,
        escalation_days_3=req.escalation_days_3,
        escalation_role_3=req.escalation_role_3,
        business_hours_only=req.business_hours_only,
        weekend_handling=req.weekend_handling,
        timezone=req.timezone,
        hospital_id=hospital_id,
        status="DRAFT",
        version=1,
        created_by=current_user.get("id"),
    )
    db.add(rule)
    await db.flush()

    # Add conditions
    for cond_data in req.conditions:
        cond = AutomationRuleCondition(rule_id=rule.id, **cond_data)
        db.add(cond)

    # Add actions
    for action_data in req.actions:
        if "action_config" in action_data and isinstance(action_data["action_config"], dict):
            action_data["action_config"] = json.dumps(action_data["action_config"])
        action = AutomationRuleAction(rule_id=rule.id, **action_data)
        db.add(action)

    await db.flush()
    return success_response(_rule_to_dict(rule), "Rule created successfully")


@router.get("/rules/{rule_id}")
async def get_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # Load conditions and actions
    conds = await db.execute(select(AutomationRuleCondition).where(AutomationRuleCondition.rule_id == rule_id).order_by(AutomationRuleCondition.sort_order))
    acts = await db.execute(select(AutomationRuleAction).where(AutomationRuleAction.rule_id == rule_id).order_by(AutomationRuleAction.sort_order))
    
    data = _rule_to_dict(rule)
    data["conditions"] = [_cond_to_dict(c) for c in conds.scalars().all()]
    data["actions"] = [_action_to_dict(a) for a in acts.scalars().all()]
    return success_response(data)


@router.put("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    req: RuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    update_data = req.model_dump(exclude_unset=True)
    conditions = update_data.pop("conditions", None)
    actions = update_data.pop("actions", None)

    for key, value in update_data.items():
        setattr(rule, key, value)

    rule.version = (rule.version or 1) + 1
    rule.modified_by = current_user.get("id")

    # Save version snapshot
    version_log = AutomationRuleVersion(
        rule_id=rule_id,
        version=rule.version,
        rule_snapshot=json.dumps(_rule_to_dict(rule)),
        change_summary=f"Updated by {current_user.get('full_name', 'system')}",
        created_by=current_user.get("id"),
    )
    db.add(version_log)

    # Replace conditions if provided
    if conditions is not None:
        await db.execute(select(AutomationRuleCondition).where(AutomationRuleCondition.rule_id == rule_id).delete())
        for cond_data in conditions:
            cond = AutomationRuleCondition(rule_id=rule_id, **cond_data)
            db.add(cond)

    # Replace actions if provided
    if actions is not None:
        await db.execute(select(AutomationRuleAction).where(AutomationRuleAction.rule_id == rule_id).delete())
        for action_data in actions:
            if "action_config" in action_data and isinstance(action_data["action_config"], dict):
                action_data["action_config"] = json.dumps(action_data["action_config"])
            action = AutomationRuleAction(rule_id=rule_id, **action_data)
            db.add(action)

    await db.flush()
    return success_response(_rule_to_dict(rule), "Rule updated successfully")


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.flush()
    return success_response(None, "Rule deleted successfully")


@router.post("/rules/{rule_id}/enable")
async def enable_rule(rule_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.status = "ACTIVE"
    rule.is_active = True
    await db.flush()
    return success_response(_rule_to_dict(rule), "Rule enabled")


@router.post("/rules/{rule_id}/disable")
async def disable_rule(rule_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.status = "DISABLED"
    rule.is_active = False
    await db.flush()
    return success_response(_rule_to_dict(rule), "Rule disabled")


@router.post("/rules/{rule_id}/archive")
async def archive_rule(rule_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.status = "ARCHIVED"
    rule.is_active = False
    await db.flush()
    return success_response(_rule_to_dict(rule), "Rule archived")


@router.post("/rules/{rule_id}/clone")
async def clone_rule(rule_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rule = await db.get(AutomationRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    new_rule = AutomationRule(
        name=f"{rule.name} (Copy)",
        description=rule.description,
        trigger_event=rule.trigger_event,
        procedure=rule.procedure,
        channel=rule.channel,
        priority=rule.priority,
        assigned_role=rule.assigned_role,
        condition_logic=rule.condition_logic,
        delay_days=rule.delay_days,
        stop_conditions=rule.stop_conditions,
        hospital_id=rule.hospital_id,
        status="DRAFT",
        version=1,
        created_by=current_user.get("id"),
    )
    db.add(new_rule)
    await db.flush()

    # Copy conditions
    conds = await db.execute(select(AutomationRuleCondition).where(AutomationRuleCondition.rule_id == rule_id))
    for c in conds.scalars().all():
        new_cond = AutomationRuleCondition(rule_id=new_rule.id, field_name=c.field_name, operator=c.operator, value=c.value, value_type=c.value_type, sort_order=c.sort_order)
        db.add(new_cond)

    # Copy actions
    acts = await db.execute(select(AutomationRuleAction).where(AutomationRuleAction.rule_id == rule_id))
    for a in acts.scalars().all():
        new_action = AutomationRuleAction(rule_id=new_rule.id, action_type=a.action_type, action_config=a.action_config, delay_days=a.delay_days, delay_hours=a.delay_hours, responsible_role=a.responsible_role, priority=a.priority, max_retries=a.max_retries, sort_order=a.sort_order)
        db.add(new_action)

    await db.flush()
    return success_response(_rule_to_dict(new_rule), "Rule cloned")


# --- Testing ---

@router.post("/rules/{rule_id}/test")
async def test_rule(
    rule_id: str,
    req: TestRuleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from app.crm.services.automation_engine import AutomationEngine
    engine = AutomationEngine(db)
    result = await engine.test_rule(rule_id, req.event_type, req.payload)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return success_response(result, "Test completed — no data was modified")


# --- Logs ---

@router.get("/rules/{rule_id}/logs")
async def get_rule_logs(
    rule_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = select(AutomationRuleLog).where(AutomationRuleLog.rule_id == rule_id)
    count_query = select(func.count()).select_from(AutomationRuleLog).where(AutomationRuleLog.rule_id == rule_id)
    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(AutomationRuleLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    items = []
    for log in result.scalars().all():
        items.append({
            "id": log.id, "event_type": log.event_type, "action_type": log.action_type,
            "execution_status": log.execution_status, "is_test": log.is_test,
            "error_message": log.error_message, "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    return paginated_response(items, total, (skip // limit) + 1, limit)


@router.get("/rules/{rule_id}/versions")
async def get_rule_versions(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = select(AutomationRuleVersion).where(AutomationRuleVersion.rule_id == rule_id).order_by(AutomationRuleVersion.version.desc())
    result = await db.execute(query)
    items = [{"id": v.id, "version": v.version, "change_summary": v.change_summary, "created_by": v.created_by, "created_at": v.created_at.isoformat() if v.created_at else None} for v in result.scalars().all()]
    return success_response(items)


# --- Queue ---

@router.get("/queue")
async def list_queue(
    status: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = select(AutomationExecutionQueue)
    count_query = select(func.count()).select_from(AutomationExecutionQueue)
    if status:
        query = query.where(AutomationExecutionQueue.status == status)
        count_query = count_query.where(AutomationExecutionQueue.status == status)
    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(AutomationExecutionQueue.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    items = [{"id": q.id, "rule_id": q.rule_id, "action_type": q.action_type, "status": q.status, "scheduled_at": q.scheduled_at.isoformat() if q.scheduled_at else None, "retry_count": q.retry_count, "error_message": q.error_message, "created_at": q.created_at.isoformat() if q.created_at else None} for q in result.scalars().all()]
    return paginated_response(items, total, (skip // limit) + 1, limit)


# --- Dashboard ---

@router.get("/dashboard")
async def automation_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    
    # Rule counts
    base_q = select(func.count()).select_from(AutomationRule)
    if hospital_id:
        from sqlalchemy import or_
        base_q = base_q.where(or_(AutomationRule.hospital_id == None, AutomationRule.hospital_id == hospital_id))
    
    total = (await db.execute(base_q)).scalar() or 0
    active = (await db.execute(base_q.where(AutomationRule.status == "ACTIVE"))).scalar() or 0
    disabled = (await db.execute(base_q.where(AutomationRule.status == "DISABLED"))).scalar() or 0
    draft = (await db.execute(base_q.where(AutomationRule.status == "DRAFT"))).scalar() or 0

    # Execution stats
    log_q = select(func.count()).select_from(AutomationRuleLog)
    if hospital_id:
        log_q = log_q.where(AutomationRuleLog.hospital_id == hospital_id)
    total_executions = (await db.execute(log_q)).scalar() or 0
    failed_executions = (await db.execute(log_q.where(AutomationRuleLog.execution_status == "FAILED"))).scalar() or 0

    # Queue stats
    queue_q = select(func.count()).select_from(AutomationExecutionQueue)
    queued = (await db.execute(queue_q.where(AutomationExecutionQueue.status == "QUEUED"))).scalar() or 0
    processing = (await db.execute(queue_q.where(AutomationExecutionQueue.status == "PROCESSING"))).scalar() or 0
    retrying = (await db.execute(queue_q.where(AutomationExecutionQueue.status == "RETRYING"))).scalar() or 0

    success_rate = round((total_executions - failed_executions) / total_executions * 100, 1) if total_executions > 0 else 0

    return success_response({
        "total_rules": total,
        "active_rules": active,
        "disabled_rules": disabled,
        "draft_rules": draft,
        "total_executions": total_executions,
        "failed_executions": failed_executions,
        "success_rate": success_rate,
        "queue": {"queued": queued, "processing": processing, "retrying": retrying},
    })


# --- Helpers ---

def _rule_to_dict(r) -> dict:
    return {c.name: getattr(r, c.name, None) for c in r.__table__.columns}

def _cond_to_dict(c) -> dict:
    return {c.name: getattr(c, c.name, None) for c in c.__table__.columns}

def _action_to_dict(a) -> dict:
    return {c.name: getattr(a, a.name, None) for a in a.__table__.columns}
