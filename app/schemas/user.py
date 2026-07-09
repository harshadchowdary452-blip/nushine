from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    hospital_id: Optional[str] = None
    admin_group_id: Optional[str] = None
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8)
    full_name: str = Field(..., min_length=2, max_length=255)
    phone: Optional[str] = None
    role: Optional[str] = None
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    license_number: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    license_number: Optional[str] = None
    hospital_id: Optional[str] = None
    admin_group_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: str
    hospital_id: Optional[str]
    admin_group_id: Optional[str]
    email: str
    full_name: str
    phone: Optional[str]
    role: str
    is_active: bool
    specialization: Optional[str]
    qualification: Optional[str]
    license_number: Optional[str]
    is_verified: bool
    last_login: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
