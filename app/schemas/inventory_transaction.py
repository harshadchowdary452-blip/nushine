from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date


class InventoryTransactionCreate(BaseModel):
    hospital_id: str = Field(..., min_length=1)
    item_id: str = Field(..., min_length=1)
    transaction_type: str = Field(..., max_length=30)
    previous_balance: Optional[float] = Field(0)
    quantity: float = Field(..., ge=0)
    current_balance: Optional[float] = Field(None)
    batch_number: Optional[str] = Field(None, max_length=100)
    expiry_date: Optional[date] = None
    reference_type: Optional[str] = Field(None, max_length=50)
    reference_id: Optional[str] = Field(None, max_length=36)
    reason: Optional[str] = Field(None, max_length=255)
    remarks: Optional[str] = None
    transaction_date: Optional[datetime] = None


class InventoryTransactionUpdate(BaseModel):
    transaction_type: Optional[str] = Field(None, max_length=30)
    previous_balance: Optional[float] = None
    quantity: Optional[float] = Field(None, ge=0)
    current_balance: Optional[float] = None
    batch_number: Optional[str] = Field(None, max_length=100)
    expiry_date: Optional[date] = None
    reference_type: Optional[str] = Field(None, max_length=50)
    reference_id: Optional[str] = Field(None, max_length=36)
    reason: Optional[str] = Field(None, max_length=255)
    remarks: Optional[str] = None
    transaction_date: Optional[datetime] = None


class InventoryTransactionResponse(BaseModel):
    id: str
    hospital_id: str
    hospital_name: Optional[str] = None
    item_id: str
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    transaction_type: str
    previous_balance: float
    quantity: float
    current_balance: float
    batch_number: Optional[str]
    expiry_date: Optional[date]
    reference_type: Optional[str]
    reference_id: Optional[str]
    reason: Optional[str]
    remarks: Optional[str]
    transaction_date: datetime
    created_by: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
