from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Role, verify_permission, Permission
from app.models.status_audit_log import StatusAuditLog
from app.services.status_automation import StatusAutomationService

router = APIRouter(prefix="/status", tags=["Status"])


class ManualOverrideRequest(BaseModel):
    entity_type: str = Field(..., pattern="^(patient|case|appointment|treatment|follow_up|billing)$")
    entity_id: str
    new_status: str
    reason: str = Field(..., min_length=1, max_length=500)


@router.post("/override")
async def manual_status_override(
    req: ManualOverrideRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role not in (Role.HOSPITAL_ADMIN.value, Role.SUPER_ADMIN.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Hospital Admin and Super Admin can override status")
    svc = StatusAutomationService(db)
    try:
        result = await svc.manual_override(
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            new_status=req.new_status,
            user_id=current_user.get("sub"),
            user_name=current_user.get("name", current_user.get("sub")),
            user_role=role,
            reason=req.reason,
        )
        await db.commit()
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/audit-logs")
async def get_status_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in (Role.HOSPITAL_ADMIN.value, Role.SUPER_ADMIN.value, Role.GROUP_ADMIN.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    query = select(StatusAuditLog)
    if entity_type:
        query = query.where(StatusAuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(StatusAuditLog.entity_id == entity_id)
    query = query.order_by(desc(StatusAuditLog.created_at)).limit(limit)
    r = await db.execute(query)
    logs = r.scalars().all()
    return [{
        "id": str(log.id),
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "previous_status": log.previous_status,
        "new_status": log.new_status,
        "user_name": log.user_name,
        "user_role": log.user_role,
        "reason": log.reason,
        "created_at": log.created_at.isoformat(),
    } for log in logs]


@router.post("/check-inactive")
async def check_inactive_patients(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in (Role.SUPER_ADMIN.value, Role.HOSPITAL_ADMIN.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    svc = StatusAutomationService(db)
    count = await svc.check_inactive_patients()
    await db.commit()
    return {"success": True, "patients_marked_inactive": count}


@router.post("/check-overdue")
async def check_overdue_billings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in (Role.SUPER_ADMIN.value, Role.HOSPITAL_ADMIN.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    svc = StatusAutomationService(db)
    count = await svc.check_overdue_billings()
    await db.commit()
    return {"success": True, "billings_marked_overdue": count}
