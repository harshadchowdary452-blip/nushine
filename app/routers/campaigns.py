from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from typing import Optional
from datetime import date, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.schemas.campaign import (
    CampaignCreate, CampaignUpdate, CampaignResponse, CampaignLaunchResponse,
    CampaignProgressResponse, CampaignAnalytics, CampaignRecipientResponse,
    CampaignResponseDetail, AudiencePreviewResponse, CampaignROI,
    CampaignDashboardWidgets, CampaignTimelineEntry, CampaignAnalyticsDetail,
)
from app.services.campaign_service import CampaignService
from app.models.campaign import Campaign, CampaignRecipient
from app.models.patient import Patient

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


def _verify_hospital_access(entity, current_user):
    """Raise 403 if the entity's hospital_id doesn't match the user's hospital_id."""
    role = current_user.get("role")
    if role in ("HOSPITAL_ADMIN", "DOCTOR"):
        entity_hid = getattr(entity, "hospital_id", None)
        user_hid = current_user.get("hospital_id")
        if entity_hid and user_hid and str(entity_hid) != str(user_hid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: entity belongs to another hospital")


@router.post("/", status_code=201)
async def create_campaign(
    data: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id") or data.hospital_id
    if not hospital_id:
        raise HTTPException(status_code=400, detail="Hospital ID required")
    svc = CampaignService(db)
    campaign = await svc.create(data.model_dump(exclude={"hospital_id"}), hospital_id=hospital_id, created_by=current_user.get("sub"))
    await db.commit()
    return {"id": campaign.id, "name": campaign.name}


@router.get("/")
async def list_campaigns(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    svc = CampaignService(db)
    campaigns = await svc.get_all(hospital_id=hospital_id, skip=skip, limit=limit)
    return [{
        "id": c.id, "name": c.name, "campaign_type": c.campaign_type,
        "channel": c.channel, "target": c.target, "status": c.status,
        "patients_targeted": c.patients_targeted, "messages_sent": c.messages_sent,
        "messages_delivered": c.messages_delivered, "messages_read": c.messages_read,
        "responses_count": c.responses_count, "appointments_generated": c.appointments_generated,
        "revenue_generated": c.revenue_generated, "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat(),
    } for c in campaigns]


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    c = await svc.get(campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(c, current_user)
    return {
        "id": c.id, "name": c.name, "campaign_type": c.campaign_type,
        "channel": c.channel, "target": c.target, "message": c.message,
        "status": c.status, "patients_targeted": c.patients_targeted,
        "messages_sent": c.messages_sent, "messages_delivered": c.messages_delivered,
        "messages_read": c.messages_read, "responses_count": c.responses_count,
        "appointments_generated": c.appointments_generated, "revenue_generated": c.revenue_generated,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "is_active": c.is_active,
        "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat(),
    }


@router.put("/{campaign_id}")
async def update_campaign(
    campaign_id: str, data: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    existing = await svc.get(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    c = await svc.update(campaign_id, data.model_dump(exclude_none=True))
    await db.commit()
    return {"success": True}


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    existing = await svc.get(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    await svc.delete(campaign_id)
    await db.commit()
    return {"success": True}


@router.post("/{campaign_id}/launch")
async def launch_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    existing = await svc.get(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    hospital_id = current_user.get("hospital_id") or existing.hospital_id
    if not hospital_id:
        raise HTTPException(status_code=400, detail="Hospital ID required")
    result = await svc.launch(campaign_id, hospital_id)
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.CAMPAIGN_COMPLETED,
            source_module=EventSource.CAMPAIGN,
            entity_type="CAMPAIGN",
            entity_id=campaign_id,
            hospital_id=hospital_id,
            db=db,
        )
    except Exception:
        pass
    await db.commit()
    return result


@router.get("/{campaign_id}/recipients")
async def get_campaign_recipients(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    existing = await db.get(Campaign, campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    q = select(CampaignRecipient, Patient.full_name).join(
        Patient, CampaignRecipient.patient_id == Patient.id
    ).where(CampaignRecipient.campaign_id == campaign_id).order_by(desc(CampaignRecipient.created_at))
    result = await db.execute(q)
    rows = result.all()
    return [{
        "id": str(r[0].id), "campaign_id": str(r[0].campaign_id),
        "patient_id": str(r[0].patient_id), "patient_name": r[1],
        "status": r[0].status, "response_message": r[0].response_message,
        "responded_at": r[0].responded_at.isoformat() if r[0].responded_at else None,
        "created_at": r[0].created_at.isoformat(),
    } for r in rows]


@router.post("/preview-audience")
async def preview_audience(
    body: _AudiencePreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    result = await svc.preview_audience(
        target=body.target,
        hospital_id=body.hospital_id or current_user.get("hospital_id"),
        filters=body.filters,
    )
    return result


@router.post("/{campaign_id}/duplicate")
async def duplicate_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    existing = await svc.get(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    result = await svc.duplicate(campaign_id)
    await db.commit()
    return result


@router.post("/{campaign_id}/archive")
async def archive_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    existing = await svc.get(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    result = await svc.archive(campaign_id)
    await db.commit()
    return result


@router.post("/{campaign_id}/resend")
async def resend_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    existing = await svc.get(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    result = await svc.resend(campaign_id, current_user.get("hospital_id"))
    await db.commit()
    return result


@router.get("/{campaign_id}/progress")
async def get_campaign_progress(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    svc = CampaignService(db)
    existing = await svc.get(campaign_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _verify_hospital_access(existing, current_user)
    return await svc.get_progress(campaign_id)


@router.post("/webhook/inbound")
async def inbound_webhook(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    svc = CampaignService(db)
    result = await svc.handle_inbound_webhook(payload)
    return result


# --- Inline request body models ---

class _AudiencePreviewRequest(BaseModel):
    target: str
    filters: Optional[dict] = None
    hospital_id: Optional[str] = None


# --- CRM Analytics Endpoints ---

@router.get("/analytics/overview")
async def crm_analytics_overview(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    svc = CampaignService(db)
    return await svc.get_analytics(hospital_id=hospital_id)


@router.get("/analytics/retention")
async def retention_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_ALL_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    svc = CampaignService(db)
    return await svc.get_retention_analytics(hospital_id=hospital_id)


@router.get("/analytics/follow-up-suggestions")
async def follow_up_suggestions(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    svc = CampaignService(db)
    return await svc.get_follow_up_suggestions(hospital_id=hospital_id)


@router.get("/analytics/follow-up-calendar")
async def follow_up_calendar(
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    hospital_id = current_user.get("hospital_id")
    svc = CampaignService(db)
    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)
    return await svc.get_follow_up_calendar(hospital_id=hospital_id, start_date=start_date, end_date=end_date)


@router.get("/analytics/patient-interactions/{patient_id}")
async def patient_interactions(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    from app.models.patient import Patient
    pat = await db.get(Patient, patient_id)
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    _verify_hospital_access(pat, current_user)
    svc = CampaignService(db)
    return await svc.get_patient_interactions(patient_id=patient_id)
