from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.laboratory_service import LaboratoryService
from app.schemas.laboratory import LaboratoryCreate, LaboratoryUpdate, LaboratoryResponse
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/laboratories", tags=["Laboratories"])


@router.post("/", response_model=LaboratoryResponse, status_code=status.HTTP_201_CREATED)
async def create_laboratory(data: LaboratoryCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LABORATORIES)
    service = LaboratoryService(db)
    return await service.create(data.model_dump(exclude_none=True), user_id=current_user.get("sub"), hospital_id=current_user.get("hospital_id"))


@router.get("/")
async def get_laboratories(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LABORATORIES, Permission.MANAGE_LABORATORIES)
    service = LaboratoryService(db)
    filters = {}
    if search:
        filters["search"] = search
    if status_filter:
        filters["status"] = status_filter
    total = await service.count(filters=filters or None, current_user=current_user)
    laboratories = await service.get_all(skip=(page - 1) * page_size, limit=page_size, filters=filters or None, current_user=current_user)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": laboratories, "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.get("/{laboratory_id}", response_model=LaboratoryResponse)
async def get_laboratory(laboratory_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LABORATORIES, Permission.MANAGE_LABORATORIES)
    service = LaboratoryService(db)
    laboratory = await service.get(laboratory_id, current_user=current_user)
    if not laboratory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laboratory not found")
    return laboratory


@router.put("/{laboratory_id}", response_model=LaboratoryResponse)
async def update_laboratory(laboratory_id: str, data: LaboratoryUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LABORATORIES)
    service = LaboratoryService(db)
    laboratory = await service.update(laboratory_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"), current_user=current_user)
    if not laboratory:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laboratory not found")
    return laboratory


@router.delete("/{laboratory_id}", response_model=MessageResponse)
async def delete_laboratory(laboratory_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LABORATORIES)
    service = LaboratoryService(db)
    deleted = await service.delete(laboratory_id, user_id=current_user.get("sub"), current_user=current_user)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Laboratory not found")
    return MessageResponse(message="Laboratory deleted successfully")
