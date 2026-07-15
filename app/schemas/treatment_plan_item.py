from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TreatmentPlanItemCreate(BaseModel):
    case_id: Optional[str] = None
    procedure_name: str = Field(..., min_length=1, max_length=255)
    tooth_numbers: Optional[List[str]] = None
    estimated_visits: int = Field(default=1, ge=1)
    estimated_cost: float = Field(default=0.0, ge=0)
    remarks: Optional[str] = None
    sequence_order: int = Field(default=0, ge=0)
    dependency_item_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    assistant_doctor_id: Optional[str] = None


class TreatmentPlanItemUpdate(BaseModel):
    procedure_name: Optional[str] = None
    tooth_numbers: Optional[List[str]] = None
    estimated_visits: Optional[int] = None
    estimated_cost: Optional[float] = None
    remarks: Optional[str] = None
    sequence_order: Optional[int] = None
    dependency_item_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    assistant_doctor_id: Optional[str] = None


class TreatmentPlanItemResponse(BaseModel):
    id: str
    case_id: str
    version: int
    is_current: bool
    procedure_name: str
    tooth_numbers: Optional[List[str]] = None
    estimated_visits: int
    estimated_cost: float
    remarks: Optional[str] = None
    sequence_order: int
    dependency_item_id: Optional[str] = None
    generated_treatment_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    assistant_doctor_id: Optional[str] = None
    created_by_id: Optional[str] = None
    assigned_doctor_name: Optional[str] = None
    assistant_doctor_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TreatmentPlanItemBulkCreate(BaseModel):
    case_id: str
    items: List[TreatmentPlanItemCreate]


class TreatmentPlanItemBulkUpdate(BaseModel):
    items: List[TreatmentPlanItemUpdate]


class TreatmentPlanItemAssignDoctor(BaseModel):
    item_id: str
    assigned_doctor_id: Optional[str] = None
    assistant_doctor_id: Optional[str] = None


class TreatmentPlanItemBulkAssignDoctor(BaseModel):
    assignments: List[TreatmentPlanItemAssignDoctor]
