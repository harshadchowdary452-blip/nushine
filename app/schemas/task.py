from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "medium"
    status: Optional[str] = "todo"
    assignee_id: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assignee_id: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None


class TaskStatusUpdate(BaseModel):
    status: str


class TaskAssigneeUpdate(BaseModel):
    assignee_id: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: str
    status: str
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    created_by: str
    created_by_name: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    is_overdue: bool = False

    model_config = {"from_attributes": True}


class TaskStats(BaseModel):
    total: int
    open: int
    in_progress: int
    completed: int
    overdue: int
    due_today: int
    upcoming: int
    by_priority: dict[str, int]
