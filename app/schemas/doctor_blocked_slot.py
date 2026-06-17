from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, time


class DoctorBlockedSlotCreate(BaseModel):
    date: date
    start_time: time
    end_time: time
    reason: Optional[str] = None


class DoctorBlockedSlotUpdate(BaseModel):
    date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    reason: Optional[str] = None


class DoctorBlockedSlotResponse(BaseModel):
    id: str
    doctor_id: str
    hospital_id: str
    date: date
    start_time: time
    end_time: time
    reason: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
