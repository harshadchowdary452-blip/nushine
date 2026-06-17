from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, time


class DoctorAvailabilityCreate(BaseModel):
    date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    is_available: bool = True
    reason: Optional[str] = None


class DoctorAvailabilityUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    is_available: Optional[bool] = None
    reason: Optional[str] = None


class DoctorAvailabilityResponse(BaseModel):
    id: str
    doctor_id: str
    hospital_id: str
    date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    is_available: bool
    reason: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
