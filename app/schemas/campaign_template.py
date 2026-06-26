from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.campaign_template import TemplateChannel, TemplateCategory


class CampaignTemplateCreate(BaseModel):
    name: str
    channel: TemplateChannel = TemplateChannel.WHATSAPP
    category: TemplateCategory = TemplateCategory.GENERAL
    message: str


class CampaignTemplateUpdate(BaseModel):
    name: Optional[str] = None
    channel: Optional[TemplateChannel] = None
    category: Optional[TemplateCategory] = None
    message: Optional[str] = None
    is_active: Optional[bool] = None


class CampaignTemplateResponse(BaseModel):
    id: str
    name: str
    channel: str
    category: str
    message: str
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
