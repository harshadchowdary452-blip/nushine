from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.treatment_category import TreatmentCategory
from app.schemas.treatment_category import TreatmentCategoryCreate, TreatmentCategoryUpdate, TreatmentCategoryResponse

router = APIRouter(prefix="/treatment-categories", tags=["Treatment Categories"])


@router.get("/", response_model=List[TreatmentCategoryResponse])
async def list_treatment_categories(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = current_user.get("hospital_id")
    q = select(TreatmentCategory).where(TreatmentCategory.is_active == True)
    if hospital_id:
        q = q.where(
            or_(
                TreatmentCategory.hospital_id == hospital_id,
                TreatmentCategory.hospital_id.is_(None),
            )
        )
    else:
        q = q.where(TreatmentCategory.hospital_id.is_(None))
    q = q.order_by(TreatmentCategory.name)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=TreatmentCategoryResponse, status_code=201)
async def create_treatment_category(
    data: TreatmentCategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    existing = await db.execute(
        select(TreatmentCategory).where(
            TreatmentCategory.name == data.name,
            or_(
                TreatmentCategory.hospital_id == hospital_id,
                TreatmentCategory.hospital_id.is_(None),
            ),
            TreatmentCategory.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Treatment category already exists")
    cat = TreatmentCategory(hospital_id=hospital_id, name=data.name, description=data.description)
    db.add(cat)
    await db.commit()
    return cat


@router.put("/{category_id}", response_model=TreatmentCategoryResponse)
async def update_treatment_category(
    category_id: str,
    data: TreatmentCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    cat = await db.get(TreatmentCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Treatment category not found")
    if hospital_id and cat.hospital_id and cat.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="Cannot modify another hospital's treatment category")
    if data.name is not None:
        cat.name = data.name
    if data.description is not None:
        cat.description = data.description
    if data.is_active is not None:
        cat.is_active = data.is_active
    await db.commit()
    return cat


@router.delete("/{category_id}")
async def delete_treatment_category(
    category_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    cat = await db.get(TreatmentCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Treatment category not found")
    if hospital_id and cat.hospital_id and cat.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="Cannot delete another hospital's treatment category")
    cat.is_active = False
    await db.commit()
    return {"success": True}
