from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, time
from app.models.appointment import PROCEDURE_DURATIONS


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
    procedure_name: Optional[str] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    appointment_date: Optional[date] = None
    appointment_time: Optional[time] = None
    doctor_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = None


class RescheduleRequest(BaseModel):
    appointment_date: date
    appointment_time: time
    reason: Optional[str] = None


class CompleteRequest(BaseModel):
    notes: Optional[str] = None


class CancelRequest(BaseModel):
    reason: Optional[str] = None


class ReassignDoctorRequest(BaseModel):
    doctor_id: str
    reason: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: str
    appointment_number: Optional[str] = None
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
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None

    # Reschedule tracking
    previous_date: Optional[date] = None
    previous_time: Optional[time] = None
    rescheduled_by_name: Optional[str] = None
    rescheduled_at: Optional[datetime] = None
    reschedule_reason: Optional[str] = None

    # Cancel tracking
    cancelled_by_name: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None

    # Complete tracking
    completed_by_name: Optional[str] = None
    completed_at: Optional[datetime] = None

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
    duration_minutes: Optional[int] = None
    procedure_name: Optional[str] = None


class ProcedureDurationResponse(BaseModel):
    procedures: dict[str, int]
    defaults: dict[str, int]
