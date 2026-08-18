"""Doctor Performance & Clinical Productivity analytics.

Role-scoped, read-only analytics aggregated directly from the operational
models (appointments, cases, treatment plans, sittings, billing, follow-ups,
patient feedback). Everything is derived from existing ERP data — there is no
manual data entry.

Scope rules:
    SUPER_ADMIN     -> every doctor (optional group_id / X-Hospital-ID filter)
    GROUP_ADMIN     -> doctors in the caller's admin group (X-Hospital-ID may
                       narrow the view to one hospital of the group)
    HOSPITAL_ADMIN  -> doctors in the caller's own hospital or the same admin
                       group; metrics (cases, treatments, revenue, outstanding,
                       etc.) are scoped to the caller's own hospital only
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
from app.models.consent_form import ConsentForm
from app.models.doctor_hospital import DoctorHospital
from app.models.feedback import PatientFeedback
from app.models.follow_up import FollowUp
from app.models.hospital import Hospital
from app.models.patient import Patient
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_sitting import TreatmentSitting, TreatmentSittingStatus
from app.models.user import User
from app.routers.dashboards.helpers import _trend_group_expr
from app.utils.dashboard_helpers import get_date_range, get_previous_date_range

router = APIRouter(prefix="/doctor-performance", tags=["Doctor Performance"])

ACTIVE_CASE_STATUSES = [
    CaseStatus.OPEN.value, CaseStatus.IN_PROGRESS.value, CaseStatus.ON_HOLD.value,
]
ACTIVE_PLAN_STATUSES = [
    TreatmentPlanStatus.GENERATED.value, TreatmentPlanStatus.ASSIGNED.value,
    TreatmentPlanStatus.SCHEDULED.value, TreatmentPlanStatus.IN_PROGRESS.value,
    TreatmentPlanStatus.WAITING_PATIENT.value, TreatmentPlanStatus.WAITING_LAB.value,
    TreatmentPlanStatus.ON_HOLD.value, TreatmentPlanStatus.OVERDUE.value,
]

_METRIC_KEYS = [
    "appointments_total", "appointments_completed", "appointments_cancelled",
    "appointments_rescheduled", "patients_seen", "returning_patients",
    "cases_created", "cases_completed_period", "active_cases",
    "plans_created", "treatments_completed", "treatments_active",
    "sittings_completed", "revenue", "followups_completed", "followups_lost",
    "rating_sum", "rating_count",
    "no_shows", "outstanding_amount", "cases_with_reports",
]


def _pct(part: float, whole: float) -> float:
    if whole <= 0:
        return 0.0
    return round(min(100.0, (part / whole * 100)), 1)


def _empty_metrics(doctor_ids: list[str]) -> dict[str, dict]:
    return {did: {key: 0 for key in _METRIC_KEYS} for did in doctor_ids}


def _hospital_cond(hospital_scope: Optional[str]) -> list:
    """Extra WHERE conditions to scope analytics to one hospital (by patient)."""
    return [Patient.hospital_id == hospital_scope] if hospital_scope else []


def _hospital_scope_for_user(current_user: dict) -> Optional[str]:
    """Hospital id that restricts metric aggregation for the current user.

    HOSPITAL_ADMINs see group-wide doctors but only their own hospital's data;
    every other role aggregates across the full doctor scope.
    """
    if current_user.get("role") == Role.HOSPITAL_ADMIN.value:
        return current_user.get("hospital_id")
    return None


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
        hosp_id = current_user.get("hospital_id")
        grp_id = current_user.get("admin_group_id")
        if grp_id:
            # Hospital admins see doctors in their own hospital OR anywhere
            # in the same admin group (multi-hospital group management).
            query = select(User).where(
                User.role == Role.DOCTOR.value,
                (User.hospital_id == hosp_id) | (User.admin_group_id == grp_id),
            )
        else:
            query = select(User).where(
                User.role == Role.DOCTOR.value,
                User.hospital_id == hosp_id,
            )
    elif role == Role.DOCTOR.value:
        query = select(User).where(
            User.id == current_user.get("sub"),
            User.role == Role.DOCTOR.value,
        )
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    result = await db.execute(query.order_by(User.full_name))
    doctors = list(result.scalars().all())

    if x_hospital_id and doctors:
        # Per-hospital activation: when a specific hospital context is active,
        # only doctors with an ACTIVE membership in that hospital are in scope.
        # Doctors without an explicit membership row for the context hospital
        # fall back to their primary hospital (legacy/backfill parity).
        member_rows = (await db.execute(
            select(DoctorHospital.user_id, DoctorHospital.hospital_id, DoctorHospital.is_active)
            .where(DoctorHospital.user_id.in_([d.id for d in doctors]))
        )).all()
        member_map: dict[str, dict[str, bool]] = {}
        for uid, hid, active in member_rows:
            member_map.setdefault(uid, {})[hid] = bool(active)

        def _active_at(d: User) -> bool:
            m = member_map.get(d.id)
            if m and x_hospital_id in m:
                return m[x_hospital_id]
            return d.hospital_id == x_hospital_id

        doctors = [d for d in doctors if _active_at(d)]
    return doctors


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
    if role == Role.HOSPITAL_ADMIN.value:
        hosp_id = current_user.get("hospital_id")
        grp_id = current_user.get("admin_group_id")
        if doctor.hospital_id != hosp_id and (not grp_id or doctor.admin_group_id != grp_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return doctor


async def _collect(db: AsyncSession, doctor_ids: list[str],
                   date_start: datetime, date_end: datetime,
                   hospital_scope: Optional[str] = None) -> tuple[dict[str, dict], dict]:
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
        )
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.is_active == True,
            Appointment.appointment_date >= date_start.date(),
            Appointment.appointment_date < date_end.date(),
            *_hospital_cond(hospital_scope),
        ).group_by(Appointment.doctor_id)
    )).all()
    for row in rows:
        m = metrics[row[0]]
        m["appointments_total"] += row[1] or 0
        m["appointments_completed"] += row[2] or 0
        m["appointments_cancelled"] += row[3] or 0
        m["appointments_rescheduled"] += row[4] or 0

    # Patients seen in period (distinct, excluding cancelled/no-show
    # appointments so a cancelled visit never counts as "seen").
    rows = (await db.execute(
        select(Appointment.doctor_id, func.count(func.distinct(Appointment.patient_id)))
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.is_active == True,
            Appointment.appointment_date >= date_start.date(),
            Appointment.appointment_date < date_end.date(),
            Appointment.status.notin_([AppointmentStatus.CANCELLED.value]),
            *_hospital_cond(hospital_scope),
        ).group_by(Appointment.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["patients_seen"] += row[1] or 0

    # Cases created in period
    rows = (await db.execute(
        select(
            Case.doctor_id,
            func.count(Case.id),
        )
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            Case.doctor_id.in_(doctor_ids),
            Case.created_at >= date_start,
            Case.created_at < date_end,
            *_hospital_cond(hospital_scope),
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
        )
        .join(Patient, Patient.id == Case.patient_id)
        .where(Case.doctor_id.in_(doctor_ids), *_hospital_cond(hospital_scope))
        .group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["active_cases"] += row[1] or 0

    # Cases completed in period
    rows = (await db.execute(
        select(Case.doctor_id, func.count(Case.id))
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            Case.doctor_id.in_(doctor_ids),
            Case.status == CaseStatus.COMPLETED.value,
            Case.completion_date >= date_start,
            Case.completion_date < date_end,
            *_hospital_cond(hospital_scope),
        ).group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["cases_completed_period"] += row[1] or 0

    # Treatment plans created / completed in period, active snapshot
    rows = (await db.execute(
        select(TreatmentPlan.assigned_doctor_id, func.count(TreatmentPlan.id))
        .join(Case, Case.id == TreatmentPlan.case_id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            TreatmentPlan.created_at >= date_start,
            TreatmentPlan.created_at < date_end,
            *_hospital_cond(hospital_scope),
        ).group_by(TreatmentPlan.assigned_doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["plans_created"] += row[1] or 0

    rows = (await db.execute(
        select(TreatmentPlan.assigned_doctor_id, func.count(TreatmentPlan.id))
        .join(Case, Case.id == TreatmentPlan.case_id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value,
            TreatmentPlan.completed_at >= date_start,
            TreatmentPlan.completed_at < date_end,
            *_hospital_cond(hospital_scope),
        ).group_by(TreatmentPlan.assigned_doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["treatments_completed"] += row[1] or 0

    rows = (await db.execute(
        select(TreatmentPlan.assigned_doctor_id, func.count(TreatmentPlan.id))
        .join(Case, Case.id == TreatmentPlan.case_id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            TreatmentPlan.status.in_(ACTIVE_PLAN_STATUSES),
            *_hospital_cond(hospital_scope),
        ).group_by(TreatmentPlan.assigned_doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["treatments_active"] += row[1] or 0

    # Sittings completed in period
    rows = (await db.execute(
        select(TreatmentSitting.doctor_id, func.count(TreatmentSitting.id))
        .join(TreatmentPlan, TreatmentPlan.id == TreatmentSitting.treatment_plan_id)
        .join(Case, Case.id == TreatmentPlan.case_id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            TreatmentSitting.doctor_id.in_(doctor_ids),
            TreatmentSitting.status == TreatmentSittingStatus.COMPLETED.value,
            TreatmentSitting.sitting_date >= date_start.date(),
            TreatmentSitting.sitting_date < date_end.date(),
            *_hospital_cond(hospital_scope),
        ).group_by(TreatmentSitting.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["sittings_completed"] += row[1] or 0

    # Revenue (sum of payments recorded in period on the doctor's cases)
    rows = (await db.execute(
        select(Case.doctor_id, func.sum(Billing.paid_amount))
        .select_from(Case)
        .join(Billing, Billing.case_id == Case.id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            Case.doctor_id.in_(doctor_ids),
            Billing.updated_at >= date_start,
            Billing.updated_at < date_end,
            *_hospital_cond(hospital_scope),
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
        )
        .join(Patient, Patient.id == FollowUp.patient_id)
        .where(
            FollowUp.doctor_id.in_(doctor_ids),
            FollowUp.created_at >= date_start,
            FollowUp.created_at < date_end,
            *_hospital_cond(hospital_scope),
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
            *_hospital_cond(hospital_scope),
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
        .join(Patient, Patient.id == seen.patient_id)
        .where(
            seen.doctor_id.in_(doctor_ids),
            prior.doctor_id.in_(doctor_ids),
            seen.is_active == True,
            prior.is_active == True,
            seen.status.notin_([AppointmentStatus.CANCELLED.value]),
            seen.appointment_date >= date_start.date(),
            seen.appointment_date < date_end.date(),
            prior.appointment_date < date_start.date(),
            *_hospital_cond(hospital_scope),
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
            *_hospital_cond(hospital_scope),
        )
    )).scalar()
    summary["rating_avg"] = round(float(scope_rating), 2) if scope_rating is not None else None

    # Scope-wide distinct patients seen in the period.
    summary["patients_seen"] = (await db.execute(
        select(func.count(func.distinct(Appointment.patient_id)))
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.is_active == True,
            Appointment.appointment_date >= date_start.date(),
            Appointment.appointment_date < date_end.date(),
            Appointment.status.notin_([AppointmentStatus.CANCELLED.value]),
            *_hospital_cond(hospital_scope),
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
        .join(Patient, Patient.id == seen.patient_id)
        .where(
            seen.doctor_id.in_(doctor_ids),
            prior.doctor_id.in_(doctor_ids),
            seen.is_active == True,
            prior.is_active == True,
            seen.status.notin_([AppointmentStatus.CANCELLED.value]),
            seen.appointment_date >= date_start.date(),
            seen.appointment_date < date_end.date(),
            prior.appointment_date < date_start.date(),
            *_hospital_cond(hospital_scope),
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

    # Treatment type breakdown (per-doctor + scope-wide)
    rows = (await db.execute(
        select(
            TreatmentPlan.assigned_doctor_id,
            TreatmentPlan.treatment_name,
            func.count(TreatmentPlan.id),
        )
        .join(Case, Case.id == TreatmentPlan.case_id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            *_hospital_cond(hospital_scope),
        ).group_by(TreatmentPlan.assigned_doctor_id, TreatmentPlan.treatment_name)
    )).all()
    per_doctor_treatments: dict[str, dict[str, int]] = {did: {} for did in doctor_ids}
    scope_treatments: dict[str, int] = {}
    for doc_id, tname, cnt in rows:
        if tname:
            per_doctor_treatments[doc_id][tname] = cnt or 0
            scope_treatments[tname] = scope_treatments.get(tname, 0) + (cnt or 0)

    summary["treatment_breakdown"] = [
        {"name": name, "value": cnt}
        for name, cnt in sorted(scope_treatments.items(), key=lambda x: -x[1])
    ]

    # Attach per-doctor treatment breakdowns to metrics
    for did in doctor_ids:
        metrics[did]["treatment_breakdown"] = per_doctor_treatments[did]

    # --- New metrics: no_shows, outstanding, case reports, treatment analytics ---

    # No shows: cancelled appointments where cancelled_by_id IS NULL
    rows = (await db.execute(
        select(Appointment.doctor_id, func.count(Appointment.id))
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(
            Appointment.doctor_id.in_(doctor_ids),
            Appointment.status == AppointmentStatus.CANCELLED.value,
            Appointment.cancelled_by_id.is_(None),
            Appointment.is_active == True,
            Appointment.appointment_date >= date_start.date(),
            Appointment.appointment_date < date_end.date(),
            *_hospital_cond(hospital_scope),
        ).group_by(Appointment.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["no_shows"] = row[1] or 0

    # Outstanding amount (all-time per doctor across their cases)
    rows = (await db.execute(
        select(
            Case.doctor_id,
            func.coalesce(func.sum(Billing.pending_amount), 0),
        )
        .select_from(Case)
        .join(Billing, Billing.case_id == Case.id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            Case.doctor_id.in_(doctor_ids),
            Billing.payment_status.in_(["PARTIAL", "OVERDUE"]),
            *_hospital_cond(hospital_scope),
        ).group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["outstanding_amount"] = float(row[1] or 0)

    # Cases with clinical reports (diagnosis or findings filled)
    rows = (await db.execute(
        select(Case.doctor_id, func.count(Case.id))
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            Case.doctor_id.in_(doctor_ids),
            Case.created_at >= date_start,
            Case.created_at < date_end,
            ((Case.clinical_findings_summary.isnot(None)) & (Case.clinical_findings_summary != "")) |
            ((Case.final_diagnosis.isnot(None)) & (Case.final_diagnosis != "")),
            *_hospital_cond(hospital_scope),
        ).group_by(Case.doctor_id)
    )).all()
    for row in rows:
        metrics[row[0]]["cases_with_reports"] = row[1] or 0

    # Treatment analytics (per doctor: name, count, cost, paid, completed)
    treatment_analytics_data: dict[str, list[dict]] = {did: [] for did in doctor_ids}
    rows = (await db.execute(
        select(
            TreatmentPlan.assigned_doctor_id,
            TreatmentPlan.treatment_name,
            func.count(TreatmentPlan.id),
            func.coalesce(func.sum(TreatmentPlan.cost), 0),
            func.coalesce(func.sum(TreatmentPlan.paid_amount), 0),
            func.sum(sql_case(
                (TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value, 1), else_=0
            )),
        )
        .join(Case, Case.id == TreatmentPlan.case_id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            TreatmentPlan.assigned_doctor_id.in_(doctor_ids),
            TreatmentPlan.treatment_name.isnot(None),
            TreatmentPlan.treatment_name != "",
            *_hospital_cond(hospital_scope),
        ).group_by(TreatmentPlan.assigned_doctor_id, TreatmentPlan.treatment_name)
    )).all()
    for doc_id, tname, cnt, total_cost, total_paid, completed in rows:
        entry = {
            "name": tname,
            "count": cnt or 0,
            "total_cost": float(total_cost or 0),
            "total_paid": float(total_paid or 0),
            "completed": completed or 0,
            "completion_rate": _pct(completed or 0, cnt or 0),
        }
        treatment_analytics_data[doc_id].append(entry)
    # Sort each doctor's analytics by count desc
    for did in doctor_ids:
        treatment_analytics_data[did].sort(key=lambda x: -x["count"])
        metrics[did]["treatment_analytics"] = treatment_analytics_data[did]
        metrics[did]["individual_treatments"] = metrics[did]["sittings_completed"]

    # Scope-wide treatment analytics
    scope_ta_rows = (await db.execute(
        select(
            TreatmentPlan.treatment_name,
            func.count(TreatmentPlan.id),
            func.coalesce(func.sum(TreatmentPlan.cost), 0),
            func.coalesce(func.sum(TreatmentPlan.paid_amount), 0),
            func.sum(sql_case(
                (TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value, 1), else_=0
            )),
        )
        .join(Case, Case.id == TreatmentPlan.case_id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(
            TreatmentPlan.treatment_name.isnot(None),
            TreatmentPlan.treatment_name != "",
            *_hospital_cond(hospital_scope),
        ).group_by(TreatmentPlan.treatment_name)
    )).all()
    scope_treatment_analytics = []
    for tname, cnt, total_cost, total_paid, completed in scope_ta_rows:
        scope_treatment_analytics.append({
            "name": tname,
            "count": cnt or 0,
            "total_cost": float(total_cost or 0),
            "total_paid": float(total_paid or 0),
            "completed": completed or 0,
            "completion_rate": _pct(completed or 0, cnt or 0),
        })
    scope_treatment_analytics.sort(key=lambda x: -x["count"])
    summary["treatment_analytics"] = scope_treatment_analytics

    # Aggregate new metrics into summary
    for did in doctor_ids:
        m = metrics[did]
        summary["no_shows"] = summary.get("no_shows", 0) + m["no_shows"]
        summary["outstanding_amount"] = summary.get("outstanding_amount", 0.0) + m["outstanding_amount"]
        summary["cases_with_reports"] = summary.get("cases_with_reports", 0) + m["cases_with_reports"]

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
        "is_active": doctor.is_active,
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
        "treatment_breakdown": m.get("treatment_breakdown", []),
        "no_shows": m.get("no_shows", 0),
        "outstanding_amount": round(m.get("outstanding_amount", 0), 2),
        "cases_with_reports": m.get("cases_with_reports", 0),
        "individual_treatments": m.get("individual_treatments", m.get("sittings_completed", 0)),
        "treatment_analytics": m.get("treatment_analytics", []),
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
        "no_shows": summary.get("no_shows", 0),
        "outstanding_amount": round(summary.get("outstanding_amount", 0), 2),
        "cases_with_reports": summary.get("cases_with_reports", 0),
    }


def _delta(current: float, previous: float) -> float:
    if previous > 0:
        return round(((current - previous) / previous * 100), 1)
    return 100.0 if current > 0 else 0.0


_SORTABLE_KEYS = {
    "name", "revenue", "patients_seen", "appointments_completed",
    "cases_created", "cases_completed", "treatments_completed",
    "sittings_completed", "attendance_rate", "retention_rate",
    "case_completion_rate", "treatment_completion_rate",
    "avg_rating", "no_shows", "outstanding_amount", "cases_with_reports",
}


def _filter_sort_paginate(doctor_rows: list[dict], search: Optional[str],
                          department: Optional[str], sort_by: str,
                          sort_order: str, page: int, page_size: int) -> list[dict]:
    if search:
        term = search.strip().lower()
        doctor_rows = [r for r in doctor_rows if (
            term in (r.get("name") or "").lower()
            or term in (r.get("email") or "").lower()
            or term in (r.get("designation") or "").lower()
            or term in (r.get("specialization") or "").lower()
        )]
    if department:
        term = department.strip().lower()
        doctor_rows = [r for r in doctor_rows if term in (r.get("department") or "").lower()]

    key = sort_by if sort_by in _SORTABLE_KEYS else "revenue"
    reverse = sort_order.lower() != "asc"

    def _sort_key(r: dict):
        v = r.get(key)
        return (v if isinstance(v, (int, float)) else 0)

    doctor_rows.sort(key=_sort_key, reverse=reverse)
    start = (page - 1) * page_size
    return doctor_rows[start:start + page_size]


@router.get("")
async def doctor_performance_overview(
    period: str = Query("this_month", description="today, yesterday, last_7_days, last_30_days, this_week, last_week, this_month, last_month, this_quarter, last_quarter, this_year, last_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom range start (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom range end (YYYY-MM-DD)"),
    group_id: Optional[str] = Query(None, description="Filter to an admin group (SUPER_ADMIN only)"),
    search: Optional[str] = Query(None, description="Free-text search on name / email / designation"),
    department: Optional[str] = Query(None, description="Filter by specialization / department"),
    sort_by: str = Query("revenue", description="Column to sort by"),
    sort_order: str = Query("desc", description="asc or desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    x_hospital_id: Optional[str] = Header(None, alias="X-Hospital-ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    doctors = await _doctors_in_scope(db, current_user, x_hospital_id, group_id)
    doctors = [d for d in doctors if d.is_active]
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
            "total_doctors": 0,
            "page": page, "page_size": page_size,
            "departments": [],
            "treatment_breakdown": empty_summary.get("treatment_breakdown", []),
        }

    date_start, date_end = get_date_range(period, start_date, end_date)
    prev_start, prev_end = get_previous_date_range(period, start_date, end_date)

    doctor_ids = [d.id for d in doctors]
    hospital_scope = _hospital_scope_for_user(current_user)
    metrics, summary = await _collect(db, doctor_ids, date_start, date_end, hospital_scope)
    _, prev_summary = await _collect(db, doctor_ids, prev_start, prev_end, hospital_scope)

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

    total_doctors = len(doctor_rows)
    doctor_rows = _filter_sort_paginate(
        doctor_rows, search, department, sort_by, sort_order, page, page_size
    )

    departments = sorted({d.specialization for d in doctors if d.specialization})

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
        "total_doctors": total_doctors,
        "page": page,
        "page_size": page_size,
        "departments": departments,
        "treatment_breakdown": summary.get("treatment_breakdown", []),
        "treatment_analytics": summary.get("treatment_analytics", []),
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
    hospital_scope = _hospital_scope_for_user(current_user)
    metrics, summary = await _collect(db, [doctor_id], date_start, date_end, hospital_scope)
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

    case_ids = [r[0] for r in (await db.execute(
        select(Case.id)
        .join(Patient, Patient.id == Case.patient_id)
        .where(Case.doctor_id == doctor_id, *_hospital_cond(hospital_scope))
    )).all()]
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
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(Appointment.doctor_id == doctor_id, Appointment.is_active == True,
               Appointment.appointment_date >= trend_start.date(),
               Appointment.appointment_date <= now.date(),
               *_hospital_cond(hospital_scope))
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
        )).all()
        treatment_breakdown = [{"name": r[0], "value": r[1] or 0} for r in rows]

    recent_appointments = []
    rows = (await db.execute(
        select(Appointment, Patient.full_name)
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(Appointment.doctor_id == doctor_id, Appointment.is_active == True,
               *_hospital_cond(hospital_scope))
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
        "is_active": doctor.is_active,
        "period": period,
        "metrics": row,
        "summary": _summary_payload(summary, 1),
        "revenue_trend": revenue_trend,
        "appointment_trend": appointment_trend,
        "treatment_breakdown": treatment_breakdown,
        "recent_appointments": recent_appointments,
    }


@router.get("/{doctor_id}/insights")
async def doctor_performance_insights(
    doctor_id: str,
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    x_hospital_id: Optional[str] = Header(None, alias="X-Hospital-ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    doctor = await _verify_doctor_scope(db, current_user, doctor_id)
    doctor_name = doctor.full_name or "This doctor"

    date_start, date_end = get_date_range(period, start_date, end_date)
    prev_start, prev_end = get_previous_date_range(period, start_date, end_date)

    hospital_scope = _hospital_scope_for_user(current_user)
    metrics, summary = await _collect(db, [doctor_id], date_start, date_end, hospital_scope)
    prev_metrics, _ = await _collect(db, [doctor_id], prev_start, prev_end, hospital_scope)

    m = metrics[doctor_id]
    m["new_patients"] = max(0, m["patients_seen"] - m["returning_patients"])
    prev_m = prev_metrics[doctor_id]
    prev_m["new_patients"] = max(0, prev_m["patients_seen"] - prev_m["returning_patients"])

    insights: list[dict] = []

    attendance_den = m["appointments_completed"] + m["appointments_cancelled"] + m["appointments_rescheduled"]

    # Volume insight
    if m["treatments_completed"] > 0 or prev_m["treatments_completed"] > 0:
        pct = _delta(m["treatments_completed"], prev_m["treatments_completed"])
        if pct > 0:
            insights.append({"type": "positive", "text": f"{doctor_name} completed {m['treatments_completed']} treatments this period, {pct:.0f}% higher than the previous period."})
        elif pct < 0:
            insights.append({"type": "warning", "text": f"{doctor_name} completed {m['treatments_completed']} treatments this period, {abs(pct):.0f}% lower than the previous period."})
        elif m["treatments_completed"] > 0:
            insights.append({"type": "neutral", "text": f"{doctor_name} completed {m['treatments_completed']} treatments this period, consistent with the previous period."})

    # Top treatment
    if m.get("treatment_analytics"):
        top = m["treatment_analytics"][0]
        pct = _pct(top["count"], m["plans_created"])
        insights.append({"type": "info", "text": f"{top['name']} is the most performed treatment ({top['count']} procedures, {pct:.0f}% of all plans)."})

    # Attendance rate
    if attendance_den > 0:
        rate = _pct(m["appointments_completed"], attendance_den)
        if rate >= 90:
            insights.append({"type": "positive", "text": f"Appointment attendance rate is {rate}%, indicating {'excellent' if rate >= 95 else 'good'} patient engagement."})
        elif rate >= 70:
            insights.append({"type": "warning", "text": f"Appointment attendance rate is {rate}%. {attendance_den - m['appointments_completed']} appointments were missed or cancelled."})
        else:
            insights.append({"type": "warning", "text": f"Appointment attendance rate is low at {rate}%. Consider reviewing scheduling practices."})

    # Case completion
    if m["cases_created"] > 0:
        rate = _pct(m["cases_completed_period"], m["cases_created"])
        insights.append({"type": "positive" if rate >= 80 else "warning", "text": f"Case completion rate is {rate}% ({m['cases_completed_period']}/{m['cases_created']} cases completed this period)."})

    # Revenue trend
    if prev_m["revenue"] > 0:
        rev_pct = _delta(m["revenue"], prev_m["revenue"])
        if rev_pct > 0:
            insights.append({"type": "positive", "text": f"Revenue increased by {rev_pct:.0f}% compared to the previous period (\u20b9{m['revenue']:,.0f} vs \u20b9{prev_m['revenue']:,.0f})."})
        elif rev_pct < -10:
            insights.append({"type": "warning", "text": f"Revenue decreased by {abs(rev_pct):.0f}% compared to the previous period."})
    elif m["revenue"] > 0:
        insights.append({"type": "positive", "text": f"Generated \u20b9{m['revenue']:,.0f} in revenue this period."})

    # Outstanding
    if m.get("outstanding_amount", 0) > 0:
        insights.append({"type": "warning", "text": f"Outstanding amount of \u20b9{m['outstanding_amount']:,.0f} is pending across this doctor's cases."})

    # Rating
    if m["rating_count"] > 0:
        avg = m["rating_sum"] / m["rating_count"]
        insights.append({"type": "positive" if avg >= 4.0 else "info", "text": f"Average patient rating is {avg:.1f}/5 based on {m['rating_count']} feedback{'s' if m['rating_count'] != 1 else ''}."})

    # New vs returning
    if m["patients_seen"] > 0:
        ret_pct = _pct(m["returning_patients"], m["patients_seen"])
        insights.append({"type": "positive" if ret_pct >= 30 else "info", "text": f"Patient retention rate is {ret_pct}% ({m['returning_patients']} returning out of {m['patients_seen']} patients seen)."})

    # No shows
    if m.get("no_shows", 0) > 0:
        insights.append({"type": "warning", "text": f"{m['no_shows']} appointment{'s' if m['no_shows'] != 1 else ''} marked as no-show this period."})

    # Case reports
    if m.get("cases_with_reports", 0) > 0 and m["cases_created"] > 0:
        report_pct = _pct(m["cases_with_reports"], m["cases_created"])
        insights.append({"type": "info", "text": f"{report_pct}% of cases ({m['cases_with_reports']}/{m['cases_created']}) have clinical documentation completed."})

    return {"doctor_id": doctor_id, "period": period, "insights": insights}
