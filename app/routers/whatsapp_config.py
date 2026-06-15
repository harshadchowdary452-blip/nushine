from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.whatsapp_config import WhatsAppConfig

router = APIRouter(prefix="/whatsapp-config", tags=["WhatsApp Config"])


class WhatsAppConfigResponse(BaseModel):
    id: str
    hospital_id: str
    enabled: bool
    clinic_whatsapp_number: Optional[str]
    country_code: str
    default_message_templates_enabled: bool
    broadcast_enabled: bool
    campaign_enabled: bool

    model_config = {"from_attributes": True}


class WhatsAppConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    clinic_whatsapp_number: Optional[str] = None
    country_code: Optional[str] = None
    default_message_templates_enabled: Optional[bool] = None
    broadcast_enabled: Optional[bool] = None
    campaign_enabled: Optional[bool] = None


@router.get("/{hospital_id}", response_model=WhatsAppConfigResponse)
async def get_whatsapp_config(hospital_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    q = await db.execute(select(WhatsAppConfig).where(WhatsAppConfig.hospital_id == hospital_id))
    config = q.scalar_one_or_none()
    if not config:
        config = WhatsAppConfig(hospital_id=hospital_id)
        db.add(config)
        await db.flush()
        await db.refresh(config)
    return config


@router.put("/{hospital_id}", response_model=WhatsAppConfigResponse)
async def update_whatsapp_config(hospital_id: str, data: WhatsAppConfigUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    q = await db.execute(select(WhatsAppConfig).where(WhatsAppConfig.hospital_id == hospital_id))
    config = q.scalar_one_or_none()
    if not config:
        config = WhatsAppConfig(hospital_id=hospital_id)
        db.add(config)
        await db.flush()
        await db.refresh(config)
    update_data = data.model_dump(exclude_none=True)
    for k, v in update_data.items():
        setattr(config, k, v)
    await db.flush()
    await db.refresh(config)
    return config
