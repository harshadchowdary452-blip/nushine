from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.billing_history import BillingHistory


class BillingHistoryRepository(BaseRepository[BillingHistory]):
    def __init__(self, db: AsyncSession):
        super().__init__(BillingHistory, db)
