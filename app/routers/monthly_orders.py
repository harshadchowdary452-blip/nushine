from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.monthly_order_service import MonthlyOrderService, MonthlyOrderStatus
from app.schemas.monthly_order import (
    MonthlyOrderCreate, MonthlyOrderUpdate, MonthlyOrderResponse,
    MonthlyOrderSuggestions, MonthlyOrderTransition, MonthlyOrderSubmit,
)
from app.schemas.common import MessageResponse
from app.models.hospital import Hospital

router = APIRouter(prefix="/inventory/monthly-orders", tags=["Monthly Orders"])

HA_SUBMIT_ONLY = {MonthlyOrderStatus.SUBMITTED}
GA_APPROVAL = {
    MonthlyOrderStatus.REVIEWED, MonthlyOrderStatus.APPROVED,
    MonthlyOrderStatus.ORDERED, MonthlyOrderStatus.COMPLETED,
}


async def _scope_hospital_ids(current_user: dict, hospital_id: Optional[str], db: AsyncSession) -> Optional[list]:
    """Resolve the hospital ids a caller may read. Returns None when unrestricted."""
    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        if hospital_id:
            return [hospital_id]
        return None
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        return [current_user.get("hospital_id")] if current_user.get("hospital_id") else []
    if role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if not agid:
            return []
        return [row[0] for row in (await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))).all()]
    return []


