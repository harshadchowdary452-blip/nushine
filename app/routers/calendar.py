from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import date, datetime, timedelta
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Permission, verify_permission
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.user import User
from app.core.permissions import Role

router = APIRouter(prefix="/calendar", tags=["Calendar"])


@router.get("/appointments")
async def get_calendar_appointments(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    doctor_id: str = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    s_date = date.fromisoformat(start_date)
    e_date = date.fromisoformat(end_date)
    role = current_user.get("role")
    user_id = current_user.get("sub")
    hospital_id = current_user.get("hospital_id")
    query = select(Appointment).where(
        Appointment.appointment_date >= s_date,
        Appointment.appointment_date <= e_date,
        Appointment.is_active == True,
    )
    if role == Role.DOCTOR.value:
        query = query.where(Appointment.doctor_id == user_id)
    elif doctor_id:
        query = query.where(Appointment.doctor_id == doctor_id)
    elif hospital_id:
        query = query.join(Appointment.patient).where(Patient.hospital_id == hospital_id)
    query = query.order_by(Appointment.appointment_date, Appointment.appointment_time)
    result = await db.execute(query)
    items = result.scalars().all()
    return [{
        "id": str(a.id), "patient_id": str(a.patient_id) if a.patient_id else None,
        "doctor_id": str(a.doctor_id) if a.doctor_id else None,
        "patient_name": a.patient_name or "Unknown",
        "doctor_name": a.doctor_name or "Unknown",
        "appointment_date": a.appointment_date.isoformat(),
        "appointment_time": a.appointment_time.strftime("%H:%M") if a.appointment_time else None,
        "status": a.status.value if hasattr(a.status, 'value') else str(a.status),
        "notes": a.notes,
    } for a in items]


@router.get("/doctors")
async def get_doctor_schedules(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    hospital_id = current_user.get("hospital_id")
    query = select(User).where(User.role == Role.DOCTOR.value, User.is_active == True)
    if hospital_id:
        query = query.where(User.hospital_id == hospital_id)
    result = await db.execute(query)
    doctors = result.scalars().all()
    return [{
        "id": str(d.id), "name": d.full_name,
        "specialization": d.specialization,
    } for d in doctors]


@router.get("/stats")
async def get_calendar_stats(
    month: str = Query(None, description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user.get("sub")
    hospital_id = current_user.get("hospital_id")
    today = date.today()
    if month:
        year, mon = map(int, month.split("-"))
        month_start = date(year, mon, 1)
        month_end = date(year, mon, 28) + timedelta(days=4)
        month_end = month_end.replace(day=1) - timedelta(days=1)
    else:
        month_start = today.replace(day=1)
        month_end = today.replace(day=28) + timedelta(days=4)
        month_end = month_end.replace(day=1) - timedelta(days=1)
    query = select(func.count(Appointment.id)).where(
        Appointment.appointment_date >= month_start,
        Appointment.appointment_date <= month_end,
    )
    if hospital_id: query = query.join(Appointment.patient).where(Patient.hospital_id == hospital_id)
    total = (await db.execute(query)).scalar() or 0
    today_q = select(func.count(Appointment.id)).where(Appointment.appointment_date == today)
    if hospital_id: today_q = today_q.join(Appointment.patient).where(Patient.hospital_id == hospital_id)
    today_count = (await db.execute(today_q)).scalar() or 0
    return {"total_month": total, "today": today_count}