"""Campaign repository — all campaign database operations."""
from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.campaign import Campaign, CampaignRecipient, CampaignStatus


class CampaignRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, campaign_id: str) -> Optional[Campaign]:
        return await self.db.get(Campaign, campaign_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[Campaign], int]:
        query = select(Campaign)
        count_query = select(func.count()).select_from(Campaign)

        if hospital_id:
            query = query.where(Campaign.hospital_id == hospital_id)
            count_query = count_query.where(Campaign.hospital_id == hospital_id)
        if status:
            query = query.where(Campaign.status == status)
            count_query = count_query.where(Campaign.status == status)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(Campaign.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_recipients(self, campaign_id: str) -> list[CampaignRecipient]:
        query = select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, campaign: Campaign) -> Campaign:
        self.db.add(campaign)
        await self.db.flush()
        return campaign

    async def update(self, campaign: Campaign) -> Campaign:
        await self.db.flush()
        return campaign
