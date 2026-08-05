from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.inventory_transaction import InventoryTransaction


class InventoryTransactionRepository(BaseRepository[InventoryTransaction]):
    def __init__(self, db: AsyncSession):
        super().__init__(InventoryTransaction, db)
