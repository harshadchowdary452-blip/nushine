import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.models.patient_timeline import PatientTimeline
from app.repositories.audit_log_repository import AuditLogRepository

logger = logging.getLogger(__name__)


class TimelineService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit_repo = AuditLogRepository(db)

    async def add_event(
        self,
        patient_id: str,
        action: str,
        module: str = None,
        description: str = None,
        user_id: str = None,
        user_name: str = None,
        user_role: str = None,
        hospital_id: str = None,
        hospital_name: str = None,
        changes: list = None,
    ):
        entry = PatientTimeline(
            patient_id=patient_id,
            action=action,
            module=module,
            description=description,
            performed_by=user_id,
            user_name=user_name or "Former User",
            user_role=user_role,
            hospital_id=hospital_id,
            hospital_name=hospital_name,
            changes=changes or [],
        )
        self.db.add(entry)
        await self.audit_repo.create(
            user_id=user_id,
            action=action,
            entity_type=(module or "SYSTEM").upper(),
            entity_id=patient_id,
            details=description,
        )

    async def get_timeline(
        self,
        patient_id: str,
        skip: int = 0,
        limit: int = 50,
        module: str = None,
        user_id: str = None,
        action_type: str = None,
        search: str = None,
        start_date: str = None,
        end_date: str = None,
    ) -> tuple[List[dict], int]:
        q = select(PatientTimeline).where(PatientTimeline.patient_id == patient_id)

        if module:
            q = q.where(PatientTimeline.module == module)
        if user_id:
            q = q.where(PatientTimeline.performed_by == user_id)
        if action_type:
            q = q.where(PatientTimeline.action.ilike(f"%{action_type}%"))
        if search:
            q = q.where(
                PatientTimeline.user_name.ilike(f"%{search}%")
                | PatientTimeline.action.ilike(f"%{search}%")
                | PatientTimeline.description.ilike(f"%{search}%")
                | PatientTimeline.module.ilike(f"%{search}%")
            )
        if start_date:
            from datetime import datetime
            q = q.where(PatientTimeline.created_at >= datetime.fromisoformat(start_date))
        if end_date:
            from datetime import datetime
            q = q.where(PatientTimeline.created_at <= datetime.fromisoformat(end_date))

        count_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(count_q)).scalar() or 0

        q = q.order_by(desc(PatientTimeline.created_at)).offset(skip).limit(limit)
        rows = (await self.db.execute(q)).scalars().all()

        result = []
        for r in rows:
            result.append({
                "id": str(r.id),
                "patient_id": str(r.patient_id),
                "action": r.action,
                "description": r.description,
                "module": r.module,
                "performed_by": str(r.performed_by) if r.performed_by else None,
                "user_name": r.user_name,
                "user_role": r.user_role,
                "hospital_id": str(r.hospital_id) if r.hospital_id else None,
                "hospital_name": r.hospital_name,
                "changes": r.changes or [],
                "created_at": r.created_at.isoformat(),
            })

        return result, total


async def add_timeline_event(
    db: AsyncSession,
    patient_id: str,
    action: str,
    module: str = None,
    description: str = None,
    user_id: str = None,
    user_name: str = None,
    user_role: str = None,
    hospital_id: str = None,
    hospital_name: str = None,
    changes: list = None,
):
    service = TimelineService(db)
    await service.add_event(
        patient_id=patient_id,
        action=action,
        module=module,
        description=description,
        user_id=user_id,
        user_name=user_name,
        user_role=user_role,
        hospital_id=hospital_id,
        hospital_name=hospital_name,
        changes=changes,
    )
