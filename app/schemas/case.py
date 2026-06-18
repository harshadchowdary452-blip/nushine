from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ClinicalFindingCreate(BaseModel):
    finding_type: str
    tooth_number: Optional[str] = None
    severity: Optional[str] = None
    notes: Optional[str] = None


class ClinicalFindingResponse(BaseModel):
    id: str
    case_id: str
    finding_type: str
    tooth_number: Optional[str] = None
    severity: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CaseCreate(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    consultant_id: Optional[str] = None
    appointment_id: Optional[str] = None
    chief_complaint: str = Field(..., min_length=1)
    diagnosis: Optional[str] = None
    initial_treatment_plan: Optional[str] = None
    notes: Optional[str] = None
    findings: Optional[List[ClinicalFindingCreate]] = None


class CaseUpdate(BaseModel):
    chief_complaint: Optional[str] = None
    diagnosis: Optional[str] = None
    initial_treatment_plan: Optional[str] = None
    status: Optional[str] = None
    consultant_id: Optional[str] = None
    doctor_id: Optional[str] = None
    notes: Optional[str] = None
    findings: Optional[List[ClinicalFindingCreate]] = None


class CaseResponse(BaseModel):
    id: str
    case_number: Optional[str] = None
    patient_id: str
    doctor_id: Optional[str]
    consultant_id: Optional[str]
    appointment_id: Optional[str] = None
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    chief_complaint: str
    diagnosis: Optional[str]
    initial_treatment_plan: Optional[str] = None
    status: str
    notes: Optional[str]
    is_active: bool
    findings: Optional[List[ClinicalFindingResponse]] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CaseTimelineResponse(BaseModel):
    id: str
    case_id: str
    action: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    performed_by: Optional[str] = None
    performer_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
