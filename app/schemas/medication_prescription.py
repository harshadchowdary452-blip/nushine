from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class MedicationPrescriptionCreate(BaseModel):
    medication_name: str = Field(..., min_length=1, max_length=255)
    dosage: Optional[str] = Field(None, max_length=100)
    frequency: Optional[str] = Field(None, max_length=100)
    duration: Optional[str] = Field(None, max_length=100)
    instructions: Optional[str] = None


class MedicationPrescriptionUpdate(BaseModel):
    medication_name: Optional[str] = Field(None, min_length=1, max_length=255)
    dosage: Optional[str] = Field(None, max_length=100)
    frequency: Optional[str] = Field(None, max_length=100)
    duration: Optional[str] = Field(None, max_length=100)
    instructions: Optional[str] = None


class MedicationPrescriptionResponse(BaseModel):
    id: str
    medication_name: str
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    created_by_id: Optional[str] = None
    updated_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
