from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from datetime import time
from app.repositories.base import BaseRepository
from app.models.doctor_working_hour import DoctorWorkingHour, WEEKDAYS
from app.models.hospital import Hospital


class DoctorWorkingHourService:
    def __init__(self, db: AsyncSession):
        self.repo = BaseRepository(DoctorWorkingHour, db)
        self.db = db

    async def _resolve_hospital_id(self, doctor_id: str, admin_group_id: str) -> str:
        """Resolve a hospital_id for working hours records. Prefers doctor's hospital_id,
        otherwise uses any hospital in the admin group, or falls back to empty string."""
        from app.models.user import User
        doc_result = await self.db.execute(select(User.hospital_id).where(User.id == doctor_id))
        doc_row = doc_result.one_or_none()
        if doc_row and doc_row[0]:
            return doc_row[0]
        any_hosp = await self.db.execute(
            select(Hospital.id).where(Hospital.admin_group_id == admin_group_id).limit(1)
        )
        any_row = any_hosp.one_or_none()
        return any_row[0] if any_row else ""

    async def get_defaults(self, doctor_id: str, admin_group_id: str) -> list[dict]:
        hospital_id = await self._resolve_hospital_id(doctor_id, admin_group_id)
        return [
            {"doctor_id": doctor_id, "hospital_id": hospital_id, "day_of_week": i,
             "start_time": time(9, 0), "end_time": time(21, 0),
             "lunch_start": time(13, 0), "lunch_end": time(14, 0),
             "is_available": i < 6}
            for i in range(7)
        ]

    async def ensure_defaults(self, doctor_id: str, admin_group_id: str) -> List[DoctorWorkingHour]:
        existing = await self.repo.get_all(filters={"doctor_id": doctor_id})
        if existing:
            return existing
        defaults = await self.get_defaults(doctor_id, admin_group_id)
        created = []
        for s in defaults:
            rec = await self.repo.create(**s)
            created.append(rec)
        return created

    async def get_by_doctor(self, doctor_id: str) -> List[DoctorWorkingHour]:
        return await self.repo.get_all(filters={"doctor_id": doctor_id})

    async def bulk_update(self, doctor_id: str, schedules: list[dict], admin_group_id: str = "") -> List[DoctorWorkingHour]:
        await self.db.execute(sa_delete(DoctorWorkingHour).where(DoctorWorkingHour.doctor_id == doctor_id))
        hospital_id = await self._resolve_hospital_id(doctor_id, admin_group_id) if admin_group_id else ""
        created = []
        for s in schedules:
            rec = await self.repo.create(
                doctor_id=doctor_id,
                hospital_id=s.get("hospital_id", hospital_id),
                day_of_week=s["day_of_week"],
                start_time=s["start_time"],
                end_time=s["end_time"],
                lunch_start=s.get("lunch_start"),
                lunch_end=s.get("lunch_end"),
                is_available=s.get("is_available", True),
            )
            created.append(rec)
        return created

    async def get_working_hours(self, doctor_id: str, day_of_week: int) -> Optional[DoctorWorkingHour]:
        results = await self.repo.get_all(filters={"doctor_id": doctor_id, "day_of_week": day_of_week, "is_available": True})
        return results[0] if results else None
