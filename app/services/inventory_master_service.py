import logging
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.inventory_master_repository import InventoryMasterRepository
from app.repositories.inventory_category_repository import InventoryCategoryRepository
from app.repositories.supplier_repository import SupplierRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.inventory_master import InventoryMaster
from app.models.inventory_category import InventoryCategory
from app.models.supplier import Supplier
from app.models.hospital_inventory import HospitalInventory
from app.models.inventory_transaction import InventoryTransaction


class InventoryMasterService:
    def __init__(self, db: AsyncSession):
        self.repo = InventoryMasterRepository(db)
        self.category_repo = InventoryCategoryRepository(db)
        self.supplier_repo = SupplierRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _validate_refs(self, data: dict):
        category_id = data.get("category_id")
        if category_id:
            category = await self.category_repo.get(category_id)
            if not category:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
        sub_category_id = data.get("sub_category_id")
        if sub_category_id:
            sub = await self.category_repo.get(sub_category_id)
            if not sub:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-category not found")
        vendor_id = data.get("preferred_vendor_id")
        if vendor_id:
            vendor = await self.supplier_repo.get(vendor_id)
            if not vendor:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preferred vendor not found")

    async def create(self, data: dict, user_id: str = None) -> InventoryMaster:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if not clean_data.get("name"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required")
        if not clean_data.get("code"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code is required")
        await self._validate_refs(clean_data)
        existing = await self.repo.get_all(filters={"code": clean_data["code"]}, limit=1)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Item code '{clean_data['code']}' already exists")
        try:
            item = await self.repo.create(**clean_data)
        except Exception as e:
            logging.getLogger(__name__).exception("CREATE_ITEM - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create item: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_ITEM", entity_type="INVENTORY_MASTER", entity_id=str(item.id), details=f"Item '{item.name}' ({item.code}) created")
        await self._attach_names(item)
        return item

    async def _attach_names(self, item: InventoryMaster):
        if item.category_id:
            cat = await self.category_repo.get(item.category_id)
            item.category_name = cat.name if cat else None
        if item.sub_category_id:
            sub = await self.category_repo.get(item.sub_category_id)
            item.sub_category_name = sub.name if sub else None
        if item.preferred_vendor_id:
            vendor = await self.supplier_repo.get(item.preferred_vendor_id)
            item.preferred_vendor_name = vendor.name if vendor else None
        return item

    async def get(self, item_id: str) -> Optional[InventoryMaster]:
        item = await self.repo.get(item_id)
        if item:
            await self._attach_names(item)
        return item

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None, order_by: str = None, descending: bool = False) -> List[InventoryMaster]:
        query = select(InventoryMaster)
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                query = query.where(
                    InventoryMaster.name.ilike(like)
                    | InventoryMaster.code.ilike(like)
                    | InventoryMaster.brand.ilike(like)
                )
            elif filters.get("name"):
                query = query.where(InventoryMaster.name.ilike(f"%{filters['name']}%"))
            for key, value in filters.items():
                if value is None or key in ("search", "name"):
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(InventoryMaster, key[:-4]).in_(value))
                elif hasattr(InventoryMaster, key):
                    query = query.where(getattr(InventoryMaster, key) == value)
        if order_by and hasattr(InventoryMaster, order_by):
            col = getattr(InventoryMaster, order_by)
            query = query.order_by(col.desc() if descending else col)
        else:
            query = query.order_by(InventoryMaster.name)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        items = list(result.scalars().all())
        for item in items:
            await self._attach_names(item)
        return items

    async def count(self, filters: dict = None) -> int:
        query = select(InventoryMaster.id)
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                query = query.where(
                    InventoryMaster.name.ilike(like)
                    | InventoryMaster.code.ilike(like)
                    | InventoryMaster.brand.ilike(like)
                )
            for key, value in filters.items():
                if value is None or key == "search":
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(InventoryMaster, key[:-4]).in_(value))
                elif hasattr(InventoryMaster, key):
                    query = query.where(getattr(InventoryMaster, key) == value)
        result = await self.db.execute(query)
        return len(result.all())

    async def update(self, item_id: str, data: dict, user_id: str = None) -> Optional[InventoryMaster]:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        await self._validate_refs(clean_data)
        if clean_data.get("code"):
            existing = await self.repo.get_all(filters={"code": clean_data["code"]}, limit=1)
            if existing and existing[0].id != item_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Item code '{clean_data['code']}' already exists")
        item = await self.repo.update(item_id, **clean_data)
        if item:
            await self._attach_names(item)
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_ITEM", entity_type="INVENTORY_MASTER", entity_id=item_id, details="Item updated")
        return item

    async def delete(self, item_id: str, user_id: str = None) -> bool:
        item = await self.repo.get(item_id)
        if not item:
            return False
        stock_result = await self.db.execute(select(HospitalInventory.id).where(HospitalInventory.item_id == item_id).limit(1))
        if stock_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item has hospital stock records and cannot be deleted. Deactivate it instead.")
        txn_result = await self.db.execute(select(InventoryTransaction.id).where(InventoryTransaction.item_id == item_id).limit(1))
        if txn_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item has inventory transactions and cannot be deleted.")
        result = await self.repo.delete(item_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_ITEM", entity_type="INVENTORY_MASTER", entity_id=item_id, details="Item deleted")
        return result
