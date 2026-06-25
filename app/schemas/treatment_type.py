from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TreatmentTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None


class TreatmentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TreatmentTypeResponse(BaseModel):
    id: str
    hospital_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
