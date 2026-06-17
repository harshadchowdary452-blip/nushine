from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.hospital_monthly_expense_service import HospitalMonthlyExpenseService
from app.schemas.hospital_monthly_expense import HospitalMonthlyExpenseCreate, HospitalMonthlyExpenseUpdate, HospitalMonthlyExpenseResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/expenses", tags=["Hospital Monthly Expenses"])


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
    expense_month: Optional[int] = Query(None),
    expense_year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_EXPENSES, Permission.MANAGE_EXPENSES)
    service = HospitalMonthlyExpenseService(db)
    filters = {}
    role = current_user.get("role")
    if role == Role.HOSPITAL_ADMIN.value:
        filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        from app.models.hospital import Hospital
        result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == current_user.get("admin_group_id")))
        hospital_ids = [row[0] for row in result.all()]
        if not hospital_ids:
            return []
        if hospital_id and hospital_id in hospital_ids:
            filters["hospital_id"] = hospital_id
        else:
            filters["hospital_id__in"] = hospital_ids
    elif role == Role.SUPER_ADMIN.value and hospital_id:
        filters["hospital_id"] = hospital_id
    if expense_month is not None:
        filters["expense_month"] = expense_month
    if expense_year is not None:
        filters["expense_year"] = expense_year
    return await service.get_all(skip=skip, limit=limit, filters=filters or None)


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
