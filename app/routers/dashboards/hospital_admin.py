"""Hospital Admin dashboard endpoint."""

from datetime import datetime, date, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, extract
from app.database import get_db
from app.dependencies import get_current_user, verify_hospital_context
from app.core.permissions import Role
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus
from app.models.appointment import Appointment, AppointmentStatus
from app.models.follow_up import FollowUp, FollowUpStatus
from app.models.billing import Billing, PaymentStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.models.lead import Lead
from app.utils.dashboard_helpers import (
    get_date_range, get_previous_date_range, calculate_revenue, calculate_revenue_for_range,
    calculate_expenses_for_date_range, calculate_profit, calculate_profit_margin,
    revenue_trend_with_expenses, revenue_by_doctor_for_range, payment_method_breakdown_for_range,
)
from app.routers.dashboards.helpers import (
    _get_patient_ids_for_hospitals, _get_case_ids_for_patients,
    _monthly_revenue_trend, _monthly_patient_trend,
    _monthly_appointment_trend, _monthly_case_trend,
    _appointment_trend, _appointment_heatmap,
    _treatment_category_breakdown, _lead_source_breakdown,
    _payment_method_breakdown, _gender_distribution, _age_group_distribution,
)

router = APIRouter()


async def _get_most_booked_doctors(db: AsyncSession, hospital_id: str, today: date, limit: int = 5):
    from app.models.appointment import Appointment, AppointmentStatus
    excluded = [AppointmentStatus.CANCELLED.value]
    pid_r = await db.execute(select(Patient.id).where(Patient.hospital_id == hospital_id))
    pids = [row[0] for row in pid_r.all()]
    if not pids:
        return []
    r = await db.execute(
        select(
            User.full_name,
            func.count(Appointment.id).label('cnt'),
        )
        .join(User, User.id == Appointment.doctor_id)
        .where(
            Appointment.patient_id.in_(pids),
            Appointment.appointment_date == today,
            ~Appointment.status.in_(excluded),
        )
        .group_by(Appointment.doctor_id, User.full_name)
        .order_by(text('cnt DESC'))
        .limit(limit)
    )
    return [{"doctor_name": row[0], "appointments": row[1]} for row in r.all()]


async def _get_peak_hours(db: AsyncSession, hospital_id: str, today: date, limit: int = 5):
    from app.models.appointment import Appointment, AppointmentStatus
    excluded = [AppointmentStatus.CANCELLED.value]
    pid_r = await db.execute(select(Patient.id).where(Patient.hospital_id == hospital_id))
    pids = [row[0] for row in pid_r.all()]
    if not pids:
        return []
    r = await db.execute(
        select(
            extract('hour', Appointment.appointment_time).label('hour'),
            func.count(Appointment.id).label('cnt'),
        )
        .where(
            Appointment.patient_id.in_(pids),
            Appointment.appointment_date == today,
            ~Appointment.status.in_(excluded),
        )
        .group_by(text('hour'))
        .order_by(text('cnt DESC'))
        .limit(limit)
    )
    return [{"hour": int(row[0]), "appointments": row[1]} for row in r.all()]


