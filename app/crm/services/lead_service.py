"""Lead service — business logic for lead management."""
from __future__ import annotations
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.crm.repositories.lead_repo import LeadRepository

logger = logging.getLogger(__name__)


class LeadCRMService:
    """Distinct from app.services.lead_service.LeadService — this is the CRM-specific lead service."""
    def __init__(self, db: AsyncSession):
        self.db = db
        self.lead_repo = LeadRepository(db)

    async def list_leads(
        self,
        hospital_id: Optional[str] = None,
        status: Optional[str] = None,
        doctor_id: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        items, total = await self.lead_repo.list(
            hospital_id=hospital_id, status=status, doctor_id=doctor_id,
            search=search, skip=skip, limit=limit,
        )
        data = []
        for l in items:
            data.append({
                "id": l.id,
                "full_name": l.full_name,
                "phone": l.phone,
                "email": l.email,
                "status": l.status,
                "score": l.score,
                "source": l.source,
                "treatment_interest": l.treatment_interest,
                "doctor_id": l.doctor_id,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            })
        return {"items": data, "total": total}

    async def get_lead(self, lead_id: str) -> Optional[dict]:
        l = await self.lead_repo.get(lead_id)
        if not l:
            return None
        communications = await self.lead_repo.get_communications(l.id)
        calls = await self.lead_repo.get_calls(l.id)
        return {
            "id": l.id,
            "full_name": l.full_name,
            "phone": l.phone,
            "email": l.email,
            "status": l.status,
            "score": l.score,
            "source": l.source,
            "treatment_interest": l.treatment_interest,
            "communications": [
                {"id": c.id, "type": c.communication_type, "notes": c.notes, "created_at": c.created_at.isoformat() if c.created_at else None}
                for c in communications
            ],
            "calls": [
                {"id": c.id, "duration": c.duration, "outcome": c.outcome, "notes": c.notes, "created_at": c.created_at.isoformat() if c.created_at else None}
                for c in calls
            ],
        }
