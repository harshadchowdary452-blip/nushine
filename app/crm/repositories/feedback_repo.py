"""Patient feedback repository."""
from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.patient_feedback import PatientFeedback


class FeedbackRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, feedback_id: str) -> Optional[PatientFeedback]:
        return await self.db.get(PatientFeedback, feedback_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[PatientFeedback], int]:
        query = select(PatientFeedback)
        count_query = select(func.count()).select_from(PatientFeedback)

        if hospital_id:
            query = query.where(PatientFeedback.hospital_id == hospital_id)
            count_query = count_query.where(PatientFeedback.hospital_id == hospital_id)
        if doctor_id:
            query = query.where(PatientFeedback.doctor_id == doctor_id)
            count_query = count_query.where(PatientFeedback.doctor_id == doctor_id)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(PatientFeedback.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def create(self, feedback: PatientFeedback) -> PatientFeedback:
        self.db.add(feedback)
        await self.db.flush()
        return feedback
