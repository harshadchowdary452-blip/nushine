from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class InventoryCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: Optional[int] = Field(0, ge=0)


class InventoryCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class InventoryCategoryResponse(BaseModel):
    id: str
    name: str
    code: Optional[str]
    description: Optional[str]
    parent_id: Optional[str]
    is_active: bool
    sort_order: int
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InventoryCategoryTreeNode(BaseModel):
    id: str
    name: str
    code: Optional[str]
    description: Optional[str]
    parent_id: Optional[str]
    is_active: bool
    sort_order: int
    children: List["InventoryCategoryTreeNode"] = []

    model_config = {"from_attributes": True}
