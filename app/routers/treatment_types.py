from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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
        q = q.where(
            (TreatmentType.hospital_id == hospital_id) | (TreatmentType.hospital_id.is_(None))
        )
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
            TreatmentType.hospital_id == hospital_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Treatment type already exists")
    tt = TreatmentType(hospital_id=hospital_id, name=data.name, description=data.description)
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
    tt = await db.get(TreatmentType, type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Treatment type not found")
    if data.name is not None:
        tt.name = data.name
    if data.description is not None:
        tt.description = data.description
    if data.is_active is not None:
        tt.is_active = data.is_active
    await db.commit()
    return tt


@router.delete("/{type_id}")
async def delete_treatment_type(
    type_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_CASES)
    tt = await db.get(TreatmentType, type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Treatment type not found")
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
                TreatmentType.hospital_id == hospital_id,
            )
        )
        if not existing.scalar_one_or_none():
            tt = TreatmentType(hospital_id=hospital_id, name=name)
            db.add(tt)
            created.append(name)
    await db.commit()
    return {"seeded": created}
