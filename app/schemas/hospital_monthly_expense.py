from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


class HospitalMonthlyExpenseCreate(BaseModel):
    hospital_id: Optional[str] = None
    expense_date: date = Field(...)
    expense_category: str = Field(..., min_length=1, max_length=255)
    expense_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    amount: float = Field(..., gt=0)
    payment_method: Optional[str] = Field(None, max_length=50)
    vendor: Optional[str] = Field(None, max_length=255)
    invoice_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class HospitalMonthlyExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    expense_category: Optional[str] = Field(None, min_length=1, max_length=255)
    expense_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    payment_method: Optional[str] = Field(None, max_length=50)
    vendor: Optional[str] = Field(None, max_length=255)
    invoice_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class HospitalMonthlyExpenseResponse(BaseModel):
    id: str
    hospital_id: str
    expense_date: date
    expense_month: int
    expense_year: int
    expense_category: str
    expense_name: str
    description: Optional[str]
    amount: float
    payment_method: Optional[str]
    vendor: Optional[str]
    invoice_number: Optional[str]
    notes: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExpenseFilterParams(BaseModel):
    filter: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class CategoryBreakdown(BaseModel):
    category: str
    amount: float


class ExpenseAnalytics(BaseModel):
    today_total: float
    this_week_total: float
    this_month_total: float
    year_to_date_total: float
    category_breakdown: List[CategoryBreakdown]
    total_expenses: float
