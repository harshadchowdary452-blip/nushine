from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from pydantic import BaseModel, Field
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.crm_opd_setting import CrmOpdSetting
from app.models.hospital import Hospital

router = APIRouter(prefix="/crm/opd-settings", tags=["CRM OPD Settings"])


class CrmOpdSettingResponse(BaseModel):
    id: str
    hospital_id: str
    opd_follow_up_enabled: bool
    default_due_days: int
    assigned_staff_id: Optional[str] = None
    priority: str
    message_template: Optional[str] = None
    is_active: bool


class CrmOpdSettingUpdate(BaseModel):
    opd_follow_up_enabled: Optional[bool] = None
    default_due_days: Optional[int] = None
    assigned_staff_id: Optional[str] = None
    priority: Optional[str] = None
    message_template: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/")
async def get_opd_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    role = current_user.get("role")
    hospital_id = current_user.get("hospital_id")
    if not hospital_id and role == "HOSPITAL_ADMIN":
        raise HTTPException(status_code=400, detail="Hospital admin must have a hospital")
    if hospital_id:
        q = select(CrmOpdSetting).where(CrmOpdSetting.hospital_id == hospital_id)
    elif role == "SUPER_ADMIN":
        q = select(CrmOpdSetting)
    else:
        raise HTTPException(status_code=403, detail="Access denied")
    rows = (await db.execute(q)).scalars().all()
    return [{
        "id": str(r.id),
        "hospital_id": str(r.hospital_id),
        "opd_follow_up_enabled": r.opd_follow_up_enabled,
        "default_due_days": r.default_due_days,
        "assigned_staff_id": str(r.assigned_staff_id) if r.assigned_staff_id else None,
        "priority": r.priority,
        "message_template": r.message_template,
        "is_active": r.is_active,
    } for r in rows]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_or_update_opd_settings(
    data: CrmOpdSettingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    if not hospital_id:
        raise HTTPException(status_code=400, detail="Hospital ID required")
    # Check if settings exist
    existing = await db.execute(
        select(CrmOpdSetting).where(CrmOpdSetting.hospital_id == hospital_id)
    )
    setting = existing.scalar_one_or_none()
    if setting:
        if data.opd_follow_up_enabled is not None: setting.opd_follow_up_enabled = data.opd_follow_up_enabled
        if data.default_due_days is not None: setting.default_due_days = data.default_due_days
        if data.assigned_staff_id is not None: setting.assigned_staff_id = data.assigned_staff_id
        if data.priority is not None: setting.priority = data.priority
        if data.message_template is not None: setting.message_template = data.message_template
        if data.is_active is not None: setting.is_active = data.is_active
    else:
        setting = CrmOpdSetting(
            hospital_id=hospital_id,
            opd_follow_up_enabled=data.opd_follow_up_enabled or True,
            default_due_days=data.default_due_days or 1,
            assigned_staff_id=data.assigned_staff_id,
            priority=data.priority or "MEDIUM",
            message_template=data.message_template,
        )
        db.add(setting)
    await db.commit()
    return {"id": str(setting.id), "hospital_id": str(setting.hospital_id)}


@router.get("/{hospital_id}")
async def get_opd_settings_by_hospital(
    hospital_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    from app.core.permissions import verify_tenant_access
    hosp = await db.get(Hospital, hospital_id)
    if not hosp:
        raise HTTPException(status_code=404, detail="Hospital not found")
    await verify_tenant_access(current_user, hosp, "hospital", db)
    q = select(CrmOpdSetting).where(CrmOpdSetting.hospital_id == hospital_id)
    setting = (await db.execute(q)).scalar_one_or_none()
    if not setting:
        return {
            "id": None, "hospital_id": hospital_id,
            "opd_follow_up_enabled": True, "default_due_days": 1,
            "assigned_staff_id": None, "priority": "MEDIUM",
            "message_template": None, "is_active": True,
        }
    return {
        "id": str(setting.id),
        "hospital_id": str(setting.hospital_id),
        "opd_follow_up_enabled": setting.opd_follow_up_enabled,
        "default_due_days": setting.default_due_days,
        "assigned_staff_id": str(setting.assigned_staff_id) if setting.assigned_staff_id else None,
        "priority": setting.priority,
        "message_template": setting.message_template,
        "is_active": setting.is_active,
    }
