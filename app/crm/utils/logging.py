"""Centralized CRM logging — structured logging for all CRM actions."""
import logging
from typing import Optional, Any
from datetime import datetime, timezone


logger = logging.getLogger("crm")


def log_crm_action(
    action: str,
    entity_type: str,
    entity_id: str,
    user_id: Optional[str] = None,
    hospital_id: Optional[str] = None,
    previous_value: Optional[Any] = None,
    new_value: Optional[Any] = None,
    ip_address: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Log a CRM action with structured data."""
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "user_id": user_id,
        "hospital_id": hospital_id,
        "ip_address": ip_address,
    }
    if previous_value is not None:
        log_entry["previous_value"] = previous_value
    if new_value is not None:
        log_entry["new_value"] = new_value
    if details:
        log_entry["details"] = details

    logger.info("CRM_ACTION: %s", log_entry)


def log_crm_event(
    event_type: str,
    entity_type: str,
    entity_id: str,
    hospital_id: Optional[str] = None,
    payload: Optional[dict] = None,
) -> None:
    """Log a CRM event (for the event engine)."""
    logger.info(
        "CRM_EVENT: type=%s entity=%s id=%s hospital=%s payload=%s",
        event_type, entity_type, entity_id, hospital_id, payload,
    )


def log_crm_error(
    action: str,
    error: Exception,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    hospital_id: Optional[str] = None,
) -> None:
    """Log a CRM error."""
    logger.error(
        "CRM_ERROR: action=%s error=%s entity=%s id=%s hospital=%s",
        action, str(error), entity_type, entity_id, hospital_id,
        exc_info=True,
    )
