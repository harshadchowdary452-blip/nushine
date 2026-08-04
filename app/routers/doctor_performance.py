"""Doctor Performance & Clinical Productivity analytics.

Role-scoped, read-only analytics aggregated directly from the operational
models (appointments, cases, treatment plans, sittings, billing, follow-ups,
patient feedback). Everything is derived from existing ERP data — there is no
manual data entry.

Scope rules:
    SUPER_ADMIN     -> every doctor (optional group_id / X-Hospital-ID filter)
    GROUP_ADMIN     -> doctors in the caller's admin group (X-Hospital-ID may
                       narrow the view to one hospital of the group)
    HOSPITAL_ADMIN  -> doctors in the caller's own hospital
    DOCTOR          -> only the caller themselves
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import and_, case as sql_case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.permissions import Role
from app.database import get_db
from app.dependencies import get_current_user
from app.models.admin_group import AdminGroup
from app.models.appointment import Appointment, AppointmentStatus
from app.models.billing import Billing
from app.models.case import Case, CaseStatus
from app.models.feedback import PatientFeedback
from app.models.follow_up import FollowUp
from app.models.hospital import Hospital
from app.models.patient import Patient
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
from app.models.user import User
from app.routers.dashboards import _trend_group_expr
from app.utils.dashboard_helpers import get_date_range, get_previous_date_range

router = APIRouter(prefix="/doctor-performance", tags=["Doctor Performance"])

ACTIVE_CASE_STATUSES = [
    CaseStatus.OPEN.value, CaseStatus.IN_PROGRESS.value, CaseStatus.ON_HOLD.value,
]
ACTIVE_PLAN_STATUSES = [
    TreatmentPlanStatus.ASSIGNED.value, TreatmentPlanStatus.SCHEDULED.value,
    TreatmentPlanStatus.IN_PROGRESS.value, TreatmentPlanStatus.WAITING_PATIENT.value,
    TreatmentPlanStatus.WAITING_LAB.value, TreatmentPlanStatus.ON_HOLD.value,
    TreatmentPlanStatus.OVERDUE.value,
]

_METRIC_KEYS = [
    "appointments_total", "appointments_completed", "appointments_cancelled",
    "appointments_rescheduled", "patients_seen", "returning_patients",
    "cases_created", "cases_completed_period", "active_cases",
    "plans_created", "treatments_completed", "treatments_active",
    "sittings_completed", "revenue", "followups_completed", "followups_lost",
    "rating_sum", "rating_count",
]


def _pct(part: float, whole: float) -> float:
    return round((part / whole * 100), 1) if whole > 0 else 0.0


def _empty_metrics(doctor_ids: list[str]) -> dict[str, dict]:
    return {did: {key: 0 for key in _METRIC_KEYS} for did in doctor_ids}


async def _doctors_in_scope(db: AsyncSession, current_user: dict,
                            x_hospital_id: Optional[str],
                            group_id: Optional[str]) -> list[User]:
    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        query = select(User).where(User.role == Role.DOCTOR.value)
        if group_id:
            query = query.where(User.admin_group_id == group_id)
        if x_hospital_id:
            query = query.where(User.hospital_id == x_hospital_id)
    elif role == Role.GROUP_ADMIN.value:
        query = select(User).where(
            User.role == Role.DOCTOR.value,
            User.admin_group_id == current_user.get("admin_group_id"),
        )
        if x_hospital_id:
            query = query.where(User.hospital_id == x_hospital_id)
    elif role == Role.HOSPITAL_ADMIN.value:
        query = select(User).where(
            User.role == Role.DOCTOR.value,
            User.hospital_id == current_user.get("hospital_id"),
        )
    elif role == Role.DOCTOR.value:
        query = select(User).where(
            User.id == current_user.get("sub"),
            User.role == Role.DOCTOR.value,
        )
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    result = await db.execute(query.order_by(User.full_name))
    return list(result.scalars().all())


async def _verify_doctor_scope(db: AsyncSession, current_user: dict, doctor_id: str) -> User:
    role = current_user.get("role")
    if role not in (Role.SUPER_ADMIN.value, Role.GROUP_ADMIN.value, Role.HOSPITAL_ADMIN.value):
        if role == Role.DOCTOR.value and doctor_id == current_user.get("sub"):
            pass
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    result = await db.execute(
        select(User).where(User.id == doctor_id, User.role == Role.DOCTOR.value)
    )
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

    if role == Role.GROUP_ADMIN.value and doctor.admin_group_id != current_user.get("admin_group_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if role == Role.HOSPITAL_ADMIN.value and doctor.hospital_id != current_user.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return doctor


async def _collect(db: AsyncSession, doctor_ids: list[str],
                   date_start: datetime, date_end: datetime) -> tuple[dict[str, dict], dict]:
    """Run the per-doctor + scope-wide aggregations for one date range.

    Returns (per-doctor metrics, scope-wide summary).
    """
    metrics = _empty_metrics(doctor_ids)
    summary = {
        "patients_seen": 0, "returning_patients": 0,
        "appointments_total": 0, "appointments_completed": 0,
        "appointments_cancelled": 0, "appointments_rescheduled": 0,
        "cases_created": 0, "cases_completed_period": 0, "active_cases": 0,
        "plans_created": 0, "treatments_completed": 0, "treatments_active": 0,
        "sittings_completed": 0, "revenue": 0.0, "followups_completed": 0,
        "followups_lost": 0, "rating_avg": None,
    }
    if not doctor_ids:
        return metrics, summary

    # Appointments in period
    rows = (await db.execute(
        select(
            Appointment.doctor_id,
            func.count(Appointment.id),
            func.sum(sql_case((Appointment.status == AppointmentStatus.COMPLETED.value, 1), else_=0)),
            func.sum(sql_case((Appointment.status == AppointmentStatus.CANCELLED.value, 1), else_=0)),
            func.sum(sql_case((Appointment.status == AppointmentStatus.RESCHEDULED.value, 1), else_=0)),
            func.count(func.distinct(Appointment.patient_id)),
        ).where(
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.is_active == True,
            Appointment.appointment_date >= date_start.date(),
            Appointment.appointment_date < date_end.date(),
        ).group_by(Appointment.doctor_id)
    )).all()
    for row in rows:
        m = metrics[row[0]]
        m["appointments_total"] += row[1] or 0
        m["appointments_completed"] += row[2] or 0
        m["appointments_cancelled"] += row[3] or 0
        m["appointments_rescheduled"] += row[4] or 0
        m["patients_seen"] += row[5] or 0

    # Cases created in period
    rows = (await db.execute(
        select(
            Case.doctor_id,
            func.count(Case.id),
        ).where(
            Case.doctor_id.in_(doctor_ids),
            Case.created_at >= date_start,
            Case.created_at < date_end,
        ).group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["cases_created"] += row[1] or 0

    # Cases snapshot (active now / completed ever)
    rows = (await db.execute(
        select(
            Case.doctor_id,
            func.sum(sql_case((Case.status.in_(ACTIVE_CASE_STATUSES), 1), else_=0)),
            func.sum(sql_case((Case.status == CaseStatus.COMPLETED.value, 1), else_=0)),
        ).where(Case.doctor_id.in_(doctor_ids)).group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["active_cases"] += row[1] or 0

    # Cases completed in period
    rows = (await db.execute(
        select(Case.doctor_id, func.count(Case.id)).where(
            Case.doctor_id.in_(doctor_ids),
            Case.status == CaseStatus.COMPLETED.value,
            Case.completion_date >= date_start,
            Case.completion_date < date_end,
        ).group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["cases_completed_period"] += row[1] or 0

    # Treatment plans created / completed in period, active snapshot
    rows = (await db.execute(
        select(TreatmentPlan.assigned_doctor_id, func.count(TreatmentPlan.id)).where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            TreatmentPlan.created_at >= date_start,
            TreatmentPlan.created_at < date_end,
        ).group_by(TreatmentPlan.assigned_doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["plans_created"] += row[1] or 0

    rows = (await db.execute(
        select(TreatmentPlan.assigned_doctor_id, func.count(TreatmentPlan.id)).where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value,
            TreatmentPlan.completed_at >= date_start,
            TreatmentPlan.completed_at < date_end,
        ).group_by(TreatmentPlan.assigned_doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["treatments_completed"] += row[1] or 0

    rows = (await db.execute(
        select(TreatmentPlan.assigned_doctor_id, func.count(TreatmentPlan.id)).where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            TreatmentPlan.status.in_(ACTIVE_PLAN_STATUSES),
        ).group_by(TreatmentPlan.assigned_doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["treatments_active"] += row[1] or 0

    # Sittings completed in period
    rows = (await db.execute(
        select(TreatmentSitting.doctor_id, func.count(TreatmentSitting.id)).where(
            TreatmentSitting.doctor_id.in_(doctor_ids),
            TreatmentSitting.status == TreatmentSittingStatus.COMPLETED.value,
            TreatmentSitting.sitting_date >= date_start.date(),
            TreatmentSitting.sitting_date < date_end.date(),
        ).group_by(TreatmentSitting.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["sittings_completed"] += row[1] or 0

    # Revenue (sum of payments recorded in period on the doctor's cases)
    rows = (await db.execute(
        select(Case.doctor_id, func.sum(Billing.paid_amount))
        .select_from(Case)
        .join(Billing, Billing.case_id == Case.id)
        .where(
            Case.doctor_id.in_(doctor_ids),
            Billing.updated_at >= date_start,
            Billing.updated_at < date_end,
        ).group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["revenue"] += float(row[1] or 0)

    # Follow-up success (completed / lost) in period
    rows = (await db.execute(
        select(
            FollowUp.doctor_id,
            func.sum(sql_case((FollowUp.status == "COMPLETED", 1), else_=0)),
            func.sum(sql_case((FollowUp.status == "LOST", 1), else_=0)),
        ).where(
            FollowUp.doctor_id.in_(doctor_ids),
            FollowUp.created_at >= date_start,
            FollowUp.created_at < date_end,
        ).group_by(FollowUp.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["followups_completed"] += row[1] or 0
        metrics[row[0]]["followups_lost"] += row[2] or 0

    # Average doctor rating (period-scoped, weighted by feedback count)
    rows = (await db.execute(
        select(
            Patient.doctor_id,
            func.avg(PatientFeedback.doctor_rating),
            func.count(PatientFeedback.id),
        )
        .select_from(Patient)
        .join(PatientFeedback, PatientFeedback.patient_id == Patient.id)
        .where(
            Patient.doctor_id.in_(doctor_ids),
            PatientFeedback.feedback_date >= date_start,
            PatientFeedback.feedback_date < date_end,
        ).group_by(Patient.doctor_id)
    )).all()
    for row in rows:
        if row[1] is not None:
            metrics[row[0]]["rating_sum"] += round(float(row[1]) * (row[2] or 0), 2)
            metrics[row[0]]["rating_count"] += row[2] or 0

    # Returning patients (seen in the period who were also seen before it).
    # Self-join on the appointments table, grouped per doctor.
    seen = aliased(Appointment)
    prior = aliased(Appointment)
    rows = (await db.execute(
        select(seen.doctor_id, func.count(func.distinct(seen.patient_id)))
        .select_from(seen)
        .join(prior, and_(
            prior.patient_id == seen.patient_id,
            prior.doctor_id == seen.doctor_id,
        ))
        .where(
            seen.doctor_id.in_(doctor_ids),
            prior.doctor_id.in_(doctor_ids),
            seen.is_active == True,
            prior.is_active == True,
            seen.appointment_date >= date_start.date(),
            seen.appointment_date < date_end.date(),
            prior.appointment_date < date_start.date(),
        ).group_by(seen.doctor_id)
    )).all()
    for did, n in rows:
        metrics[did]["returning_patients"] = n or 0

    # Rating average across the whole scope (weighted by feedback rows)
    scope_rating = (await db.execute(
        select(func.avg(PatientFeedback.doctor_rating))
        .select_from(Patient)
        .join(PatientFeedback, PatientFeedback.patient_id == Patient.id)
        .where(
            Patient.doctor_id.in_(doctor_ids),
            PatientFeedback.feedback_date >= date_start,
            PatientFeedback.feedback_date < date_end,
        )
    )).scalar()
    summary["rating_avg"] = round(float(scope_rating), 2) if scope_rating is not None else None

    # Scope-wide distinct patients seen in the period.
    summary["patients_seen"] = (await db.execute(
        select(func.count(func.distinct(Appointment.patient_id))).where(
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.is_active == True,
            Appointment.appointment_date >= date_start.date(),
            Appointment.appointment_date < date_end.date(),
        )
    )).scalar() or 0

    # Scope-wide returning patients (per-doctor union may double-count a patient
    # across doctors, so recompute with a cross-doctor self-join).
    seen = aliased(Appointment)
    prior = aliased(Appointment)
    summary["returning_patients"] = (await db.execute(
        select(func.count(func.distinct(seen.patient_id)))
        .select_from(seen)
        .join(prior, and_(
            prior.patient_id == seen.patient_id,
            prior.doctor_id == seen.doctor_id,
        ))
        .where(
            seen.doctor_id.in_(doctor_ids),
            prior.doctor_id.in_(doctor_ids),
            seen.is_active == True,
            prior.is_active == True,
            seen.appointment_date >= date_start.date(),
            seen.appointment_date < date_end.date(),
            prior.appointment_date < date_start.date(),
        )
    )).scalar() or 0

    for did in doctor_ids:
        m = metrics[did]
        summary["appointments_total"] += m["appointments_total"]
        summary["appointments_completed"] += m["appointments_completed"]
        summary["appointments_cancelled"] += m["appointments_cancelled"]
        summary["appointments_rescheduled"] += m["appointments_rescheduled"]
        summary["cases_created"] += m["cases_created"]
        summary["cases_completed_period"] += m["cases_completed_period"]
        summary["active_cases"] += m["active_cases"]
        summary["plans_created"] += m["plans_created"]
        summary["treatments_completed"] += m["treatments_completed"]
        summary["treatments_active"] += m["treatments_active"]
        summary["sittings_completed"] += m["sittings_completed"]
        summary["revenue"] += m["revenue"]
        summary["followups_completed"] += m["followups_completed"]
        summary["followups_lost"] += m["followups_lost"]

    return metrics, summary


def _doctor_row(doctor: User, m: dict, hospital_names: dict, group_names: dict) -> dict:
    attendance_den = m["appointments_completed"] + m["appointments_cancelled"] + m["appointments_rescheduled"]
    retention_den = m["new_patients"] + m["returning_patients"]
    recall_den = m["followups_completed"] + m["followups_lost"]
    return {
        "id": doctor.id,
        "name": doctor.full_name,
        "email": doctor.email,
        "qualification": doctor.qualification,
        "specialization": doctor.specialization,
        "designation": doctor.qualification or "Doctor",
        "department": doctor.specialization or "General Dentistry",
        "hospital_id": doctor.hospital_id,
        "hospital_name": hospital_names.get(doctor.hospital_id) if doctor.hospital_id else None,
        "admin_group_id": doctor.admin_group_id,
        "admin_group_name": group_names.get(doctor.admin_group_id) if doctor.admin_group_id else None,
        "patients_seen": m["patients_seen"],
        "new_patients": m["new_patients"],
        "returning_patients": m["returning_patients"],
        "appointments_total": m["appointments_total"],
        "appointments_completed": m["appointments_completed"],
        "appointments_cancelled": m["appointments_cancelled"],
        "appointments_rescheduled": m["appointments_rescheduled"],
        "cases_created": m["cases_created"],
        "cases_completed": m["cases_completed_period"],
        "active_cases": m["active_cases"],
        "treatment_plans_created": m["plans_created"],
        "treatments_completed": m["treatments_completed"],
        "treatments_active": m["treatments_active"],
        "sittings_completed": m["sittings_completed"],
        "revenue": round(m["revenue"], 2),
        "avg_revenue_per_patient": round(m["revenue"] / m["patients_seen"], 2) if m["patients_seen"] else 0.0,
        "avg_revenue_per_appointment": round(m["revenue"] / m["appointments_completed"], 2) if m["appointments_completed"] else 0.0,
        "case_completion_rate": _pct(m["cases_completed_period"], m["cases_created"]),
        "treatment_completion_rate": _pct(m["treatments_completed"], m["plans_created"]),
        "treatment_acceptance_rate": _pct(m["plans_created"], m["cases_created"]),
        "attendance_rate": _pct(m["appointments_completed"], attendance_den),
        "retention_rate": _pct(m["returning_patients"], retention_den),
        "recall_success_rate": _pct(m["followups_completed"], recall_den),
        "avg_rating": round(m["rating_sum"] / m["rating_count"], 2) if m["rating_count"] else None,
    }


def _summary_payload(summary: dict, doctor_count: int) -> dict:
    new_patients = max(0, summary["patients_seen"] - summary["returning_patients"])
    return {
        "doctors": doctor_count,
        "patients_seen": summary["patients_seen"],
        "new_patients": new_patients,
        "returning_patients": summary["returning_patients"],
        "appointments_total": summary["appointments_total"],
        "appointments_completed": summary["appointments_completed"],
        "appointments_cancelled": summary["appointments_cancelled"],
        "appointments_rescheduled": summary["appointments_rescheduled"],
        "cases_created": summary["cases_created"],
        "cases_completed": summary["cases_completed_period"],
        "active_cases": summary["active_cases"],
        "treatment_plans_created": summary["plans_created"],
        "treatments_completed": summary["treatments_completed"],
        "treatments_active": summary["treatments_active"],
        "sittings_completed": summary["sittings_completed"],
        "revenue": round(summary["revenue"], 2),
        "avg_revenue_per_patient": round(summary["revenue"] / summary["patients_seen"], 2) if summary["patients_seen"] else 0.0,
        "avg_revenue_per_appointment": round(summary["revenue"] / summary["appointments_completed"], 2) if summary["appointments_completed"] else 0.0,
        "case_completion_rate": _pct(summary["cases_completed_period"], summary["cases_created"]),
        "treatment_completion_rate": _pct(summary["treatments_completed"], summary["plans_created"]),
        "treatment_acceptance_rate": _pct(summary["plans_created"], summary["cases_created"]),
        "attendance_rate": _pct(summary["appointments_completed"],
                                summary["appointments_completed"] + summary["appointments_cancelled"] + summary["appointments_rescheduled"]),
        "retention_rate": _pct(summary["returning_patients"], summary["patients_seen"]),
        "recall_success_rate": _pct(summary["followups_completed"],
                                    summary["followups_completed"] + summary["followups_lost"]),
        "avg_rating": summary["rating_avg"],
    }


def _delta(current: float, previous: float) -> float:
    if previous > 0:
        return round(((current - previous) / previous * 100), 1)
    return 100.0 if current > 0 else 0.0


@router.get("")
async def doctor_performance_overview(
    period: str = Query("this_month", description="today, yesterday, last_7_days, last_30_days, this_week, last_week, this_month, last_month, this_quarter, last_quarter, this_year, last_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom range start (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom range end (YYYY-MM-DD)"),
    group_id: Optional[str] = Query(None, description="Filter to an admin group (SUPER_ADMIN only)"),
    x_hospital_id: Optional[str] = Header(None, alias="X-Hospital-ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    doctors = await _doctors_in_scope(db, current_user, x_hospital_id, group_id)
    if not doctors:
        _, empty_summary = await _collect(
            db, [], datetime.now(timezone.utc), datetime.now(timezone.utc)
        )
        return {
            "period": period,
            "scope": {
                "role": current_user.get("role"),
                "hospital_id": x_hospital_id,
                "admin_group_id": current_user.get("admin_group_id"),
                "group_id": group_id,
            },
            "summary": _summary_payload(empty_summary, 0),
            "previous": {}, "deltas": {}, "doctors": [],
        }

    date_start, date_end = get_date_range(period, start_date, end_date)
    prev_start, prev_end = get_previous_date_range(period, start_date, end_date)

    doctor_ids = [d.id for d in doctors]
    metrics, summary = await _collect(db, doctor_ids, date_start, date_end)
    _, prev_summary = await _collect(db, doctor_ids, prev_start, prev_end)

    hospital_names = {}
    hospital_ids = {d.hospital_id for d in doctors if d.hospital_id}
    if hospital_ids:
        rows = (await db.execute(select(Hospital.id, Hospital.name).where(Hospital.id.in_(hospital_ids)))).all()
        hospital_names = {str(r[0]): r[1] for r in rows}
    group_names = {}
    group_ids = {d.admin_group_id for d in doctors if d.admin_group_id}
    if group_ids:
        rows = (await db.execute(select(AdminGroup.id, AdminGroup.name).where(AdminGroup.id.in_(group_ids)))).all()
        group_names = {str(r[0]): r[1] for r in rows}

    doctor_rows = []
    for doc in doctors:
        m = metrics[doc.id]
        m["new_patients"] = max(0, m["patients_seen"] - m["returning_patients"])
        doctor_rows.append(_doctor_row(doc, m, hospital_names, group_names))

    doctor_rows.sort(key=lambda r: r["revenue"], reverse=True)

    return {
        "period": period,
        "scope": {
            "role": current_user.get("role"),
            "hospital_id": x_hospital_id,
            "admin_group_id": current_user.get("admin_group_id"),
            "group_id": group_id,
        },
        "summary": _summary_payload(summary, len(doctors)),
        "previous": {
            "revenue": round(prev_summary["revenue"], 2),
            "patients_seen": prev_summary["patients_seen"],
            "appointments_completed": prev_summary["appointments_completed"],
        },
        "deltas": {
            "revenue_pct": _delta(summary["revenue"], prev_summary["revenue"]),
            "patients_pct": _delta(summary["patients_seen"], prev_summary["patients_seen"]),
            "appointments_pct": _delta(summary["appointments_completed"], prev_summary["appointments_completed"]),
        },
        "doctors": doctor_rows,
    }


@router.get("/{doctor_id}")
async def doctor_performance_detail(
    doctor_id: str,
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    x_hospital_id: Optional[str] = Header(None, alias="X-Hospital-ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    doctor = await _verify_doctor_scope(db, current_user, doctor_id)

    date_start, date_end = get_date_range(period, start_date, end_date)
    metrics, summary = await _collect(db, [doctor_id], date_start, date_end)
    m = metrics[doctor_id]
    m["new_patients"] = max(0, m["patients_seen"] - m["returning_patients"])

    hospital_names = {doctor.hospital_id: None}
    if doctor.hospital_id:
        hosp = await db.get(Hospital, doctor.hospital_id)
        hospital_names[doctor.hospital_id] = hosp.name if hosp else None
    group_names = {doctor.admin_group_id: None}
    if doctor.admin_group_id:
        grp = await db.get(AdminGroup, doctor.admin_group_id)
        group_names[doctor.admin_group_id] = grp.name if grp else None

    row = _doctor_row(doctor, m, hospital_names, group_names)

    case_ids = [r[0] for r in (await db.execute(select(Case.id).where(Case.doctor_id == doctor_id))).all()]
    now = datetime.now(timezone.utc)
    trend_start = (now - timedelta(days=365)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    revenue_trend = []
    if case_ids:
        rows = (await db.execute(
            select(_trend_group_expr(Billing.updated_at, 365).label("month"),
                   func.sum(Billing.paid_amount).label("revenue"))
            .where(Billing.updated_at >= trend_start, Billing.updated_at <= now,
                   Billing.case_id.in_(case_ids))
            .group_by(text("month")).order_by(text("month"))
        )).all()
        revenue_trend = [{"month": r[0], "revenue": float(r[1] or 0)} for r in rows]

    appointment_trend = []
    rows = (await db.execute(
        select(_trend_group_expr(Appointment.appointment_date, 365).label("month"),
               func.count(Appointment.id).label("n"))
        .where(Appointment.doctor_id == doctor_id, Appointment.is_active == True,
               Appointment.appointment_date >= trend_start.date(),
               Appointment.appointment_date <= now.date())
        .group_by(text("month")).order_by(text("month"))
    )).all()
    appointment_trend = [{"month": r[0], "n": r[1] or 0} for r in rows]

    treatment_breakdown = []
    if case_ids:
        rows = (await db.execute(
            select(TreatmentPlan.treatment_name, func.count(TreatmentPlan.id).label("cnt"))
            .where(TreatmentPlan.case_id.in_(case_ids))
            .group_by(TreatmentPlan.treatment_name)
            .order_by(text("cnt DESC"))
            .limit(6)
        )).all()
        treatment_breakdown = [{"name": r[0], "value": r[1] or 0} for r in rows]

    recent_appointments = []
    rows = (await db.execute(
        select(Appointment, Patient.full_name)
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(Appointment.doctor_id == doctor_id, Appointment.is_active == True)
        .order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc())
        .limit(5)
    )).all()
    for appt, patient_name in rows:
        recent_appointments.append({
            "id": appt.id,
            "appointment_number": appt.appointment_number,
            "patient_name": patient_name,
            "appointment_date": appt.appointment_date.isoformat(),
            "appointment_time": appt.appointment_time.strftime("%H:%M"),
            "status": appt.status.value if hasattr(appt.status, "value") else appt.status,
            "appointment_type": appt.appointment_type.value if hasattr(appt.appointment_type, "value") else appt.appointment_type,
        })

    return {
        "id": doctor.id,
        "name": doctor.full_name,
        "email": doctor.email,
        "phone": doctor.phone,
        "qualification": doctor.qualification,
        "specialization": doctor.specialization,
        "license_number": doctor.license_number,
        "designation": row["designation"],
        "department": row["department"],
        "hospital_id": doctor.hospital_id,
        "hospital_name": hospital_names.get(doctor.hospital_id),
        "admin_group_id": doctor.admin_group_id,
        "admin_group_name": group_names.get(doctor.admin_group_id),
        "period": period,
        "metrics": row,
        "summary": _summary_payload(summary, 1),
        "revenue_trend": revenue_trend,
        "appointment_trend": appointment_trend,
        "treatment_breakdown": treatment_breakdown,
        "recent_appointments": recent_appointments,
    }
