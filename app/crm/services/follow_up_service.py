"""Follow-up service — business logic for follow-up management."""
from __future__ import annotations
import logging
from typing import Optional
from datetime import date, time, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.crm.repositories.follow_up_repo import FollowUpRepository
from app.crm.repositories.communication_repo import CommunicationRepository
from app.crm.enums import FollowUpStatus, FollowUpType, CommunicationChannel
from app.crm.utils import enrich_follow_up

logger = logging.getLogger(__name__)


class FollowUpService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.follow_up_repo = FollowUpRepository(db)
        self.communication_repo = CommunicationRepository(db)

    async def list_follow_ups(
        self,
        hospital_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        status: Optional[str] = None,
        follow_up_type: Optional[str] = None,
        doctor_id: Optional[str] = None,
        filter_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        items, total = await self.follow_up_repo.list(
            hospital_id=hospital_id, patient_id=patient_id, status=status,
            follow_up_type=follow_up_type, doctor_id=doctor_id,
            filter_type=filter_type, skip=skip, limit=limit,
        )
        enriched = [await enrich_follow_up(self.db, fu) for fu in items]
        return {"items": enriched, "total": total, "page": (skip // limit) + 1, "pages": (total + limit - 1) // limit}

    async def get_follow_up(self, follow_up_id: str) -> Optional[dict]:
        fu = await self.follow_up_repo.get(follow_up_id)
        if not fu:
            return None
        return await enrich_follow_up(self.db, fu)

    async def create_follow_up(self, data: dict) -> dict:
        from app.models.follow_up import FollowUp
        fu = FollowUp(
            patient_id=data["patient_id"],
            hospital_id=data.get("hospital_id"),
            doctor_id=data.get("doctor_id"),
            case_id=data.get("case_id"),
            follow_up_date=date.fromisoformat(data["follow_up_date"]),
            follow_up_time=time.fromisoformat(data["follow_up_time"]) if data.get("follow_up_time") else None,
            follow_up_type=data.get("follow_up_type", FollowUpType.CUSTOM_FOLLOW_UP.value),
            status=FollowUpStatus.PENDING.value,
            notes=data.get("notes"),
        )
        await self.follow_up_repo.create(fu)
        return await enrich_follow_up(self.db, fu)

    async def update_follow_up(self, follow_up_id: str, data: dict) -> Optional[dict]:
        fu = await self.follow_up_repo.get(follow_up_id)
        if not fu:
            return None
        for key, value in data.items():
            if value is not None and hasattr(fu, key):
                setattr(fu, key, value)
        await self.follow_up_repo.update(fu)
        return await enrich_follow_up(self.db, fu)

    async def delete_follow_up(self, follow_up_id: str) -> bool:
        fu = await self.follow_up_repo.get(follow_up_id)
        if not fu:
            return False
        await self.follow_up_repo.delete(fu)
        return True

    async def record_feedback(self, follow_up_id: str, data: dict) -> Optional[dict]:
        fu = await self.follow_up_repo.get(follow_up_id)
        if not fu:
            return None
        fu.status = data.get("response_status", fu.status)
        fu.patient_feedback = data.get("patient_feedback", fu.patient_feedback)
        fu.staff_notes = data.get("staff_notes", fu.staff_notes)
        fu.response_summary = data.get("response_summary", fu.response_summary)
        fu.next_action = data.get("next_action")
        fu.contact_channel = data.get("contact_channel")
        await self.follow_up_repo.update(fu)
        return await enrich_follow_up(self.db, fu)

    async def reschedule(self, follow_up_id: str, new_date: str, new_time: Optional[str] = None) -> Optional[dict]:
        fu = await self.follow_up_repo.get(follow_up_id)
        if not fu:
            return None
        fu.follow_up_date = date.fromisoformat(new_date)
        if new_time:
            fu.follow_up_time = time.fromisoformat(new_time)
        fu.status = FollowUpStatus.RESCHEDULED.value
        await self.follow_up_repo.update(fu)
        return await enrich_follow_up(self.db, fu)

    async def mark_completed(self, follow_up_id: str) -> Optional[dict]:
        fu = await self.follow_up_repo.get(follow_up_id)
        if not fu:
            return None
        fu.status = FollowUpStatus.COMPLETED.value
        fu.completed_at = datetime.now(timezone.utc)
        await self.follow_up_repo.update(fu)
        return await enrich_follow_up(self.db, fu)

    async def get_dashboard_stats(self, hospital_id: Optional[str] = None) -> dict:
        today = date.today()
        status_counts = await self.follow_up_repo.count_by_status(hospital_id)
        channel_counts = await self.follow_up_repo.count_by_channel(hospital_id)
        overdue = await self.follow_up_repo.get_overdue(hospital_id)
        today_follow_ups = await self.follow_up_repo.get_pending_by_date(today, hospital_id)

        return {
            "today_follow_ups": len(today_follow_ups),
            "upcoming": sum(1 for s, c in status_counts.items() if s in ["PENDING", "SCHEDULED"]),
            "overdue": len(overdue),
            "completed_today": status_counts.get("COMPLETED", 0) + status_counts.get("DONE", 0),
            "by_status": status_counts,
            "by_channel": channel_counts,
        }

    async def get_patient_timeline(self, patient_id: str) -> dict:
        follow_ups = await self.follow_up_repo.get_patient_follow_ups(patient_id)
        communications = await self.communication_repo.get_patient_communications(patient_id)
        
        fu_data = [await enrich_follow_up(self.db, fu) for fu in follow_ups]
        comm_data = []
        for c in communications:
            comm_data.append({
                "id": c.id,
                "channel": c.channel,
                "message_type": c.message_type,
                "subject": c.subject,
                "message": c.message,
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
        
        return {"follow_ups": fu_data, "communications": comm_data}

    async def escalate(self, follow_up_id: str) -> Optional[dict]:
        fu = await self.follow_up_repo.get(follow_up_id)
        if not fu:
            return None
        fu.escalation_level = (fu.escalation_level or 0) + 1
        fu.status = FollowUpStatus.ESCALATED.value
        await self.follow_up_repo.update(fu)
        return await enrich_follow_up(self.db, fu)
