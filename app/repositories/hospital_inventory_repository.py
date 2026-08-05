from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.hospital_inventory import HospitalInventory


class HospitalInventoryRepository(BaseRepository[HospitalInventory]):
    def __init__(self, db: AsyncSession):
        super().__init__(HospitalInventory, db)
