from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date, time


class TreatmentSittingCreate(BaseModel):
    treatment_plan_id: str
    sitting_number: int = Field(..., ge=1)
    work_done: Optional[str] = None
    status: Optional[str] = None
    doctor_notes: Optional[str] = None
    next_appointment_date: Optional[date] = None
    next_appointment_time: Optional[time] = None


class TreatmentSittingUpdate(BaseModel):
    work_done: Optional[str] = None
    status: Optional[str] = None
    doctor_notes: Optional[str] = None
    next_appointment_date: Optional[date] = None
    next_appointment_time: Optional[time] = None


class TreatmentSittingResponse(BaseModel):
    id: str
    treatment_plan_id: str
    sitting_number: int
    work_done: Optional[str]
    status: str
    doctor_notes: Optional[str]
    next_appointment_date: Optional[date]
    next_appointment_time: Optional[time]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
