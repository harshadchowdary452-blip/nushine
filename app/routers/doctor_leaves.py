from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.doctor_leave_service import DoctorLeaveService
from app.schemas.doctor_leave import DoctorLeaveCreate, DoctorLeaveUpdate, DoctorLeaveResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/doctors/{doctor_id}/leaves", tags=["Doctor Leaves"])


@router.post("/", response_model=DoctorLeaveResponse, status_code=status.HTTP_201_CREATED)
async def create_leave(doctor_id: str, data: DoctorLeaveCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    hospital_id = current_user.get("hospital_id", "")
    service = DoctorLeaveService(db)
    return await service.create({**data.model_dump(), "doctor_id": doctor_id, "hospital_id": hospital_id, "created_by": current_user.get("sub")})


@router.get("/", response_model=List[DoctorLeaveResponse])
async def get_leaves(doctor_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = DoctorLeaveService(db)
    return await service.get_by_doctor(doctor_id)


@router.put("/{leave_id}", response_model=DoctorLeaveResponse)
async def update_leave(doctor_id: str, leave_id: str, data: DoctorLeaveUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    service = DoctorLeaveService(db)
    leave = await service.get(leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return await service.update(leave_id, {**data.model_dump(exclude_none=True), "updated_by": current_user.get("sub")})


@router.delete("/{leave_id}", response_model=MessageResponse)
async def delete_leave(doctor_id: str, leave_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    service = DoctorLeaveService(db)
    await service.delete(leave_id)
    return MessageResponse(message="Leave deleted")
