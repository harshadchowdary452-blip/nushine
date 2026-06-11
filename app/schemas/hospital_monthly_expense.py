from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class HospitalMonthlyExpenseCreate(BaseModel):
    hospital_id: Optional[str] = None
    expense_month: int = Field(..., ge=1, le=12)
    expense_year: int = Field(...)
    expense_category: str = Field(..., min_length=1, max_length=255)
    expense_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    amount: float = Field(..., gt=0)


class HospitalMonthlyExpenseUpdate(BaseModel):
    expense_month: Optional[int] = Field(None, ge=1, le=12)
    expense_year: Optional[int] = None
    expense_category: Optional[str] = Field(None, min_length=1, max_length=255)
    expense_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)


class HospitalMonthlyExpenseResponse(BaseModel):
    id: str
    hospital_id: str
    expense_month: int
    expense_year: int
    expense_category: str
    expense_name: str
    description: Optional[str]
    amount: float
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
