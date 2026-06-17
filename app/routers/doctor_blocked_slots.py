from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.doctor_blocked_slot_service import DoctorBlockedSlotService
from app.schemas.doctor_blocked_slot import DoctorBlockedSlotCreate, DoctorBlockedSlotUpdate, DoctorBlockedSlotResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/doctors/{doctor_id}/blocked-slots", tags=["Doctor Blocked Slots"])


@router.post("/", response_model=DoctorBlockedSlotResponse, status_code=status.HTTP_201_CREATED)
async def create_blocked_slot(doctor_id: str, data: DoctorBlockedSlotCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    hospital_id = current_user.get("hospital_id", "")
    service = DoctorBlockedSlotService(db)
    return await service.create({**data.model_dump(), "doctor_id": doctor_id, "hospital_id": hospital_id, "created_by": current_user.get("sub")})


@router.get("/", response_model=List[DoctorBlockedSlotResponse])
async def get_blocked_slots(doctor_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = DoctorBlockedSlotService(db)
    return await service.get_by_doctor(doctor_id)


@router.delete("/{slot_id}", response_model=MessageResponse)
async def delete_blocked_slot(doctor_id: str, slot_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    service = DoctorBlockedSlotService(db)
    await service.delete(slot_id)
    return MessageResponse(message="Blocked slot deleted")
