from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class MonthlyOrderItemCreate(BaseModel):
    item_id: str = Field(..., min_length=1)
    required_quantity: float = Field(..., ge=0)
    remarks: Optional[str] = None


class MonthlyOrderSubmitItem(BaseModel):
    item_id: str = Field(..., min_length=1)
    required_quantity: float = Field(..., ge=0)
    estimated_cost: Optional[float] = Field(None, ge=0, description="Total estimated cost for the line, entered by the hospital admin")
    remarks: Optional[str] = None


class MonthlyOrderSubmit(BaseModel):
    hospital_id: Optional[str] = None
    order_period: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="Month period as YYYY-MM")
    items: List[MonthlyOrderSubmitItem] = []
    notes: Optional[str] = None


class MonthlyOrderCreate(BaseModel):
    hospital_id: Optional[str] = None
    order_period: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="Month period as YYYY-MM")
    items: List[MonthlyOrderItemCreate] = []
    notes: Optional[str] = None


class MonthlyOrderUpdate(BaseModel):
    items: Optional[List[MonthlyOrderItemCreate]] = None
    notes: Optional[str] = None


class MonthlyOrderTransition(BaseModel):
    to_status: str = Field(..., max_length=20)


class MonthlyOrderItemResponse(BaseModel):
    id: str
    order_id: str
    item_id: str
    item_name: Optional[str]
    item_code: Optional[str]
    unit: Optional[str]
    current_stock: float
    minimum_stock: float
    avg_monthly_usage: float
    remaining_days: Optional[float]
    suggested_quantity: float
    required_quantity: float
    unit_cost: float
    estimated_cost: float
    preferred_supplier_name: Optional[str]
    remarks: Optional[str]

    model_config = {"from_attributes": True}


class MonthlyOrderResponse(BaseModel):
    id: str
    hospital_id: str
    hospital_name: Optional[str] = None
    admin_group_id: Optional[str] = None
    order_period: str
    status: str
    submitted_date: Optional[datetime]
    reviewed_date: Optional[datetime]
    approved_date: Optional[datetime]
    ordered_date: Optional[datetime]
    completed_date: Optional[datetime]
    estimated_cost_total: float
    notes: Optional[str]
    items: List[MonthlyOrderItemResponse] = []
    submitted_by: Optional[str] = None
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MonthlyOrderSuggestionItem(BaseModel):
    item_id: str
    item_name: str
    item_code: Optional[str] = None
    category_name: Optional[str] = None
    unit: Optional[str] = None
    current_stock: float
    minimum_stock: float
    avg_monthly_usage: float
    usage_source: Optional[str] = None
    status: Optional[str] = None
    remaining_days: Optional[float] = None
    suggested_quantity: float
    preferred_supplier_name: Optional[str] = None
    preferred_supplier_id: Optional[str] = None
    unit_cost: float
    estimated_cost: float


class MonthlyOrderSuggestions(BaseModel):
    hospital_id: str
    hospital_name: Optional[str] = None
    order_period: str
    items: List[MonthlyOrderSuggestionItem]
    estimated_cost_total: float
