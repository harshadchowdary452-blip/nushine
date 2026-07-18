"""Communication log repository — all communication database operations."""
from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.communication_log import CommunicationLog, CommunicationChannel, CommunicationStatus


class CommunicationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, log_id: str) -> Optional[CommunicationLog]:
        return await self.db.get(CommunicationLog, log_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        channel: Optional[str] = None,
        message_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[CommunicationLog], int]:
        query = select(CommunicationLog)
        count_query = select(func.count()).select_from(CommunicationLog)

        if hospital_id:
            query = query.where(CommunicationLog.hospital_id == hospital_id)
            count_query = count_query.where(CommunicationLog.hospital_id == hospital_id)
        if patient_id:
            query = query.where(CommunicationLog.patient_id == patient_id)
            count_query = count_query.where(CommunicationLog.patient_id == patient_id)
        if channel:
            query = query.where(CommunicationLog.channel == channel)
            count_query = count_query.where(CommunicationLog.channel == channel)
        if message_type:
            query = query.where(CommunicationLog.message_type == message_type)
            count_query = count_query.where(CommunicationLog.message_type == message_type)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(CommunicationLog.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_patient_communications(self, patient_id: str, limit: int = 50) -> list[CommunicationLog]:
        query = select(CommunicationLog).where(
            CommunicationLog.patient_id == patient_id
        ).order_by(CommunicationLog.created_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, log: CommunicationLog) -> CommunicationLog:
        self.db.add(log)
        await self.db.flush()
        return log
