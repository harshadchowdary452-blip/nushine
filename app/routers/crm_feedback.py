"""Context-aware feedback API for CRM enquiries.

Separate endpoints for Lead and Patient feedback with
type-specific fields. All operations go through the
centralized FeedbackService.
"""

from datetime import date, time, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.crm.services.feedback_service import (
    FeedbackService,
    serialize_lead_feedback,
    serialize_patient_feedback,
    serialize_note,
)
from app.models.generated_enquiry import GeneratedEnquiry

router = APIRouter(prefix="/crm/feedback", tags=["CRM Feedback"])


# =========================================================================
# Schemas
# =========================================================================

class LeadFeedbackCreate(BaseModel):
    response_status: str = Field(default="CONTACTED")
    interested: bool = False
    follow_up_required: bool = True
    budget_mentioned: Optional[float] = None
    preferred_consultation_date: Optional[str] = None
    preferred_consultation_time: Optional[str] = None
    preferred_doctor_id: Optional[str] = None
    reason_not_interested: Optional[str] = None
    competitor_chosen: Optional[str] = None
    call_outcome: Optional[str] = None
    whatsapp_replied: bool = False
    callback_requested: bool = False
    notes: Optional[str] = None


class PatientFeedbackCreate(BaseModel):
    consultation_experience: Optional[int] = Field(None, ge=1, le=5)
    treatment_satisfaction: Optional[int] = Field(None, ge=1, le=5)
    doctor_rating: Optional[int] = Field(None, ge=1, le=5)
    staff_behaviour: Optional[int] = Field(None, ge=1, le=5)
    waiting_time: Optional[int] = Field(None, ge=1, le=5)
    billing_experience: Optional[int] = Field(None, ge=1, le=5)
    facility_cleanliness: Optional[int] = Field(None, ge=1, le=5)
    would_recommend: Optional[bool] = None
    overall_rating: Optional[int] = Field(None, ge=1, le=5)
    next_follow_up_required: bool = False
    recovery_status: Optional[str] = None
    additional_comments: Optional[str] = None
    next_follow_up_date: Optional[str] = None


class NoteCreate(BaseModel):
    content: str = Field(..., min_length=1)


class NoteUpdate(BaseModel):
    content: str = Field(..., min_length=1)


# =========================================================================
# Helpers
# =========================================================================

async def _get_enquiry(enquiry_id: str, db: AsyncSession) -> GeneratedEnquiry:
    ge = await db.get(GeneratedEnquiry, enquiry_id)
    if not ge:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return ge


def _parse_date(val: Optional[str]) -> Optional[date]:
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date: {val}")


def _parse_time(val: Optional[str]) -> Optional[time]:
    if not val:
        return None
    try:
        parts = val.split(":")
        return time(int(parts[0]), int(parts[1]))
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail=f"Invalid time: {val}")


# =========================================================================
# Endpoints — Lead Feedback
# =========================================================================