async def _ensure_hospital_in_scope(current_user: dict, hospital_id: str, db: AsyncSession):
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        if hospital_id != current_user.get("hospital_id"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")
    elif role == Role.GROUP_ADMIN.value:
        hids = await _scope_hospital_ids(current_user, None, db)
        if hospital_id not in hids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")


async def _hospital_is_standalone(db: AsyncSession, hospital_id: Optional[str]) -> bool:
    """True when a hospital does not belong to an admin group (standalone clinic)."""
    if not hospital_id:
        return False
    row = (await db.execute(select(Hospital.admin_group_id).where(Hospital.id == hospital_id))).one_or_none()
    return bool(row) and not row[0]


@router.get("/suggestions", response_model=MonthlyOrderSuggestions)
async def get_suggestions(
    hospital_id: str = Query(...),
    order_period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    await _ensure_hospital_in_scope(current_user, hospital_id, db)
    return await MonthlyOrderService(db).get_suggestions(hospital_id, order_period)


@router.post("/", response_model=MonthlyOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(data: MonthlyOrderCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    data_dict = data.model_dump(exclude_none=True)
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        data_dict["hospital_id"] = current_user.get("hospital_id")
    if not data_dict.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
    await _ensure_hospital_in_scope(current_user, data_dict["hospital_id"], db)
    return await MonthlyOrderService(db).create(data_dict, user_id=current_user.get("sub"))


@router.get("/")
async def get_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    order_period: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = MonthlyOrderService(db)
    filters = {}
    hids = await _scope_hospital_ids(current_user, hospital_id, db)
    if hids is not None:
        if not hids:
            return {"items": [], "total": 0, "page": page, "size": page_size, "pages": 0}
        filters["hospital_id__in"] = hids
    elif hospital_id:
        filters["hospital_id"] = hospital_id
    if order_period:
        filters["order_period"] = order_period
    if status_filter:
        filters["status"] = status_filter
    total = await service.count(filters=filters or None)
    items = await service.get_all(skip=(page - 1) * page_size, limit=page_size,
                                  filters=filters or None, order_by=sort_by, descending=sort_order == "desc")
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": items, "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.get("/consolidated")
async def consolidated_orders(
    order_period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    role = current_user.get("role")
    if role == Role.GROUP_ADMIN.value:
        hids = await _scope_hospital_ids(current_user, None, db)
    elif role == Role.SUPER_ADMIN.value:
        hids = [row[0] for row in (await db.execute(select(Hospital.id))).all()]
    else:
        hids = [current_user.get("hospital_id")] if current_user.get("hospital_id") else []
    return await MonthlyOrderService(db).consolidate(hids, order_period)


@router.get("/overview")
async def overview_orders(
    order_period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """GA consolidation view: one row per hospital with items, cost, status, submitted date."""
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    role = current_user.get("role")
    if role == Role.GROUP_ADMIN.value:
        hids = await _scope_hospital_ids(current_user, None, db)
    elif role == Role.SUPER_ADMIN.value:
        hids = [row[0] for row in (await db.execute(select(Hospital.id))).all()]
    else:
        hids = [current_user.get("hospital_id")] if current_user.get("hospital_id") else []
    if not hids:
        return {
            "order_period": order_period, "hospitals": [],
            "total_items": 0, "estimated_cost_total": 0.0,
            "orders_submitted": 0, "orders_total": 0, "status_counts": {},
        }
    return await MonthlyOrderService(db).overview(hids, order_period)


@router.get("/validate")
async def validate_orders(
    order_period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Validation engine — pre-flight check before generating a consolidated indent."""
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    hids = await _scope_hospital_ids(current_user, None, db)
    if hids is None:
        hids = [row[0] for row in (await db.execute(select(Hospital.id))).all()]
    return await MonthlyOrderService(db).validate(hids or [], order_period)


@router.post("/generate")
async def generate_consolidated(
    order_period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """One-click Generate Consolidated Monthly Indent.

    Runs complete validation first. The consolidated matrix is returned only
    when every hospital submission is valid; otherwise validation errors are
    returned and nothing is generated.
    """
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    hids = await _scope_hospital_ids(current_user, None, db)
    if hids is None:
        hids = [row[0] for row in (await db.execute(select(Hospital.id))).all()]
    return await MonthlyOrderService(db).generate(hids or [], order_period, user_id=current_user.get("sub"))


@router.get("/audit")
async def audit_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    order_period: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Audit trail for the monthly indent workflow, scoped to the caller's group."""
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    hids = await _scope_hospital_ids(current_user, None, db)
    if hids is None:
        hids = [row[0] for row in (await db.execute(select(Hospital.id))).all()]
    if hids is not None and not hids:
        return {"items": [], "total": 0, "skip": 0, "limit": page_size}
    result = await MonthlyOrderService(db).audit_history(
        hids or [], skip=(page - 1) * page_size, limit=page_size, order_period=order_period,
    )
    return result


@router.post("/submit", response_model=MonthlyOrderResponse)
async def submit_order(data: MonthlyOrderSubmit, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Hospital admin monthly indent — create/update the DRAFT order and submit it."""
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    data_dict = data.model_dump(exclude_none=True)
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        data_dict["hospital_id"] = current_user.get("hospital_id")
    if not data_dict.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
    await _ensure_hospital_in_scope(current_user, data_dict["hospital_id"], db)
    return await MonthlyOrderService(db).submit(data_dict, user_id=current_user.get("sub"))


@router.get("/{order_id}", response_model=MonthlyOrderResponse)
async def get_order(order_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = MonthlyOrderService(db)
    order = await service.get(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monthly order not found")
    await verify_tenant_access(current_user, order, "monthly_order", db)
    return order


@router.put("/{order_id}", response_model=MonthlyOrderResponse)
async def update_order(order_id: str, data: MonthlyOrderUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = MonthlyOrderService(db)
    order = await service.get(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monthly order not found")
    await verify_tenant_access(current_user, order, "monthly_order", db)
    order = await service.update(order_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    return order


@router.post("/{order_id}/transition", response_model=MonthlyOrderResponse)
async def transition_order(order_id: str, data: MonthlyOrderTransition, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = MonthlyOrderService(db)
    order = await service.get(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monthly order not found")
    role = current_user.get("role")
    try:
        target = MonthlyOrderStatus(data.to_status)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {data.to_status}")
    if role == Role.HOSPITAL_ADMIN.value:
        if await _hospital_is_standalone(db, order.hospital_id):
            if target not in (HA_SUBMIT_ONLY | GA_APPROVAL):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hospital admins may only submit or self-approve standalone orders")
        elif target not in HA_SUBMIT_ONLY:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hospital admins may only submit orders")
    if role == Role.GROUP_ADMIN.value and target not in GA_APPROVAL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Group admins may only review, approve, order or complete")
    if role == Role.DOCTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Read-only role")
    await verify_tenant_access(current_user, order, "monthly_order", db)
    order = await service.transition(order_id, target.value, user_id=current_user.get("sub"))
    return order


@router.delete("/{order_id}", response_model=MessageResponse)
async def delete_order(order_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = MonthlyOrderService(db)
    order = await service.get(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monthly order not found")
    if order.status != MonthlyOrderStatus.DRAFT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only DRAFT orders can be deleted")
    await verify_tenant_access(current_user, order, "monthly_order", db)
    for item in list(order.items):
        await db.delete(item)
    await db.delete(order)
    await db.commit()
    return MessageResponse(message="Monthly order deleted")
