from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.inventory_transaction_service import InventoryTransactionService
from app.schemas.inventory_transaction import InventoryTransactionCreate, InventoryTransactionResponse
from app.models.hospital import Hospital

router = APIRouter(prefix="/inventory/transactions", tags=["Inventory Transactions"])


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


@router.post("/", response_model=InventoryTransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(data: InventoryTransactionCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = InventoryTransactionService(db)
    data_dict = data.model_dump(exclude_none=True)
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        data_dict["hospital_id"] = current_user.get("hospital_id")
    if not data_dict.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
    if role == Role.GROUP_ADMIN.value:
        hids = await _scope_hospital_ids(current_user, None, db)
        if data_dict["hospital_id"] not in hids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")
    return await service.create(data_dict, user_id=current_user.get("sub"))


@router.get("/")
async def get_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    item_id: Optional[str] = Query(None),
    transaction_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = InventoryTransactionService(db)
    filters = {}
    hids = await _scope_hospital_ids(current_user, hospital_id, db)
    if hids is not None:
        if not hids:
            return {"items": [], "total": 0, "page": page, "size": page_size, "pages": 0}
        filters["hospital_id__in"] = hids
    elif hospital_id:
        filters["hospital_id"] = hospital_id
    if item_id:
        filters["item_id"] = item_id
    if transaction_type:
        filters["transaction_type"] = transaction_type
    if search:
        filters["search"] = search
    if date_from:
        filters["transaction_date__ge"] = date_from
    if date_to:
        filters["transaction_date__lt"] = date_to
    total = await service.count(filters=filters or None)
    items = await service.get_all(skip=(page - 1) * page_size, limit=page_size, filters=filters or None, order_by=sort_by, descending=sort_order == "desc")
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": items, "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.get("/{transaction_id}", response_model=InventoryTransactionResponse)
async def get_transaction(transaction_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = InventoryTransactionService(db)
    transaction = await service.get(transaction_id)
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    await verify_tenant_access(current_user, transaction, "inventory_transaction", db)
    return transaction
