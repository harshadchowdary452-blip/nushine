from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from app.models.campaign import CampaignType, CampaignChannel, CampaignTarget, CampaignStatus, CampaignRecipientStatus


class CampaignCreate(BaseModel):
    name: str
    campaign_type: CampaignType = CampaignType.GENERAL
    channel: CampaignChannel = CampaignChannel.WHATSAPP
    target: CampaignTarget = CampaignTarget.ALL
    message: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    campaign_type: Optional[CampaignType] = None
    channel: Optional[CampaignChannel] = None
    target: Optional[CampaignTarget] = None
    message: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[CampaignStatus] = None


class CampaignResponse(BaseModel):
    id: str
    name: str
    campaign_type: str
    channel: str
    target: str
    message: str
    start_date: Optional[date]
    end_date: Optional[date]
    status: str
    patients_targeted: int
    messages_sent: int
    messages_delivered: int
    messages_read: int
    responses_count: int
    appointments_generated: int
    revenue_generated: float
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CampaignLaunchResponse(BaseModel):
    success: bool
    campaign_id: str
    recipients_count: int
    message: str


class CampaignAnalytics(BaseModel):
    total_campaigns: int
    active_campaigns: int
    completed_campaigns: int
    total_recipients: int
    total_delivered: int
    total_responses: int
    total_appointments: float
    total_revenue: float
    delivery_rate: float
    response_rate: float
    appointment_conversion_rate: float


class CampaignRecipientResponse(BaseModel):
    id: str
    campaign_id: str
    patient_id: str
    patient_name: Optional[str] = None
    status: str
    response_message: Optional[str] = None
    responded_at: Optional[datetime] = None
    created_at: datetime
    model_config = {"from_attributes": True}
