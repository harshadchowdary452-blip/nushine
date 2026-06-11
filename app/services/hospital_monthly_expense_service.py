import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.hospital_monthly_expense_repository import HospitalMonthlyExpenseRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.hospital_repository import HospitalRepository
from app.models.hospital_monthly_expense import HospitalMonthlyExpense


class HospitalMonthlyExpenseService:
    def __init__(self, db: AsyncSession):
        self.repo = HospitalMonthlyExpenseRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.hospital_repo = HospitalRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> HospitalMonthlyExpense:
        logger = logging.getLogger(__name__)
        logger.info("CREATE_EXPENSE - Request data: %s", data)
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        hospital_id = clean_data.get("hospital_id")
        if not hospital_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
        hospital = await self.hospital_repo.get(hospital_id)
        if not hospital:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
        month = clean_data.get("expense_month")
        year = clean_data.get("expense_year")
        if month and (month < 1 or month > 12):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expense_month must be between 1 and 12")
        if year and year < 1900:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid expense_year")
        try:
            expense = await self.repo.create(**clean_data)
            logger.info("CREATE_EXPENSE - Success: %s", expense.id)
        except Exception as e:
            logger.exception("CREATE_EXPENSE - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create expense: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_EXPENSE", entity_type="HOSPITAL_MONTHLY_EXPENSE", entity_id=str(expense.id), details=f"Expense '{expense.expense_name}' created")
        return expense

    async def get(self, expense_id: str) -> Optional[HospitalMonthlyExpense]:
        return await self.repo.get(expense_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[HospitalMonthlyExpense]:
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters)

    async def update(self, expense_id: str, data: dict, user_id: str = None) -> Optional[HospitalMonthlyExpense]:
        logger = logging.getLogger(__name__)
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if "expense_month" in clean_data and (clean_data["expense_month"] < 1 or clean_data["expense_month"] > 12):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expense_month must be between 1 and 12")
        expense = await self.repo.update(expense_id, **clean_data)
        if expense:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_EXPENSE", entity_type="HOSPITAL_MONTHLY_EXPENSE", entity_id=expense_id, details="Expense updated")
        return expense

    async def delete(self, expense_id: str, user_id: str = None) -> bool:
        result = await self.repo.delete(expense_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_EXPENSE", entity_type="HOSPITAL_MONTHLY_EXPENSE", entity_id=expense_id, details="Expense deleted")
        return result
