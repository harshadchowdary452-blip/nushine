from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.schemas.campaign_template import (
    CampaignTemplateCreate, CampaignTemplateUpdate,
)
from app.models.campaign_template import CampaignTemplate

router = APIRouter(prefix="/campaign-templates", tags=["Campaign Templates"])


def _serialize(t: CampaignTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "channel": t.channel.value if hasattr(t.channel, 'value') else str(t.channel),
        "category": t.category.value if hasattr(t.category, 'value') else str(t.category),
        "message": t.message,
        "is_active": t.is_active,
        "created_by": t.created_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("/")
async def list_templates(
    channel: Optional[str] = None,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    query = select(CampaignTemplate).order_by(desc(CampaignTemplate.created_at))
    if channel:
        query = query.where(CampaignTemplate.channel == channel)
    if category:
        query = query.where(CampaignTemplate.category == category)
    result = await db.execute(query)
    return [_serialize(t) for t in result.scalars().all()]


@router.get("/{template_id}")
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    template = await db.get(CampaignTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return _serialize(template)


@router.post("/", status_code=201)
async def create_template(
    data: CampaignTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    template = CampaignTemplate(
        name=data.name,
        channel=data.channel,
        category=data.category,
        message=data.message,
        created_by=current_user.get("sub"),
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return _serialize(template)


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    data: CampaignTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    template = await db.get(CampaignTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    update_data = data.model_dump(exclude_none=True)
    for key, value in update_data.items():
        if hasattr(template, key):
            setattr(template, key, value)
    await db.commit()
    await db.refresh(template)
    return _serialize(template)


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    template = await db.get(CampaignTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    await db.commit()
    return {"success": True}


@router.post("/{template_id}/duplicate")
async def duplicate_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    original = await db.get(CampaignTemplate, template_id)
    if not original:
        raise HTTPException(status_code=404, detail="Template not found")
    new_template = CampaignTemplate(
        name=f"{original.name} (Copy)",
        channel=original.channel,
        category=original.category,
        message=original.message,
        created_by=current_user.get("sub"),
    )
    db.add(new_template)
    await db.commit()
    await db.refresh(new_template)
    return _serialize(new_template)
