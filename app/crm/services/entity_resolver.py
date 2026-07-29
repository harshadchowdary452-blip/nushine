"""Centralized entity resolver for CRM enquiries.

Single source of truth for resolving display information
based on enquiry type. Every API endpoint and service
must use this module — no duplicated resolution logic.
"""

from typing import Any, Optional


# Sentinel used when both lead_id and patient_id are null.
PLACEHOLDER = "-"


def resolve_display_info(
    enquiry_type: str | None,
    patient_obj: Any | None,
    lead_obj: Any | None,
) -> dict:
    """Return resolved display-name, phone, and email for an enquiry.

    Rules
    -----
    * LEAD_FOLLOW_UP  → lead fields (never patient)
    * Patient enquiry  → patient fields (never lead)
    * Both null        → "-" for every field

    Returns
    -------
    dict with keys: ``display_name``, ``display_phone``, ``display_email``
    """
    is_lead = enquiry_type == "LEAD_FOLLOW_UP"

    if is_lead and lead_obj:
        return {
            "display_name": lead_obj.lead_name or PLACEHOLDER,
            "display_phone": lead_obj.mobile or PLACEHOLDER,
            "display_email": lead_obj.email or PLACEHOLDER,
        }

    if not is_lead and patient_obj:
        return {
            "display_name": patient_obj.full_name or PLACEHOLDER,
            "display_phone": patient_obj.phone or PLACEHOLDER,
            "display_email": patient_obj.email or PLACEHOLDER,
        }

    return {
        "display_name": PLACEHOLDER,
        "display_phone": PLACEHOLDER,
        "display_email": PLACEHOLDER,
    }


def resolve_lead_detail(lead_obj: Any) -> dict | None:
    """Build a standardised lead-info dict (or None if lead_obj is falsy)."""
    if not lead_obj:
        return None
    return {
        "id": str(lead_obj.id),
        "name": lead_obj.lead_name,
        "mobile": lead_obj.mobile,
        "email": lead_obj.email,
        "source": lead_obj.source,
        "status": lead_obj.status,
        "interested_treatment": lead_obj.interested_treatment,
        "priority": lead_obj.priority,
        "next_follow_up_date": (
            lead_obj.next_follow_up_date.isoformat()
            if lead_obj.next_follow_up_date else None
        ),
        "notes": lead_obj.notes,
    }


def resolve_patient_detail(patient_obj: Any, is_lead: bool = False) -> dict | None:
    """Build a standardised patient-info dict (None for LEAD or missing)."""
    if not patient_obj or is_lead:
        return None
    return {
        "id": str(patient_obj.id),
        "name": patient_obj.full_name,
        "photo_url": patient_obj.photo_url,
        "phone": patient_obj.phone,
        "op_number": patient_obj.op_no,
        "age": patient_obj.age,
        "gender": patient_obj.gender,
        "status": (
            patient_obj.status.value
            if hasattr(patient_obj.status, "value")
            else patient_obj.status
        ),
    }
