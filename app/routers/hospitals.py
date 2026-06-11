from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.hospital_service import HospitalService
from app.services.user_service import UserService
from app.schemas.hospital import HospitalCreate, HospitalUpdate, HospitalResponse
from app.schemas.user import UserCreate, UserResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])


@router.post("/", response_model=HospitalResponse, status_code=status.HTTP_201_CREATED)
async def create_hospital(data: HospitalCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_HOSPITAL)
    service = HospitalService(db)
    data_dict = data.model_dump(exclude_none=True)
    role = current_user.get("role")
    if role == Role.GROUP_ADMIN.value:
        data_dict["admin_group_id"] = current_user.get("admin_group_id")
    if not data_dict.get("admin_group_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin_group_id is required")
    return await service.create(data_dict, user_id=current_user.get("sub"))


@router.get("/")
async def get_hospitals(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), admin_group_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_OWN_HOSPITALS, Permission.VIEW_ALL_HOSPITALS)
    service = HospitalService(db)
    filters = {}
    role = current_user.get("role")
    if role == Role.GROUP_ADMIN.value:
        filters["admin_group_id"] = current_user.get("admin_group_id")
    elif role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        if current_user.get("hospital_id"):
            filters["id"] = current_user.get("hospital_id")
    elif role == Role.SUPER_ADMIN.value and admin_group_id:
        filters["admin_group_id"] = admin_group_id
    return await service.get_all(skip=skip, limit=limit, filters=filters or None)


@router.get("/{hospital_id}", response_model=HospitalResponse)
async def get_hospital(hospital_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_OWN_HOSPITALS, Permission.VIEW_ALL_HOSPITALS)
    service = HospitalService(db)
    hospital = await service.get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    return hospital


@router.put("/{hospital_id}", response_model=HospitalResponse)
async def update_hospital(hospital_id: str, data: HospitalUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_HOSPITAL)
    service = HospitalService(db)
    hospital = await service.update(hospital_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not hospital:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    return hospital


@router.delete("/{hospital_id}", response_model=MessageResponse)
async def delete_hospital(hospital_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_HOSPITAL)
    service = HospitalService(db)
    deleted = await service.delete(hospital_id, user_id=current_user.get("sub"))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    return MessageResponse(message="Hospital deleted successfully")


@router.post("/{hospital_id}/admins", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_hospital_admin(hospital_id: str, data: UserCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_HOSPITAL_ADMIN)
    from sqlalchemy import select
    from app.models.hospital import Hospital
    hospital_result = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hospital = hospital_result.scalar_one_or_none()
    if not hospital:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
    service = UserService(db)
    data_dict = data.model_dump(exclude_none=True)
    data_dict["hospital_id"] = hospital_id
    data_dict["role"] = Role.HOSPITAL_ADMIN.value
    data_dict["admin_group_id"] = hospital.admin_group_id
    return await service.create(data_dict, user_id=current_user.get("sub"))
