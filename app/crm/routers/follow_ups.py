"""Follow-up router — thin controller, delegates to FollowUpService."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.crm.services.follow_up_service import FollowUpService
from app.crm.utils import verify_hospital_access, get_hospital_filter
from app.crm.schemas import success_response, error_response, paginated_response

router = APIRouter(prefix="/follow-ups", tags=["CRM Follow-ups V2"])


class FollowUpCreateRequest(BaseModel):
    patient_id: str
    doctor_id: Optional[str] = None
    case_id: Optional[str] = None
    follow_up_date: str
    follow_up_time: Optional[str] = None
    follow_up_type: Optional[str] = "CUSTOM_FOLLOW_UP"
    notes: Optional[str] = None


class FollowUpUpdateRequest(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    patient_feedback: Optional[str] = None
    staff_notes: Optional[str] = None
    response_summary: Optional[str] = None
    next_action: Optional[str] = None
    contact_channel: Optional[str] = None
    follow_up_date: Optional[str] = None
    follow_up_time: Optional[str] = None


class FeedbackRequest(BaseModel):
    response_status: str
    patient_feedback: Optional[str] = None
    staff_notes: Optional[str] = None
    response_summary: Optional[str] = None
    next_action: Optional[str] = None
    contact_channel: Optional[str] = None


class RescheduleRequest(BaseModel):
    follow_up_date: str
    follow_up_time: Optional[str] = None


@router.get("")
async def list_follow_ups(
    patient_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    follow_up_type: Optional[str] = None,
    doctor_id: Optional[str] = None,
    filter_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    svc = FollowUpService(db)
    result = await svc.list_follow_ups(
        hospital_id=hospital_id, patient_id=patient_id,
        status=status_filter, follow_up_type=follow_up_type,
        doctor_id=doctor_id, filter_type=filter_type,
        skip=skip, limit=limit,
    )
    return paginated_response(result["items"], result["total"], result["page"], result["pages"])


@router.get("/dashboard")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    svc = FollowUpService(db)
    stats = await svc.get_dashboard_stats(hospital_id)
    return success_response(stats)


@router.get("/{follow_up_id}")
async def get_follow_up(
    follow_up_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    fu = await svc.get_follow_up(follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return success_response(fu)


@router.post("")
async def create_follow_up(
    req: FollowUpCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = get_hospital_filter(current_user)
    svc = FollowUpService(db)
    data = req.model_dump()
    data["hospital_id"] = hospital_id
    fu = await svc.create_follow_up(data)
    return success_response(fu, "Follow-up created successfully")


@router.put("/{follow_up_id}")
async def update_follow_up(
    follow_up_id: str,
    req: FollowUpUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    fu = await svc.update_follow_up(follow_up_id, req.model_dump(exclude_unset=True))
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return success_response(fu, "Follow-up updated successfully")


@router.delete("/{follow_up_id}")
async def delete_follow_up(
    follow_up_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    deleted = await svc.delete_follow_up(follow_up_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return success_response(None, "Follow-up deleted successfully")


@router.post("/{follow_up_id}/feedback")
async def record_feedback(
    follow_up_id: str,
    req: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    fu = await svc.record_feedback(follow_up_id, req.model_dump(exclude_unset=True))
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return success_response(fu, "Feedback recorded successfully")


@router.post("/{follow_up_id}/reschedule")
async def reschedule_follow_up(
    follow_up_id: str,
    req: RescheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    fu = await svc.reschedule(follow_up_id, req.follow_up_date, req.follow_up_time)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return success_response(fu, "Follow-up rescheduled successfully")


@router.post("/{follow_up_id}/mark-completed")
async def mark_completed(
    follow_up_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    fu = await svc.mark_completed(follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return success_response(fu, "Follow-up completed")


@router.post("/{follow_up_id}/escalate")
async def escalate_follow_up(
    follow_up_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    fu = await svc.escalate(follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return success_response(fu, "Follow-up escalated")


@router.get("/patient/{patient_id}/timeline")
async def get_patient_timeline(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    svc = FollowUpService(db)
    timeline = await svc.get_patient_timeline(patient_id)
    return success_response(timeline)
