from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.admin_group_service import AdminGroupService
from app.services.user_service import UserService
from app.schemas.admin_group import AdminGroupCreate, AdminGroupUpdate, AdminGroupResponse
from app.schemas.user import UserCreate, UserResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/admin-groups", tags=["Admin Groups"])


@router.post("/", response_model=AdminGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(data: AdminGroupCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_GROUP_ADMIN)
    service = AdminGroupService(db)
    return await service.create(data.model_dump(), user_id=current_user.get("sub"))


@router.get("/", response_model=List[AdminGroupResponse])
async def get_groups(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_GROUP_ADMINS)
    service = AdminGroupService(db)
    return await service.get_all(skip=skip, limit=limit)


@router.get("/{group_id}", response_model=AdminGroupResponse)
async def get_group(group_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_GROUP_ADMINS)
    service = AdminGroupService(db)
    group = await service.get(group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin group not found")
    return group


@router.put("/{group_id}", response_model=AdminGroupResponse)
async def update_group(group_id: str, data: AdminGroupUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_GROUP_ADMINS)
    service = AdminGroupService(db)
    group = await service.update(group_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin group not found")
    return group


@router.delete("/{group_id}", response_model=MessageResponse)
async def delete_group(group_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_GROUP_ADMINS)
    service = AdminGroupService(db)
    deleted = await service.delete(group_id, user_id=current_user.get("sub"))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin group not found")
    return MessageResponse(message="Admin group deleted successfully")


@router.post("/{group_id}/admins", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_group_admin(group_id: str, data: UserCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_GROUP_ADMINS)
    service = UserService(db)
    data_dict = data.model_dump()
    data_dict["admin_group_id"] = group_id
    data_dict["role"] = Role.GROUP_ADMIN.value
    return await service.create(data_dict, user_id=current_user.get("sub"))
