from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.repositories.base import BaseRepository
from app.models.consent_form import ConsentForm


class ConsentFormRepository(BaseRepository[ConsentForm]):
    def __init__(self, db: AsyncSession):
        super().__init__(ConsentForm, db)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None, order_by: str = None, descending: bool = False):
        query = select(self.model)
        if filters:
            hospital_id = filters.pop("hospital_id", None)
            if hospital_id:
                query = query.where(ConsentForm.hospital_id == hospital_id)
            hospital_ids_in = filters.pop("hospital_id__in", None)
            if hospital_ids_in:
                query = query.where(ConsentForm.hospital_id.in_(hospital_ids_in))
            is_deleted = filters.pop("is_deleted", None)
            if is_deleted is not None:
                query = query.where(ConsentForm.is_deleted == is_deleted)
            search = filters.pop("search", None)
            if search:
                query = query.where(
                    or_(
                        ConsentForm.patient_name.ilike(f"%{search}%"),
                        ConsentForm.op_number.ilike(f"%{search}%"),
                        ConsentForm.consent_type.ilike(f"%{search}%"),
                    )
                )
            date_from = filters.pop("date_from", None)
            if date_from:
                query = query.where(ConsentForm.created_at >= date_from)
            date_to = filters.pop("date_to", None)
            if date_to:
                query = query.where(ConsentForm.created_at <= date_to)
            for key, value in filters.items():
                if key.endswith("__in") and isinstance(value, (list, tuple)):
                    attr_name = key[:-4]
                    if hasattr(self.model, attr_name):
                        query = query.where(getattr(self.model, attr_name).in_(value))
                elif hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(order_col.desc() if descending else order_col)
        else:
            query = query.order_by(ConsentForm.created_at.desc())
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count(self, filters: dict = None) -> int:
        query = select(func.count(ConsentForm.id))
        if filters:
            hospital_id = filters.pop("hospital_id", None)
            if hospital_id:
                query = query.where(ConsentForm.hospital_id == hospital_id)
            hospital_ids_in = filters.pop("hospital_id__in", None)
            if hospital_ids_in:
                query = query.where(ConsentForm.hospital_id.in_(hospital_ids_in))
            is_deleted = filters.pop("is_deleted", None)
            if is_deleted is not None:
                query = query.where(ConsentForm.is_deleted == is_deleted)
            date_from = filters.pop("date_from", None)
            if date_from:
                query = query.where(ConsentForm.created_at >= date_from)
            date_to = filters.pop("date_to", None)
            if date_to:
                query = query.where(ConsentForm.created_at <= date_to)
            for key, value in filters.items():
                if hasattr(self.model, key) and value is not None:
                    query = query.where(getattr(self.model, key) == value)
        result = await self.db.execute(query)
        return result.scalar() or 0
