"""CRM Services — centralized business logic."""
from app.crm.services.follow_up_service import FollowUpService
from app.crm.services.communication_service import CommunicationService
from app.crm.services.campaign_service import CampaignService
from app.crm.services.lead_service import LeadCRMService
from app.crm.services.template_service import TemplateService
from app.crm.services.analytics_service import AnalyticsService
from app.crm.services.rule_engine import get_rule_engine
from app.crm.services.enquiry_executor import get_enquiry_executor
from app.crm.services.event_dispatcher import get_central_dispatcher, publish_event

__all__ = [
    "FollowUpService",
    "CommunicationService",
    "CampaignService",
    "LeadCRMService",
    "TemplateService",
    "AnalyticsService",
    "get_rule_engine",
    "get_enquiry_executor",
    "get_central_dispatcher",
    "publish_event",
]
