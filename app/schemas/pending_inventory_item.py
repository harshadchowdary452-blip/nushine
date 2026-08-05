from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class PendingInventoryItemCreate(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=255)
    required_quantity: Optional[float] = Field(None, ge=0)
    estimated_cost: Optional[float] = Field(0, ge=0)
    remarks: Optional[str] = None
    order_period: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}$")


class PendingInventoryItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, min_length=1, max_length=255)
    required_quantity: Optional[float] = Field(None, ge=0)
    estimated_cost: Optional[float] = Field(None, ge=0)
    remarks: Optional[str] = None


class PendingInventoryItemReview(BaseModel):
    action: str = Field(..., pattern="^(APPROVE|REJECT|CONVERT|MERGE)$")
    category_id: Optional[str] = None
    unit: Optional[str] = Field(None, max_length=50)
    merge_item_id: Optional[str] = None
    rollout: Optional[str] = Field("ALL", pattern="^(ALL|NEW_ONLY)$")
    review_notes: Optional[str] = None


class DuplicateCandidate(BaseModel):
    id: str
    name: str
    code: Optional[str] = None
    category_name: Optional[str] = None
    sub_category_name: Optional[str] = None
    unit: Optional[str] = None
    match_type: str
    similarity: float


class DuplicateCheckResponse(BaseModel):
    item_name: str
    candidates: List[DuplicateCandidate] = []


class PendingInventoryItemResponse(BaseModel):
    id: str
    hospital_id: str
    hospital_name: Optional[str] = None
    item_name: str
    unit: str
    required_quantity: Optional[float] = None
    estimated_cost: float
    remarks: Optional[str]
    order_period: Optional[str] = None
    status: str
    rollout: str = "ALL"
    category_id: Optional[str]
    category_name: Optional[str] = None
    converted_item_id: Optional[str]
    review_notes: Optional[str]
    created_by: Optional[str]
    requested_by_name: Optional[str] = None
    reviewed_by: Optional[str]
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
