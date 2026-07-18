"""CRM Services — centralized business logic."""
from app.crm.services.follow_up_service import FollowUpService
from app.crm.services.communication_service import CommunicationService
from app.crm.services.campaign_service import CampaignService
from app.crm.services.lead_service import LeadCRMService
from app.crm.services.template_service import TemplateService
from app.crm.services.analytics_service import AnalyticsService

__all__ = [
    "FollowUpService",
    "CommunicationService",
    "CampaignService",
    "LeadCRMService",
    "TemplateService",
    "AnalyticsService",
]
