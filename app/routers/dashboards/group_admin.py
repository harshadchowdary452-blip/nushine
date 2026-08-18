"""Group Admin dashboard endpoint."""

from datetime import datetime, date, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Role
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus
from app.models.appointment import Appointment, AppointmentStatus
from app.models.billing import Billing, PaymentStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.utils.dashboard_helpers import (
    get_date_range, get_previous_date_range, calculate_revenue, calculate_revenue_for_range,
    calculate_expenses_for_date_range, calculate_profit, calculate_profit_margin,
    revenue_trend_with_expenses,
    revenue_by_doctor_for_range, payment_method_breakdown_for_range,
)
from app.routers.dashboards.helpers import (
    _get_hospital_ids_for_group, _get_patient_ids_for_hospitals, _get_case_ids_for_patients,
    _monthly_revenue_trend, _monthly_patient_trend,
    _appointment_trend, _appointment_heatmap,
    _treatment_category_breakdown, _lead_source_breakdown,
    _payment_method_breakdown, _gender_distribution, _age_group_distribution,
)

router = APIRouter()


@router.get("/group-admin")
async def group_admin_dashboard(
    period: str = Query("this_month", description="today, this_week, this_month, this_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom range start (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom range end (YYYY-MM-DD)"),
    hospital_id: Optional[str] = Query(None, description="Filter to a specific hospital in the group"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != Role.GROUP_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    admin_group_id = current_user.get("admin_group_id")
    if not admin_group_id:
        return {
            "total_hospitals": 0, "total_doctors": 0, "total_patients": 0,
            "total_active_cases": 0, "total_appointments": 0,
            "total_revenue": 0, "monthly_revenue": 0, "yearly_revenue": 0,
            "total_expenses": 0, "net_profit": 0, "profit_margin": 0, "period_revenue": 0,
            "revenue_trend": [], "patient_growth_trend": [],
            "monthly_growth_trend": [], "hospital_performance": [], "doctor_performance": [],
            "revenue_expense_trend": [], "expense_trend": [], "profit_trend": [],
            "selected_hospital_id": None,
            "appointment_trend": [], "appointment_heatmap": [],
            "treatment_category_breakdown": [], "lead_source_breakdown": [],
            "payment_method_breakdown": [], "gender_distribution": [],
            "age_group_distribution": [],
            "comparison": {},
        }

    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    group_hospital_ids = await _get_hospital_ids_for_group(db, admin_group_id)
    if not group_hospital_ids:
        return {
            "total_hospitals": 0, "total_doctors": 0, "total_patients": 0,
            "total_active_cases": 0, "total_appointments": 0,
            "total_revenue": 0, "monthly_revenue": 0, "yearly_revenue": 0,
            "total_expenses": 0, "net_profit": 0, "profit_margin": 0, "period_revenue": 0,
            "revenue_trend": [], "patient_growth_trend": [],
            "monthly_growth_trend": [], "hospital_performance": [], "doctor_performance": [],
            "revenue_expense_trend": [], "expense_trend": [], "profit_trend": [],
            "selected_hospital_id": None,
            "appointment_trend": [], "appointment_heatmap": [],
            "treatment_category_breakdown": [], "lead_source_breakdown": [],
            "payment_method_breakdown": [], "gender_distribution": [],
            "age_group_distribution": [],
            "comparison": {},
        }

    # If hospital_id is provided, validate it belongs to the group and use it
    if hospital_id:
        if hospital_id not in group_hospital_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hospital not in your admin group")
        hospital_ids = [hospital_id]
    else:
        hospital_ids = group_hospital_ids

    total_hospitals = len(hospital_ids)
    total_doctors = (await db.execute(
        select(func.count(func.distinct(User.id))).where(
            User.role == Role.DOCTOR.value,
            User.hospital_id.in_(hospital_ids) if hospital_ids else text("false"),
        )
    )).scalar() or 0

    patient_ids = await _get_patient_ids_for_hospitals(db, hospital_ids)
    total_patients = len(patient_ids)

    case_ids = await _get_case_ids_for_patients(db, patient_ids)

    active_case_statuses = [s.value for s in CaseStatus if s not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED)]
    total_active_cases = 0
    if case_ids:
        total_active_cases = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses))
        )).scalar() or 0

    total_appointments = 0
    if patient_ids:
        total_appointments = (await db.execute(
            select(func.count(Appointment.id)).where(Appointment.patient_id.in_(patient_ids))
        )).scalar() or 0

    total_revenue = 0.0
    monthly_revenue = 0.0
    yearly_revenue = 0.0
    if case_ids:
        total_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(case_ids))
        )).scalar() or 0)
        monthly_revenue = await calculate_revenue(db, case_ids, period="this_month")
        yearly_revenue = await calculate_revenue(db, case_ids, period="this_year")

    period_revenue = await calculate_revenue(db, case_ids, period=period, start_date=start_date, end_date=end_date)
    date_start, date_end = get_date_range(period, start_date, end_date)
    total_expenses = await calculate_expenses_for_date_range(db, hospital_ids, date_start=date_start, date_end=date_end)
    net_profit = await calculate_profit(period_revenue, total_expenses)
    profit_margin = await calculate_profit_margin(period_revenue, net_profit)

    revenue_trend = await _monthly_revenue_trend(db, case_ids if case_ids else [], date_start=date_start, date_end=date_end)
    patient_growth_trend = await _monthly_patient_trend(db, hospital_ids, date_start=date_start, date_end=date_end)

    # Hospital performance with expenses
    hospital_performance = []
    for hid in hospital_ids:
        h_name_r = await db.execute(select(Hospital.name).where(Hospital.id == hid))
        h_name = h_name_r.scalar()
        h_pids = await _get_patient_ids_for_hospitals(db, [hid])
        h_cids = await _get_case_ids_for_patients(db, h_pids)
        rev = 0.0
        if h_cids:
            rev = await calculate_revenue_for_range(db, h_cids, date_start, date_end)
        h_exp = await calculate_expenses_for_date_range(db, [hid], date_start=date_start, date_end=date_end)
        h_profit = rev - h_exp
        h_margin = round((h_profit / rev * 100), 2) if rev > 0 else 0
        h_patient_count = len(h_pids)
        h_case_count = len(h_cids)
        h_doctor_count = 0
        if h_cids:
            h_doctor_count = (await db.execute(
                select(func.count(func.distinct(Case.doctor_id))).where(
                    Case.id.in_(h_cids), Case.doctor_id.isnot(None)
                )
            )).scalar() or 0
        hospital_performance.append({
            "id": hid, "name": h_name or hid, "revenue": rev,
            "expenses": h_exp, "profit": h_profit, "profit_margin": h_margin,
            "patients": h_patient_count, "cases": h_case_count, "doctors": h_doctor_count,
        })
    hospital_performance.sort(key=lambda x: x["revenue"], reverse=True)

    # Doctor performance — revenue scoped to hospital(s), period-filtered
    doctor_performance = []
    if case_ids:
        doctor_rev_map = await revenue_by_doctor_for_range(db, case_ids, date_start, date_end)
        for did, rev in doctor_rev_map.items():
            dname_r = await db.execute(select(User.full_name).where(User.id == did))
            dname = dname_r.scalar() or did
            doctor_performance.append({"id": did, "name": dname, "value": rev})
        doctor_performance.sort(key=lambda x: x["value"], reverse=True)

    # Monthly growth trend with expenses (respect period)
    combined_trend = await revenue_trend_with_expenses(db, case_ids if case_ids else [], hospital_ids, period=period, start_date=start_date, end_date=end_date)
    patient_by_bucket = {t["month"]: t["count"] for t in patient_growth_trend}
    monthly_growth_trend = [
        {"month": t["month"], "revenue": t["revenue"], "patients": patient_by_bucket.get(t["month"], 0)}
        for t in combined_trend
    ]

    total_pending_billing = float((await db.execute(
        select(func.coalesce(func.sum(Billing.pending_amount), 0)).where(
            Billing.case_id.in_(case_ids) if case_ids else text("false"),
        )
    )).scalar() or 0) if case_ids else 0

    expense_breakdown_r = await db.execute(
        select(HospitalMonthlyExpense.expense_category, func.coalesce(func.sum(HospitalMonthlyExpense.amount), 0).label("total"))
        .where(
            HospitalMonthlyExpense.hospital_id.in_(hospital_ids),
            HospitalMonthlyExpense.expense_date >= date_start.date(),
            HospitalMonthlyExpense.expense_date < date_end.date(),
        )
        .group_by(HospitalMonthlyExpense.expense_category).order_by(text("total DESC"))
    )
    expense_breakdown = [{"category": row[0], "amount": float(row[1])} for row in expense_breakdown_r.all()]

    # --- Period-over-period comparison ---
    prev_start, prev_end = get_previous_date_range(period, start_date, end_date)
    prev_period_revenue = await calculate_revenue_for_range(db, case_ids, prev_start, prev_end)

    period_patients = (await db.execute(
        select(func.count(Patient.id)).where(
            Patient.id.in_(patient_ids) if patient_ids else text("false"),
            Patient.created_at >= date_start, Patient.created_at < date_end,
        )
    )).scalar() or 0
    prev_patients = (await db.execute(
        select(func.count(Patient.id)).where(
            Patient.id.in_(patient_ids) if patient_ids else text("false"),
            Patient.created_at >= prev_start, Patient.created_at < prev_end,
        )
    )).scalar() or 0

    period_appointments = (await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.patient_id.in_(patient_ids) if patient_ids else text("false"),
            Appointment.appointment_date >= date_start.date(),
            Appointment.appointment_date < date_end.date(),
        )
    )).scalar() or 0
    prev_appointments = (await db.execute(
        select(func.count(Appointment.id)).where(
            Appointment.patient_id.in_(patient_ids) if patient_ids else text("false"),
            Appointment.appointment_date >= prev_start.date(),
            Appointment.appointment_date < prev_end.date(),
        )
    )).scalar() or 0

    period_cases = (await db.execute(
        select(func.count(Case.id)).where(
            Case.id.in_(case_ids) if case_ids else text("false"),
            Case.created_at >= date_start, Case.created_at < date_end,
        )
    )).scalar() or 0
    prev_cases = (await db.execute(
        select(func.count(Case.id)).where(
            Case.id.in_(case_ids) if case_ids else text("false"),
            Case.created_at >= prev_start, Case.created_at < prev_end,
        )
    )).scalar() or 0

    def pct_change(current: float, previous: float) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)

    comparison = {
        "revenue_change": pct_change(period_revenue, prev_period_revenue),
        "patient_change": pct_change(period_patients, prev_patients),
        "appointment_change": pct_change(period_appointments, prev_appointments),
        "case_change": pct_change(period_cases, prev_cases),
    }

    # --- Enterprise BI aggregates (period-scoped, filtered to this group) ---
    appointment_trend = await _appointment_trend(db, hospital_ids=hospital_ids, date_start=date_start, date_end=date_end)
    appointment_heatmap = await _appointment_heatmap(db, hospital_ids=hospital_ids, date_start=date_start, date_end=date_end)
    treatment_category_breakdown = await _treatment_category_breakdown(db, case_ids=case_ids, date_start=date_start, date_end=date_end)
    lead_source_breakdown = await _lead_source_breakdown(db, hospital_ids=hospital_ids, date_start=date_start, date_end=date_end)
    payment_method_breakdown = await _payment_method_breakdown(db, case_ids=case_ids, date_start=date_start, date_end=date_end)
    gender_distribution = await _gender_distribution(db, hospital_ids=hospital_ids, date_start=date_start, date_end=date_end)
    age_group_distribution = await _age_group_distribution(db, hospital_ids=hospital_ids, date_start=date_start, date_end=date_end)

    return {
        "selected_hospital_id": hospital_id,
        "total_hospitals": len(group_hospital_ids),
        "total_doctors": total_doctors,
        "total_patients": total_patients,
        "total_active_cases": total_active_cases,
        "total_appointments": total_appointments,
        "total_revenue": total_revenue,
        "monthly_revenue": monthly_revenue,
        "yearly_revenue": yearly_revenue,
        "period_revenue": period_revenue,
        "period_patients": period_patients,
        "period_appointments": period_appointments,
        "period_cases": period_cases,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "profit_margin": profit_margin,
        "revenue_trend": revenue_trend,
        "patient_growth_trend": patient_growth_trend,
        "monthly_growth_trend": monthly_growth_trend,
        "revenue_expense_trend": combined_trend,
        "expense_trend": [{"month": t["month"], "expenses": t["expenses"]} for t in combined_trend],
        "profit_trend": [{"month": t["month"], "profit": t["profit"], "profit_margin": t["profit_margin"]} for t in combined_trend],
        "expense_breakdown": expense_breakdown,
        "total_pending_billing": total_pending_billing,
        "hospital_performance": hospital_performance[:5],
        "doctor_performance": doctor_performance[:5],
        "comparison": comparison,
        "appointment_trend": appointment_trend,
        "appointment_heatmap": appointment_heatmap,
        "treatment_category_breakdown": treatment_category_breakdown,
        "lead_source_breakdown": lead_source_breakdown,
        "payment_method_breakdown": payment_method_breakdown,
        "gender_distribution": gender_distribution,
        "age_group_distribution": age_group_distribution,
        "treatment_kpis": {
            "active_treatments": (await db.execute(select(func.count(TreatmentPlan.id)).where(TreatmentPlan.case_id.in_(case_ids) if case_ids else text("false"), TreatmentPlan.is_active == True, TreatmentPlan.status.in_(["GENERATED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "WAITING_PATIENT", "WAITING_LAB", "ON_HOLD"])))).scalar() or 0 if case_ids else 0,
            "overdue_treatments": (await db.execute(select(func.count(TreatmentPlan.id)).where(TreatmentPlan.case_id.in_(case_ids) if case_ids else text("false"), TreatmentPlan.is_active == True, TreatmentPlan.status == TreatmentPlanStatus.OVERDUE))).scalar() or 0 if case_ids else 0,
            "completed_today": (await db.execute(select(func.count(TreatmentPlan.id)).where(
                TreatmentPlan.case_id.in_(case_ids) if case_ids else text("false"),
                TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value,
                TreatmentPlan.completed_at >= now.replace(hour=0, minute=0, second=0, microsecond=0),
            ))).scalar() or 0 if case_ids else 0,
            "waiting_patient": (await db.execute(select(func.count(TreatmentPlan.id)).where(TreatmentPlan.case_id.in_(case_ids) if case_ids else text("false"), TreatmentPlan.is_active == True, TreatmentPlan.status == TreatmentPlanStatus.WAITING_PATIENT))).scalar() or 0 if case_ids else 0,
            "waiting_lab": (await db.execute(select(func.count(TreatmentPlan.id)).where(TreatmentPlan.case_id.in_(case_ids) if case_ids else text("false"), TreatmentPlan.is_active == True, TreatmentPlan.status == TreatmentPlanStatus.WAITING_LAB))).scalar() or 0 if case_ids else 0,
            "completion_rate": round(
                ((await db.execute(select(func.count(TreatmentPlan.id)).where(
                    TreatmentPlan.case_id.in_(case_ids) if case_ids else text("false"),
                    TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value,
                ))).scalar() or 0)
                / max((await db.execute(select(func.count(TreatmentPlan.id)).where(
                    TreatmentPlan.case_id.in_(case_ids) if case_ids else text("false"),
                ))).scalar() or 0, 1)
                * 100, 1
            ),
        },
    }
