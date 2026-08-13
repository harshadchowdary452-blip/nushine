import logging
from typing import Optional, List
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.laboratory_repository import LaboratoryRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.laboratory import Laboratory
from app.models.hospital import Hospital


class LaboratoryService:
    def __init__(self, db: AsyncSession):
        self.repo = LaboratoryRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _hospital_scope(self, current_user: dict) -> Optional[List[str]]:
        """Hospital ids the caller may access. None = unrestricted (SUPER_ADMIN)."""
        if not current_user:
            return None
        role = current_user.get("role")
        if role == "SUPER_ADMIN":
            return None
        if role == "GROUP_ADMIN":
            agid = current_user.get("admin_group_id")
            if not agid:
                return []
            r = await self.db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            return [str(row[0]) for row in r.all()]
        hid = current_user.get("hospital_id")
        return [str(hid)] if hid else []

    async def _resolve_admin_group(self, hospital_id: str) -> Optional[str]:
        if not hospital_id:
            return None
        r = await self.db.execute(select(Hospital.admin_group_id).where(Hospital.id == hospital_id))
        row = r.one_or_none()
        return str(row[0]) if row and row[0] else None

    async def _ensure_access(self, current_user: dict, laboratory: Laboratory):
        """Reject writes to laboratories belonging to another hospital."""
        if not current_user:
            return
        role = current_user.get("role")
        if role == "SUPER_ADMIN":
            return
        if not laboratory.hospital_id:
            return  # legacy global laboratory: shared and visible to all scoped roles
        scope = await self._hospital_scope(current_user)
        if scope and str(laboratory.hospital_id) in scope:
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Access denied: laboratory belongs to another hospital")

    def _apply_scope(self, query, scope: Optional[List[str]]):
        if scope is None:
            return query
        if not scope:
            return query.where(Laboratory.hospital_id.is_(None))
        return query.where(or_(Laboratory.hospital_id.is_(None), Laboratory.hospital_id.in_(scope)))

    async def create(self, data: dict, user_id: str = None, hospital_id: str = None) -> Laboratory:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if not clean_data.get("name"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required")
        existing = await self._find_by_name(clean_data["name"])
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Laboratory '{clean_data['name']}' already exists")
        resolved_hospital_id = clean_data.pop("hospital_id", None) or hospital_id
        admin_group_id = clean_data.pop("admin_group_id", None)
        if resolved_hospital_id:
            clean_data["hospital_id"] = resolved_hospital_id
            if not admin_group_id:
                admin_group_id = await self._resolve_admin_group(resolved_hospital_id)
        if admin_group_id:
            clean_data["admin_group_id"] = admin_group_id
        try:
            laboratory = await self.repo.create(**clean_data)
        except Exception as e:
            logging.getLogger(__name__).exception("CREATE_LABORATORY - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create laboratory: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_LABORATORY", entity_type="LABORATORY", entity_id=str(laboratory.id), details=f"Laboratory '{laboratory.name}' created")
        return laboratory

    async def create_or_get(self, name: str, user_id: str = None, hospital_id: str = None) -> Laboratory:
        existing = await self._find_by_name(name)
        if existing:
            return existing
        return await self.create({"name": name, "status": "ACTIVE"}, user_id=user_id, hospital_id=hospital_id)

    async def _find_by_name(self, name: str) -> Optional[Laboratory]:
        result = await self.db.execute(select(Laboratory).where(func.lower(Laboratory.name) == name.strip().lower()).limit(1))
        return result.scalar_one_or_none()

    async def get(self, laboratory_id: str, current_user: dict = None) -> Optional[Laboratory]:
        laboratory = await self.repo.get(laboratory_id)
        if laboratory and current_user:
            await self._ensure_access(current_user, laboratory)
        return laboratory

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None, current_user: dict = None) -> List[Laboratory]:
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
        scope = await self._hospital_scope(current_user)
        query = self._apply_scope(query, scope)
        query = query.order_by(Laboratory.name)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count(self, filters: dict = None, current_user: dict = None) -> int:
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
        scope = await self._hospital_scope(current_user)
        query = self._apply_scope(query, scope)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def update(self, laboratory_id: str, data: dict, user_id: str = None, current_user: dict = None) -> Optional[Laboratory]:
        laboratory = await self.repo.get(laboratory_id)
        if not laboratory:
            return None
        if current_user:
            await self._ensure_access(current_user, laboratory)
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if clean_data.get("name"):
            existing = await self._find_by_name(clean_data["name"])
            if existing and existing.id != laboratory_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Laboratory '{clean_data['name']}' already exists")
        if clean_data.get("hospital_id") and clean_data["hospital_id"] != str(laboratory.hospital_id or ""):
            resolved_hospital_id = clean_data.pop("hospital_id")
            clean_data["hospital_id"] = resolved_hospital_id
            clean_data["admin_group_id"] = await self._resolve_admin_group(resolved_hospital_id)
        else:
            clean_data.pop("hospital_id", None)
        laboratory = await self.repo.update(laboratory_id, **clean_data)
        if laboratory:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_LABORATORY", entity_type="LABORATORY", entity_id=laboratory_id, details="Laboratory updated")
        return laboratory

    async def delete(self, laboratory_id: str, user_id: str = None, current_user: dict = None) -> bool:
        laboratory = await self.repo.get(laboratory_id)
        if not laboratory:
            return False
        if current_user:
            await self._ensure_access(current_user, laboratory)
        result = await self.repo.delete(laboratory_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_LABORATORY", entity_type="LABORATORY", entity_id=laboratory_id, details="Laboratory deleted")
        return result
