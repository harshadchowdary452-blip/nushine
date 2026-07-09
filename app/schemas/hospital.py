from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class HospitalCreate(BaseModel):
    admin_group_id: Optional[str] = None
    name: str = Field(..., min_length=2, max_length=255)
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    registration_number: Optional[str] = None
    gst_number: Optional[str] = None
    logo_url: Optional[str] = None


class HospitalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    registration_number: Optional[str] = None
    gst_number: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: Optional[bool] = None


class HospitalBrief(BaseModel):
    id: str
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    registration_number: Optional[str] = None
    gst_number: Optional[str] = None
    logo_url: Optional[str] = None

    model_config = {"from_attributes": True}


class HospitalResponse(BaseModel):
    id: str
    admin_group_id: str
    name: str
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    registration_number: Optional[str]
    gst_number: Optional[str]
    logo_url: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
