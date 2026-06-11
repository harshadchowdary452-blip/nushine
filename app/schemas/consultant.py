from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ConsultantCreate(BaseModel):
    hospital_id: Optional[str] = None
    full_name: str = Field(..., min_length=2, max_length=255)
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None


class ConsultantUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None
    is_active: Optional[bool] = None


class ConsultantResponse(BaseModel):
    id: str
    hospital_id: str
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    specialization: Optional[str]
    license_number: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
