from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload
from app.repositories.base import BaseRepository
from app.models.treatment_plan_item import TreatmentPlanItem
from app.models.case import Case
from app.models.patient import Patient
from app.models.user import User


class TreatmentPlanItemRepository(BaseRepository[TreatmentPlanItem]):
    def __init__(self, db: AsyncSession):
        super().__init__(TreatmentPlanItem, db)

    def _base_query(self):
        return select(self.model).options(
            joinedload(TreatmentPlanItem.case).joinedload(Case.patient),
            joinedload(TreatmentPlanItem.assigned_doctor),
            joinedload(TreatmentPlanItem.assistant_doctor),
            joinedload(TreatmentPlanItem.created_by),
            joinedload(TreatmentPlanItem.dependency_item),
        )

    async def get_all(self, skip: int = 0, limit: int = 100, filters: Optional[Dict[str, Any]] = None, order_by: Optional[str] = None, descending: bool = False) -> List[TreatmentPlanItem]:
        query = self._base_query()
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif hasattr(self.model, key):
                    query = query.where(getattr(self.model, key) == value)
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col)
        else:
            query = query.order_by(TreatmentPlanItem.version.desc(), TreatmentPlanItem.sequence_order)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.unique().scalars().all())

    async def get(self, item_id: str) -> Optional[TreatmentPlanItem]:
        query = self._base_query().where(self.model.id == item_id)
        result = await self.db.execute(query)
        return result.unique().scalars().first()

    async def get_current_by_case(self, case_id: str) -> List[TreatmentPlanItem]:
        query = self._base_query().where(
            TreatmentPlanItem.case_id == case_id,
            TreatmentPlanItem.is_current == True,
        ).order_by(TreatmentPlanItem.sequence_order)
        result = await self.db.execute(query)
        return list(result.unique().scalars().all())

    async def get_all_versions(self, case_id: str) -> List[List[TreatmentPlanItem]]:
        query = self._base_query().where(
            TreatmentPlanItem.case_id == case_id,
        ).order_by(TreatmentPlanItem.version.desc(), TreatmentPlanItem.sequence_order)
        result = await self.db.execute(query)
        all_items = list(result.unique().scalars().all())
        versions = {}
        for item in all_items:
            versions.setdefault(item.version, []).append(item)
        return [versions[v] for v in sorted(versions.keys(), reverse=True)]
