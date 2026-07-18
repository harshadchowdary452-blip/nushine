"""Centralized CRM validation — reusable validators for common fields."""
import re
from typing import Optional, Any


class CRMValidation:
    VALID_PHONE = re.compile(r"^\+?[\d\s-]{7,15}$")
    VALID_EMAIL = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

    VALID_PRIORITIES = {"HIGH", "MEDIUM", "LOW"}
    VALID_CHANNELS = {"WHATSAPP", "SMS", "EMAIL", "PHONE", "TASK", "NOTIFICATION"}
    VALID_ROLES = {"RECEPTION", "DOCTOR", "CRM_EXECUTIVE", "HOSPITAL_ADMIN"}
    VALID_FOLLOW_UP_STATUSES = {
        "PENDING", "CONTACTED", "COMPLETED", "CANCELLED", "RESCHEDULED",
        "SKIPPED", "FAILED", "SCHEDULED", "NO_SHOW", "OVERDUE", "ESCALATED",
        "INTERESTED", "NOT_INTERESTED", "NEEDS_MORE_TIME", "REQUESTED_CALLBACK",
        "BUSY", "NO_RESPONSE", "WRONG_NUMBER", "TREATMENT_COMPLETED", "NEEDS_REVIEW", "DONE",
    }
    VALID_FOLLOW_UP_TYPES = {
        "OPD_FOLLOW_UP", "TREATMENT_FOLLOW_UP", "RECALL", "POST_SURGERY",
        "CUSTOM_FOLLOW_UP", "LEAD_FOLLOW_UP", "ENQUIRY_FOLLOW_UP",
    }
    VALID_TRIGGER_EVENTS = {
        "PATIENT_REGISTERED", "APPOINTMENT_COMPLETED", "APPOINTMENT_MISSED",
        "TREATMENT_STARTED", "VISIT_COMPLETED", "TREATMENT_COMPLETED",
        "BILL_GENERATED", "PAYMENT_OVERDUE", "PATIENT_INACTIVE",
        "PATIENT_BIRTHDAY", "MANUAL",
    }
    VALID_CAMPAIGN_STATUSES = {"DRAFT", "SCHEDULED", "SENDING", "SENT", "PAUSED", "CANCELLED", "COMPLETED"}
    VALID_LEAD_STATUSES = {
        "NEW", "CONTACTED", "INTERESTED", "QUALIFIED", "PROPOSAL_SENT",
        "NEGOTIATION", "CONVERTED", "LOST", "UNRESPONSIVE", "FOLLOW_UP_REQUIRED",
    }

    @classmethod
    def phone(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        if not cls.VALID_PHONE.match(value):
            raise ValueError(f"Invalid phone number: {value}")
        return value

    @classmethod
    def email(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        if not cls.VALID_EMAIL.match(value):
            raise ValueError(f"Invalid email: {value}")
        return value

    @classmethod
    def priority(cls, value: str) -> str:
        if value not in cls.VALID_PRIORITIES:
            raise ValueError(f"Invalid priority: {value}. Must be one of: {cls.VALID_PRIORITIES}")
        return value

    @classmethod
    def channel(cls, value: str) -> str:
        if value not in cls.VALID_CHANNELS:
            raise ValueError(f"Invalid channel: {value}. Must be one of: {cls.VALID_CHANNELS}")
        return value

    @classmethod
    def role(cls, value: str) -> str:
        if value not in cls.VALID_ROLES:
            raise ValueError(f"Invalid role: {value}. Must be one of: {cls.VALID_ROLES}")
        return value

    @classmethod
    def follow_up_status(cls, value: str) -> str:
        if value not in cls.VALID_FOLLOW_UP_STATUSES:
            raise ValueError(f"Invalid follow-up status: {value}")
        return value

    @classmethod
    def follow_up_type(cls, value: str) -> str:
        if value not in cls.VALID_FOLLOW_UP_TYPES:
            raise ValueError(f"Invalid follow-up type: {value}")
        return value

    @classmethod
    def trigger_event(cls, value: str) -> str:
        if value not in cls.VALID_TRIGGER_EVENTS:
            raise ValueError(f"Invalid trigger event: {value}")
        return value

    @classmethod
    def campaign_status(cls, value: str) -> str:
        if value not in cls.VALID_CAMPAIGN_STATUSES:
            raise ValueError(f"Invalid campaign status: {value}")
        return value

    @classmethod
    def lead_status(cls, value: str) -> str:
        if value not in cls.VALID_LEAD_STATUSES:
            raise ValueError(f"Invalid lead status: {value}")
        return value

    @classmethod
    def name(cls, value: str, min_len: int = 1, max_len: int = 255) -> str:
        if not value or len(value.strip()) < min_len:
            raise ValueError(f"Name must be at least {min_len} characters")
        if len(value) > max_len:
            raise ValueError(f"Name must not exceed {max_len} characters")
        return value.strip()

    @classmethod
    def positive_int(cls, value: Any, field_name: str = "value") -> int:
        try:
            v = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"{field_name} must be a positive integer")
        if v < 0:
            raise ValueError(f"{field_name} must not be negative")
        return v
