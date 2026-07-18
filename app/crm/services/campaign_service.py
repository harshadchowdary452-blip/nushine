"""Campaign service — business logic for campaign management."""
from __future__ import annotations
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.crm.repositories.campaign_repo import CampaignRepository

logger = logging.getLogger(__name__)


class CampaignService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.campaign_repo = CampaignRepository(db)

    async def list_campaigns(
        self,
        hospital_id: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        items, total = await self.campaign_repo.list(
            hospital_id=hospital_id, status=status, skip=skip, limit=limit,
        )
        data = []
        for c in items:
            recipients = await self.campaign_repo.get_recipients(c.id)
            data.append({
                "id": c.id,
                "name": c.name,
                "message": c.message,
                "status": c.status,
                "campaign_type": c.campaign_type,
                "total_recipients": len(recipients),
                "sent_count": sum(1 for r in recipients if r.status == "SENT"),
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
        return {"items": data, "total": total}

    async def get_campaign(self, campaign_id: str) -> Optional[dict]:
        c = await self.campaign_repo.get(campaign_id)
        if not c:
            return None
        recipients = await self.campaign_repo.get_recipients(c.id)
        return {
            "id": c.id,
            "name": c.name,
            "message": c.message,
            "status": c.status,
            "campaign_type": c.campaign_type,
            "recipients": [
                {"id": r.id, "patient_id": r.patient_id, "status": r.status}
                for r in recipients
            ],
        }
