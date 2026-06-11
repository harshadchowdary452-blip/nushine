from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_
from datetime import datetime, timezone, date
from app.database import get_db
from app.dependencies import get_current_user
from app.models.notification import Notification
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.user import User
from app.utils.template_engine import TemplateEngine

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
async def get_notifications(
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user.get("sub")
    query = select(Notification).where(Notification.user_id == uid)
    query = query.order_by(desc(Notification.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()
    count_q = select(func.count(Notification.id)).where(Notification.user_id == uid)
    total = (await db.execute(count_q)).scalar() or 0
    unread_q = select(func.count(Notification.id)).where(
        and_(Notification.user_id == uid, Notification.is_read == False)
    )
    unread = (await db.execute(unread_q)).scalar() or 0
    return {"total": total, "unread": unread, "items": [{
        "id": str(n.id), "type": n.type, "title": n.title,
        "description": n.description, "is_read": n.is_read,
        "entity_type": n.entity_type, "entity_id": n.entity_id,
        "created_at": n.created_at.isoformat(),
    } for n in items]}


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    n = await db.get(Notification, notification_id)
    if not n or n.user_id != current_user.get("sub"):
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}


@router.post("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user.get("sub")
    result = await db.execute(
        select(Notification).where(
            and_(Notification.user_id == uid, Notification.is_read == False)
        )
    )
    for n in result.scalars().all():
        n.is_read = True
        n.read_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = current_user.get("sub")
    q = select(func.count(Notification.id)).where(
        and_(Notification.user_id == uid, Notification.is_read == False)
    )
    count = (await db.execute(q)).scalar() or 0
    return {"unread": count}


@router.post("/generate")
async def generate_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate today's notifications for the current user."""
    uid = current_user.get("sub")
    user = await db.get(User, uid)
    if not user:
        return {"count": 0}

    today = date.today()
    created = 0

    apt_query = select(Appointment).where(
        Appointment.doctor_id == uid,
        func.date(Appointment.appointment_date) == today,
        Appointment.is_active == True,
    )
    apt_result = await db.execute(apt_query)
    for apt in apt_result.scalars().all():
        patient = None
        patient_name = "Unknown"
        if apt.patient_id:
            p = await db.get(Patient, apt.patient_id)
            patient = p
            patient_name = p.full_name if p else "Unknown"
        existing = await db.execute(
            select(func.count(Notification.id)).where(
                and_(Notification.user_id == uid, Notification.entity_id == str(apt.id), Notification.type == "appointment")
            )
        )
        if existing.scalar() == 0:
            time_str = apt.appointment_time.strftime("%I:%M %p") if apt.appointment_time else "N/A"
            desc = TemplateEngine.render_template(
                "{{patient_name}} at {{appointment_time}}",
                TemplateEngine.build_variables(
                    patient_name=patient_name,
                    appointment_time=time_str,
                ),
            )
            n = Notification(
                user_id=uid, type="appointment",
                title="Today's Appointment",
                description=desc,
                entity_type="appointment", entity_id=str(apt.id),
            )
            db.add(n)
            created += 1

    await db.commit()
    return {"count": created}