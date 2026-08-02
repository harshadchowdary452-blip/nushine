from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.repositories.base import BaseRepository
from app.models.billing import Billing
from app.models.case import Case
from app.models.patient import Patient


class BillingRepository(BaseRepository[Billing]):
    def __init__(self, db: AsyncSession):
        super().__init__(Billing, db)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: Optional[Dict[str, Any]] = None, order_by: Optional[str] = None, descending: bool = False) -> List[Billing]:
        query = select(self.model)
        if filters:
            hospital_id = filters.pop("hospital_id", None)
            if hospital_id:
                query = query.join(Case, Billing.case_id == Case.id).join(Patient, Case.patient_id == Patient.id).where(Patient.hospital_id == hospital_id)
            hospital_ids_in = filters.pop("hospital_id__in", None)
            if hospital_ids_in:
                query = query.join(Case, Billing.case_id == Case.id).join(Patient, Case.patient_id == Patient.id).where(Patient.hospital_id.in_(hospital_ids_in))
            for key, value in filters.items():
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif key == "search" and value:
                    term = f"%{value}%"
                    conditions = [Billing.patient_name.ilike(term), Billing.invoice_number.ilike(term)]
                    if hasattr(self.model, "full_name"):
                        conditions.append(self.model.full_name.ilike(term))
                    query = query.where(or_(*conditions))
                elif hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())
