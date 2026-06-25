from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from enum import Enum


class TreatmentPlanCreate(BaseModel):
    case_id: str
    treatment_name: str = Field(..., min_length=1, max_length=255)
    treatment_type_id: Optional[str] = None
    description: Optional[str] = None
    cost: float = Field(default=0.0, ge=0)
    paid_amount: Optional[float] = Field(default=0.0, ge=0)
    total_sittings: int = Field(default=1, ge=1)
    duration_minutes: Optional[int] = None
    start_date: Optional[date] = None
    expected_completion_date: Optional[date] = None
    next_appointment_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class TreatmentPlanUpdate(BaseModel):
    treatment_name: Optional[str] = None
    treatment_type_id: Optional[str] = None
    description: Optional[str] = None
    cost: Optional[float] = None
    paid_amount: Optional[float] = None
    total_sittings: Optional[int] = None
    duration_minutes: Optional[int] = None
    start_date: Optional[date] = None
    expected_completion_date: Optional[date] = None
    next_appointment_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class TreatmentPlanResponse(BaseModel):
    id: str
    treatment_number: Optional[str] = None
    case_id: str
    treatment_name: str
    treatment_type_id: Optional[str] = None
    treatment_type_name: Optional[str] = None
    description: Optional[str]
    cost: float
    paid_amount: float = 0.0
    pending_amount: float = 0.0
    duration_minutes: Optional[int]
    start_date: Optional[date] = None
    expected_completion_date: Optional[date] = None
    next_appointment_date: Optional[date] = None
    status: str
    notes: Optional[str]
    is_active: bool
    total_sittings: int = 0
    completed_sittings: int = 0
    remaining_sittings: int = 0
    progress: float = 0.0
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    doctor_name: Optional[str] = None
    case_number: Optional[str] = None
    case_status: Optional[str] = None
    hospital_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
