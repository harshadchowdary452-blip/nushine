"""Shared helper functions for dashboard endpoints."""

from datetime import datetime, date, timezone, timedelta
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, extract
from app.database import get_db
from app.core.permissions import Role
from app.models.hospital import Hospital
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus
from app.models.appointment import Appointment, AppointmentStatus
from app.models.follow_up import FollowUp, FollowUpStatus
from app.models.billing import Billing, PaymentStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.pre_op import PreOp
from app.models.post_op import PostOp
from app.models.treatment_sitting import TreatmentSitting
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.models.lead import Lead
from app.models.user import User
from app.config import settings
from app.utils.dashboard_helpers import (
    get_date_range, get_previous_date_range, calculate_revenue, calculate_revenue_for_range,
    calculate_expenses_for_date_range, calculate_profit, calculate_profit_margin,
    revenue_trend_with_expenses, revenue_trend_with_expenses_range,
    revenue_bucket_map, revenue_by_doctor_for_range, payment_method_breakdown_for_range,
)


async def _get_hospital_ids_for_group(db: AsyncSession, admin_group_id: str) -> list[str]:
    r = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == admin_group_id))
    return [row[0] for row in r.all()]


async def _get_patient_ids_for_hospitals(db: AsyncSession, hospital_ids: list[str]) -> list[str]:
    if not hospital_ids:
        return []
    r = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hospital_ids)))
    return [row[0] for row in r.all()]


async def _get_case_ids_for_patients(db: AsyncSession, patient_ids: list[str]) -> list[str]:
    if not patient_ids:
        return []
    r = await db.execute(select(Case.id).where(Case.patient_id.in_(patient_ids)))
    return [row[0] for row in r.all()]


def _trend_group_expr(column, range_days: int):
    """Return a group-by expression producing 'YYYY-MM-DD HH24:00' / 'YYYY-MM-DD' / 'YYYY-MM' keys.

    Uses to_char on PostgreSQL and the equivalent strftime on SQLite so tests and
    the app behave identically regardless of the backing database.
    """
    if range_days <= 1:
        pg_fmt, sq_fmt = 'YYYY-MM-DD HH24:00', '%Y-%m-%d %H:00'
    elif range_days <= 90:
        pg_fmt, sq_fmt = 'YYYY-MM-DD', '%Y-%m-%d'
    else:
        pg_fmt, sq_fmt = 'YYYY-MM', '%Y-%m'
    if settings.DB_IS_POSTGRESQL:
        return func.to_char(column, pg_fmt)
    return func.strftime(sq_fmt, column)


async def _monthly_revenue_trend(db: AsyncSession, case_ids: list[str] | None = None,
                                 date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start:
        now = datetime.now(timezone.utc)
        date_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)).replace(day=1)
    if not date_end:
        date_end = datetime.now(timezone.utc)

    range_days = (date_end - date_start).days
    if range_days <= 1:
        python_format, sql_format = '%Y-%m-%d %H:00', 'YYYY-MM-DD HH24:00'
    elif range_days <= 90:
        python_format, sql_format = '%Y-%m-%d', 'YYYY-MM-DD'
    else:
        python_format, sql_format = '%Y-%m', 'YYYY-MM'

    revenue_map = await revenue_bucket_map(db, case_ids, date_start, date_end, python_format, sql_format)
    return [{"month": month, "revenue": revenue} for month, revenue in sorted(revenue_map.items())]


async def _monthly_patient_trend(db: AsyncSession, hospital_ids: list[str] | None = None,
                                 date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start:
        now = datetime.now(timezone.utc)
        date_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)).replace(day=1)
    if not date_end:
        date_end = datetime.now(timezone.utc)

    range_days = (date_end - date_start).days

    query = select(
        _trend_group_expr(Patient.created_at, range_days).label('month'),
        func.count(Patient.id).label('count'),
    ).where(Patient.created_at >= date_start, Patient.created_at < date_end)
    if hospital_ids is not None:
        query = query.where(Patient.hospital_id.in_(hospital_ids))
    query = query.group_by(text("month")).order_by(text("month"))

    r = await db.execute(query)
    return [{"month": row[0], "count": row[1]} for row in r.all()]


