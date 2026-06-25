from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, or_, text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, date, timezone, timedelta
from dateutil.relativedelta import relativedelta
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.hospital_monthly_expense_service import HospitalMonthlyExpenseService
from app.schemas.hospital_monthly_expense import HospitalMonthlyExpenseCreate, HospitalMonthlyExpenseUpdate, HospitalMonthlyExpenseResponse, ExpenseAnalytics
from app.schemas.common import MessageResponse
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.models.hospital import Hospital

router = APIRouter(prefix="/expenses", tags=["Hospital Monthly Expenses"])


def _resolve_date_range(filter: Optional[str], start_date: Optional[date], end_date: Optional[date]):
    today = date.today()
    if filter == "today":
        return today, today + timedelta(days=1)
    elif filter == "yesterday":
        return today - timedelta(days=1), today
    elif filter == "this_week":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=7)
    elif filter == "last_7_days":
        return today - timedelta(days=6), today + timedelta(days=1)
    elif filter == "this_month":
        start = today.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        return start, end
    elif filter == "last_month":
        first_of_this = today.replace(day=1)
        end = first_of_this
        start = first_of_this - relativedelta(months=1)
        return start, end
    elif filter == "this_quarter":
        q = (today.month - 1) // 3
        start = today.replace(month=q * 3 + 1, day=1)
        if q == 3:
            end = today.replace(year=today.year + 1, month=1, day=1)
        else:
            end = today.replace(month=(q + 1) * 3 + 1, day=1)
        return start, end
    elif filter == "this_year":
        start = today.replace(month=1, day=1)
        end = start.replace(year=start.year + 1)
        return start, end
    elif start_date and end_date:
        return start_date, end_date
    return None, None


def _build_expense_filters(current_user: dict, hospital_id: Optional[str], filter: Optional[str], start_date: Optional[date], end_date: Optional[date], expense_month: Optional[int], expense_year: Optional[int]):
    filters = {}
    role = current_user.get("role")
    is_super = role == Role.SUPER_ADMIN.value
    is_group = role == Role.GROUP_ADMIN.value
    is_hospital = role == Role.HOSPITAL_ADMIN.value

    if is_hospital:
        filters["hospital_id"] = current_user.get("hospital_id")
    elif is_group:
        from sqlalchemy import select
        from app.models.hospital import Hospital
        result = None
        filters["hospital_id__in"] = None
    elif is_super and hospital_id:
        filters["hospital_id"] = hospital_id

    dr_start, dr_end = _resolve_date_range(filter, start_date, end_date)
    if dr_start and dr_end:
        filters["expense_date__ge"] = dr_start
        filters["expense_date__lt"] = dr_end
    if expense_month is not None:
        filters["expense_month"] = expense_month
    if expense_year is not None:
        filters["expense_year"] = expense_year
    return filters, dr_start, dr_end


@router.post("/", response_model=HospitalMonthlyExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(data: HospitalMonthlyExpenseCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_EXPENSES)
    service = HospitalMonthlyExpenseService(db)
    data_dict = data.model_dump(exclude_none=True)
    role = current_user.get("role")
    if role == Role.HOSPITAL_ADMIN.value:
        data_dict["hospital_id"] = current_user.get("hospital_id")
    if not data_dict.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
    return await service.create(data_dict, user_id=current_user.get("sub"))


@router.get("/")
async def get_expenses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    filter: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    expense_month: Optional[int] = Query(None),
    expense_year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_EXPENSES, Permission.MANAGE_EXPENSES)
    service = HospitalMonthlyExpenseService(db)
    filters, dr_start, dr_end = _build_expense_filters(current_user, hospital_id, filter, start_date, end_date, expense_month, expense_year)

    role = current_user.get("role")
    if role == Role.GROUP_ADMIN.value:
        r = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == current_user.get("admin_group_id")))
        hospital_ids = [row[0] for row in r.all()]
        if not hospital_ids:
            return []
        if hospital_id and hospital_id in hospital_ids:
            filters["hospital_id"] = hospital_id
        else:
            filters["hospital_id__in"] = hospital_ids

    return await service.get_all(skip=skip, limit=limit, filters=filters or None)


