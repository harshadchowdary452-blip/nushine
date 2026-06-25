import logging
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text, and_
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
        expense_date = clean_data.get("expense_date")
        if not expense_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expense_date is required")
        if isinstance(expense_date, str):
            from datetime import datetime as dt
            expense_date = dt.strptime(expense_date, "%Y-%m-%d").date()
        clean_data["expense_month"] = expense_date.month
        clean_data["expense_year"] = expense_date.year
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
        expense_date = clean_data.get("expense_date")
        if expense_date:
            if isinstance(expense_date, str):
                from datetime import datetime as dt
                expense_date = dt.strptime(expense_date, "%Y-%m-%d").date()
            clean_data["expense_month"] = expense_date.month
            clean_data["expense_year"] = expense_date.year
        expense = await self.repo.update(expense_id, **clean_data)
        if expense:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_EXPENSE", entity_type="HOSPITAL_MONTHLY_EXPENSE", entity_id=expense_id, details="Expense updated")
        return expense

    async def delete(self, expense_id: str, user_id: str = None) -> bool:
        result = await self.repo.delete(expense_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_EXPENSE", entity_type="HOSPITAL_MONTHLY_EXPENSE", entity_id=expense_id, details="Expense deleted")
        return result

    async def get_analytics(self, hospital_ids: list = None) -> dict:
        today = date.today()
        today_start = today
        today_end = today + timedelta(days=1)
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=7)
        month_start = today.replace(day=1)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1)
        year_start = today.replace(month=1, day=1)
        year_end = year_start.replace(year=year_start.year + 1)

        base = select(func.coalesce(func.sum(HospitalMonthlyExpense.amount), 0))
        conds = []
        if hospital_ids is not None:
            conds.append(HospitalMonthlyExpense.hospital_id.in_(hospital_ids))

        async def _sum_where(*extra_conds):
            q = base.where(and_(*extra_conds))
            if conds:
                q = q.where(*conds)
            r = await self.db.execute(q)
            return float(r.scalar() or 0)

        today_total = await _sum_where(
            HospitalMonthlyExpense.expense_date >= today_start,
            HospitalMonthlyExpense.expense_date < today_end,
        )
        this_week_total = await _sum_where(
            HospitalMonthlyExpense.expense_date >= week_start,
            HospitalMonthlyExpense.expense_date < week_end,
        )
        this_month_total = await _sum_where(
            HospitalMonthlyExpense.expense_date >= month_start,
            HospitalMonthlyExpense.expense_date < month_end,
        )
        year_to_date_total = await _sum_where(
            HospitalMonthlyExpense.expense_date >= year_start,
            HospitalMonthlyExpense.expense_date < year_end,
        )
        total_expenses = await _sum_where(HospitalMonthlyExpense.id.isnot(None))

        cat_query = select(
            HospitalMonthlyExpense.expense_category,
            func.coalesce(func.sum(HospitalMonthlyExpense.amount), 0).label("total"),
        )
        if conds:
            cat_query = cat_query.where(*conds)
        cat_query = cat_query.group_by(HospitalMonthlyExpense.expense_category).order_by(text("total DESC"))
        cat_r = await self.db.execute(cat_query)
        category_breakdown = [{"category": row[0], "amount": float(row[1])} for row in cat_r.all()]

        return {
            "today_total": today_total,
            "this_week_total": this_week_total,
            "this_month_total": this_month_total,
            "year_to_date_total": year_to_date_total,
            "category_breakdown": category_breakdown,
            "total_expenses": total_expenses,
        }
