from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_role, Permission, Role
from app.services.inventory_master_service import InventoryMasterService
from app.schemas.inventory_master import InventoryMasterCreate, InventoryMasterUpdate, InventoryMasterResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/inventory/items", tags=["Inventory Master"])


def _require_catalogue_manager(current_user: dict):
    """Only Group Admin / Super Admin may manage the shared Master Catalogue."""
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    verify_role(current_user, Role.GROUP_ADMIN, Role.SUPER_ADMIN)


@router.post("/", response_model=InventoryMasterResponse, status_code=status.HTTP_201_CREATED)
async def create_item(data: InventoryMasterCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_catalogue_manager(current_user)
    service = InventoryMasterService(db)
    return await service.create(data.model_dump(exclude_none=True), user_id=current_user.get("sub"))


@router.get("/")
async def get_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    sub_category_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = InventoryMasterService(db)
    filters = {}
    if search:
        filters["search"] = search
    if category_id:
        filters["category_id"] = category_id
    if sub_category_id:
        filters["sub_category_id"] = sub_category_id
    if status_filter:
        filters["status"] = status_filter
    total = await service.count(filters=filters or None)
    skip = (page - 1) * page_size
    items = await service.get_all(skip=skip, limit=page_size, filters=filters or None, order_by=sort_by, descending=sort_order == "desc")
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": items, "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.get("/{item_id}", response_model=InventoryMasterResponse)
async def get_item(item_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = InventoryMasterService(db)
    item = await service.get(item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


@router.put("/{item_id}", response_model=InventoryMasterResponse)
async def update_item(item_id: str, data: InventoryMasterUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_catalogue_manager(current_user)
    service = InventoryMasterService(db)
    item = await service.update(item_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


@router.delete("/{item_id}", response_model=MessageResponse)
async def delete_item(item_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_catalogue_manager(current_user)
    service = InventoryMasterService(db)
    deleted = await service.delete(item_id, user_id=current_user.get("sub"))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return MessageResponse(message="Item deleted successfully")
