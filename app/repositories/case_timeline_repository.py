from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.repositories.base import BaseRepository
from app.models.case_timeline import CaseTimeline
from app.models.user import User


class CaseTimelineRepository(BaseRepository[CaseTimeline]):
    def __init__(self, db: AsyncSession):
        super().__init__(CaseTimeline, db)

    async def get_by_case(self, case_id: str, skip: int = 0, limit: int = 100) -> List[CaseTimeline]:
        query = (
            select(self.model)
            .where(self.model.case_id == case_id)
            .options(selectinload(self.model.performer))
            .order_by(self.model.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create_entry(self, case_id: str, action: str, field_name: str = None, old_value: str = None, new_value: str = None, performed_by: str = None, performer_role: str = None) -> CaseTimeline:
        entry = self.model(
            case_id=case_id,
            action=action,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            performed_by=performed_by,
            performer_role=performer_role,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry
