from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.pending_inventory_item import PendingInventoryItem


class PendingInventoryItemRepository(BaseRepository[PendingInventoryItem]):
    def __init__(self, db: AsyncSession):
        super().__init__(PendingInventoryItem, db)
