from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.schemas.communication_center import CommunicationFilters, ExportRequest, ResendRequest
from app.schemas.common import MessageResponse
from app.services.communication_center_service import (
    CommunicationCenterService,
    ALL_SOURCES,
    ALL_CHANNELS,
    ALL_STATUSES,
)

router = APIRouter(prefix="/communication-center", tags=["Communication Center"])


def _service(db: AsyncSession) -> CommunicationCenterService:
    return CommunicationCenterService(db)


def _validate_filter(value: Optional[str], allowed, name: str):
    if value and value not in allowed:
        raise HTTPException(status_code=400, detail=f"{name} must be one of: {', '.join(allowed)}")


def _params(
    search: Optional[str] = Query(None),
    hospital_id: Optional[str] = Query(None),
    source_module: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    communication_type: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
) -> dict:
    return {
        "search": search, "hospital_id": hospital_id,
        "source_module": source_module, "channel": channel, "status": status,
        "communication_type": communication_type, "doctor_id": doctor_id,
        "date_from": date_from, "date_to": date_to,
        "page": page, "page_size": page_size, "sort_by": sort_by, "sort_dir": sort_dir,
    }


@router.get("/communications")
async def list_communications(
    params: dict = Depends(_params),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    _validate_filter(params["source_module"], ALL_SOURCES, "source_module")
    _validate_filter(params["channel"], ALL_CHANNELS, "channel")
    _validate_filter(params["status"], ALL_STATUSES, "status")
    return await _service(db).list_communications(current_user, params)


@router.get("/communications/stats")
async def communication_stats(
    params: dict = Depends(_params),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    return await _service(db).stats(current_user, params)


@router.get("/communications/{source_module}/{source_id}")
async def get_communication(
    source_module: str,
    source_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    return await _service(db).get_communication(current_user, source_module, source_id)


@router.get("/communications/{source_module}/{source_id}/preview")
async def preview_communication(
    source_module: str,
    source_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    return await _service(db).preview(current_user, source_module, source_id)


@router.post("/communications/{source_module}/{source_id}/resend")
async def resend_communication(
    source_module: str,
    source_id: str,
    data: ResendRequest = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_COMMUNICATIONS)
    return await _service(db).resend(
        current_user, source_module, source_id,
        message_override=data.message if data else None,
    )


@router.get("/communications/{source_module}/{source_id}/download")
async def download_communication(
    source_module: str,
    source_id: str,
    print: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    return await _service(db).download(
        current_user, source_module, source_id,
        action="PRINT" if print else "DOWNLOAD",
    )


@router.get("/patients/{patient_id}/communications")
async def patient_communications(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    return await _service(db).patient_timeline(current_user, patient_id)


@router.post("/export")
async def export_communications(
    data: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.EXPORT_COMMUNICATIONS)
    _validate_filter(data.source_module, ALL_SOURCES, "source_module")
    _validate_filter(data.channel, ALL_CHANNELS, "channel")
    _validate_filter(data.status, ALL_STATUSES, "status")
    params = data.model_dump(exclude_none=True)
    return await _service(db).export_communications(current_user, params, data.format)


@router.get("/activities")
async def list_activities(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    source_module: Optional[str] = Query(None),
    communication_id: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    params = {
        "page": page, "page_size": page_size, "hospital_id": hospital_id,
        "action": action, "source_module": source_module,
        "communication_id": communication_id,
        "date_from": date_from, "date_to": date_to,
    }
    return await _service(db).list_activities(current_user, params)


@router.get("/meta")
async def meta(current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_COMMUNICATIONS)
    return {
        "sources": ALL_SOURCES,
        "channels": ALL_CHANNELS,
        "statuses": ALL_STATUSES,
    }
