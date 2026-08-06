from typing import Optional
from datetime import date
from pydantic import BaseModel, Field


class CommunicationFilters(BaseModel):
    search: Optional[str] = None
    hospital_id: Optional[str] = None
    source_module: Optional[str] = None
    channel: Optional[str] = None
    status: Optional[str] = None
    communication_type: Optional[str] = None
    doctor_id: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class ResendRequest(BaseModel):
    message: Optional[str] = Field(None, max_length=4000)


class ExportRequest(CommunicationFilters):
    format: str = Field("csv", pattern="^(csv|excel|pdf|zip)$")
