from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class HospitalInventoryCreate(BaseModel):
    hospital_id: str = Field(..., min_length=1)
    item_id: str = Field(..., min_length=1)
    unit: Optional[str] = Field(None, max_length=50)
    quantity: Optional[float] = Field(0, ge=0)
    minimum_stock: Optional[float] = Field(None, ge=0)
    reorder_level: Optional[float] = Field(None, ge=0)
    critical_level: Optional[float] = Field(None, ge=0)
    maximum_stock: Optional[float] = Field(None, ge=0)
    location: Optional[str] = Field(None, max_length=255)


class HospitalInventoryUpdate(BaseModel):
    unit: Optional[str] = Field(None, max_length=50)
    quantity: Optional[float] = Field(None, ge=0)
    minimum_stock: Optional[float] = Field(None, ge=0)
    reorder_level: Optional[float] = Field(None, ge=0)
    critical_level: Optional[float] = Field(None, ge=0)
    maximum_stock: Optional[float] = Field(None, ge=0)
    location: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class HospitalInventoryResponse(BaseModel):
    id: str
    hospital_id: str
    hospital_name: Optional[str] = None
    item_id: str
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    category_name: Optional[str] = None
    sub_category_name: Optional[str] = None
    unit: Optional[str]
    quantity: float
    minimum_stock: Optional[float]
    reorder_level: Optional[float]
    critical_level: Optional[float]
    maximum_stock: Optional[float]
    location: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