async def _monthly_case_trend(db: AsyncSession, case_ids: list[str] | None = None,
                              date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start:
        now = datetime.now(timezone.utc)
        date_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)).replace(day=1)
    if not date_end:
        date_end = datetime.now(timezone.utc)

    range_days = (date_end - date_start).days

    query = select(
        _trend_group_expr(Case.created_at, range_days).label('month'),
        func.count(Case.id).label('count'),
    ).where(Case.created_at >= date_start, Case.created_at < date_end)
    if case_ids is not None:
        query = query.where(Case.id.in_(case_ids))
    query = query.group_by(text("month")).order_by(text("month"))

    r = await db.execute(query)
    return [{"month": row[0], "count": row[1]} for row in r.all()]


async def _monthly_appointment_trend(db: AsyncSession, hospital_ids: list[str] | None = None,
                                     doctor_id: str | None = None,
                                     date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start:
        now = datetime.now(timezone.utc)
        date_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)).replace(day=1)
    if not date_end:
        date_end = datetime.now(timezone.utc)

    range_days = (date_end - date_start).days

    query = select(
        _trend_group_expr(Appointment.created_at, range_days).label('month'),
        func.count(Appointment.id).label('count'),
    ).where(Appointment.created_at >= date_start, Appointment.created_at < date_end)
    if doctor_id:
        query = query.where(Appointment.doctor_id == doctor_id)
    elif hospital_ids is not None:
        pids_r = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hospital_ids)))
        pids = [row[0] for row in pids_r.all()]
        if not pids:
            return []
        query = query.where(Appointment.patient_id.in_(pids))
    query = query.group_by(text("month")).order_by(text("month"))

    r = await db.execute(query)
    return [{"month": row[0], "count": row[1]} for row in r.all()]


async def _get_top_performers(db: AsyncSession, field_name: str, field_id: str,
                              case_ids: list[str], limit: int = 5) -> list:
    if not case_ids:
        return []
    from app.models.billing import Billing
    query = select(
        getattr(Billing.case, field_name) if hasattr(Billing, field_name) else Billing.case_id,
        func.sum(Billing.paid_amount).label('revenue'),
    ).where(Billing.case_id.in_(case_ids)).group_by(
        getattr(Billing.case, field_name) if hasattr(Billing, field_name) else Billing.case_id
    ).order_by(text("revenue DESC")).limit(limit)
    r = await db.execute(query)
    return [{"name": row[0], "value": float(row[1] or 0)} for row in r.all()]


def _trend_format(range_days: int):
    """Returns (python_format, sql_format, group_label) for the given span."""
    if range_days <= 1:
        return ('%Y-%m-%d %H:00', 'YYYY-MM-DD HH24:00' if settings.DB_IS_POSTGRESQL else '%Y-%m-%d %H:00', 'hour')
    elif range_days <= 31:
        return ('%Y-%m-%d', 'YYYY-MM-DD' if settings.DB_IS_POSTGRESQL else '%Y-%m-%d', 'day')
    return ('%Y-%m', 'YYYY-MM' if settings.DB_IS_POSTGRESQL else '%Y-%m', 'month')


