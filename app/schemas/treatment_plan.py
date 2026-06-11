from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class TreatmentPlanCreate(BaseModel):
    case_id: str
    treatment_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    cost: float = Field(default=0.0, ge=0)
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class TreatmentPlanUpdate(BaseModel):
    treatment_name: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[float] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class TreatmentPlanResponse(BaseModel):
    id: str
    case_id: str
    treatment_name: str
    description: Optional[str]
    cost: float
    duration_minutes: Optional[int]
    status: str
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
