import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.demo_request import DemoRequest, DemoRequestStatus
from app.dependencies import get_current_user

logger = logging.getLogger("app")

router = APIRouter(prefix="/public", tags=["Public"])
admin_router = APIRouter(prefix="/demo-requests", tags=["Demo Requests"])


# ── Public schemas ──

class DemoRequestCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    organization: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    role: str | None = Field(None, max_length=100)
    num_hospitals: str | None = Field(None, max_length=50)
    num_doctors: str | None = Field(None, max_length=50)
    message: str | None = None
    preferred_date: str | None = Field(None, max_length=50)
    preferred_time: str | None = Field(None, max_length=50)


class DemoRequestResponse(BaseModel):
    id: str
    message: str


# ── Admin schemas ──

class DemoRequestAdminResponse(BaseModel):
    id: str
    full_name: str
    organization: str
    email: str
    phone: str | None
    role: str | None
    num_hospitals: str | None
    num_doctors: str | None
    message: str | None
    preferred_date: str | None
    preferred_time: str | None
    status: str
    notes: str | None
    assigned_to: str | None
    created_at: str
    updated_at: str


class DemoRequestUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    assigned_to: str | None = None


class DemoRequestListResponse(BaseModel):
    items: list[DemoRequestAdminResponse]
    total: int
    page: int
    page_size: int


# ── WhatsApp notification helper ──

async def _send_whatsapp_notification(demo: DemoRequest):
    """Send demo request to configured business WhatsApp number.
    Only sends if WhatsApp provider is configured (not mock)."""
    try:
        from app.config import settings
        if settings.WHATSAPP_PROVIDER == "mock":
            logger.info("WhatsApp not configured — skipping demo notification")
            return

        from twilio.rest import Client as TwilioClient
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_WHATSAPP_NUMBER:
            logger.info("WhatsApp credentials not configured — skipping demo notification")
            return

        client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        message_body = (
            f"New Appointin Demo Request\n\n"
            f"Name: {demo.full_name}\n"
            f"Organization: {demo.organization}\n"
            f"Role: {demo.role or 'Not specified'}\n"
            f"Phone: {demo.phone or 'Not provided'}\n"
            f"Email: {demo.email}\n"
            f"Hospitals: {demo.num_hospitals or 'Not specified'}\n"
            f"Doctors: {demo.num_doctors or 'Not specified'}\n"
            f"Preferred Date: {demo.preferred_date or 'Not specified'}\n"
            f"Preferred Time: {demo.preferred_time or 'Not specified'}\n\n"
            f"Requirements:\n{demo.message or 'None'}"
        )

        # Send to the configured business WhatsApp number
        # The recipient should be set in environment/config
        business_number = getattr(settings, "BUSINESS_WHATSAPP_NUMBER", None)
        if not business_number:
            logger.info("BUSINESS_WHATSAPP_NUMBER not configured — skipping demo notification")
            return

        client.messages.create(
            from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
            body=message_body,
            to=f"whatsapp:{business_number}",
        )
        logger.info(f"WhatsApp demo notification sent for {demo.email}")
    except Exception as e:
        logger.warning(f"Failed to send WhatsApp demo notification: {e}")


# ── Public endpoint (no auth) ──

@router.post("/demo-requests", response_model=DemoRequestResponse, status_code=201)
async def create_demo_request(request: Request, payload: DemoRequestCreate, db: AsyncSession = Depends(get_db)):
    demo = DemoRequest(
        full_name=payload.full_name.strip(),
        organization=payload.organization.strip(),
        email=payload.email.strip().lower(),
        phone=payload.phone.strip() if payload.phone else None,
        role=payload.role.strip() if payload.role else None,
        num_hospitals=payload.num_hospitals.strip() if payload.num_hospitals else None,
        num_doctors=payload.num_doctors.strip() if payload.num_doctors else None,
        message=payload.message.strip() if payload.message else None,
        preferred_date=payload.preferred_date.strip() if payload.preferred_date else None,
        preferred_time=payload.preferred_time.strip() if payload.preferred_time else None,
    )
    db.add(demo)
    await db.flush()

    logger.info(f"New demo request from {payload.email} ({payload.organization})")

    # Send WhatsApp notification (fire-and-forget, non-blocking)
    import asyncio
    asyncio.create_task(_send_whatsapp_notification(demo))

    return DemoRequestResponse(id=demo.id, message="Demo request submitted successfully. We will contact you shortly.")


# ── Admin endpoints (Super Admin only) ──

def _to_admin_response(demo: DemoRequest) -> DemoRequestAdminResponse:
    return DemoRequestAdminResponse(
        id=str(demo.id),
        full_name=demo.full_name,
        organization=demo.organization,
        email=demo.email,
        phone=demo.phone,
        role=demo.role,
        num_hospitals=demo.num_hospitals,
        num_doctors=demo.num_doctors,
        message=demo.message,
        preferred_date=demo.preferred_date,
        preferred_time=demo.preferred_time,
        status=demo.status,
        notes=demo.notes,
        assigned_to=demo.assigned_to,
        created_at=demo.created_at.isoformat() if demo.created_at else "",
        updated_at=demo.updated_at.isoformat() if demo.updated_at else "",
    )


@admin_router.get("", response_model=DemoRequestListResponse)
async def list_demo_requests(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only Super Admin can access demo requests")

    query = select(DemoRequest)
    count_query = select(func.count(DemoRequest.id))

    if status:
        query = query.where(DemoRequest.status == status)
        count_query = count_query.where(DemoRequest.status == status)

    if search:
        search_term = f"%{search.lower()}%"
        query = query.where(
            (DemoRequest.full_name.ilike(search_term))
            | (DemoRequest.organization.ilike(search_term))
            | (DemoRequest.email.ilike(search_term))
        )
        count_query = count_query.where(
            (DemoRequest.full_name.ilike(search_term))
            | (DemoRequest.organization.ilike(search_term))
            | (DemoRequest.email.ilike(search_term))
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(DemoRequest.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return DemoRequestListResponse(
        items=[_to_admin_response(d) for d in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@admin_router.get("/{demo_id}", response_model=DemoRequestAdminResponse)
async def get_demo_request(
    demo_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only Super Admin can access demo requests")

    result = await db.execute(select(DemoRequest).where(DemoRequest.id == demo_id))
    demo = result.scalar_one_or_none()
    if not demo:
        raise HTTPException(status_code=404, detail="Demo request not found")

    return _to_admin_response(demo)


@admin_router.patch("/{demo_id}", response_model=DemoRequestAdminResponse)
async def update_demo_request(
    demo_id: str,
    payload: DemoRequestUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Only Super Admin can update demo requests")

    result = await db.execute(select(DemoRequest).where(DemoRequest.id == demo_id))
    demo = result.scalar_one_or_none()
    if not demo:
        raise HTTPException(status_code=404, detail="Demo request not found")

    if payload.status is not None:
        if payload.status not in DemoRequestStatus.ALL:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(DemoRequestStatus.ALL)}")
        demo.status = payload.status

    if payload.notes is not None:
        demo.notes = payload.notes

    if payload.assigned_to is not None:
        demo.assigned_to = payload.assigned_to

    await db.flush()
    logger.info(f"Demo request {demo_id} updated by {current_user.get('email')}")

    return _to_admin_response(demo)
