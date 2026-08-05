from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.hospital_inventory_service import HospitalInventoryService
from app.schemas.hospital_inventory import HospitalInventoryCreate, HospitalInventoryUpdate, HospitalInventoryResponse
from app.schemas.common import MessageResponse
from app.models.hospital import Hospital

router = APIRouter(prefix="/inventory/hospital", tags=["Hospital Inventory"])


async def _scope_hospital_ids(current_user: dict, hospital_id: Optional[str], db: AsyncSession) -> Optional[list]:
    """Resolve the hospital ids a caller may read. Returns None when unrestricted."""
    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        if hospital_id:
            return [hospital_id]
        return None
    if role == Role.HOSPITAL_ADMIN.value or role == Role.DOCTOR.value:
        return [current_user.get("hospital_id")] if current_user.get("hospital_id") else []
    if role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if not agid:
            return []
        return [row[0] for row in (await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))).all()]
    return []


@router.post("/", response_model=HospitalInventoryResponse, status_code=status.HTTP_201_CREATED)
async def create_stock(data: HospitalInventoryCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = HospitalInventoryService(db)
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
async def get_hospital_inventory(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    item_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = HospitalInventoryService(db)
    role = current_user.get("role")
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
    if search:
        filters["search"] = search
    if location:
        filters["location"] = location
    total = await service.count(filters=filters or None)
    items = await service.get_all(skip=(page - 1) * page_size, limit=page_size, filters=filters or None, order_by=sort_by, descending=sort_order == "desc")
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": items, "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.get("/{record_id}", response_model=HospitalInventoryResponse)
async def get_stock_record(record_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    service = HospitalInventoryService(db)
    record = await service.get(record_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock record not found")
    await verify_tenant_access(current_user, record, "hospital_inventory", db)
    return record


@router.put("/{record_id}", response_model=HospitalInventoryResponse)
async def update_stock_record(record_id: str, data: HospitalInventoryUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = HospitalInventoryService(db)
    record = await service.get(record_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock record not found")
    await verify_tenant_access(current_user, record, "hospital_inventory", db)
    record = await service.update(record_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    return record


@router.delete("/{record_id}", response_model=MessageResponse)
async def delete_stock_record(record_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_INVENTORY)
    service = HospitalInventoryService(db)
    record = await service.get(record_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock record not found")
    await verify_tenant_access(current_user, record, "hospital_inventory", db)
    deleted = await service.delete(record_id, user_id=current_user.get("sub"))
    return MessageResponse(message="Stock record deleted successfully")
