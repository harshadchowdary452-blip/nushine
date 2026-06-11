from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class AdminGroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None


class AdminGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class AdminGroupResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    hospital_count: int = 0
    hospital_names: List[str] = []
    doctor_count: int = 0
    patient_count: int = 0

    model_config = {"from_attributes": True}
