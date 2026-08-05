from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class InventoryMasterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=50)
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    brand: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=255)
    preferred_vendor_id: Optional[str] = None
    unit: Optional[str] = Field("PCS", max_length=50)
    purchase_price: Optional[float] = Field(0, ge=0)
    average_cost: Optional[float] = Field(0, ge=0)
    initial_estimated_monthly_usage: Optional[float] = Field(0, ge=0)
    minimum_stock: Optional[float] = Field(0, ge=0)
    reorder_level: Optional[float] = Field(0, ge=0)
    critical_level: Optional[float] = Field(0, ge=0)
    maximum_stock: Optional[float] = Field(0, ge=0)
    batch_tracking: Optional[bool] = False
    expiry_tracking: Optional[bool] = False
    status: Optional[str] = Field("ACTIVE", max_length=20)
    description: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)


class InventoryMasterUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    brand: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=255)
    preferred_vendor_id: Optional[str] = None
    unit: Optional[str] = Field(None, max_length=50)
    purchase_price: Optional[float] = Field(None, ge=0)
    average_cost: Optional[float] = Field(None, ge=0)
    initial_estimated_monthly_usage: Optional[float] = Field(None, ge=0)
    minimum_stock: Optional[float] = Field(None, ge=0)
    reorder_level: Optional[float] = Field(None, ge=0)
    critical_level: Optional[float] = Field(None, ge=0)
    maximum_stock: Optional[float] = Field(None, ge=0)
    batch_tracking: Optional[bool] = None
    expiry_tracking: Optional[bool] = None
    status: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)


class InventoryMasterResponse(BaseModel):
    id: str
    name: str
    code: str
    category_id: Optional[str]
    sub_category_id: Optional[str]
    category_name: Optional[str] = None
    sub_category_name: Optional[str] = None
    preferred_vendor_name: Optional[str] = None
    brand: Optional[str]
    manufacturer: Optional[str]
    preferred_vendor_id: Optional[str]
    unit: str
    purchase_price: float
    average_cost: float
    initial_estimated_monthly_usage: float
    minimum_stock: float
    reorder_level: float
    critical_level: float
    maximum_stock: float
    batch_tracking: bool
    expiry_tracking: bool
    status: str
    description: Optional[str]
    image_url: Optional[str]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
