from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, time
from app.schemas.patient import PatientResponse


class ClinicalFindingCreate(BaseModel):
    finding_type: str
    tooth_number: Optional[str] = None
    severity: Optional[str] = None
    dentition_type: Optional[str] = None
    surface: Optional[str] = None
    notes: Optional[str] = None


class ClinicalFindingResponse(BaseModel):
    id: str
    case_id: str
    finding_type: str
    tooth_number: Optional[str] = None
    severity: Optional[str] = None
    dentition_type: Optional[str] = None
    surface: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CaseCreate(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    consultant_id: Optional[str] = None
    appointment_id: Optional[str] = None
    chief_complaint: str = Field(..., min_length=1)
    chief_complaint_duration: Optional[str] = None
    chief_complaint_severity: Optional[str] = None
    chief_complaint_associated_symptoms: Optional[str] = None
    hpi: Optional[str] = None
    personal_history: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None
    dental_history: Optional[str] = None
    extra_oral_examination: Optional[str] = None
    intra_oral_examination: Optional[str] = None
    clinical_findings_summary: Optional[str] = None
    periodontal_examination: Optional[str] = None
    investigations: Optional[str] = None
    provisional_diagnosis: Optional[str] = None
    final_diagnosis: Optional[str] = None
    diagnosis: Optional[str] = None
    initial_treatment_plan: Optional[str] = None
    treatment_plan_estimated_cost: Optional[float] = None
    treatment_plan_estimated_visits: Optional[int] = None
    patient_instructions: Optional[str] = None
    medicines_prescribed: Optional[str] = None
    follow_up_instructions: Optional[str] = None
    next_review_date: Optional[datetime] = None
    doctor_registration_number: Optional[str] = None
    doctor_specialization: Optional[str] = None
    notes: Optional[str] = None
    findings: Optional[List[ClinicalFindingCreate]] = None


class CaseUpdate(BaseModel):
    chief_complaint: Optional[str] = None
    chief_complaint_duration: Optional[str] = None
    chief_complaint_severity: Optional[str] = None
    chief_complaint_associated_symptoms: Optional[str] = None
    hpi: Optional[str] = None
    personal_history: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None
    dental_history: Optional[str] = None
    extra_oral_examination: Optional[str] = None
    intra_oral_examination: Optional[str] = None
    clinical_findings_summary: Optional[str] = None
    periodontal_examination: Optional[str] = None
    investigations: Optional[str] = None
    provisional_diagnosis: Optional[str] = None
    final_diagnosis: Optional[str] = None
    diagnosis: Optional[str] = None
    initial_treatment_plan: Optional[str] = None
    treatment_plan_estimated_cost: Optional[float] = None
    treatment_plan_estimated_visits: Optional[int] = None
    patient_instructions: Optional[str] = None
    medicines_prescribed: Optional[str] = None
    follow_up_instructions: Optional[str] = None
    next_review_date: Optional[datetime] = None
    doctor_registration_number: Optional[str] = None
    doctor_specialization: Optional[str] = None
    status: Optional[str] = None
    consultant_id: Optional[str] = None
    doctor_id: Optional[str] = None
    notes: Optional[str] = None
    findings: Optional[List[ClinicalFindingCreate]] = None


class UserBrief(BaseModel):
    id: str
    full_name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None

    model_config = {"from_attributes": True}


class CaseResponse(BaseModel):
    id: str
    case_number: Optional[str] = None
    patient_id: str
    doctor_id: Optional[str]
    consultant_id: Optional[str]
    appointment_id: Optional[str] = None
    patient: Optional[PatientResponse] = None
    patient_name: Optional[str] = None
    doctor: Optional[UserBrief] = None
    doctor_name: Optional[str] = None
    created_by: Optional[UserBrief] = None
    updated_by: Optional[UserBrief] = None
    appointment_date: Optional[date] = None
    appointment_time: Optional[time] = None
    chief_complaint: str
    chief_complaint_duration: Optional[str] = None
    chief_complaint_severity: Optional[str] = None
    chief_complaint_associated_symptoms: Optional[str] = None
    hpi: Optional[str] = None
    personal_history: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None
    dental_history: Optional[str] = None
    extra_oral_examination: Optional[str] = None
    intra_oral_examination: Optional[str] = None
    clinical_findings_summary: Optional[str] = None
    periodontal_examination: Optional[str] = None
    investigations: Optional[str] = None
    provisional_diagnosis: Optional[str] = None
    final_diagnosis: Optional[str] = None
    diagnosis: Optional[str] = None
    initial_treatment_plan: Optional[str] = None
    treatment_plan_estimated_cost: Optional[float] = None
    treatment_plan_estimated_visits: Optional[int] = None
    patient_instructions: Optional[str] = None
    medicines_prescribed: Optional[str] = None
    follow_up_instructions: Optional[str] = None
    next_review_date: Optional[datetime] = None
    doctor_registration_number: Optional[str] = None
    doctor_specialization: Optional[str] = None
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
    performer_role: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
