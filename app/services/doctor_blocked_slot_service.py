from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from app.repositories.base import BaseRepository
from app.models.doctor_blocked_slot import DoctorBlockedSlot


class DoctorBlockedSlotService:
    def __init__(self, db: AsyncSession):
        self.repo = BaseRepository(DoctorBlockedSlot, db)
        self.db = db

    async def create(self, data: dict) -> DoctorBlockedSlot:
        return await self.repo.create(**data)

    async def get(self, slot_id: str) -> Optional[DoctorBlockedSlot]:
        return await self.repo.get(slot_id)

    async def get_by_doctor(self, doctor_id: str) -> List[DoctorBlockedSlot]:
        return await self.repo.get_all(filters={"doctor_id": doctor_id})

    async def get_by_date(self, doctor_id: str, target_date: date) -> List[DoctorBlockedSlot]:
        return await self.repo.get_all(filters={"doctor_id": doctor_id, "date": target_date})

    async def delete(self, slot_id: str) -> bool:
        return await self.repo.delete(slot_id)
