from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import date
from app.repositories.base import BaseRepository
from app.models.doctor_leave import DoctorLeave, LeaveStatus


class DoctorLeaveService:
    def __init__(self, db: AsyncSession):
        self.repo = BaseRepository(DoctorLeave, db)
        self.db = db

    async def create(self, data: dict) -> DoctorLeave:
        if "status" not in data or not data["status"]:
            data["status"] = LeaveStatus.PENDING
        return await self.repo.create(**data)

    async def get(self, leave_id: str) -> Optional[DoctorLeave]:
        return await self.repo.get(leave_id)

    async def get_by_doctor(self, doctor_id: str) -> List[DoctorLeave]:
        return await self.repo.get_all(filters={"doctor_id": doctor_id})

    async def get_by_hospital(self, hospital_id: str) -> List[DoctorLeave]:
        return await self.repo.get_all(filters={"hospital_id": hospital_id})

    async def update(self, leave_id: str, data: dict) -> Optional[DoctorLeave]:
        return await self.repo.update(leave_id, **data)

    async def delete(self, leave_id: str) -> bool:
        return await self.repo.delete(leave_id)

    async def is_on_leave(self, doctor_id: str, check_date: date) -> bool:
        result = await self.db.execute(
            select(func.count()).select_from(DoctorLeave).where(
                DoctorLeave.doctor_id == doctor_id,
                DoctorLeave.status == LeaveStatus.APPROVED,
                DoctorLeave.start_date <= check_date,
                DoctorLeave.end_date >= check_date,
            )
        )
        return result.scalar() > 0

    async def get_active_for_date_range(self, doctor_id: str, start: date, end: date) -> List[DoctorLeave]:
        result = await self.db.execute(
            select(DoctorLeave).where(
                DoctorLeave.doctor_id == doctor_id,
                DoctorLeave.status == LeaveStatus.APPROVED,
                DoctorLeave.start_date <= end,
                DoctorLeave.end_date >= start,
            )
        )
        return result.scalars().all()
