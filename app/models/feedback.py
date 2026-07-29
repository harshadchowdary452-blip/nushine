"""Context-aware feedback models for Leads and Patients.

Single source of truth for all CRM feedback data.
Lead enquiries and Patient enquiries use separate models
with distinct fields aligned to their business workflows.
"""

import uuid
import json
from datetime import datetime, timezone, date, time
from typing import Optional
from sqlalchemy import (
    String, DateTime, Text, ForeignKey, Integer, Boolean,
    Date, Time, Float, JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LeadFeedback(Base):
    """Context-aware feedback for LEAD_FOLLOW_UP enquiries.

    Optimised for converting Leads into Patients.
    """

    __tablename__ = "lead_feedback"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    enquiry_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("generated_enquiries.id"), nullable=False, index=True
    )
    hospital_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hospitals.id"), nullable=True
    )
    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("leads.id"), nullable=False, index=True
    )

    # --- Core response ---
    response_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="CONTACTED"
    )
    interested: Mapped[bool] = mapped_column(Boolean, default=False)
    follow_up_required: Mapped[bool] = mapped_column(Boolean, default=True)

    # --- Conversion-oriented fields ---
    budget_mentioned: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    preferred_consultation_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    preferred_consultation_time: Mapped[Optional[time]] = mapped_column(
        Time, nullable=True
    )
    preferred_doctor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    reason_not_interested: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    competitor_chosen: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )

    # --- Communication ---
    call_outcome: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    whatsapp_replied: Mapped[bool] = mapped_column(Boolean, default=False)
    callback_requested: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Metadata ---
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    feedback_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    feedback_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # --- Relationships ---
    lead = relationship("Lead", foreign_keys=[lead_id])
    feedback_by_user = relationship(
        "User", foreign_keys=[feedback_by]
    )
    preferred_doctor = relationship(
        "User", foreign_keys=[preferred_doctor_id]
    )


class PatientFeedback(Base):
    """Context-aware feedback for patient-type enquiries.

    Focuses on service quality, clinical satisfaction, and recovery.
    Replaces the legacy generic PatientFeedback model.
    """

    __tablename__ = "patient_feedback_context"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    enquiry_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("generated_enquiries.id"), nullable=False, index=True
    )
    hospital_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hospitals.id"), nullable=True
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id"), nullable=False, index=True
    )

    # --- Ratings (1-5 scale) ---
    consultation_experience: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    treatment_satisfaction: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    doctor_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    staff_behaviour: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    waiting_time: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    billing_experience: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    facility_cleanliness: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )

    # --- Overall ---
    would_recommend: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    overall_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # --- Next steps ---
    next_follow_up_required: Mapped[bool] = mapped_column(Boolean, default=False)
    recovery_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # --- Comments ---
    additional_comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- Metadata ---
    feedback_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    feedback_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # --- Relationships ---
    patient = relationship("Patient", foreign_keys=[patient_id])
    feedback_by_user = relationship("User", foreign_keys=[feedback_by])


class FeedbackNote(Base):
    """Reusable notes model for both Lead and Patient feedback.

    Supports rich text, author tracking, edit history,
    and chronological timeline display.
    """

    __tablename__ = "feedback_notes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    feedback_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    feedback_type: Mapped[str] = mapped_column(
        String(10), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    edit_history: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    created_by_user = relationship("User", foreign_keys=[created_by])

    def record_edit(self, previous_content: str) -> None:
        history = []
        if self.edit_history:
            history = json.loads(self.edit_history)
        history.append({
            "previous": previous_content,
            "edited_at": datetime.now(timezone.utc).isoformat(),
            "edited_by": self.created_by,
        })
        self.edit_history = json.dumps(history)
