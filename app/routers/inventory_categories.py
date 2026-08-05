from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_role, Permission, Role
from app.services.inventory_category_service import InventoryCategoryService
from app.schemas.inventory_category import InventoryCategoryCreate, InventoryCategoryUpdate, InventoryCategoryResponse, InventoryCategoryTreeNode
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/inventory/categories", tags=["Inventory Categories"])


def _require_catalogue_manager(current_user: dict):
    """Only Group Admin / Super Admin may manage the shared category tree."""
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    verify_role(current_user, Role.GROUP_ADMIN, Role.SUPER_ADMIN)


@router.post("/", response_model=InventoryCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(data: InventoryCategoryCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_catalogue_manager(current_user)
    service = InventoryCategoryService(db)
    return await service.create(data.model_dump(exclude_none=True), user_id=current_user.get("sub"))


@router.get("/tree", response_model=List[InventoryCategoryTreeNode])
async def get_category_tree(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = InventoryCategoryService(db)
    return await service.get_tree(include_inactive=include_inactive)


@router.get("/")
async def get_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None),
    only_top_level: bool = Query(False),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = InventoryCategoryService(db)
    filters = {}
    if search:
        filters["search"] = search
    if parent_id:
        filters["parent_id"] = parent_id
    if only_top_level:
        filters["only_top_level"] = True
    categories = await service.get_all(skip=(page - 1) * page_size, limit=page_size, filters=filters or None, include_inactive=include_inactive)
    return {"items": categories, "total": len(categories), "page": page, "size": page_size, "pages": 1}


@router.get("/{category_id}", response_model=InventoryCategoryResponse)
async def get_category(category_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = InventoryCategoryService(db)
    category = await service.get(category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


@router.put("/{category_id}", response_model=InventoryCategoryResponse)
async def update_category(category_id: str, data: InventoryCategoryUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_catalogue_manager(current_user)
    service = InventoryCategoryService(db)
    category = await service.update(category_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


@router.delete("/{category_id}", response_model=MessageResponse)
async def delete_category(category_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_catalogue_manager(current_user)
    service = InventoryCategoryService(db)
    deleted = await service.delete(category_id, user_id=current_user.get("sub"))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return MessageResponse(message="Category deleted successfully")
