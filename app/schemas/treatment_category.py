from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TreatmentCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None


class TreatmentCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TreatmentCategoryResponse(BaseModel):
    id: str
    hospital_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
