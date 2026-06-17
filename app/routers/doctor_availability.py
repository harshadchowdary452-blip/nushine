from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.doctor_availability_service import DoctorAvailabilityService
from app.schemas.doctor_availability import DoctorAvailabilityCreate, DoctorAvailabilityUpdate, DoctorAvailabilityResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/doctors/{doctor_id}/availability", tags=["Doctor Availability"])


@router.post("/", response_model=DoctorAvailabilityResponse, status_code=status.HTTP_201_CREATED)
async def create_availability(doctor_id: str, data: DoctorAvailabilityCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    hospital_id = current_user.get("hospital_id", "")
    service = DoctorAvailabilityService(db)
    return await service.create({**data.model_dump(), "doctor_id": doctor_id, "hospital_id": hospital_id, "created_by": current_user.get("sub")})


@router.get("/", response_model=List[DoctorAvailabilityResponse])
async def get_availability_list(doctor_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = DoctorAvailabilityService(db)
    return await service.get_by_doctor(doctor_id)


@router.get("/{override_id}", response_model=DoctorAvailabilityResponse)
async def get_availability(doctor_id: str, override_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = DoctorAvailabilityService(db)
    item = await service.get(override_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return item


@router.put("/{override_id}", response_model=DoctorAvailabilityResponse)
async def update_availability(doctor_id: str, override_id: str, data: DoctorAvailabilityUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    service = DoctorAvailabilityService(db)
    item = await service.get(override_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return await service.update(override_id, {**data.model_dump(exclude_none=True), "updated_by": current_user.get("sub")})


@router.delete("/{override_id}", response_model=MessageResponse)
async def delete_availability(doctor_id: str, override_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    service = DoctorAvailabilityService(db)
    await service.delete(override_id)
    return MessageResponse(message="Availability override deleted")
