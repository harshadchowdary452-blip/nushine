"""Analytics service — business logic for CRM analytics and reports."""
from __future__ import annotations
import logging
from typing import Optional
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.crm.utils import calculate_period_dates, categorize_patient_source
from app.crm.repositories.follow_up_repo import FollowUpRepository
from app.crm.repositories.lead_repo import LeadRepository

logger = logging.getLogger(__name__)


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.follow_up_repo = FollowUpRepository(db)
        self.lead_repo = LeadRepository(db)

    async def get_source_analytics(self, hospital_id: Optional[str] = None) -> dict:
        from app.models.patient import Patient
        query = select(Patient.patient_source, func.count()).where(Patient.is_active == True)
        if hospital_id:
            query = query.where(Patient.hospital_id == hospital_id)
        query = query.group_by(Patient.patient_source)
        result = await self.db.execute(query)
        
        raw = {}
        for source, count in result.all():
            category = categorize_patient_source(source)
            raw[category] = raw.get(category, 0) + count
        
        return {"sources": [{"source": k, "count": v} for k, v in sorted(raw.items(), key=lambda x: -x[1])]}

    async def get_performance_report(
        self,
        hospital_id: Optional[str] = None,
        period: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> dict:
        start, end = calculate_period_dates(period, start_date, end_date)
        status_counts = await self.follow_up_repo.count_by_status(hospital_id)
        channel_counts = await self.follow_up_repo.count_by_channel(hospital_id)
        
        total = sum(status_counts.values())
        completed = status_counts.get("COMPLETED", 0) + status_counts.get("DONE", 0)
        
        return {
            "period": {"start": start.isoformat(), "end": end.isoformat()},
            "total_follow_ups": total,
            "completed": completed,
            "completion_rate": round(completed / total * 100, 1) if total > 0 else 0,
            "by_status": status_counts,
            "by_channel": channel_counts,
        }

    async def get_recall_effectiveness(self, hospital_id: Optional[str] = None) -> dict:
        from app.models.follow_up import FollowUp, FollowUpType
        query = select(
            FollowUp.treatment_name,
            func.count().label("total"),
            func.count().filter(FollowUp.status.in_(["COMPLETED", "DONE"])).label("completed"),
        ).where(
            FollowUp.follow_up_type == FollowUpType.RECALL.value,
            FollowUp.is_active == True,
        )
        if hospital_id:
            query = query.where(FollowUp.hospital_id == hospital_id)
        query = query.group_by(FollowUp.treatment_name)
        result = await self.db.execute(query)
        
        recalls = []
        for row in result.all():
            total = row.total
            completed = row.completed
            recalls.append({
                "treatment": row.treatment_name or "General",
                "total": total,
                "completed": completed,
                "rate": round(completed / total * 100, 1) if total > 0 else 0,
            })
        
        return {"recalls": recalls}
