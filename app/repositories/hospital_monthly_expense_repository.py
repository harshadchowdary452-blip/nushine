from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.base import BaseRepository
from app.models.hospital_monthly_expense import HospitalMonthlyExpense


class HospitalMonthlyExpenseRepository(BaseRepository[HospitalMonthlyExpense]):
    def __init__(self, db: AsyncSession):
        super().__init__(HospitalMonthlyExpense, db)
