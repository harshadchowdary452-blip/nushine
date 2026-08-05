from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.monthly_order import MonthlyOrder


class MonthlyOrderRepository(BaseRepository[MonthlyOrder]):
    def __init__(self, db: AsyncSession):
        super().__init__(MonthlyOrder, db)
