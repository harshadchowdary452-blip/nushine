from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.inventory_master import InventoryMaster


class InventoryMasterRepository(BaseRepository[InventoryMaster]):
    def __init__(self, db: AsyncSession):
        super().__init__(InventoryMaster, db)
