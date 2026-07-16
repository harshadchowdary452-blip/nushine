from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ClinicalProgressNoteCreate(BaseModel):
    case_id: str
    note_date: datetime
    clinical_note: str = Field(..., min_length=1)
    attachments_json: Optional[str] = None
    digital_signature_url: Optional[str] = None


class ClinicalProgressNoteUpdate(BaseModel):
    clinical_note: Optional[str] = None
    attachments_json: Optional[str] = None
    digital_signature_url: Optional[str] = None


class ClinicalProgressNoteResponse(BaseModel):
    id: str
    case_id: str
    doctor_id: str
    doctor_name: Optional[str] = None
    note_date: datetime
    clinical_note: str
    attachments_json: Optional[str] = None
    digital_signature_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