@router.post("/lead/{enquiry_id}")
async def submit_lead_feedback(
    enquiry_id: str,
    data: LeadFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    enquiry = await _get_enquiry(enquiry_id, db)
    if enquiry.enquiry_type != "LEAD_FOLLOW_UP":
        raise HTTPException(
            status_code=400,
            detail="Lead feedback can only be submitted for LEAD_FOLLOW_UP enquiries",
        )
    svc = FeedbackService(db, current_user)
    fb = await svc.create_lead_feedback(enquiry, {
        "response_status": data.response_status,
        "interested": data.interested,
        "follow_up_required": data.follow_up_required,
        "budget_mentioned": data.budget_mentioned,
        "preferred_consultation_date": _parse_date(data.preferred_consultation_date),
        "preferred_consultation_time": _parse_time(data.preferred_consultation_time),
        "preferred_doctor_id": data.preferred_doctor_id,
        "reason_not_interested": data.reason_not_interested,
        "competitor_chosen": data.competitor_chosen,
        "call_outcome": data.call_outcome,
        "whatsapp_replied": data.whatsapp_replied,
        "callback_requested": data.callback_requested,
        "notes": data.notes,
    })
    await db.commit()
    return serialize_lead_feedback(fb)


@router.get("/lead/{enquiry_id}")
async def get_lead_feedback(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    svc = FeedbackService(db, current_user)
    fb_list = await svc.get_all_lead_feedback(enquiry_id)
    return [serialize_lead_feedback(fb) for fb in fb_list]


@router.get("/lead/{enquiry_id}/latest")
async def get_latest_lead_feedback(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    svc = FeedbackService(db, current_user)
    fb = await svc.get_lead_feedback(enquiry_id)
    if not fb:
        return None
    return serialize_lead_feedback(fb)


# =========================================================================
# Endpoints — Patient Feedback
# =========================================================================

@router.post("/patient/{enquiry_id}")
async def submit_patient_feedback(
    enquiry_id: str,
    data: PatientFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    enquiry = await _get_enquiry(enquiry_id, db)
    if enquiry.enquiry_type == "LEAD_FOLLOW_UP":
        raise HTTPException(
            status_code=400,
            detail="Patient feedback is not valid for LEAD_FOLLOW_UP enquiries",
        )
    svc = FeedbackService(db, current_user)
    fb = await svc.create_patient_feedback(enquiry, data.model_dump())
    await db.commit()
    return serialize_patient_feedback(fb)


@router.get("/patient/{enquiry_id}")
async def get_patient_feedback(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    svc = FeedbackService(db, current_user)
    fb_list = await svc.get_all_patient_feedback(enquiry_id)
    return [serialize_patient_feedback(fb) for fb in fb_list]


@router.get("/patient/{enquiry_id}/latest")
async def get_latest_patient_feedback(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    svc = FeedbackService(db, current_user)
    fb = await svc.get_patient_feedback(enquiry_id)
    if not fb:
        return None
    return serialize_patient_feedback(fb)


# =========================================================================
# Endpoints — Notes (shared)
# =========================================================================

@router.post("/{feedback_id}/notes")
async def add_feedback_note(
    feedback_id: str,
    data: NoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    svc = FeedbackService(db, current_user)

    from app.models.feedback import LeadFeedback, PatientFeedback
    fb_lead = await db.get(LeadFeedback, feedback_id)
    fb_patient = await db.get(PatientFeedback, feedback_id)
    fb_type = "lead" if fb_lead else ("patient" if fb_patient else None)
    if not fb_type:
        raise HTTPException(status_code=404, detail="Feedback record not found")

    note = await svc.add_note(feedback_id, fb_type, data.content)
    await db.commit()
    return serialize_note(note)


@router.get("/{feedback_id}/notes")
async def list_feedback_notes(
    feedback_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    from app.models.feedback import LeadFeedback, PatientFeedback
    fb_lead = await db.get(LeadFeedback, feedback_id)
    fb_patient = await db.get(PatientFeedback, feedback_id)
    fb_type = "lead" if fb_lead else ("patient" if fb_patient else None)
    if not fb_type:
        raise HTTPException(status_code=404, detail="Feedback record not found")

    svc = FeedbackService(db, current_user)
    notes = await svc.get_notes(feedback_id, fb_type)
    return [serialize_note(n) for n in notes]


@router.patch("/notes/{note_id}")
async def update_feedback_note(
    note_id: str,
    data: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    svc = FeedbackService(db, current_user)
    note = await svc.update_note(note_id, data.content)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.commit()
    return serialize_note(note)


# =========================================================================
# Endpoint — Get feedback summary for an enquiry (auto-detect type)
# =========================================================================

@router.get("/{enquiry_id}/summary")
async def get_enquiry_feedback_summary(
    enquiry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    enquiry = await _get_enquiry(enquiry_id, db)
    svc = FeedbackService(db, current_user)

    if enquiry.enquiry_type == "LEAD_FOLLOW_UP":
        fb = await svc.get_lead_feedback(enquiry_id)
        return {
            "enquiry_type": "LEAD_FOLLOW_UP",
            "feedback": serialize_lead_feedback(fb) if fb else None,
        }
    else:
        fb = await svc.get_patient_feedback(enquiry_id)
        return {
            "enquiry_type": enquiry.enquiry_type,
            "feedback": serialize_patient_feedback(fb) if fb else None,
        }
