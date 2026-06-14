from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class BillingCreate(BaseModel):
    case_id: str
    total_amount: float = Field(default=0.0, ge=0)
    paid_amount: float = Field(default=0.0, ge=0)
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    discount_type: str = Field(default="PERCENTAGE", pattern="^(PERCENTAGE|FIXED)$")
    discount_percent: float = Field(default=0.0, ge=0, le=100)
    discount_amount: float = Field(default=0.0, ge=0)
    discount_reason: Optional[str] = None


class BillingUpdate(BaseModel):
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class BillingDiscountUpdate(BaseModel):
    discount_type: str = Field(default="PERCENTAGE", pattern="^(PERCENTAGE|FIXED)$")
    discount_percent: float = Field(default=0.0, ge=0, le=100)
    discount_amount: float = Field(default=0.0, ge=0)
    discount_reason: Optional[str] = None


class BillingResponse(BaseModel):
    id: str
    case_id: str
    patient_name: Optional[str] = None
    case_chief_complaint: Optional[str] = None
    original_amount: float
    total_amount: float
    paid_amount: float
    pending_amount: float
    discount_type: str
    discount_percent: float
    discount_amount: float
    discount_reason: Optional[str]
    payment_status: str
    payment_method: Optional[str]
    paid_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
