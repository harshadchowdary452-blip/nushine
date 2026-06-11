from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ConsultantNoteCreate(BaseModel):
    case_id: str
    consultant_id: str
    notes: str = Field(..., min_length=1)


class ConsultantNoteUpdate(BaseModel):
    notes: Optional[str] = None


class ConsultantNoteResponse(BaseModel):
    id: str
    case_id: str
    consultant_id: str
    notes: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
