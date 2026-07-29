"""Centralized feedback service for CRM enquiries.

Single source of truth for creating, updating, and syncing
feedback across Lead and Patient enquiry types. Every feedback
operation flows through this service — no duplicate logic.
"""

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import LeadFeedback, PatientFeedback, FeedbackNote
from app.models.generated_enquiry import GeneratedEnquiry
from app.models.lead import Lead
from app.models.patient import Patient
from app.models.patient_timeline import PatientTimeline
from app.services.timeline_helper import record_timeline_event


class FeedbackService:
    """Create, read, and sync feedback for CRM enquiries."""

    def __init__(self, db: AsyncSession, current_user: Optional[dict] = None):
        self.db = db
        self.current_user = current_user

    # ------------------------------------------------------------------
    # Lead Feedback
    # ------------------------------------------------------------------

    async def create_lead_feedback(
        self,
        enquiry: GeneratedEnquiry,
        data: dict,
    ) -> LeadFeedback:
        """Create feedback for a LEAD_FOLLOW_UP enquiry and sync to Lead."""
        fb = LeadFeedback(
            enquiry_id=enquiry.id,
            hospital_id=enquiry.hospital_id,
            lead_id=enquiry.lead_id,
            response_status=data.get("response_status", "CONTACTED"),
            interested=data.get("interested", False),
            follow_up_required=data.get("follow_up_required", True),
            budget_mentioned=data.get("budget_mentioned"),
            preferred_consultation_date=data.get("preferred_consultation_date"),
            preferred_consultation_time=data.get("preferred_consultation_time"),
            preferred_doctor_id=data.get("preferred_doctor_id"),
            reason_not_interested=data.get("reason_not_interested"),
            competitor_chosen=data.get("competitor_chosen"),
            call_outcome=data.get("call_outcome"),
            whatsapp_replied=data.get("whatsapp_replied", False),
            callback_requested=data.get("callback_requested", False),
            notes=data.get("notes"),
            feedback_by=data.get(
                "feedback_by",
                self.current_user.get("id") if self.current_user else None,
            ),
        )
        self.db.add(fb)
        await self.db.flush()

        # Sync to master Lead record
        await self._sync_lead(enquiry.lead_id, fb, data.get("notes"))

        # Record timeline event
        await self._record_lead_timeline(fb, data.get("notes"))

        return fb

    async def get_lead_feedback(
        self, enquiry_id: str
    ) -> Optional[LeadFeedback]:
        q = select(LeadFeedback).where(
            LeadFeedback.enquiry_id == enquiry_id
        ).order_by(LeadFeedback.created_at.desc()).limit(1)
        result = await self.db.execute(q)
        return result.scalar_one_or_none()

    async def get_all_lead_feedback(
        self, enquiry_id: str
    ) -> list[LeadFeedback]:
        q = select(LeadFeedback).where(
            LeadFeedback.enquiry_id == enquiry_id
        ).order_by(LeadFeedback.created_at.desc())
        result = await self.db.execute(q)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Patient Feedback
    # ------------------------------------------------------------------

    async def create_patient_feedback(
        self,
        enquiry: GeneratedEnquiry,
        data: dict,
    ) -> PatientFeedback:
        """Create feedback for a patient-type enquiry and sync to Patient."""
        fb = PatientFeedback(
            enquiry_id=enquiry.id,
            hospital_id=enquiry.hospital_id,
            patient_id=enquiry.patient_id,
            consultation_experience=data.get("consultation_experience"),
            treatment_satisfaction=data.get("treatment_satisfaction"),
            doctor_rating=data.get("doctor_rating"),
            staff_behaviour=data.get("staff_behaviour"),
            waiting_time=data.get("waiting_time"),
            billing_experience=data.get("billing_experience"),
            facility_cleanliness=data.get("facility_cleanliness"),
            would_recommend=data.get("would_recommend"),
            overall_rating=data.get("overall_rating"),
            next_follow_up_required=data.get("next_follow_up_required", False),
            recovery_status=data.get("recovery_status"),
            additional_comments=data.get("additional_comments"),
            feedback_by=data.get(
                "feedback_by",
                self.current_user.get("id") if self.current_user else None,
            ),
        )
        self.db.add(fb)
        await self.db.flush()

        # Sync to master Patient record
        await self._sync_patient(enquiry.patient_id, fb)

        # Record timeline event
        await self._record_patient_timeline(fb)

        return fb

    async def get_patient_feedback(
        self, enquiry_id: str
    ) -> Optional[PatientFeedback]:
        q = select(PatientFeedback).where(
            PatientFeedback.enquiry_id == enquiry_id
        ).order_by(PatientFeedback.created_at.desc()).limit(1)
        result = await self.db.execute(q)
        return result.scalar_one_or_none()

    async def get_all_patient_feedback(
        self, enquiry_id: str
    ) -> list[PatientFeedback]:
        q = select(PatientFeedback).where(
            PatientFeedback.enquiry_id == enquiry_id
        ).order_by(PatientFeedback.created_at.desc())
        result = await self.db.execute(q)
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Notes (shared across both types)
    # ------------------------------------------------------------------

    async def add_note(
        self,
        feedback_id: str,
        feedback_type: str,
        content: str,
    ) -> FeedbackNote:
        note = FeedbackNote(
            feedback_id=feedback_id,
            feedback_type=feedback_type,
            content=content,
            created_by=self.current_user.get("id") if self.current_user else None,
        )
        self.db.add(note)
        await self.db.flush()
        return note

    async def get_notes(
        self, feedback_id: str, feedback_type: str
    ) -> list[FeedbackNote]:
        q = select(FeedbackNote).where(
            FeedbackNote.feedback_id == feedback_id,
            FeedbackNote.feedback_type == feedback_type,
        ).order_by(FeedbackNote.created_at.asc())
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def update_note(
        self, note_id: str, new_content: str
    ) -> Optional[FeedbackNote]:
        note = await self.db.get(FeedbackNote, note_id)
        if not note:
            return None
        note.record_edit(note.content)
        note.content = new_content
        await self.db.flush()
        return note

    # ------------------------------------------------------------------
    # Sync helpers
    # ------------------------------------------------------------------

    async def _sync_lead(
        self, lead_id: str, fb: LeadFeedback, notes: Optional[str]
    ) -> None:
        lead = await self.db.get(Lead, lead_id)
        if not lead:
            return
        lead.latest_response_status = fb.response_status
        lead.latest_feedback_date = fb.feedback_date
        lead.latest_feedback_notes = notes or fb.notes
        lead.latest_call_outcome = fb.call_outcome
        lead.latest_follow_up_requirement = (
            "Yes" if fb.follow_up_required else "No"
        )
        await self.db.flush()

    async def _sync_patient(
        self, patient_id: str, fb: PatientFeedback
    ) -> None:
        patient = await self.db.get(Patient, patient_id)
        if not patient:
            return
        patient.latest_satisfaction_rating = fb.overall_rating
        patient.latest_feedback_date = fb.feedback_date
        patient.latest_feedback_comments = fb.additional_comments
        patient.latest_recovery_status = fb.recovery_status
        patient.latest_recommendation_status = fb.would_recommend
        await self.db.flush()

    async def _record_lead_timeline(
        self, fb: LeadFeedback, notes: Optional[str]
    ) -> None:
        status = fb.response_status.replace("_", " ").title()
        desc = f"Feedback recorded: {status}"
        if fb.follow_up_required:
            desc += " — Follow-up requested"
        if notes:
            desc += f" ({notes[:100]})"
        await record_timeline_event(
            db=self.db,
            patient_id=fb.lead_id,
            action="LEAD_FEEDBACK",
            module="CRM_FEEDBACK",
            description=desc,
            current_user=self.current_user,
        )

    async def _record_patient_timeline(
        self, fb: PatientFeedback
    ) -> None:
        rating_str = (
            f"Rated {fb.overall_rating}/5"
            if fb.overall_rating
            else "Feedback submitted"
        )
        recommend = " and recommended the clinic" if fb.would_recommend else ""
        desc = f"Feedback recorded: {rating_str}{recommend}"
        if fb.recovery_status:
            desc += f" — Recovery: {fb.recovery_status.replace('_', ' ').title()}"
        await record_timeline_event(
            db=self.db,
            patient_id=fb.patient_id,
            action="PATIENT_FEEDBACK",
            module="CRM_FEEDBACK",
            description=desc,
            current_user=self.current_user,
        )


