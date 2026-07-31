from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Permission, Role, verify_permission
from app.database import get_db
from app.dependencies import get_current_user
from app.models.hospital import Hospital
from app.schemas.user import UserResponse
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=List[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    hospital_id: Optional[str] = Query(None),
    admin_group_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(
        current_user,
        Permission.VIEW_ALL_DOCTORS,
        Permission.MANAGE_STAFF,
        Permission.VIEW_LEADS,
        Permission.MANAGE_LEADS,
    )
    service = UserService(db)
    filters: dict = {}
    if search:
        filters["search"] = search
    if role:
        roles = [r.strip() for r in role.split(",") if r.strip()]
        if len(roles) == 1:
            filters["role"] = roles[0]
        elif len(roles) > 1:
            filters["role__in"] = roles

    user_role = current_user.get("role")
    if user_role in (Role.DOCTOR.value, Role.HOSPITAL_ADMIN.value):
        resolved_admin_group_id = current_user.get("admin_group_id")
        if user_role == Role.HOSPITAL_ADMIN.value and not resolved_admin_group_id:
            hid = current_user.get("hospital_id")
            if hid:
                row = await db.execute(
                    select(Hospital.admin_group_id).where(Hospital.id == hid)
                )
                value = row.scalar_one_or_none()
                resolved_admin_group_id = str(value) if value else None
        if resolved_admin_group_id:
            filters["admin_group_id"] = resolved_admin_group_id
        elif current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
        else:
            filters["id"] = current_user.get("sub")
    elif user_role == Role.GROUP_ADMIN.value:
        if current_user.get("admin_group_id"):
            filters["admin_group_id"] = current_user.get("admin_group_id")
        else:
            filters["id"] = current_user.get("sub")
    elif user_role == Role.SUPER_ADMIN.value:
        if hospital_id:
            filters["hospital_id"] = hospital_id
        if admin_group_id:
            filters["admin_group_id"] = admin_group_id
    else:
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
        elif current_user.get("admin_group_id"):
            filters["admin_group_id"] = current_user.get("admin_group_id")
        else:
            filters["id"] = current_user.get("sub")

    return await service.get_all(skip=skip, limit=limit, filters=filters)
