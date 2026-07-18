"""Shared CRM utilities — single source of truth for helper functions."""
import logging
from datetime import date, timedelta
from typing import Optional, Any

logger = logging.getLogger(__name__)


def verify_hospital_access(entity, current_user: dict) -> None:
    """Raise HTTPException if entity's hospital_id doesn't match user's.
    
    Must be imported and called with:
        from fastapi import HTTPException, status
    """
    from fastapi import HTTPException, status as http_status
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        entity_hid = getattr(entity, "hospital_id", None)
        user_hid = current_user.get("hospital_id")
        if entity_hid and user_hid and str(entity_hid) != str(user_hid):
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Access denied: entity belongs to another hospital",
            )


def get_hospital_filter(current_user: dict) -> Optional[str]:
    """Return hospital_id for hospital-scoped queries, or None for global."""
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        return current_user.get("hospital_id")
    return None


def calculate_period_dates(
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> tuple[date, date]:
    """Calculate start/end dates from a period string or explicit dates.
    
    Returns (start, end) as date objects. Default is last 30 days.
    """
    today = date.today()
    if start_date and end_date:
        return date.fromisoformat(start_date), date.fromisoformat(end_date)
    if period == "today":
        return today, today
    elif period == "yesterday":
        yesterday = today - timedelta(days=1)
        return yesterday, yesterday
    elif period == "this_week":
        start = today - timedelta(days=today.weekday())
        return start, today
    elif period == "last_week":
        end = today - timedelta(days=today.weekday() + 1)
        start = end - timedelta(days=6)
        return start, end
    elif period == "this_month":
        return today.replace(day=1), today
    elif period == "last_month":
        first_this = today.replace(day=1)
        last_month_end = first_this - timedelta(days=1)
        return last_month_end.replace(day=1), last_month_end
    elif period == "this_quarter":
        quarter_start_month = (today.month - 1) // 3 * 3 + 1
        return today.replace(month=quarter_start_month, day=1), today
    elif period == "this_year":
        return today.replace(month=1, day=1), today
    elif period == "last_30_days":
        return today - timedelta(days=30), today
    elif period == "last_90_days":
        return today - timedelta(days=90), today
    elif period == "last_180_days":
        return today - timedelta(days=180), today
    elif period == "last_365_days":
        return today - timedelta(days=365), today
    else:
        return today - timedelta(days=30), today


async def enrich_follow_up(db, follow_up) -> dict[str, Any]:
    """Enrich a follow-up with patient name, doctor name, and billing info.
    
    Returns a dict suitable for API response.
    """
    from app.models.patient import Patient
    from app.models.user import User
    from app.models.billing import Billing
    
    fu_dict = {c.name: getattr(follow_up, c.name, None) for c in follow_up.__table__.columns}
    
    patient = await db.get(Patient, follow_up.patient_id)
    if patient:
        fu_dict["patient_name"] = patient.full_name
        fu_dict["patient_phone"] = patient.phone
    
    if follow_up.doctor_id:
        doctor = await db.get(User, follow_up.doctor_id)
        if doctor:
            fu_dict["doctor_name"] = doctor.full_name
    
    if follow_up.billing_id:
        billing = await db.get(Billing, follow_up.billing_id)
        if billing:
            fu_dict["billing_amount"] = float(billing.total_amount or 0)
            fu_dict["billing_status"] = billing.payment_status
    
    return fu_dict


PATIENT_SOURCE_PATTERNS: dict[str, list[str]] = {
    "Walk-in": ["walk-in", "walk in", "walkin", "direct", "walk_in"],
    "Referral": ["referral", "referred", "reference", "doctor_referral"],
    "Online": ["online", "website", "web", "google", "social media", "facebook", "instagram", "youtube"],
    "Campaign": ["campaign", "marketing", "ad", "advertisement", "promo"],
    "Insurance": ["insurance", "corporate", "tie-up"],
    "OPD": ["opd", "outpatient"],
    "Emergency": ["emergency", "urgent"],
    "Other": ["other", "unknown", ""],
}


def categorize_patient_source(source: Optional[str]) -> str:
    """Categorize a patient source string into a standard category."""
    if not source:
        return "Other"
    source_lower = source.lower().strip()
    for category, keywords in PATIENT_SOURCE_PATTERNS.items():
        if any(kw in source_lower for kw in keywords):
            return category
    return "Other"
