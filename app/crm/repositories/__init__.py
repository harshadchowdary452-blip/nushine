"""CRM Repositories — centralized database operations."""
from app.crm.repositories.follow_up_repo import FollowUpRepository
from app.crm.repositories.communication_repo import CommunicationRepository
from app.crm.repositories.campaign_repo import CampaignRepository
from app.crm.repositories.lead_repo import LeadRepository
from app.crm.repositories.enquiry_repo import EnquiryRepository
from app.crm.repositories.feedback_repo import FeedbackRepository
from app.crm.repositories.automation_repo import AutomationRuleRepository, FollowUpTemplateRepository
from app.crm.repositories.automation_repo import AutomationRuleConditionRepository, AutomationRuleActionRepository, AutomationRuleVersionRepository, AutomationRuleLogRepository, AutomationExecutionQueueRepository
from app.crm.repositories.notification_repo import NotificationRepository

__all__ = [
    "FollowUpRepository",
    "CommunicationRepository",
    "CampaignRepository",
    "LeadRepository",
    "EnquiryRepository",
    "FeedbackRepository",
    "AutomationRuleRepository",
    "FollowUpTemplateRepository",
    "AutomationRuleConditionRepository",
    "AutomationRuleActionRepository",
    "AutomationRuleVersionRepository",
    "AutomationRuleLogRepository",
    "AutomationExecutionQueueRepository",
    "NotificationRepository",
]
