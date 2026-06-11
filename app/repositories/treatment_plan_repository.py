from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.repositories.base import BaseRepository
from app.models.treatment_plan import TreatmentPlan
from app.models.case import Case
from app.models.patient import Patient


class TreatmentPlanRepository(BaseRepository[TreatmentPlan]):
    def __init__(self, db: AsyncSession):
        super().__init__(TreatmentPlan, db)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: Optional[Dict[str, Any]] = None, order_by: Optional[str] = None, descending: bool = False) -> List[TreatmentPlan]:
        query = select(self.model)
        if filters:
            hospital_id = filters.pop("hospital_id", None)
            if hospital_id:
                query = query.join(Case, TreatmentPlan.case_id == Case.id).join(Patient, Case.patient_id == Patient.id).where(Patient.hospital_id == hospital_id)
            for key, value in filters.items():
                if key.endswith("__in") and isinstance(value, (list, tuple)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif key == "search" and value and hasattr(self.model, "full_name"):
                    query = query.where(self.model.full_name.ilike(f"%{value}%"))
                elif hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())