@router.get("/hospital-admin")
async def hospital_admin_dashboard(
    period: str = Query("this_month", description="today, yesterday, last_7_days, last_30_days, this_month, last_month, this_quarter, last_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom range start (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom range end (YYYY-MM-DD)"),
    doctor_id: Optional[str] = Query(None, description="Filter by doctor ID"),
    x_hospital_id: Optional[str] = Depends(verify_hospital_context),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role not in (Role.SUPER_ADMIN.value, Role.GROUP_ADMIN.value, Role.HOSPITAL_ADMIN.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    # The validated X-Hospital-ID context takes precedence (SUPER_ADMIN /
    # GROUP_ADMIN must switch into a hospital to view this dashboard); a
    # HOSPITAL_ADMIN falls back to their own hospital.
    hospital_id = x_hospital_id or current_user.get("hospital_id")
    hospital_name = None
    if not hospital_id:
        return {
            "hospital_name": None,
            "today_appointments": 0, "total_revenue": 0.0, "monthly_revenue": 0.0, "yearly_revenue": 0.0,
            "total_patients": 0, "total_cases": 0, "total_active_cases": 0,
            "total_expenses": 0, "net_profit": 0, "profit_margin": 0, "period_revenue": 0,
            "revenue_trend": [], "patient_growth_trend": [], "appointment_count_trend": [], "case_count_trend": [],
            "monthly_growth_trend": [], "doctor_performance": [], "treatment_performance": [],
            "revenue_expense_trend": [], "expense_trend": [], "profit_trend": [],
            "total_pending_billing": 0, "total_follow_ups": 0, "pending_follow_ups": 0,
            "completed_follow_ups": 0, "missed_follow_ups": 0, "expense_breakdown": [],
            "capacity_most_booked_doctors": [], "capacity_peak_hours": [], "comparison": {},
            "today_appointments_list": [], "pending_actions": {"follow_ups": 0, "billings_count": 0, "billings_amount": 0},
            "recent_activity": [], "revenue_sources": [],
            "crm_insights": {"total_leads": 0, "new_leads": 0, "converted_leads": 0, "conversion_rate": 0, "leads_by_source": []},
            "appointment_trend": [], "appointment_heatmap": [],
            "treatment_category_breakdown": [], "lead_source_breakdown": [],
            "payment_method_breakdown": [], "gender_distribution": [],
            "age_group_distribution": [],
            "treatment_kpis": {"active_treatments": 0, "overdue_treatments": 0, "completed_today": 0, "waiting_patient": 0, "waiting_lab": 0, "completed_this_month": 0, "completion_rate": 0.0, "total_treatments": 0},
        }

    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    today = date.today()

    hospital_name = (await db.execute(
        select(Hospital.name).where(Hospital.id == hospital_id)
    )).scalar()

    # Period date range (used by all period-filtered queries)
    date_start, date_end = get_date_range(period, start_date, end_date)
    sd = date_start.date() if hasattr(date_start, 'date') else date_start
    ed = date_end.date() if hasattr(date_end, 'date') else date_end

    # --- Build scoped IDs (respecting doctor_id filter) ---
    if doctor_id:
        # Doctor scope: only patients/cases/appointments for this doctor in this hospital
        patient_ids_r = await db.execute(
            select(Patient.id).where(Patient.hospital_id == hospital_id, Patient.doctor_id == doctor_id)
        )
        patient_ids = [row[0] for row in patient_ids_r.all()]
        case_ids_r = await db.execute(
            select(Case.id).where(Case.patient_id.in_(patient_ids) if patient_ids else Case.id == None, Case.doctor_id == doctor_id)
        )
        case_ids = [row[0] for row in case_ids_r.all()]
    else:
        patient_ids = await _get_patient_ids_for_hospitals(db, [hospital_id])
        case_ids = await _get_case_ids_for_patients(db, patient_ids)

    # --- All-time totals (always hospital-wide, not period-filtered) ---
    total_patients_q = select(func.count(Patient.id)).where(Patient.hospital_id == hospital_id)
    if doctor_id:
        total_patients_q = total_patients_q.where(Patient.doctor_id == doctor_id)
    total_patients = (await db.execute(total_patients_q)).scalar() or 0

    total_cases_q = select(func.count(Case.id)).where(Case.patient_id.in_(patient_ids)) if patient_ids else select(func.count(Case.id)).where(Case.id == None)
    total_cases = (await db.execute(total_cases_q)).scalar() or 0

    active_case_statuses = [s.value for s in CaseStatus if s not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED)]
    total_active_cases = 0
    if case_ids:
        active_q = select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses))
        total_active_cases = (await db.execute(active_q)).scalar() or 0

    # Today's appointments count
    today_appt_q = select(func.count(Appointment.id)).where(
        Appointment.patient_id.in_(patient_ids) if patient_ids else Appointment.id == None,
        Appointment.appointment_date == today,
    )
    if doctor_id:
        today_appt_q = today_appt_q.where(Appointment.doctor_id == doctor_id)
    today_appointments = (await db.execute(today_appt_q)).scalar() or 0

    # --- All-time revenue/expenses ---
    total_revenue = 0.0
    monthly_revenue = 0.0
    yearly_revenue = 0.0
    total_pending_billing = 0.0
    if case_ids:
        total_revenue = float((await db.execute(select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(case_ids)))).scalar() or 0)
        monthly_revenue = await calculate_revenue(db, case_ids, period="this_month")
        yearly_revenue = await calculate_revenue(db, case_ids, period="this_year")
        total_pending_billing = float((await db.execute(select(func.sum(Billing.pending_amount)).where(Billing.case_id.in_(case_ids)))).scalar() or 0)

    # --- Period-filtered financials ---
    period_revenue = await calculate_revenue(db, case_ids, period=period, start_date=start_date, end_date=end_date)
    total_expenses = await calculate_expenses_for_date_range(db, [hospital_id], date_start=date_start, date_end=date_end)
    net_profit = await calculate_profit(period_revenue, total_expenses)
    profit_margin = await calculate_profit_margin(period_revenue, net_profit)

    # Expense breakdown (period-filtered)
    cat_r = await db.execute(
        select(HospitalMonthlyExpense.expense_category, func.coalesce(func.sum(HospitalMonthlyExpense.amount), 0).label("total"))
        .where(HospitalMonthlyExpense.hospital_id == hospital_id, HospitalMonthlyExpense.expense_date >= sd, HospitalMonthlyExpense.expense_date < ed)
        .group_by(HospitalMonthlyExpense.expense_category).order_by(text("total DESC"))
    )
    expense_breakdown = [{"category": row[0], "amount": float(row[1])} for row in cat_r.all()]

    # --- Trend data (PERIOD-FILTERED) ---
    revenue_trend = await _monthly_revenue_trend(db, case_ids if case_ids else [], date_start=date_start, date_end=date_end)
    patient_growth_trend = await _monthly_patient_trend(db, [hospital_id], date_start=date_start, date_end=date_end)
    appointment_count_trend = await _monthly_appointment_trend(db, [hospital_id] if not doctor_id else None, doctor_id=doctor_id, date_start=date_start, date_end=date_end)
    case_count_trend = await _monthly_case_trend(db, case_ids if case_ids else [], date_start=date_start, date_end=date_end)

    # --- Doctor performance (PERIOD-FILTERED) ---
    doctor_performance = []
    if case_ids:
        doctor_rev_map = await revenue_by_doctor_for_range(db, case_ids, date_start, date_end)
        for did, rev in doctor_rev_map.items():
            dname = (await db.execute(select(User.full_name).where(User.id == did))).scalar() or did
            doctor_performance.append({"id": did, "name": dname, "value": rev})
        doctor_performance.sort(key=lambda x: x["value"], reverse=True)

    # --- Treatment performance (PERIOD-FILTERED) ---
    treatment_performance = []
    if case_ids:
        tp_q = (
            select(TreatmentPlan.treatment_name, func.count(TreatmentPlan.id).label('cnt'))
            .where(TreatmentPlan.case_id.in_(case_ids),
                   TreatmentPlan.created_at >= date_start, TreatmentPlan.created_at < date_end)
            .group_by(TreatmentPlan.treatment_name).order_by(text("cnt DESC")).limit(5)
        )
        for row in (await db.execute(tp_q)).all():
            treatment_performance.append({"name": row[0], "value": row[1]})

    # --- Period-over-period comparison ---
    prev_start, prev_end = get_previous_date_range(period, start_date, end_date)

    period_patient_count = (await db.execute(
        select(func.count(Patient.id)).where(Patient.hospital_id == hospital_id, Patient.created_at >= date_start, Patient.created_at < date_end)
    )).scalar() or 0

    period_appointment_count = 0
    if patient_ids:
        appt_date_filter = [Appointment.patient_id.in_(patient_ids), Appointment.appointment_date >= sd, Appointment.appointment_date < ed]
        if doctor_id:
            appt_date_filter.append(Appointment.doctor_id == doctor_id)
        period_appointment_count = (await db.execute(select(func.count(Appointment.id)).where(*appt_date_filter))).scalar() or 0

    period_active_case_count = 0
    if case_ids:
        period_active_case_count = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses), Case.created_at >= date_start, Case.created_at < date_end)
        )).scalar() or 0

    prev_patient_count = (await db.execute(
        select(func.count(Patient.id)).where(Patient.hospital_id == hospital_id, Patient.created_at >= prev_start, Patient.created_at < prev_end)
    )).scalar() or 0

    prev_appointment_count = 0
    if patient_ids:
        prev_appt_filter = [Appointment.patient_id.in_(patient_ids), Appointment.appointment_date >= prev_start.date(), Appointment.appointment_date < prev_end.date()]
        if doctor_id:
            prev_appt_filter.append(Appointment.doctor_id == doctor_id)
        prev_appointment_count = (await db.execute(select(func.count(Appointment.id)).where(*prev_appt_filter))).scalar() or 0

    prev_active_case_count = 0
    if case_ids:
        prev_active_case_count = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses), Case.created_at >= prev_start, Case.created_at < prev_end)
        )).scalar() or 0

    prev_period_revenue = await calculate_revenue_for_range(db, case_ids, prev_start, prev_end)

    def pct_change(current: float, previous: float) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)

    # --- Follow-up stats (PERIOD-FILTERED by due date, not creation date) ---
    # "Due" means the follow-up's scheduled date falls within the period (or is
    # already overdue and still pending). Future-dated recalls (e.g. a 6-month or
    # 12-month recall created this period but due next year) must NOT be counted
    # as due now.
    fu_scope = [FollowUp.hospital_id == hospital_id]
    if doctor_id:
        fu_scope.append(FollowUp.doctor_id == doctor_id)
    total_follow_ups = (await db.execute(select(func.count(FollowUp.id)).where(
        *fu_scope, FollowUp.follow_up_date >= sd, FollowUp.follow_up_date < ed))).scalar() or 0
    pending_follow_ups = (await db.execute(select(func.count(FollowUp.id)).where(
        *fu_scope, FollowUp.status == FollowUpStatus.PENDING.value, FollowUp.follow_up_date < ed))).scalar() or 0
    completed_follow_ups = (await db.execute(select(func.count(FollowUp.id)).where(
        *fu_scope, FollowUp.status == FollowUpStatus.COMPLETED.value, FollowUp.follow_up_date >= sd, FollowUp.follow_up_date < ed))).scalar() or 0
    missed_follow_ups = (await db.execute(select(func.count(FollowUp.id)).where(
        *fu_scope, FollowUp.status == FollowUpStatus.LOST.value, FollowUp.follow_up_date >= sd, FollowUp.follow_up_date < ed))).scalar() or 0

    # Revenue vs expenses trend (period-filtered)
    combined_trend = await revenue_trend_with_expenses(db, case_ids if case_ids else [], [hospital_id], period=period, start_date=start_date, end_date=end_date)
    patient_by_bucket = {t["month"]: t["count"] for t in patient_growth_trend}
    monthly_growth_trend = [
        {"month": t["month"], "revenue": t["revenue"], "patients": patient_by_bucket.get(t["month"], 0)}
        for t in combined_trend
    ]

    # --- Today's appointments list ---
    today_appt_list = []
    if patient_ids:
        appt_q = (
            select(
                Appointment.id, Appointment.appointment_time, Appointment.status,
                Appointment.notes,
                Patient.full_name.label("patient_name"),
                User.full_name.label("doctor_name"),
                Case.chief_complaint.label("chief_complaint"),
            )
            .join(Patient, Appointment.patient_id == Patient.id)
            .join(User, Appointment.doctor_id == User.id, isouter=True)
            .outerjoin(Case, Case.appointment_id == Appointment.id)
            .where(Appointment.patient_id.in_(patient_ids), Appointment.appointment_date == today)
        )
        if doctor_id:
            appt_q = appt_q.where(Appointment.doctor_id == doctor_id)
        appt_q = appt_q.order_by(Appointment.appointment_time)
        for row in (await db.execute(appt_q)).all():
            today_appt_list.append({
                "id": row[0], "time": str(row[1])[:5] if row[1] else "",
                "status": row[2].value if hasattr(row[2], 'value') else str(row[2]),
                "notes": row[3] or "", "patient_name": row[4] or "",
                "doctor_name": row[5] or "Unassigned",
                "chief_complaint": row[6] or "",
            })

    # --- Pending actions ---
    pending_billings_count = 0
    pending_billings_amount = 0.0
    if case_ids:
        pb_r = await db.execute(
            select(func.count(Billing.id), func.coalesce(func.sum(Billing.pending_amount), 0))
            .where(Billing.case_id.in_(case_ids), Billing.payment_status.in_([PaymentStatus.PARTIAL.value, PaymentStatus.OVERDUE.value]))
        )
        pb_row = pb_r.one_or_none()
        pending_billings_count = pb_row[0] if pb_row else 0
        pending_billings_amount = float(pb_row[1]) if pb_row else 0.0
    pending_actions = {"follow_ups": pending_follow_ups, "billings_count": pending_billings_count, "billings_amount": pending_billings_amount}

    # --- Recent activity (uses period range, capped at 30 days for activity) ---
    activity_start = date_start
    activity_end = date_end
    range_days = (date_end - date_start).days
    if range_days > 30:
        activity_start = datetime.now(timezone.utc) - timedelta(days=30)

    recent_patients_q = select(Patient.id, Patient.full_name, Patient.created_at).where(
        Patient.hospital_id == hospital_id, Patient.created_at >= activity_start, Patient.created_at < activity_end
    )
    if doctor_id:
        recent_patients_q = recent_patients_q.where(Patient.doctor_id == doctor_id)
    recent_patients_r = await db.execute(recent_patients_q.order_by(Patient.created_at.desc()).limit(5))

    recent_activities = []
    for row in recent_patients_r.all():
        recent_activities.append({"type": "patient_registered", "description": f"New patient: {row[1]}", "date": row[2].isoformat() if row[2] else ""})

    if patient_ids:
        recent_appt_q = (
            select(Appointment.id, Appointment.appointment_date, Appointment.status, Patient.full_name.label("patient_name"))
            .join(Patient, Appointment.patient_id == Patient.id)
            .where(Appointment.patient_id.in_(patient_ids), Appointment.created_at >= activity_start, Appointment.created_at < activity_end)
        )
        if doctor_id:
            recent_appt_q = recent_appt_q.where(Appointment.doctor_id == doctor_id)
        for row in (await db.execute(recent_appt_q.order_by(Appointment.created_at.desc()).limit(5))).all():
            status_val = row[2].value if hasattr(row[2], 'value') else str(row[2])
            recent_activities.append({"type": "appointment_created", "description": f"Appointment for {row[3]} - {status_val}", "date": str(row[1]) if row[1] else ""})
    recent_activities.sort(key=lambda x: x.get("date", ""), reverse=True)
    recent_activities = recent_activities[:10]

    # --- Revenue sources (PERIOD-FILTERED) ---
    revenue_sources = []
    if case_ids:
        breakdown = await payment_method_breakdown_for_range(db, case_ids, date_start, date_end)
        rows = [{"method": m or "Other", "amount": amount} for m, amount in breakdown.items()]
        rows.sort(key=lambda x: x["amount"], reverse=True)
        revenue_sources = rows

    # --- Treatment KPIs (hospital-wide, filtered by doctor_id if set) ---
    from app.models.treatment_plan import TreatmentPlanStatus
    tp_base_filters = [TreatmentPlan.is_active == True]
    if case_ids:
        tp_base_filters.append(TreatmentPlan.case_id.in_(case_ids))
    elif doctor_id:
        tp_base_filters.append(TreatmentPlan.assigned_doctor_id == doctor_id)

    total_active_treatments = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(*tp_base_filters, TreatmentPlan.status.in_([
            TreatmentPlanStatus.GENERATED, TreatmentPlanStatus.ASSIGNED, TreatmentPlanStatus.SCHEDULED,
            TreatmentPlanStatus.IN_PROGRESS, TreatmentPlanStatus.WAITING_PATIENT,
            TreatmentPlanStatus.WAITING_LAB, TreatmentPlanStatus.ON_HOLD,
        ]))
    )).scalar() or 0

    overdue_treatments = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(*tp_base_filters, TreatmentPlan.status == TreatmentPlanStatus.OVERDUE)
    )).scalar() or 0

    completed_today = 0
    today_start_dt = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    today_end_dt = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc)
    completed_today = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(
            *tp_base_filters, TreatmentPlan.status == TreatmentPlanStatus.COMPLETED,
            TreatmentPlan.completed_at >= today_start_dt, TreatmentPlan.completed_at <= today_end_dt,
        )
    )).scalar() or 0

    waiting_patient = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(*tp_base_filters, TreatmentPlan.status == TreatmentPlanStatus.WAITING_PATIENT)
    )).scalar() or 0

    waiting_lab = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(*tp_base_filters, TreatmentPlan.status == TreatmentPlanStatus.WAITING_LAB)
    )).scalar() or 0

    completed_this_month = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(
            *tp_base_filters, TreatmentPlan.status == TreatmentPlanStatus.COMPLETED,
            TreatmentPlan.completed_at >= current_month_start,
        )
    )).scalar() or 0

    total_completed_all = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(*tp_base_filters, TreatmentPlan.status == TreatmentPlanStatus.COMPLETED)
    )).scalar() or 0

    total_all_treatments = (await db.execute(
        select(func.count(TreatmentPlan.id)).where(*tp_base_filters)
    )).scalar() or 0

    treatment_completion_rate = round((total_completed_all / total_all_treatments * 100), 1) if total_all_treatments > 0 else 0.0

    treatment_kpis = {
        "active_treatments": total_active_treatments,
        "overdue_treatments": overdue_treatments,
        "completed_today": completed_today,
        "waiting_patient": waiting_patient,
        "waiting_lab": waiting_lab,
        "completed_this_month": completed_this_month,
        "completion_rate": treatment_completion_rate,
        "total_treatments": total_all_treatments,
    }

    # --- CRM insights (PERIOD-FILTERED) ---
    crm_base = [Lead.hospital_id == hospital_id, Lead.created_at >= date_start, Lead.created_at < date_end]
    total_leads = (await db.execute(select(func.count(Lead.id)).where(*crm_base))).scalar() or 0
    new_leads = (await db.execute(select(func.count(Lead.id)).where(*crm_base, Lead.status == "NEW"))).scalar() or 0
    converted_leads = (await db.execute(select(func.count(Lead.id)).where(*crm_base, Lead.status == "CONVERTED"))).scalar() or 0
    conversion_rate = round((converted_leads / total_leads * 100), 1) if total_leads > 0 else 0.0

    leads_by_source = []
    lead_src_r = await db.execute(
        select(Lead.source, func.count(Lead.id).label("cnt"))
        .where(*crm_base).group_by(Lead.source).order_by(text("cnt DESC")).limit(5)
    )
    for row in lead_src_r.all():
        leads_by_source.append({"source": row[0], "count": row[1]})

    crm_insights = {"total_leads": total_leads, "new_leads": new_leads, "converted_leads": converted_leads, "conversion_rate": conversion_rate, "leads_by_source": leads_by_source}

    # --- Enterprise BI aggregates (period-scoped to this hospital / doctor) ---
    appointment_trend = await _appointment_trend(db, hospital_ids=[hospital_id] if not doctor_id else None, doctor_id=doctor_id, date_start=date_start, date_end=date_end)
    appointment_heatmap = await _appointment_heatmap(db, hospital_ids=[hospital_id] if not doctor_id else None, doctor_id=doctor_id, date_start=date_start, date_end=date_end)
    treatment_category_breakdown = await _treatment_category_breakdown(db, case_ids=case_ids, date_start=date_start, date_end=date_end)
    lead_source_breakdown = await _lead_source_breakdown(db, hospital_ids=[hospital_id], date_start=date_start, date_end=date_end)
    payment_method_breakdown = await _payment_method_breakdown(db, case_ids=case_ids, date_start=date_start, date_end=date_end)
    gender_distribution = await _gender_distribution(db, hospital_ids=[hospital_id] if not doctor_id else None, doctor_id=doctor_id, date_start=date_start, date_end=date_end)
    age_group_distribution = await _age_group_distribution(db, hospital_ids=[hospital_id] if not doctor_id else None, doctor_id=doctor_id, date_start=date_start, date_end=date_end)

    return {
        "today_appointments": today_appointments,
        "today_appointments_list": today_appt_list,
        "total_follow_ups": total_follow_ups, "pending_follow_ups": pending_follow_ups,
        "completed_follow_ups": completed_follow_ups, "missed_follow_ups": missed_follow_ups,
        "total_revenue": total_revenue, "monthly_revenue": monthly_revenue, "yearly_revenue": yearly_revenue,
        "period_revenue": period_revenue, "total_expenses": total_expenses,
        "net_profit": net_profit, "profit_margin": profit_margin,
        "period_patients": period_patient_count,
        "period_appointments": period_appointment_count,
        "period_cases": period_active_case_count,
        "hospital_name": hospital_name,
        "total_patients": total_patients, "total_cases": total_cases, "total_active_cases": total_active_cases,
        "revenue_trend": revenue_trend, "patient_growth_trend": patient_growth_trend,
        "appointment_count_trend": appointment_count_trend, "case_count_trend": case_count_trend,
        "monthly_growth_trend": monthly_growth_trend,
        "revenue_expense_trend": combined_trend,
        "expense_trend": [{"month": t["month"], "expenses": t["expenses"]} for t in combined_trend],
        "profit_trend": [{"month": t["month"], "profit": t["profit"], "profit_margin": t["profit_margin"]} for t in combined_trend],
        "doctor_performance": doctor_performance[:5],
        "treatment_performance": treatment_performance[:5],
        "expense_breakdown": expense_breakdown,
        "total_pending_billing": total_pending_billing,
        "pending_actions": pending_actions,
        "recent_activity": recent_activities,
        "revenue_sources": revenue_sources,
        "crm_insights": crm_insights,
        "treatment_kpis": treatment_kpis,
        "capacity_most_booked_doctors": await _get_most_booked_doctors(db, hospital_id, today),
        "capacity_peak_hours": await _get_peak_hours(db, hospital_id, today),
        "appointment_trend": appointment_trend,
        "appointment_heatmap": appointment_heatmap,
        "treatment_category_breakdown": treatment_category_breakdown,
        "lead_source_breakdown": lead_source_breakdown,
        "payment_method_breakdown": payment_method_breakdown,
        "gender_distribution": gender_distribution,
        "age_group_distribution": age_group_distribution,
        "comparison": {
            "revenue_change": pct_change(period_revenue, prev_period_revenue),
            "patient_change": pct_change(period_patient_count, prev_patient_count),
            "appointment_change": pct_change(period_appointment_count, prev_appointment_count),
            "case_change": pct_change(period_active_case_count, prev_active_case_count),
        },
    }
