from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, time


TREATMENT_DURATION_MAP = {
    "CONSULTATION": 30,
    "FOLLOW_UP": 30,
    "TREATMENT": 60,
    "EMERGENCY": 30,
    "REVIEW": 30,
}


class AppointmentCreate(BaseModel):
    patient_id: str
    doctor_id: str
    appointment_date: date
    appointment_time: time
    appointment_type: Optional[str] = "CONSULTATION"
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    appointment_date: Optional[date] = None
    appointment_time: Optional[time] = None
    doctor_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None


class ReassignDoctorRequest(BaseModel):
    doctor_id: str
    reason: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None
    appointment_date: date
    appointment_time: time
    duration_minutes: int
    end_time: time
    appointment_type: str
    status: str
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TimeSlot(BaseModel):
    time: str
    available: bool
    status: str  # "available", "booked", "leave", "blocked", "past", "selected"
    patient_name: Optional[str] = None
    appointment_type: Optional[str] = None
    duration_minutes: Optional[int] = None
    appointment_id: Optional[str] = None


class DoctorSlotResponse(BaseModel):
    doctor_id: str
    doctor_name: str
    date: date
    slots: List[TimeSlot]
    is_on_leave: bool = False
    leave_reason: Optional[str] = None
    working_hours: Optional[str] = None
