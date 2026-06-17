from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, time


class DoctorWorkingHourCreate(BaseModel):
    day_of_week: int
    start_time: time
    end_time: time
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    is_available: bool = True


class DoctorWorkingHourUpdate(BaseModel):
    day_of_week: Optional[int] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    is_available: Optional[bool] = None


class DoctorWorkingHourResponse(BaseModel):
    id: str
    doctor_id: str
    hospital_id: str
    day_of_week: int
    start_time: time
    end_time: time
    lunch_start: Optional[time] = None
    lunch_end: Optional[time] = None
    is_available: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class DoctorWorkingHourBulkCreate(BaseModel):
    schedules: List[DoctorWorkingHourCreate]
