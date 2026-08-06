from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class LaboratoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: Optional[str] = Field(None, max_length=50)
    contact_person: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    whatsapp_number: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    status: Optional[str] = Field("ACTIVE", max_length=20)
    notes: Optional[str] = None


class LaboratoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    code: Optional[str] = Field(None, max_length=50)
    contact_person: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    whatsapp_number: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    status: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None


class LaboratoryResponse(BaseModel):
    id: str
    name: str
    code: Optional[str]
    contact_person: Optional[str]
    phone: Optional[str]
    whatsapp_number: Optional[str]
    email: Optional[str]
    address: Optional[str]
    status: str
    notes: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
