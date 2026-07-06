from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class PatientCreate(BaseModel):
    hospital_id: Optional[str] = None
    doctor_id: Optional[str] = None
    full_name: str = Field(..., min_length=2, max_length=255)
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    patient_source: Optional[str] = None
    original_source: Optional[str] = None
    source_campaign_name: Optional[str] = None
    source_campaign_id: Optional[str] = None
    source_campaign_date: Optional[date] = None
    address: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    bp: Optional[str] = None
    sugar: Optional[str] = None
    spo2: Optional[str] = None
    medical_history: Optional[str] = None
    abha_id: Optional[str] = None
    op_no: Optional[str] = None
    status: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    patient_source: Optional[str] = None
    original_source: Optional[str] = None
    source_campaign_name: Optional[str] = None
    source_campaign_id: Optional[str] = None
    source_campaign_date: Optional[date] = None
    address: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    bp: Optional[str] = None
    sugar: Optional[str] = None
    spo2: Optional[str] = None
    medical_history: Optional[str] = None
    abha_id: Optional[str] = None
    op_no: Optional[str] = None
    status: Optional[str] = None


class PatientResponse(BaseModel):
    id: str
    hospital_id: str
    doctor_id: Optional[str]
    full_name: str
    gender: Optional[str]
    date_of_birth: Optional[date]
    age: Optional[int]
    phone: Optional[str]
    email: Optional[str]
    patient_source: Optional[str]
    original_source: Optional[str]
    source_campaign_name: Optional[str]
    source_campaign_id: Optional[str]
    source_campaign_date: Optional[date]
    address: Optional[str]
    height: Optional[float]
    weight: Optional[float]
    bp: Optional[str]
    sugar: Optional[str]
    spo2: Optional[str]
    medical_history: Optional[str]
    abha_id: Optional[str]
    op_no: Optional[str]
    emergency_contact: Optional[str]
    photo_url: Optional[str]
    status: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
