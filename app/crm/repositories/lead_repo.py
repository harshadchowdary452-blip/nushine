"""Lead repository — all lead database operations."""
from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.lead import Lead, LeadStatus, LeadCommunication, LeadCall


class LeadRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, lead_id: str) -> Optional[Lead]:
        return await self.db.get(Lead, lead_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        status: Optional[str] = None,
        doctor_id: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Lead], int]:
        query = select(Lead).where(Lead.is_active == True)
        count_query = select(func.count()).select_from(Lead).where(Lead.is_active == True)

        if hospital_id:
            query = query.where(Lead.hospital_id == hospital_id)
            count_query = count_query.where(Lead.hospital_id == hospital_id)
        if status:
            query = query.where(Lead.status == status)
            count_query = count_query.where(Lead.status == status)
        if doctor_id:
            query = query.where(Lead.doctor_id == doctor_id)
            count_query = count_query.where(Lead.doctor_id == doctor_id)
        if search:
            search_filter = Lead.full_name.ilike(f"%{search}%") | Lead.phone.ilike(f"%{search}%")
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(Lead.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def count_by_status(self, hospital_id: Optional[str] = None) -> dict[str, int]:
        query = select(Lead.status, func.count()).where(Lead.is_active == True)
        if hospital_id:
            query = query.where(Lead.hospital_id == hospital_id)
        query = query.group_by(Lead.status)
        result = await self.db.execute(query)
        return {row[0]: row[1] for row in result.all()}

    async def get_communications(self, lead_id: str) -> list[LeadCommunication]:
        query = select(LeadCommunication).where(LeadCommunication.lead_id == lead_id).order_by(LeadCommunication.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_calls(self, lead_id: str) -> list[LeadCall]:
        query = select(LeadCall).where(LeadCall.lead_id == lead_id).order_by(LeadCall.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, lead: Lead) -> Lead:
        self.db.add(lead)
        await self.db.flush()
        return lead

    async def update(self, lead: Lead) -> Lead:
        await self.db.flush()
        return lead
