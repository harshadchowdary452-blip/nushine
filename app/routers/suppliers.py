from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.supplier_service import SupplierService
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/inventory/suppliers", tags=["Suppliers"])


@router.post("/", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(data: SupplierCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_SUPPLIERS)
    service = SupplierService(db)
    return await service.create(data.model_dump(exclude_none=True), user_id=current_user.get("sub"))


@router.get("/")
async def get_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_SUPPLIERS, Permission.MANAGE_SUPPLIERS)
    service = SupplierService(db)
    filters = {}
    if search:
        filters["search"] = search
    if status_filter:
        filters["status"] = status_filter
    total = await service.count(filters=filters or None)
    suppliers = await service.get_all(skip=(page - 1) * page_size, limit=page_size, filters=filters or None)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": suppliers, "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_SUPPLIERS, Permission.MANAGE_SUPPLIERS)
    service = SupplierService(db)
    supplier = await service.get(supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(supplier_id: str, data: SupplierUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_SUPPLIERS)
    service = SupplierService(db)
    supplier = await service.update(supplier_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


@router.delete("/{supplier_id}", response_model=MessageResponse)
async def delete_supplier(supplier_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_SUPPLIERS)
    service = SupplierService(db)
    deleted = await service.delete(supplier_id, user_id=current_user.get("sub"))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return MessageResponse(message="Supplier deleted successfully")
