from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.repositories.base import BaseRepository
from app.models.case import Case, ClinicalFinding
from app.models.patient import Patient
from app.models.user import User


class CaseRepository(BaseRepository[Case]):
    def __init__(self, db: AsyncSession):
        super().__init__(Case, db)

    async def get(self, id: Any) -> Optional[Case]:
        query = select(self.model).where(self.model.id == id).options(
            selectinload(self.model.patient),
            selectinload(self.model.doctor),
            selectinload(self.model.created_by),
            selectinload(self.model.updated_by),
            selectinload(self.model.consultant),
            selectinload(self.model.appointment),
            selectinload(self.model.findings),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 100, filters: Optional[Dict[str, Any]] = None, order_by: Optional[str] = None, descending: bool = False) -> List[Case]:
        query = select(self.model).options(
            selectinload(self.model.patient),
            selectinload(self.model.doctor),
            selectinload(self.model.created_by),
            selectinload(self.model.updated_by),
            selectinload(self.model.consultant),
            selectinload(self.model.appointment),
            selectinload(self.model.findings),
        )
        if filters:
            hospital_id = filters.pop("hospital_id", None)
            if hospital_id:
                query = query.join(Patient, Case.patient_id == Patient.id).where(Patient.hospital_id == hospital_id)
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
