from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import date, datetime, timezone
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.appointment import Appointment
from app.models.patient import Patient

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
async def get_notifications(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    uid = current_user.get("sub")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        return {"count": 0, "items": []}

    today = date.today()
    notifications = []

    apt_query = select(Appointment).where(
        Appointment.doctor_id == uid,
        func.date(Appointment.appointment_date) == today,
        Appointment.is_active == True,
    )
    apt_result = await db.execute(apt_query)
    today_appts = apt_result.scalars().all()

    for apt in today_appts:
        patient = None
        if apt.patient_id:
            p_result = await db.execute(select(Patient).where(Patient.id == apt.patient_id))
            patient = p_result.scalar_one_or_none()
        notifications.append({
            "id": str(apt.id),
            "type": "appointment",
            "title": "Today's Appointment",
            "description": f"{patient.full_name if patient else 'Unknown'} at {apt.appointment_time or 'N/A'}",
            "time": apt.appointment_time or "",
        })

    return {"count": len(notifications), "items": notifications}