def serialize_lead_feedback(fb: LeadFeedback) -> dict:
    return {
        "id": fb.id,
        "enquiry_id": fb.enquiry_id,
        "lead_id": fb.lead_id,
        "response_status": fb.response_status,
        "interested": fb.interested,
        "follow_up_required": fb.follow_up_required,
        "budget_mentioned": fb.budget_mentioned,
        "preferred_consultation_date": (
            fb.preferred_consultation_date.isoformat()
            if fb.preferred_consultation_date else None
        ),
        "preferred_consultation_time": (
            fb.preferred_consultation_time.strftime("%H:%M")
            if fb.preferred_consultation_time else None
        ),
        "preferred_doctor_id": fb.preferred_doctor_id,
        "reason_not_interested": fb.reason_not_interested,
        "competitor_chosen": fb.competitor_chosen,
        "call_outcome": fb.call_outcome,
        "whatsapp_replied": fb.whatsapp_replied,
        "callback_requested": fb.callback_requested,
        "notes": fb.notes,
        "feedback_date": fb.feedback_date.isoformat() if fb.feedback_date else None,
        "feedback_by": fb.feedback_by,
        "created_at": fb.created_at.isoformat() if fb.created_at else None,
    }


def serialize_patient_feedback(fb: PatientFeedback) -> dict:
    return {
        "id": fb.id,
        "enquiry_id": fb.enquiry_id,
        "patient_id": fb.patient_id,
        "consultation_experience": fb.consultation_experience,
        "treatment_satisfaction": fb.treatment_satisfaction,
        "doctor_rating": fb.doctor_rating,
        "staff_behaviour": fb.staff_behaviour,
        "waiting_time": fb.waiting_time,
        "billing_experience": fb.billing_experience,
        "facility_cleanliness": fb.facility_cleanliness,
        "would_recommend": fb.would_recommend,
        "overall_rating": fb.overall_rating,
        "next_follow_up_required": fb.next_follow_up_required,
        "recovery_status": fb.recovery_status,
        "additional_comments": fb.additional_comments,
        "feedback_date": fb.feedback_date.isoformat() if fb.feedback_date else None,
        "feedback_by": fb.feedback_by,
        "created_at": fb.created_at.isoformat() if fb.created_at else None,
    }


def serialize_note(note: FeedbackNote) -> dict:
    return {
        "id": note.id,
        "feedback_id": note.feedback_id,
        "content": note.content,
        "created_by": note.created_by,
        "created_by_name": note.created_by_user.full_name if note.created_by_user else None,
        "edit_history": (
            json.loads(note.edit_history) if note.edit_history else []
        ),
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }
