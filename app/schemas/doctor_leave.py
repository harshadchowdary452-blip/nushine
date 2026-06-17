from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date


class DoctorLeaveCreate(BaseModel):
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: Optional[str] = "PENDING"


class DoctorLeaveUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None
    status: Optional[str] = None


class DoctorLeaveResponse(BaseModel):
    id: str
    doctor_id: str
    hospital_id: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
