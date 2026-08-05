import logging
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.inventory_category_repository import InventoryCategoryRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.inventory_category import InventoryCategory
from app.models.inventory_master import InventoryMaster


class InventoryCategoryService:
    def __init__(self, db: AsyncSession):
        self.repo = InventoryCategoryRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> InventoryCategory:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        name = clean_data.get("name")
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name is required")
        parent_id = clean_data.get("parent_id")
        if parent_id:
            parent = await self.repo.get(parent_id)
            if not parent:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent category not found")
        existing = await self._find_by_name(name, parent_id)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Category '{name}' already exists")
        try:
            category = await self.repo.create(**clean_data)
        except Exception as e:
            logging.getLogger(__name__).exception("CREATE_CATEGORY - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create category: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_CATEGORY", entity_type="INVENTORY_CATEGORY", entity_id=str(category.id), details=f"Category '{category.name}' created")
        return category

    async def _find_by_name(self, name: str, parent_id: Optional[str]):
        query = select(InventoryCategory).where(InventoryCategory.name == name)
        if parent_id:
            query = query.where(InventoryCategory.parent_id == parent_id)
        else:
            query = query.where(InventoryCategory.parent_id.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get(self, category_id: str) -> Optional[InventoryCategory]:
        return await self.repo.get(category_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None, include_inactive: bool = False) -> List[InventoryCategory]:
        query = select(InventoryCategory)
        if not include_inactive:
            query = query.where(InventoryCategory.is_active.is_(True))
        if filters:
            if filters.get("parent_id"):
                query = query.where(InventoryCategory.parent_id == filters["parent_id"])
            elif filters.get("only_top_level"):
                query = query.where(InventoryCategory.parent_id.is_(None))
            if filters.get("name"):
                query = query.where(InventoryCategory.name.ilike(f"%{filters['name']}%"))
            if filters.get("search"):
                query = query.where(InventoryCategory.name.ilike(f"%{filters['search']}%"))
        query = query.order_by(InventoryCategory.sort_order, InventoryCategory.name)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_tree(self, include_inactive: bool = False) -> List[dict]:
        categories = await self.get_all(skip=0, limit=10000, include_inactive=include_inactive)
        by_parent: dict = {}
        for c in categories:
            by_parent.setdefault(c.parent_id, []).append(c)

        def build(parent_id):
            nodes = []
            for c in sorted(by_parent.get(parent_id, []), key=lambda x: (x.sort_order, x.name or "")):
                nodes.append({
                    "id": c.id, "name": c.name, "code": c.code, "description": c.description,
                    "parent_id": c.parent_id, "is_active": c.is_active, "sort_order": c.sort_order,
                    "children": build(c.id),
                })
            return nodes

        return build(None)

    async def update(self, category_id: str, data: dict, user_id: str = None) -> Optional[InventoryCategory]:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        name = clean_data.get("name")
        parent_id = clean_data.get("parent_id")
        if name or parent_id is not None:
            category = await self.repo.get(category_id)
            if not category:
                return None
            new_name = name or category.name
            new_parent = parent_id if parent_id is not None else category.parent_id
            if new_parent == category_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A category cannot be its own parent")
            if new_parent:
                parent = await self.repo.get(new_parent)
                if not parent:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent category not found")
            existing = await self._find_by_name(new_name, new_parent)
            if existing and existing.id != category_id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Category '{new_name}' already exists")
        category = await self.repo.update(category_id, **clean_data)
        if category:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_CATEGORY", entity_type="INVENTORY_CATEGORY", entity_id=category_id, details="Category updated")
        return category

    async def delete(self, category_id: str, user_id: str = None) -> bool:
        category = await self.repo.get(category_id)
        if not category:
            return False
        child_result = await self.db.execute(select(InventoryCategory.id).where(InventoryCategory.parent_id == category_id).limit(1))
        if child_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category has sub-categories and cannot be deleted. Deactivate it instead.")
        item_result = await self.db.execute(select(InventoryMaster.id).where(InventoryMaster.category_id == category_id).limit(1))
        if item_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category is in use by inventory items and cannot be deleted.")
        result = await self.repo.delete(category_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_CATEGORY", entity_type="INVENTORY_CATEGORY", entity_id=category_id, details="Category deleted")
        return result
