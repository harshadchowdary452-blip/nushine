from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.doctor_working_hour_service import DoctorWorkingHourService
from app.schemas.doctor_working_hour import DoctorWorkingHourCreate, DoctorWorkingHourUpdate, DoctorWorkingHourResponse, DoctorWorkingHourBulkCreate

router = APIRouter(prefix="/doctors/{doctor_id}/working-hours", tags=["Doctor Working Hours"])


@router.get("/", response_model=List[DoctorWorkingHourResponse])
async def get_working_hours(doctor_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    admin_group_id = current_user.get("admin_group_id", "")
    service = DoctorWorkingHourService(db)
    schedules = await service.ensure_defaults(doctor_id, admin_group_id)
    return schedules


@router.post("/bulk", response_model=List[DoctorWorkingHourResponse])
async def bulk_update_working_hours(doctor_id: str, data: DoctorWorkingHourBulkCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == Role.DOCTOR.value and current_user.get("sub") != doctor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctors can only update their own schedule")
    if role != Role.DOCTOR.value:
        verify_permission(current_user, Permission.MANAGE_STAFF)
    admin_group_id = current_user.get("admin_group_id", "")
    service = DoctorWorkingHourService(db)
    schedules = [s.model_dump() for s in data.schedules]
    return await service.bulk_update(doctor_id, schedules, admin_group_id)