async def _appointment_trend(db: AsyncSession, hospital_ids: list[str] | None = None,
                             doctor_id: str | None = None,
                             date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start or not date_end:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = month_end

    python_format, sql_format, group_label = _trend_format((date_end - date_start).days)

    query = select(
        (func.to_char(Appointment.appointment_date, sql_format) if settings.DB_IS_POSTGRESQL
         else func.strftime(python_format, Appointment.appointment_date)).label(group_label),
        func.count(Appointment.id).label('count'),
    ).where(
        Appointment.appointment_date >= date_start.date(),
        Appointment.appointment_date < date_end.date(),
    )
    if doctor_id:
        query = query.where(Appointment.doctor_id == doctor_id)
    elif hospital_ids is not None:
        pids_r = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hospital_ids)))
        pids = [row[0] for row in pids_r.all()]
        if not pids:
            return []
        query = query.where(Appointment.patient_id.in_(pids))
    query = query.group_by(text(group_label)).order_by(text(group_label))
    r = await db.execute(query)
    count_map = {row[0]: row[1] for row in r.all()}

    result = []
    cursor = date_start
    if group_label == 'hour':
        step = timedelta(hours=1)
    elif group_label == 'day':
        step = timedelta(days=1)
    else:
        step = timedelta(days=31)
    while cursor < date_end:
        key = cursor.strftime(python_format)
        result.append({"label": key, "count": count_map.get(key, 0)})
        if group_label == 'month':
            cursor = cursor.replace(month=cursor.month % 12 + 1, day=1) if cursor.month < 12 else cursor.replace(year=cursor.year + 1, month=1, day=1)
        else:
            cursor += step
    return result


async def _appointment_heatmap(db: AsyncSession, hospital_ids: list[str] | None = None,
                               doctor_id: str | None = None,
                               date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start or not date_end:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = month_end

    if settings.DB_IS_POSTGRESQL:
        dow_expr = func.to_char(Appointment.appointment_date, 'ID')
        hour_expr = func.to_char(Appointment.appointment_time, 'HH24')
    else:
        dow_expr = func.strftime('%w', Appointment.appointment_date)
        hour_expr = func.strftime('%H', Appointment.appointment_time)

    query = select(
        dow_expr.label('dow'), hour_expr.label('hour'), func.count(Appointment.id).label('count'),
    ).where(
        Appointment.appointment_date >= date_start.date(),
        Appointment.appointment_date < date_end.date(),
    )
    if doctor_id:
        query = query.where(Appointment.doctor_id == doctor_id)
    elif hospital_ids is not None:
        pids_r = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hospital_ids)))
        pids = [row[0] for row in pids_r.all()]
        if not pids:
            return []
        query = query.where(Appointment.patient_id.in_(pids))
    query = query.group_by(text('dow'), text('hour')).order_by(text('dow'), text('hour'))
    r = await db.execute(query)

    result = []
    for dow_raw, hour, count in r.all():
        if settings.DB_IS_POSTGRESQL:
            dow = int(dow_raw) - 1          # 'ID' is 1..7 (Mon..Sun) -> 0..6
        else:
            dow = (int(dow_raw) + 6) % 7    # SQLite '%w' is 0..6 (Sun..Sat) -> 0..6 (Mon..Sun)
        result.append({"day": dow, "hour": int(hour), "count": count})
    return result


async def _treatment_category_breakdown(db: AsyncSession, case_ids: list[str] | None = None,
                                        date_start: datetime | None = None, date_end: datetime | None = None,
                                        limit: int = 8) -> list:
    if not date_start or not date_end:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = month_end

    query = select(
        TreatmentPlan.treatment_name,
        func.count(TreatmentPlan.id).label('count'),
        func.coalesce(func.sum(TreatmentPlan.cost), 0).label('cost'),
    ).where(TreatmentPlan.created_at >= date_start, TreatmentPlan.created_at < date_end)
    if case_ids is not None:
        query = query.where(TreatmentPlan.case_id.in_(case_ids))
    query = query.group_by(TreatmentPlan.treatment_name).order_by(text('count DESC')).limit(limit)
    r = await db.execute(query)
    return [{"name": row[0], "count": row[1], "cost": float(row[2])} for row in r.all()]


