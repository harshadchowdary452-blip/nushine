from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, not_
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.treatment_type import TreatmentType
from app.schemas.treatment_type import TreatmentTypeCreate, TreatmentTypeUpdate, TreatmentTypeResponse

router = APIRouter(prefix="/treatment-types", tags=["Treatment Types"])


@router.get("/", response_model=List[TreatmentTypeResponse])
async def list_treatment_types(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = current_user.get("hospital_id")
    q = select(TreatmentType).where(TreatmentType.is_active == True)
    if hospital_id:
        hosp_names = (
            select(TreatmentType.name)
            .where(
                TreatmentType.hospital_id == hospital_id,
                TreatmentType.is_active == True,
            )
        )
        q = q.where(
            or_(
                TreatmentType.hospital_id == hospital_id,
                and_(
                    TreatmentType.hospital_id.is_(None),
                    not_(TreatmentType.name.in_(hosp_names)),
                ),
            )
        )
    else:
        q = q.where(TreatmentType.hospital_id.is_(None))
    q = q.order_by(TreatmentType.name)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/", response_model=TreatmentTypeResponse, status_code=201)
async def create_treatment_type(
    data: TreatmentTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    existing = await db.execute(
        select(TreatmentType).where(
            TreatmentType.name == data.name,
            or_(
                TreatmentType.hospital_id == hospital_id,
                TreatmentType.hospital_id.is_(None),
            ),
            TreatmentType.is_active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Treatment type already exists")
    tt = TreatmentType(
        hospital_id=hospital_id, name=data.name, description=data.description,
        treatment_category_id=data.treatment_category_id,
        estimated_duration=data.estimated_duration,
        default_cost=data.default_cost,
    )
    db.add(tt)
    await db.commit()
    return tt


@router.put("/{type_id}", response_model=TreatmentTypeResponse)
async def update_treatment_type(
    type_id: str,
    data: TreatmentTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    tt = await db.get(TreatmentType, type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Treatment type not found")
    # Hospital ownership check: only modify your own hospital's types
    if hospital_id and tt.hospital_id and tt.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="Cannot modify another hospital's treatment type")
    if data.name is not None:
        tt.name = data.name
    if data.description is not None:
        tt.description = data.description
    if data.is_active is not None:
        tt.is_active = data.is_active
    if data.treatment_category_id is not None:
        tt.treatment_category_id = data.treatment_category_id
    if data.estimated_duration is not None:
        tt.estimated_duration = data.estimated_duration
    if data.default_cost is not None:
        tt.default_cost = data.default_cost
    await db.commit()
    return tt


@router.delete("/{type_id}")
async def delete_treatment_type(
    type_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    hospital_id = current_user.get("hospital_id")
    tt = await db.get(TreatmentType, type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Treatment type not found")
    # Hospital ownership check: only delete your own hospital's types
    if hospital_id and tt.hospital_id and tt.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="Cannot delete another hospital's treatment type")
    tt.is_active = False
    await db.commit()
    return {"success": True}


@router.post("/seed")
async def seed_treatment_types(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = current_user.get("hospital_id")
    default_types = [
        "Scaling", "Root Canal Treatment (RCT)", "Extraction", "Wisdom Tooth Extraction",
        "Implant", "Crown", "Bridge", "Denture", "Orthodontics",
        "Teeth Whitening", "Smile Design", "Filling", "Surgery", "Other",
    ]
    created = []
    for name in default_types:
        existing = await db.execute(
            select(TreatmentType).where(
                TreatmentType.name == name,
                or_(
                    TreatmentType.hospital_id == hospital_id,
                    TreatmentType.hospital_id.is_(None),
                ),
            )
        )
        existing_type = existing.scalar_one_or_none()
        if existing_type:
            if not existing_type.is_active:
                existing_type.is_active = True
                created.append(name)
        else:
            tt = TreatmentType(hospital_id=hospital_id, name=name)
            db.add(tt)
            created.append(name)
    await db.commit()
    return {"seeded": created}
