"""CRM Repositories — centralized database operations."""
from app.crm.repositories.follow_up_repo import FollowUpRepository
from app.crm.repositories.communication_repo import CommunicationRepository
from app.crm.repositories.lead_repo import LeadRepository
from app.crm.repositories.automation_repo import AutomationRuleRepository, FollowUpTemplateRepository

__all__ = [
    "FollowUpRepository",
    "CommunicationRepository",
    "LeadRepository",
    "AutomationRuleRepository",
    "FollowUpTemplateRepository",
]
