import logging
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.laboratory_repository import LaboratoryRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.laboratory import Laboratory


class LaboratoryService:
    def __init__(self, db: AsyncSession):
        self.repo = LaboratoryRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Laboratory:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if not clean_data.get("name"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required")
        existing = await self._find_by_name(clean_data["name"])
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Laboratory '{clean_data['name']}' already exists")
        try:
            laboratory = await self.repo.create(**clean_data)
        except Exception as e:
            logging.getLogger(__name__).exception("CREATE_LABORATORY - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create laboratory: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_LABORATORY", entity_type="LABORATORY", entity_id=str(laboratory.id), details=f"Laboratory '{laboratory.name}' created")
        return laboratory

    async def create_or_get(self, name: str, user_id: str = None) -> Laboratory:
        existing = await self._find_by_name(name)
        if existing:
            return existing
        return await self.create({"name": name, "status": "ACTIVE"}, user_id=user_id)

    async def _find_by_name(self, name: str) -> Optional[Laboratory]:
        result = await self.db.execute(select(Laboratory).where(func.lower(Laboratory.name) == name.strip().lower()).limit(1))
        return result.scalar_one_or_none()

    async def get(self, laboratory_id: str) -> Optional[Laboratory]:
        return await self.repo.get(laboratory_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Laboratory]:
        query = select(Laboratory)
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                query = query.where(Laboratory.name.ilike(like) | Laboratory.code.ilike(like) | Laboratory.contact_person.ilike(like))
            elif filters.get("name"):
                query = query.where(Laboratory.name.ilike(f"%{filters['name']}%"))
            for key, value in filters.items():
                if value is None or key in ("search", "name"):
                    continue
                if hasattr(Laboratory, key):
                    query = query.where(getattr(Laboratory, key) == value)
        query = query.order_by(Laboratory.name)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count(self, filters: dict = None) -> int:
        query = select(func.count(Laboratory.id))
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                query = query.where(Laboratory.name.ilike(like) | Laboratory.code.ilike(like) | Laboratory.contact_person.ilike(like))
            for key, value in filters.items():
                if value is None or key == "search":
                    continue
                if hasattr(Laboratory, key):
                    query = query.where(getattr(Laboratory, key) == value)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def update(self, laboratory_id: str, data: dict, user_id: str = None) -> Optional[Laboratory]:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if clean_data.get("name"):
            existing = await self._find_by_name(clean_data["name"])
            if existing and existing.id != laboratory_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Laboratory '{clean_data['name']}' already exists")
        laboratory = await self.repo.update(laboratory_id, **clean_data)
        if laboratory:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_LABORATORY", entity_type="LABORATORY", entity_id=laboratory_id, details="Laboratory updated")
        return laboratory

    async def delete(self, laboratory_id: str, user_id: str = None) -> bool:
        laboratory = await self.repo.get(laboratory_id)
        if not laboratory:
            return False
        result = await self.repo.delete(laboratory_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_LABORATORY", entity_type="LABORATORY", entity_id=laboratory_id, details="Laboratory deleted")
        return result
