from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from app.models.campaign import CampaignType, CampaignChannel, CampaignTarget, CampaignStatus, CampaignRecipientStatus


class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    campaign_type: CampaignType = CampaignType.GENERAL
    channel: CampaignChannel = CampaignChannel.WHATSAPP
    target: CampaignTarget = CampaignTarget.ALL
    message: str
    hospital_id: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    scheduled_at: Optional[datetime] = None
    campaign_cost: float = 0.0


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    campaign_type: Optional[CampaignType] = None
    channel: Optional[CampaignChannel] = None
    target: Optional[CampaignTarget] = None
    message: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[CampaignStatus] = None
    campaign_cost: Optional[float] = None


class CampaignResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    campaign_type: str
    channel: str
    target: str
    message: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    scheduled_at: Optional[datetime] = None
    status: str
    campaign_cost: float = 0.0
    patients_targeted: int = 0
    messages_sent: int = 0
    messages_delivered: int = 0
    messages_failed: int = 0
    messages_read: int = 0
    responses_count: int = 0
    interested_count: int = 0
    appointments_generated: int = 0
    patients_converted: int = 0
    revenue_generated: float = 0.0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CampaignLaunchResponse(BaseModel):
    success: bool
    campaign_id: str
    recipients_count: int
    sent_count: int
    message: str


class CampaignProgressResponse(BaseModel):
    campaign_id: str
    status: str
    total_recipients: int
    sent: int
    delivered: int
    failed: int
    pending: int
    processing: bool


class CampaignAnalytics(BaseModel):
    total_campaigns: int
    active_campaigns: int
    completed_campaigns: int
    total_recipients: int
    total_delivered: int
    total_responses: int
    total_interested: int
    total_appointments: int
    total_converted: int
    total_revenue: float
    total_cost: float
    delivery_rate: float
    response_rate: float
    interest_rate: float
    conversion_rate: float
    appointment_conversion_rate: float
    roi_percentage: float


class CampaignRecipientResponse(BaseModel):
    id: str
    campaign_id: str
    patient_id: Optional[str] = None
    lead_id: Optional[str] = None
    patient_name: Optional[str] = None
    phone: Optional[str] = None
    status: str
    response_message: Optional[str] = None
    responded_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    created_at: datetime
    model_config = {"from_attributes": True}


class CampaignResponseDetail(BaseModel):
    id: str
    campaign_id: str
    campaign_name: Optional[str] = None
    recipient_id: str
    patient_id: Optional[str] = None
    lead_id: Optional[str] = None
    phone: str
    sender_name: Optional[str] = None
    message: str
    message_type: str
    is_read: bool = False
    is_lead: bool = False
    converted_to_patient: bool = False
    created_at: datetime
    model_config = {"from_attributes": True}


class AudiencePreviewResponse(BaseModel):
    total_count: int
    patients: List[dict] = []


class CampaignROI(BaseModel):
    campaign_id: str
    campaign_name: str
    campaign_cost: float
    revenue_generated: float
    net_profit: float
    roi_percentage: float
    patients_converted: int
    appointments_generated: int
    cost_per_patient: float
    revenue_per_patient: float


class CampaignDashboardWidgets(BaseModel):
    messages_sent_today: int = 0
    replies_today: int = 0
    appointments_generated: int = 0
    leads_converted: int = 0
    conversion_rate: float = 0.0
    revenue_generated: float = 0.0
    top_campaign: Optional[str] = None
    active_campaigns_count: int = 0


class CampaignTimelineEntry(BaseModel):
    id: str
    campaign_id: str
    campaign_name: Optional[str] = None
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    lead_id: Optional[str] = None
    event_type: str
    description: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class CampaignAnalyticsDetail(BaseModel):
    overview: CampaignAnalytics
    top_campaigns: List[dict] = []
    roi_data: List[CampaignROI] = []
    messages_over_time: List[dict] = []
    top_templates: List[dict] = []
    top_sources: List[dict] = []
    conversion_funnel: dict = {}
