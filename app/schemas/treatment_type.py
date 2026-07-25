from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TreatmentTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    treatment_category_id: Optional[str] = None
    estimated_duration: Optional[int] = None
    default_cost: Optional[float] = None


class TreatmentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    treatment_category_id: Optional[str] = None
    estimated_duration: Optional[int] = None
    default_cost: Optional[float] = None


class TreatmentTypeResponse(BaseModel):
    id: str
    hospital_id: Optional[str] = None
    treatment_category_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    estimated_duration: Optional[int] = None
    default_cost: Optional[float] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
