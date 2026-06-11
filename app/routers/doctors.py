from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.user_service import UserService
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas.common import MessageResponse
from app.models.hospital import Hospital

router = APIRouter(prefix="/doctors", tags=["Doctors"])


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_doctor(data: UserCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_DOCTOR)
    service = UserService(db)
    data_dict = data.model_dump(exclude_none=True)
    data_dict = {k: v for k, v in data_dict.items() if v != ""}
    data_dict["role"] = Role.DOCTOR.value
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.GROUP_ADMIN.value):
        if current_user.get("hospital_id"):
            data_dict["hospital_id"] = current_user.get("hospital_id")
        if current_user.get("admin_group_id"):
            data_dict["admin_group_id"] = current_user.get("admin_group_id")
    elif role == Role.SUPER_ADMIN.value:
        if not data_dict.get("hospital_id"):
            if current_user.get("hospital_id"):
                data_dict["hospital_id"] = current_user.get("hospital_id")
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required when creating a doctor as super admin")
        if not data_dict.get("admin_group_id"):
            if current_user.get("admin_group_id"):
                data_dict["admin_group_id"] = current_user.get("admin_group_id")
            else:
                result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == data_dict["hospital_id"]))
                hospital_row = result.one_or_none()
                if not hospital_row:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
                data_dict["admin_group_id"] = str(hospital_row[0])
    else:
        if not data_dict.get("hospital_id") and current_user.get("hospital_id"):
            data_dict["hospital_id"] = current_user.get("hospital_id")
        if not data_dict.get("admin_group_id") and current_user.get("admin_group_id"):
            data_dict["admin_group_id"] = current_user.get("admin_group_id")
        if not data_dict.get("hospital_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
    return await service.create(data_dict, user_id=current_user.get("sub"))


@router.get("/")
async def get_doctors(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), search: Optional[str] = Query(None), hospital_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_ALL_DOCTORS, Permission.MANAGE_STAFF)
    service = UserService(db)
    filters = {"role": Role.DOCTOR.value}
    if search:
        filters["search"] = search
    role = current_user.get("role")
    if role == Role.DOCTOR.value:
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.HOSPITAL_ADMIN.value:
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        filters["admin_group_id"] = current_user.get("admin_group_id")
    elif role == Role.SUPER_ADMIN.value and hospital_id:
        filters["hospital_id"] = hospital_id
    return await service.get_all(skip=skip, limit=limit, filters=filters)


@router.get("/{doctor_id}", response_model=UserResponse)
async def get_doctor(doctor_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_ALL_DOCTORS, Permission.MANAGE_STAFF)
    service = UserService(db)
    doctor = await service.get(doctor_id)
    if not doctor or doctor.role != Role.DOCTOR:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    await verify_tenant_access(current_user, doctor, "doctor", db)
    return doctor


@router.put("/{doctor_id}", response_model=UserResponse)
async def update_doctor(doctor_id: str, data: UserUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_DOCTOR)
    service = UserService(db)
    doctor = await service.get(doctor_id)
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    await verify_tenant_access(current_user, doctor, "doctor", db)
    doctor = await service.update(doctor_id, data.model_dump(exclude_none=True), admin_id=current_user.get("sub"))
    return doctor


@router.post("/{doctor_id}/deactivate", response_model=MessageResponse)
async def deactivate_doctor(doctor_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_STAFF)
    service = UserService(db)
    doctor = await service.get(doctor_id)
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    await verify_tenant_access(current_user, doctor, "doctor", db)
    doctor = await service.deactivate(doctor_id, admin_id=current_user.get("sub"))
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    return MessageResponse(message="Doctor deactivated successfully")


@router.post("/{doctor_id}/activate", response_model=MessageResponse)
async def activate_doctor(doctor_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_STAFF)
    service = UserService(db)
    doctor = await service.get(doctor_id)
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    await verify_tenant_access(current_user, doctor, "doctor", db)
    doctor = await service.activate(doctor_id, admin_id=current_user.get("sub"))
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
    return MessageResponse(message="Doctor activated successfully")
