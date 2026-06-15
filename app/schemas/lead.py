from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class LeadCreate(BaseModel):
    hospital_id: Optional[str] = None
    lead_name: str = Field(..., min_length=1, max_length=255)
    mobile: str = Field(..., min_length=5, max_length=50)
    alternate_mobile: Optional[str] = None
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    source: str = "OTHER"
    interested_treatment: Optional[str] = None
    budget: Optional[float] = None
    preferred_visit_date: Optional[date] = None
    notes: Optional[str] = None
    lead_score: Optional[int] = None
    priority: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None


class LeadUpdate(BaseModel):
    lead_name: Optional[str] = None
    mobile: Optional[str] = None
    alternate_mobile: Optional[str] = None
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    source: Optional[str] = None
    interested_treatment: Optional[str] = None
    budget: Optional[float] = None
    preferred_visit_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    lead_score: Optional[int] = None
    priority: Optional[str] = None
    last_contacted_at: Optional[datetime] = None
    next_follow_up_date: Optional[date] = None
    assigned_staff_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    converted_patient_id: Optional[str] = None


class LeadResponse(BaseModel):
    id: str
    hospital_id: str
    assigned_staff_id: Optional[str]
    assigned_doctor_id: Optional[str]
    converted_patient_id: Optional[str]
    lead_name: str
    mobile: str
    alternate_mobile: Optional[str]
    email: Optional[str]
    age: Optional[int]
    gender: Optional[str]
    city: Optional[str]
    source: str
    interested_treatment: Optional[str]
    budget: Optional[float]
    preferred_visit_date: Optional[date]
    notes: Optional[str]
    status: str
    lead_score: Optional[int]
    last_contacted_at: Optional[datetime]
    next_follow_up_date: Optional[date]
    priority: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadStatusUpdate(BaseModel):
    status: str


class LeadCallCreate(BaseModel):
    outcome: Optional[str] = None
    notes: Optional[str] = None
    follow_up_date: Optional[date] = None
    duration_seconds: Optional[int] = None


class LeadCallResponse(BaseModel):
    id: str
    lead_id: str
    called_by: Optional[str]
    outcome: Optional[str]
    notes: Optional[str]
    follow_up_date: Optional[date]
    duration_seconds: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class LeadConvertCreate(BaseModel):
    patient_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None
    doctor_id: Optional[str] = None

class LeadFollowUpCreate(BaseModel):
    follow_up_date: str
    follow_up_time: Optional[str] = None
    priority: Optional[str] = "MEDIUM"
    reason: Optional[str] = None
    notes: Optional[str] = None

class LeadAppointmentCreate(BaseModel):
    appointment_date: str
    appointment_time: Optional[str] = "09:00"
    doctor_id: Optional[str] = None
    notes: Optional[str] = None

class LeadCommunicationCreate(BaseModel):
    channel: str = "WHATSAPP"
    message: str


class LeadCommunicationResponse(BaseModel):
    id: str
    lead_id: str
    channel: str
    message: str
    status: str
    sent_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
