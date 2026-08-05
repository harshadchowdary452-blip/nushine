from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.inventory_category import InventoryCategory


class InventoryCategoryRepository(BaseRepository[InventoryCategory]):
    def __init__(self, db: AsyncSession):
        super().__init__(InventoryCategory, db)
