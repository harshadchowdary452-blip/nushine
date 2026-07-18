"""Follow-up repository — all follow-up database operations."""
from __future__ import annotations
from typing import Optional
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType


class FollowUpRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, follow_up_id: str) -> Optional[FollowUp]:
        return await self.db.get(FollowUp, follow_up_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        status: Optional[str] = None,
        follow_up_type: Optional[str] = None,
        doctor_id: Optional[str] = None,
        filter_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[FollowUp], int]:
        query = select(FollowUp).where(FollowUp.is_active == True)
        count_query = select(func.count()).select_from(FollowUp).where(FollowUp.is_active == True)

        if hospital_id:
            query = query.where(FollowUp.hospital_id == hospital_id)
            count_query = count_query.where(FollowUp.hospital_id == hospital_id)
        if patient_id:
            query = query.where(FollowUp.patient_id == patient_id)
            count_query = count_query.where(FollowUp.patient_id == patient_id)
        if status:
            query = query.where(FollowUp.status == status)
            count_query = count_query.where(FollowUp.status == status)
        if follow_up_type:
            query = query.where(FollowUp.follow_up_type == follow_up_type)
            count_query = count_query.where(FollowUp.follow_up_type == follow_up_type)
        if doctor_id:
            query = query.where(FollowUp.doctor_id == doctor_id)
            count_query = count_query.where(FollowUp.doctor_id == doctor_id)
        if filter_type == "pending":
            query = query.where(FollowUp.status.in_(["PENDING", "SCHEDULED", "OVERDUE"]))
            count_query = count_query.where(FollowUp.status.in_(["PENDING", "SCHEDULED", "OVERDUE"]))
        elif filter_type == "completed":
            query = query.where(FollowUp.status.in_(["COMPLETED", "DONE"]))
            count_query = count_query.where(FollowUp.status.in_(["COMPLETED", "DONE"]))
        elif filter_type == "overdue":
            query = query.where(
                FollowUp.follow_up_date < date.today(),
                FollowUp.status.in_(["PENDING", "SCHEDULED", "CONTACTED"]),
            )
            count_query = count_query.where(
                FollowUp.follow_up_date < date.today(),
                FollowUp.status.in_(["PENDING", "SCHEDULED", "CONTACTED"]),
            )

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(FollowUp.follow_up_date.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_pending_by_date(self, follow_up_date: date, hospital_id: Optional[str] = None) -> list[FollowUp]:
        query = select(FollowUp).where(
            FollowUp.follow_up_date == follow_up_date,
            FollowUp.status.in_(["PENDING", "SCHEDULED"]),
            FollowUp.is_active == True,
        )
        if hospital_id:
            query = query.where(FollowUp.hospital_id == hospital_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_overdue(self, hospital_id: Optional[str] = None) -> list[FollowUp]:
        query = select(FollowUp).where(
            FollowUp.follow_up_date < date.today(),
            FollowUp.status.in_(["PENDING", "SCHEDULED", "CONTACTED"]),
            FollowUp.is_active == True,
        )
        if hospital_id:
            query = query.where(FollowUp.hospital_id == hospital_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_by_status(self, hospital_id: Optional[str] = None) -> dict[str, int]:
        query = select(FollowUp.status, func.count()).where(FollowUp.is_active == True)
        if hospital_id:
            query = query.where(FollowUp.hospital_id == hospital_id)
        query = query.group_by(FollowUp.status)
        result = await self.db.execute(query)
        return {row[0]: row[1] for row in result.all()}

    async def count_by_channel(self, hospital_id: Optional[str] = None) -> dict[str, int]:
        query = select(FollowUp.channel, func.count()).where(
            FollowUp.is_active == True,
            FollowUp.channel.isnot(None),
        )
        if hospital_id:
            query = query.where(FollowUp.hospital_id == hospital_id)
        query = query.group_by(FollowUp.channel)
        result = await self.db.execute(query)
        return {row[0]: row[1] for row in result.all()}

    async def get_patient_follow_ups(self, patient_id: str) -> list[FollowUp]:
        query = select(FollowUp).where(
            FollowUp.patient_id == patient_id,
            FollowUp.is_active == True,
        ).order_by(FollowUp.follow_up_date.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def has_existing(self, patient_id: str, treatment_name: Optional[str] = None) -> bool:
        query = select(FollowUp).where(
            FollowUp.patient_id == patient_id,
            FollowUp.status.in_(["PENDING", "SCHEDULED", "CONTACTED"]),
        )
        if treatment_name:
            query = query.where(FollowUp.treatment_name.ilike(f"%{treatment_name}%"))
        query = query.limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none() is not None

    async def create(self, follow_up: FollowUp) -> FollowUp:
        self.db.add(follow_up)
        await self.db.flush()
        return follow_up

    async def update(self, follow_up: FollowUp) -> FollowUp:
        await self.db.flush()
        return follow_up

    async def delete(self, follow_up: FollowUp) -> None:
        follow_up.is_active = False
        await self.db.flush()
