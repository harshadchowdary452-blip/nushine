"""Communication service — business logic for WhatsApp, Email, SMS."""
from __future__ import annotations
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.crm.repositories.communication_repo import CommunicationRepository
from app.crm.enums import CommunicationChannel, CommunicationStatus, MessageType

logger = logging.getLogger(__name__)


class CommunicationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.comm_repo = CommunicationRepository(db)

    async def list_communications(
        self,
        hospital_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        channel: Optional[str] = None,
        message_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        items, total = await self.comm_repo.list(
            hospital_id=hospital_id, patient_id=patient_id,
            channel=channel, message_type=message_type,
            skip=skip, limit=limit,
        )
        data = []
        for c in items:
            data.append({
                "id": c.id,
                "patient_id": c.patient_id,
                "channel": c.channel,
                "message_type": c.message_type,
                "subject": c.subject,
                "message": c.message,
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
        return {"items": data, "total": total}

    async def get_patient_communications(self, patient_id: str) -> list[dict]:
        items = await self.comm_repo.get_patient_communications(patient_id)
        return [
            {
                "id": c.id,
                "channel": c.channel,
                "message_type": c.message_type,
                "subject": c.subject,
                "message": c.message,
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in items
        ]

    async def log_communication(
        self,
        patient_id: str,
        hospital_id: Optional[str],
        channel: str,
        message_type: str,
        message: str,
        subject: Optional[str] = None,
        status: str = "SENT",
        lead_id: Optional[str] = None,
    ) -> dict:
        from app.models.communication_log import CommunicationLog
        log = CommunicationLog(
            patient_id=patient_id,
            hospital_id=hospital_id,
            lead_id=lead_id,
            channel=channel,
            message_type=message_type,
            subject=subject,
            message=message,
            status=status,
        )
        await self.comm_repo.create(log)
        return {"id": log.id, "status": log.status}