@router.get("/analytics", response_model=ExpenseAnalytics)
async def get_expense_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_EXPENSES, Permission.MANAGE_EXPENSES)
    service = HospitalMonthlyExpenseService(db)
    role = current_user.get("role")
    hospital_ids = None
    if role == Role.HOSPITAL_ADMIN.value:
        hospital_ids = [current_user.get("hospital_id")]
    elif role == Role.GROUP_ADMIN.value:
        r = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == current_user.get("admin_group_id")))
        hospital_ids = [row[0] for row in r.all()]
    return await service.get_analytics(hospital_ids)


@router.get("/calendar")
async def get_expenses_calendar(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_EXPENSES, Permission.MANAGE_EXPENSES)
    today = date.today()
    month = month or today.month
    year = year or today.year
    q = select(
        HospitalMonthlyExpense.expense_date,
        func.coalesce(func.count(HospitalMonthlyExpense.id), 0).label("count"),
        func.coalesce(func.sum(HospitalMonthlyExpense.amount), 0).label("total"),
    ).where(
        HospitalMonthlyExpense.expense_month == month,
        HospitalMonthlyExpense.expense_year == year,
    )
    role = current_user.get("role")
    if role == Role.HOSPITAL_ADMIN.value:
        q = q.where(HospitalMonthlyExpense.hospital_id == current_user.get("hospital_id"))
    elif role == Role.GROUP_ADMIN.value:
        r = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == current_user.get("admin_group_id")))
        hids = [row[0] for row in r.all()]
        if hids:
            q = q.where(HospitalMonthlyExpense.hospital_id.in_(hids))
    elif role == Role.SUPER_ADMIN.value and hospital_id:
        q = q.where(HospitalMonthlyExpense.hospital_id == hospital_id)
    q = q.group_by(HospitalMonthlyExpense.expense_date).order_by(HospitalMonthlyExpense.expense_date)
    rows = (await db.execute(q)).all()
    return [
        {"date": str(row[0]), "count": int(row[1]), "total": float(row[2])}
        for row in rows
    ]


@router.get("/calendar/{calendar_date}")
async def get_expenses_by_date(
    calendar_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_EXPENSES, Permission.MANAGE_EXPENSES)
    service = HospitalMonthlyExpenseService(db)
    filters = {"expense_date": calendar_date}
    role = current_user.get("role")
    if role == Role.HOSPITAL_ADMIN.value:
        filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        r = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == current_user.get("admin_group_id")))
        hids = [row[0] for row in r.all()]
        if hids:
            filters["hospital_id__in"] = hids
    elif role == Role.SUPER_ADMIN.value:
        pass
    return await service.get_all(filters=filters)


@router.get("/{expense_id}", response_model=HospitalMonthlyExpenseResponse)
async def get_expense(expense_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_EXPENSES, Permission.MANAGE_EXPENSES)
    service = HospitalMonthlyExpenseService(db)
    expense = await service.get(expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    await verify_tenant_access(current_user, expense, "hospital", db)
    return expense


@router.put("/{expense_id}", response_model=HospitalMonthlyExpenseResponse)
async def update_expense(expense_id: str, data: HospitalMonthlyExpenseUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_EXPENSES)
    service = HospitalMonthlyExpenseService(db)
    expense = await service.get(expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    await verify_tenant_access(current_user, expense, "hospital", db)
    expense = await service.update(expense_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    return expense


@router.delete("/{expense_id}", response_model=MessageResponse)
async def delete_expense(expense_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.DELETE_EXPENSE)
    service = HospitalMonthlyExpenseService(db)
    expense = await service.get(expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    await verify_tenant_access(current_user, expense, "hospital", db)
    deleted = await service.delete(expense_id, user_id=current_user.get("sub"))
    return MessageResponse(message="Expense deleted successfully")
