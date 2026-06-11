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
    address: Optional[str] = None
    medical_history: Optional[str] = None
    status: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    medical_history: Optional[str] = None
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
    address: Optional[str]
    medical_history: Optional[str]
    photo_url: Optional[str]
    status: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
