from datetime import datetime, date, timezone
from typing import Optional
import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, or_
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Role
from app.models.hospital import Hospital
from app.models.patient import Patient
from app.models.case import Case, CaseStatus
from app.models.appointment import Appointment, AppointmentStatus
from app.models.follow_up import FollowUp, FollowUpStatus
from app.models.billing import Billing
from app.models.treatment_plan import TreatmentPlan
from app.models.user import User
from app.routers.dashboards.helpers import (
    get_date_range, get_previous_date_range, calculate_revenue, calculate_revenue_for_range,
    _monthly_revenue_trend, _monthly_case_trend,
    _appointment_trend, _appointment_heatmap,
    _treatment_category_breakdown, _lead_source_breakdown,
    _payment_method_breakdown, _gender_distribution, _age_group_distribution,
)

router = APIRouter()


@router.get("/doctor")
async def doctor_dashboard(
    period: str = Query("this_month", description="today, yesterday, last_7_days, last_30_days, this_month, last_month, this_quarter, last_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom range start (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom range end (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != Role.DOCTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    doctor_id = current_user.get("sub")

    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    period_start, period_end = get_date_range(period, start_date, end_date)

    my_patients = (await db.execute(
        select(func.count(func.distinct(Patient.id))).where(
            or_(
                Patient.doctor_id == doctor_id,
                Patient.id.in_(select(Appointment.patient_id).where(Appointment.doctor_id == doctor_id, Appointment.is_active == True)),
                Patient.id.in_(select(Case.patient_id).where(Case.doctor_id == doctor_id)),
            )
        )
    )).scalar() or 0

    today = date.today()
    today_appointments = (await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date == today,
            Appointment.is_active == True,
            Appointment.status.notin_([AppointmentStatus.CANCELLED.value]),
        )
    )).scalar() or 0

    # --- Today's appointments list (for Doctor dashboard) ---
    today_appt_list = []
    appt_q = (
        select(
            Appointment.id, Appointment.appointment_time, Appointment.status,
            Appointment.notes, Patient.full_name.label("patient_name"),
            Case.chief_complaint.label("chief_complaint"),
        )
        .join(Patient, Appointment.patient_id == Patient.id)
        .outerjoin(Case, Case.appointment_id == Appointment.id)
        .where(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date == today,
            Appointment.is_active == True,
        )
        .order_by(Appointment.appointment_time)
    )
    for row in (await db.execute(appt_q)).all():
        today_appt_list.append({
            "id": row[0],
            "time": str(row[1])[:5] if row[1] else "",
            "status": row[2].value if hasattr(row[2], 'value') else str(row[2]),
            "notes": row[3] or "",
            "patient_name": row[4] or "",
            "chief_complaint": row[5] or "",
        })

    my_cases_r = await db.execute(select(Case).where(Case.doctor_id == doctor_id))
    my_cases = my_cases_r.scalars().all()

    active_statuses = {CaseStatus.IN_PROGRESS, CaseStatus.OPEN, CaseStatus.ON_HOLD}
    active_cases = [c for c in my_cases if c.status in active_statuses]
    completed_cases = [c for c in my_cases if c.status == CaseStatus.COMPLETED]

    my_case_ids = {c.id for c in my_cases}

    personal_revenue = 0.0
    monthly_revenue = 0.0
    yearly_revenue = 0.0
    if my_case_ids:
        personal_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(my_case_ids))
        )).scalar() or 0)
        monthly_revenue = await calculate_revenue(db, list(my_case_ids), period="this_month")
        yearly_revenue = await calculate_revenue(db, list(my_case_ids), period="this_year")

    total_follow_ups_count = (await db.execute(
        select(func.count(FollowUp.id)).where(FollowUp.doctor_id == doctor_id)
    )).scalar() or 0
    treatment_success_rate = round((len(completed_cases) / len(my_cases) * 100) if my_cases else 0, 1)
    follow_up_rate = round((total_follow_ups_count / len(my_cases) * 100) if my_cases else 0, 1)

    # Follow-Up specific stats
    upcoming_follow_ups = (await db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.doctor_id == doctor_id,
            FollowUp.status == FollowUpStatus.PENDING.value,
            FollowUp.follow_up_date >= today,
        )
    )).scalar() or 0
    completed_follow_ups = (await db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.doctor_id == doctor_id,
            FollowUp.status == FollowUpStatus.COMPLETED.value,
        )
    )).scalar() or 0
    missed_follow_ups = (await db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.doctor_id == doctor_id,
            FollowUp.status == FollowUpStatus.LOST.value,
        )
    )).scalar() or 0
    follow_up_success_rate = round(
        completed_follow_ups / (completed_follow_ups + missed_follow_ups) * 100
    ) if (completed_follow_ups + missed_follow_ups) > 0 else 0

    # Revenue trend (respect period filter)
    revenue_trend = await _monthly_revenue_trend(db, list(my_case_ids) if my_case_ids else [], date_start=period_start, date_end=period_end)

    # Case completion trend (respect period filter)
    case_completion_trend = await _monthly_case_trend(db, list(my_case_ids) if my_case_ids else [], date_start=period_start, date_end=period_end)

    # Treatment trend
    treatment_trend = []
    if my_case_ids:
        tp_r = await db.execute(
            select(TreatmentPlan.treatment_name, func.count(TreatmentPlan.id).label('cnt'))
            .where(TreatmentPlan.case_id.in_(my_case_ids))
            .group_by(TreatmentPlan.treatment_name)
            .order_by(text("cnt DESC"))
            .limit(5)
        )
        for row in tp_r.all():
            treatment_trend.append({"name": row[0], "value": row[1]})

    # Appointment capacity
    max_per_hour = 4
    doctor_hosp_result = await db.execute(select(User.hospital_id, User.admin_group_id).where(User.id == doctor_id))
    dh_row = doctor_hosp_result.one_or_none()
    hospital_id_for_capacity = dh_row[0] if dh_row else None
    admin_group_id_for_capacity = dh_row[1] if dh_row else None
    if not hospital_id_for_capacity and admin_group_id_for_capacity:
        # Doctor has no hospital_id; use any hospital in their admin group for settings
        any_hosp = await db.execute(
            select(Hospital.id).where(Hospital.admin_group_id == admin_group_id_for_capacity).limit(1)
        )
        any_hosp_row = any_hosp.one_or_none()
        hospital_id_for_capacity = any_hosp_row[0] if any_hosp_row else None
    if hospital_id_for_capacity:
        h_set_result = await db.execute(select(Hospital.settings).where(Hospital.id == hospital_id_for_capacity))
        h_set_row = h_set_result.one_or_none()
        if h_set_row and h_set_row[0]:
            try:
                s = json.loads(h_set_row[0])
                max_per_hour = s.get("doctor_max_appointments_per_hour", 4)
            except Exception:
                pass

    today_scheduled = (await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date == today,
            Appointment.is_active == True,
            Appointment.status.notin_([AppointmentStatus.CANCELLED.value]),
        )
    )).scalar() or 0

    # Estimate working hours (9 AM to 6 PM = 9 hours by default)
    working_hours = 9
    total_capacity = max_per_hour * working_hours
    available_capacity = max(0, total_capacity - today_scheduled)
    utilization_pct = round((today_scheduled / total_capacity) * 100) if total_capacity > 0 else 0

    # ---- Period-aware KPIs (respect dashboard filter) ----
    period_start, period_end = get_date_range(period, start_date, end_date)
    prev_start, prev_end = get_previous_date_range(period, start_date, end_date)
    period_revenue = await calculate_revenue_for_range(db, my_case_ids, period_start, period_end)
    prev_period_revenue = await calculate_revenue_for_range(db, my_case_ids, prev_start, prev_end)
    revenue_change = round(((period_revenue - prev_period_revenue) / prev_period_revenue * 100), 1) if prev_period_revenue > 0 else (100.0 if period_revenue > 0 else 0.0)

    patients_seen_period = (await db.execute(
        select(func.count(func.distinct(Appointment.patient_id))).where(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date >= period_start.date(),
            Appointment.appointment_date < period_end.date(),
            Appointment.is_active == True,
            Appointment.status.notin_([AppointmentStatus.CANCELLED.value]),
        )
    )).scalar() or 0

    appointments_period = (await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date >= period_start.date(),
            Appointment.appointment_date < period_end.date(),
            Appointment.is_active == True,
        )
    )).scalar() or 0

    completed_appointments_period = (await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.doctor_id == doctor_id,
            Appointment.appointment_date >= period_start.date(),
            Appointment.appointment_date < period_end.date(),
            Appointment.status == AppointmentStatus.COMPLETED.value,
        )
    )).scalar() or 0

    cases_created_period = 0
    cases_completed_period = 0
    if my_case_ids:
        cases_created_period = (await db.execute(
            select(func.count(Case.id)).where(
                Case.id.in_(my_case_ids),
                Case.created_at >= period_start,
                Case.created_at < period_end,
            )
        )).scalar() or 0
        cases_completed_period = (await db.execute(
            select(func.count(Case.id)).where(
                Case.id.in_(my_case_ids),
                Case.status == CaseStatus.COMPLETED.value,
                Case.completion_date >= period_start,
                Case.completion_date < period_end,
            )
        )).scalar() or 0

    # --- Enterprise BI aggregates (period-scoped to this doctor) ---
    my_case_ids_list = list(my_case_ids) if my_case_ids else None
    appointment_trend = await _appointment_trend(db, doctor_id=doctor_id, date_start=period_start, date_end=period_end)
    appointment_heatmap = await _appointment_heatmap(db, doctor_id=doctor_id, date_start=period_start, date_end=period_end)
    treatment_category_breakdown = await _treatment_category_breakdown(db, case_ids=my_case_ids_list, date_start=period_start, date_end=period_end)
    lead_source_breakdown = await _lead_source_breakdown(db, doctor_id=doctor_id, date_start=period_start, date_end=period_end)
    payment_method_breakdown = await _payment_method_breakdown(db, case_ids=my_case_ids_list, date_start=period_start, date_end=period_end)
    gender_distribution = await _gender_distribution(db, doctor_id=doctor_id, date_start=period_start, date_end=period_end)
    age_group_distribution = await _age_group_distribution(db, doctor_id=doctor_id, date_start=period_start, date_end=period_end)

    return {
        "period": period,
        "my_patients": my_patients,
        "today_appointments": today_appointments,
        "today_appointments_list": today_appt_list,
        "active_cases": len(active_cases),
        "personal_revenue": personal_revenue,
        "cases_completed": len(completed_cases),
        "treatment_success_rate": treatment_success_rate,
        "follow_up_rate": follow_up_rate,
        "pending_follow_ups": total_follow_ups_count,
        "upcoming_follow_ups": upcoming_follow_ups,
        "completed_follow_ups": completed_follow_ups,
        "missed_follow_ups": missed_follow_ups,
        "follow_up_success_rate": follow_up_success_rate,
        "monthly_revenue": monthly_revenue,
        "yearly_revenue": yearly_revenue,
        "revenue_trend": revenue_trend,
        "case_completion_trend": case_completion_trend,
        "treatment_trend": treatment_trend,
        "today_capacity_max_per_hour": max_per_hour,
        "today_capacity_total": total_capacity,
        "today_appointments_scheduled": today_scheduled,
        "today_capacity_available": available_capacity,
        "today_capacity_utilization_pct": utilization_pct,
        "period_revenue": period_revenue,
        "prev_period_revenue": prev_period_revenue,
        "revenue_change": revenue_change,
        "patients_seen_period": patients_seen_period,
        "appointments_period": appointments_period,
        "completed_appointments_period": completed_appointments_period,
        "cases_created_period": cases_created_period,
        "cases_completed_period": cases_completed_period,
        "appointment_trend": appointment_trend,
        "appointment_heatmap": appointment_heatmap,
        "treatment_category_breakdown": treatment_category_breakdown,
        "lead_source_breakdown": lead_source_breakdown,
        "payment_method_breakdown": payment_method_breakdown,
        "gender_distribution": gender_distribution,
        "age_group_distribution": age_group_distribution,
    }
