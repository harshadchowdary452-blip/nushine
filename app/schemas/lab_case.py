from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class LabCaseCreate(BaseModel):
    treatment_plan_id: Optional[str] = None
    laboratory_id: Optional[str] = None
    lab_status: Optional[str] = Field("PENDING", max_length=30)
    order_number: Optional[str] = Field(None, max_length=100)
    tooth_number: Optional[str] = Field(None, max_length=255)
    material: Optional[str] = Field(None, max_length=255)
    sent_date: Optional[date] = None
    due_date: Optional[date] = None
    returned_date: Optional[date] = None
    lab_cost: Optional[float] = None
    remarks: Optional[str] = None


class LabCaseUpdate(BaseModel):
    laboratory_id: Optional[str] = None
    lab_status: Optional[str] = Field(None, max_length=30)
    order_number: Optional[str] = Field(None, max_length=100)
    tooth_number: Optional[str] = Field(None, max_length=255)
    material: Optional[str] = Field(None, max_length=255)
    sent_date: Optional[date] = None
    due_date: Optional[date] = None
    returned_date: Optional[date] = None
    lab_cost: Optional[float] = None
    remarks: Optional[str] = None


class LabCaseStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=30)
    note: Optional[str] = None


class LabCaseEventCreate(BaseModel):
    event_type: str = Field(..., max_length=30)
    note: Optional[str] = None


class LabCaseEventResponse(BaseModel):
    id: str
    lab_case_id: str
    event_type: str
    from_status: Optional[str]
    to_status: Optional[str]
    note: Optional[str]
    actor_id: Optional[str]
    actor_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WhatsAppSendBody(BaseModel):
    message: str = Field(..., min_length=1)
    phone: Optional[str] = Field(None, max_length=50)


class CallLogBody(BaseModel):
    note: Optional[str] = None
    duration_seconds: Optional[int] = None


class MonthlyReportResponse(BaseModel):
    month: str
    total_cases: int
    total_cost: float
    status_breakdown: dict
    lab_breakdown: list
    rows: list

    model_config = {"from_attributes": True}