async def _lead_source_breakdown(db: AsyncSession, hospital_ids: list[str] | None = None,
                                 doctor_id: str | None = None,
                                 date_start: datetime | None = None, date_end: datetime | None = None,
                                 limit: int = 8) -> list:
    if not date_start or not date_end:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = month_end

    query = select(Lead.source, func.count(Lead.id).label('count')).where(
        Lead.created_at >= date_start, Lead.created_at < date_end,
    )
    if doctor_id:
        query = query.where(Lead.assigned_doctor_id == doctor_id)
    elif hospital_ids is not None:
        query = query.where(Lead.hospital_id.in_(hospital_ids))
    query = query.group_by(Lead.source).order_by(text('count DESC')).limit(limit)
    r = await db.execute(query)
    return [{"source": row[0], "count": row[1]} for row in r.all()]


async def _payment_method_breakdown(db: AsyncSession, case_ids: list[str] | None = None,
                                    date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start or not date_end:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = month_end

    breakdown = await payment_method_breakdown_for_range(db, case_ids, date_start, date_end)
    rows = [{"method": m or "Unknown", "amount": amount} for m, amount in breakdown.items()]
    rows.sort(key=lambda x: x["amount"], reverse=True)
    return rows


async def _gender_distribution(db: AsyncSession, hospital_ids: list[str] | None = None,
                               doctor_id: str | None = None,
                               date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start or not date_end:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = month_end

    query = select(Patient.gender, func.count(Patient.id).label('count')).where(
        Patient.created_at >= date_start, Patient.created_at < date_end,
    )
    if doctor_id:
        query = query.where(Patient.doctor_id == doctor_id)
    elif hospital_ids is not None:
        query = query.where(Patient.hospital_id.in_(hospital_ids))
    query = query.group_by(Patient.gender).order_by(text('count DESC'))
    r = await db.execute(query)
    return [{"gender": row[0] or "Unknown", "count": row[1]} for row in r.all()]


async def _age_group_distribution(db: AsyncSession, hospital_ids: list[str] | None = None,
                                  doctor_id: str | None = None,
                                  date_start: datetime | None = None, date_end: datetime | None = None) -> list:
    if not date_start or not date_end:
        now = datetime.now(timezone.utc)
        date_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = date_start.replace(month=date_start.month % 12 + 1, day=1) if date_start.month < 12 else date_start.replace(year=date_start.year + 1, month=1, day=1)
        date_end = month_end

    query = select(Patient.age).where(
        Patient.created_at >= date_start, Patient.created_at < date_end,
    )
    if doctor_id:
        query = query.where(Patient.doctor_id == doctor_id)
    elif hospital_ids is not None:
        query = query.where(Patient.hospital_id.in_(hospital_ids))
    r = await db.execute(query)

    buckets = [("0-12", 0), ("13-17", 0), ("18-24", 0), ("25-34", 0), ("35-44", 0), ("45-54", 0), ("55-64", 0), ("65+", 0), ("Unknown", 0)]
    for (age,) in r.all():
        if age is None or age < 0:
            buckets[8] = (buckets[8][0], buckets[8][1] + 1)
            continue
        if age <= 12:
            buckets[0] = (buckets[0][0], buckets[0][1] + 1)
        elif age <= 17:
            buckets[1] = (buckets[1][0], buckets[1][1] + 1)
        elif age <= 24:
            buckets[2] = (buckets[2][0], buckets[2][1] + 1)
        elif age <= 34:
            buckets[3] = (buckets[3][0], buckets[3][1] + 1)
        elif age <= 44:
            buckets[4] = (buckets[4][0], buckets[4][1] + 1)
        elif age <= 54:
            buckets[5] = (buckets[5][0], buckets[5][1] + 1)
        elif age <= 64:
            buckets[6] = (buckets[6][0], buckets[6][1] + 1)
        else:
            buckets[7] = (buckets[7][0], buckets[7][1] + 1)
    return [{"group": k, "count": v} for k, v in buckets]
