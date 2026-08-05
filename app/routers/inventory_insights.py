from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.models.hospital import Hospital
from app.services.inventory_calculation_service import (
    item_insights, stock_insights, transfer_suggestions,
)

router = APIRouter(prefix="/inventory/insights", tags=["Inventory Insights"])


async def _ensure_hospital_in_scope(current_user: dict, hospital_id: str, db: AsyncSession):
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        if hospital_id != current_user.get("hospital_id"):
            raise HTTPException(status_code=403, detail="HOSPITAL_CONTEXT_DENIED")
    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        hids = [row[0] for row in (await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))).all()]
        if hospital_id not in hids:
            raise HTTPException(status_code=403, detail="HOSPITAL_CONTEXT_DENIED")


@router.get("/item")
async def get_item_insights(
    hospital_id: str = Query(...),
    item_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    await _ensure_hospital_in_scope(current_user, hospital_id, db)
    return await item_insights(db, hospital_id, item_id)


@router.get("/stock")
async def get_stock_insights(
    hospital_id: str = Query(...),
    item_ids: Optional[str] = Query(None, description="Comma separated item ids"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    await _ensure_hospital_in_scope(current_user, hospital_id, db)
    ids = [i for i in item_ids.split(",")] if item_ids else None
    return await stock_insights(db, hospital_id, ids)


@router.get("/transfer-suggestions")
async def get_transfer_suggestions(
    hospital_ids: str = Query(...),
    item_ids: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    hids = [h for h in hospital_ids.split(",") if h]
    if not hids:
        raise HTTPException(status_code=400, detail="hospital_ids is required")
    role = current_user.get("role")
    if role in (Role.HOSPITAL_ADMIN.value, Role.DOCTOR.value):
        hids = [current_user.get("hospital_id")] if current_user.get("hospital_id") else []
    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        allowed = [row[0] for row in (await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))).all()]
        hids = [h for h in hids if h in allowed]
    ids = [i for i in item_ids.split(",")] if item_ids else None
    return await transfer_suggestions(db, hids, ids)
