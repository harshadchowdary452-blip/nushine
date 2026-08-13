from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.services.pending_inventory_item_service import PendingInventoryItemService
from app.schemas.pending_inventory_item import (
    PendingInventoryItemCreate, PendingInventoryItemUpdate, PendingInventoryItemReview,
    PendingInventoryItemResponse, DuplicateCheckResponse,
)
from app.schemas.common import MessageResponse
from app.models.hospital import Hospital

router = APIRouter(prefix="/inventory/pending-items", tags=["Pending Inventory Items"])


async def _require_reviewer(current_user: dict, db: AsyncSession, hospital_id: Optional[str] = None):
    """Only group admins / super admins may review pending items, except the
    hospital admin of a standalone (group-less) hospital, who is the indent
    master for their own hospital."""
    role = current_user.get("role")
    if role in (Role.GROUP_ADMIN.value, Role.SUPER_ADMIN.value):
        return
    if role == Role.HOSPITAL_ADMIN.value:
        own = current_user.get("hospital_id")
        if own and hospital_id and str(own) == str(hospital_id):
            row = (await db.execute(select(Hospital.admin_group_id).where(Hospital.id == hospital_id))).one_or_none()
            if row and not row[0]:
                return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only group admins can review pending items")


async def _scope_hospital_ids(current_user: dict, db: AsyncSession) -> Optional[list]:
    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        return None
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        return [current_user.get("hospital_id")] if current_user.get("hospital_id") else []
    if role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if not agid:
            return []
        return [row[0] for row in (await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))).all()]
    return []


@router.post("/", response_model=PendingInventoryItemResponse, status_code=status.HTTP_201_CREATED)
async def create_pending_item(data: PendingInventoryItemCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        hospital_id = current_user.get("hospital_id")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only hospital admins can request custom items")
    service = PendingInventoryItemService(db)
    return await service.create(data.model_dump(exclude_none=True), hospital_id=hospital_id, user_id=current_user.get("sub"))


@router.get("/")
async def get_pending_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    order_period: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = PendingInventoryItemService(db)
    filters = {}
    hids = await _scope_hospital_ids(current_user, db)
    if hids is not None:
        if not hids:
            return {"items": [], "total": 0, "page": page, "size": page_size, "pages": 0}
        filters["hospital_id__in"] = hids
    elif hospital_id:
        filters["hospital_id"] = hospital_id
    if status_filter:
        filters["status"] = status_filter
    if order_period:
        filters["order_period"] = order_period
    total = await service.count(filters=filters or None)
    items = await service.get_all(skip=(page - 1) * page_size, limit=page_size, filters=filters or None)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": items, "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.get("/duplicates", response_model=DuplicateCheckResponse)
async def check_duplicates(
    name: str = Query(..., min_length=1, max_length=255),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = PendingInventoryItemService(db)
    candidates = await service.find_duplicates(name)
    return {"item_name": name, "candidates": candidates}


@router.get("/{pending_id}", response_model=PendingInventoryItemResponse)
async def get_pending_item(pending_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = PendingInventoryItemService(db)
    pending = await service.get(pending_id)
    if not pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending item not found")
    hids = await _scope_hospital_ids(current_user, db)
    if hids is not None and pending.hospital_id not in hids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")
    return pending


@router.put("/{pending_id}", response_model=PendingInventoryItemResponse)
async def update_pending_item(pending_id: str, data: PendingInventoryItemUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = PendingInventoryItemService(db)
    pending = await service.get(pending_id)
    if not pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending item not found")
    await _require_reviewer(current_user, db, pending.hospital_id)
    hids = await _scope_hospital_ids(current_user, db)
    if hids is not None and pending.hospital_id not in hids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")
    return await service.update(pending_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))


@router.post("/{pending_id}/review", response_model=PendingInventoryItemResponse)
async def review_pending_item(pending_id: str, data: PendingInventoryItemReview, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = PendingInventoryItemService(db)
    pending = await service.get(pending_id)
    if not pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending item not found")
    await _require_reviewer(current_user, db, pending.hospital_id)
    hids = await _scope_hospital_ids(current_user, db)
    if hids is not None and pending.hospital_id not in hids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")
    return await service.review(pending_id, data.action, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
