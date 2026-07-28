import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import date, timedelta
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Permission, verify_permission, Role
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User

router = APIRouter(prefix="/calendar", tags=["Calendar"])
logger = logging.getLogger(__name__)


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

    stmt = (
        select(
            Appointment.id,
            Appointment.patient_id,
            Appointment.doctor_id,
            Appointment.appointment_date,
            Appointment.appointment_time,
            Appointment.status,
            Appointment.notes,
            Patient.full_name.label("patient_name"),
            User.full_name.label("doctor_name"),
        )
        .outerjoin(Patient, Appointment.patient_id == Patient.id)
        .outerjoin(User, Appointment.doctor_id == User.id)
        .where(
            Appointment.appointment_date >= s_date,
            Appointment.appointment_date <= e_date,
            Appointment.is_active == True,
        )
    )

    if role == Role.DOCTOR.value:
        stmt = stmt.where(Appointment.doctor_id == user_id)
    elif doctor_id:
        stmt = stmt.where(Appointment.doctor_id == doctor_id)
    elif hospital_id:
        stmt = stmt.where(Patient.hospital_id == hospital_id)

    stmt = stmt.order_by(Appointment.appointment_date, Appointment.appointment_time)
    result = await db.execute(stmt)
    rows = result.fetchall()

    out = []
    for row in rows:
        status_val = row.status
        if hasattr(status_val, 'value'):
            status_val = status_val.value
        else:
            status_val = str(status_val)
        appt_time = row.appointment_time
        if appt_time:
            appt_time = appt_time.strftime("%H:%M")
        out.append({
            "id": str(row.id),
            "patient_id": str(row.patient_id) if row.patient_id else None,
            "doctor_id": str(row.doctor_id) if row.doctor_id else None,
            "patient_name": getattr(row, 'patient_name', None) or "Unknown",
            "doctor_name": getattr(row, 'doctor_name', None) or "Unknown",
            "appointment_date": row.appointment_date.isoformat(),
            "appointment_time": appt_time,
            "status": status_val,
            "notes": row.notes,
        })
    return out


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

    count_filters = [
        Appointment.appointment_date >= month_start,
        Appointment.appointment_date <= month_end,
    ]
    today_filters = [Appointment.appointment_date == today]

    if hospital_id:
        pid_subq = select(Patient.id).where(Patient.hospital_id == hospital_id).scalar_subquery()
        count_filters.append(Appointment.patient_id.in_(pid_subq))
        today_filters.append(Appointment.patient_id.in_(pid_subq))

    total = (await db.execute(select(func.count(Appointment.id)).where(*count_filters))).scalar() or 0
    today_count = (await db.execute(select(func.count(Appointment.id)).where(*today_filters))).scalar() or 0
    return {"total_month": total, "today": today_count}
