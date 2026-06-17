from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from app.repositories.base import BaseRepository
from app.models.doctor_availability import DoctorAvailability


class DoctorAvailabilityService:
    def __init__(self, db: AsyncSession):
        self.repo = BaseRepository(DoctorAvailability, db)
        self.db = db

    async def create(self, data: dict) -> DoctorAvailability:
        return await self.repo.create(**data)

    async def get(self, override_id: str) -> Optional[DoctorAvailability]:
        return await self.repo.get(override_id)

    async def get_by_doctor(self, doctor_id: str) -> List[DoctorAvailability]:
        return await self.repo.get_all(filters={"doctor_id": doctor_id})

    async def get_by_date(self, doctor_id: str, target_date: date) -> Optional[DoctorAvailability]:
        results = await self.repo.get_all(filters={"doctor_id": doctor_id, "date": target_date})
        return results[0] if results else None

    async def update(self, override_id: str, data: dict) -> Optional[DoctorAvailability]:
        return await self.repo.update(override_id, **data)

    async def delete(self, override_id: str) -> bool:
        return await self.repo.delete(override_id)
