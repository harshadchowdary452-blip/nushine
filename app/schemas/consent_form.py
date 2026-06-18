from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ConsentFormCreate(BaseModel):
    patient_id: Optional[str] = None
    patient_name: str
    op_number: Optional[str] = None
    phone: Optional[str] = None
    doctor_id: Optional[str] = None
    consent_type: str
    remarks: Optional[str] = None
    hospital_id: str
    case_id: Optional[str] = None
    treatment_plan_id: Optional[str] = None


class ConsentFormUpdate(BaseModel):
    patient_name: Optional[str] = None
    op_number: Optional[str] = None
    phone: Optional[str] = None
    doctor_id: Optional[str] = None
    consent_type: Optional[str] = None
    remarks: Optional[str] = None


class ConsentFormResponse(BaseModel):
    id: str
    patient_id: Optional[str]
    patient_name: str
    op_number: Optional[str]
    phone: Optional[str]
    doctor_id: Optional[str]
    doctor_name: Optional[str] = None
    consent_type: str
    remarks: Optional[str]
    pdf_path: Optional[str]
    hospital_id: str
    uploaded_by: Optional[str]
    uploader_name: Optional[str] = None
    case_id: Optional[str]
    treatment_plan_id: Optional[str]
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConsentFormListResponse(BaseModel):
    items: List[ConsentFormResponse]
    total: int
