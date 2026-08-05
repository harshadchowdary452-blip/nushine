import logging
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.supplier_repository import SupplierRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.supplier import Supplier
from app.models.inventory_master import InventoryMaster


class SupplierService:
    def __init__(self, db: AsyncSession):
        self.repo = SupplierRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Supplier:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if not clean_data.get("name"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required")
        if clean_data.get("code"):
            existing = await self.repo.get_all(filters={"code": clean_data["code"]}, limit=1)
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Supplier code '{clean_data['code']}' already exists")
        try:
            supplier = await self.repo.create(**clean_data)
        except Exception as e:
            logging.getLogger(__name__).exception("CREATE_SUPPLIER - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create supplier: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_SUPPLIER", entity_type="SUPPLIER", entity_id=str(supplier.id), details=f"Supplier '{supplier.name}' created")
        return supplier

    async def get(self, supplier_id: str) -> Optional[Supplier]:
        return await self.repo.get(supplier_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Supplier]:
        query = select(Supplier)
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                query = query.where(Supplier.name.ilike(like) | Supplier.code.ilike(like) | Supplier.contact_person.ilike(like))
            elif filters.get("name"):
                query = query.where(Supplier.name.ilike(f"%{filters['name']}%"))
            for key, value in filters.items():
                if value is None or key in ("search", "name"):
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(Supplier, key[:-4]).in_(value))
                elif hasattr(Supplier, key):
                    query = query.where(getattr(Supplier, key) == value)
        query = query.order_by(Supplier.name)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count(self, filters: dict = None) -> int:
        query = select(func.count(Supplier.id))
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                query = query.where(Supplier.name.ilike(like) | Supplier.code.ilike(like) | Supplier.contact_person.ilike(like))
            for key, value in filters.items():
                if value is None or key == "search":
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(Supplier, key[:-4]).in_(value))
                elif hasattr(Supplier, key):
                    query = query.where(getattr(Supplier, key) == value)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def update(self, supplier_id: str, data: dict, user_id: str = None) -> Optional[Supplier]:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if clean_data.get("code"):
            existing = await self.repo.get_all(filters={"code": clean_data["code"]}, limit=1)
            if existing and existing[0].id != supplier_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Supplier code '{clean_data['code']}' already exists")
        supplier = await self.repo.update(supplier_id, **clean_data)
        if supplier:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_SUPPLIER", entity_type="SUPPLIER", entity_id=supplier_id, details="Supplier updated")
        return supplier

    async def delete(self, supplier_id: str, user_id: str = None) -> bool:
        supplier = await self.repo.get(supplier_id)
        if not supplier:
            return False
        item_result = await self.db.execute(select(InventoryMaster.id).where(InventoryMaster.preferred_vendor_id == supplier_id).limit(1))
        if item_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Supplier is referenced by inventory items and cannot be deleted. Deactivate it instead.")
        result = await self.repo.delete(supplier_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_SUPPLIER", entity_type="SUPPLIER", entity_id=supplier_id, details="Supplier deleted")
        return result
