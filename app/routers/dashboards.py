from datetime import datetime, date, timezone, timedelta
from typing import Optional
import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, extract, or_
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Role
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.follow_up import FollowUp, FollowUpStatus
from app.models.billing import Billing, PaymentStatus
from app.models.treatment_plan import TreatmentPlan
from app.models.pre_op import PreOp
from app.models.post_op import PostOp
from app.models.treatment_sitting import TreatmentSitting
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.models.lead import Lead
from app.utils.dashboard_helpers import (
    get_date_range, get_previous_date_range, calculate_revenue, calculate_expenses_for_date_range,
    calculate_profit, calculate_profit_margin, revenue_trend_with_expenses
)

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])


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


async def _monthly_revenue_trend(db: AsyncSession, case_ids: list[str] | None = None) -> list:
    now = datetime.now(timezone.utc)
    twelve_months_ago = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)
    twelve_months_ago = twelve_months_ago.replace(day=1)

    query = select(
        func.to_char(Billing.updated_at, 'YYYY-MM').label('month'),
        func.sum(Billing.paid_amount).label('revenue'),
    ).where(
        Billing.updated_at >= twelve_months_ago,
    )
    if case_ids is not None:
        query = query.where(Billing.case_id.in_(case_ids))
    query = query.group_by(text("month")).order_by(text("month"))

    r = await db.execute(query)
    rows = r.all()
    return [{"month": row[0], "revenue": float(row[1] or 0)} for row in rows]


async def _monthly_patient_trend(db: AsyncSession, hospital_ids: list[str] | None = None) -> list:
    now = datetime.now(timezone.utc)
    twelve_months_ago = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)
    twelve_months_ago = twelve_months_ago.replace(day=1)

    query = select(
        func.to_char(Patient.created_at, 'YYYY-MM').label('month'),
        func.count(Patient.id).label('count'),
    ).where(
        Patient.created_at >= twelve_months_ago,
    )
    if hospital_ids is not None:
        query = query.where(Patient.hospital_id.in_(hospital_ids))
    query = query.group_by(text("month")).order_by(text("month"))

    r = await db.execute(query)
    rows = r.all()
    return [{"month": row[0], "count": row[1]} for row in rows]


async def _monthly_case_trend(db: AsyncSession, case_ids: list[str] | None = None) -> list:
    now = datetime.now(timezone.utc)
    twelve_months_ago = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)
    twelve_months_ago = twelve_months_ago.replace(day=1)

    query = select(
        func.to_char(Case.created_at, 'YYYY-MM').label('month'),
        func.count(Case.id).label('count'),
    ).where(
        Case.created_at >= twelve_months_ago,
    )
    if case_ids is not None:
        query = query.where(Case.id.in_(case_ids))
    query = query.group_by(text("month")).order_by(text("month"))

    r = await db.execute(query)
    rows = r.all()
    return [{"month": row[0], "count": row[1]} for row in rows]


async def _monthly_appointment_trend(db: AsyncSession, hospital_ids: list[str] | None = None) -> list:
    now = datetime.now(timezone.utc)
    twelve_months_ago = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=365)
    twelve_months_ago = twelve_months_ago.replace(day=1)

    query = select(
        func.to_char(Appointment.created_at, 'YYYY-MM').label('month'),
        func.count(Appointment.id).label('count'),
    ).where(
        Appointment.created_at >= twelve_months_ago,
    )
    if hospital_ids is not None:
        pids_r = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hospital_ids)))
        pids = [row[0] for row in pids_r.all()]
        if not pids:
            return []
        query = query.where(Appointment.patient_id.in_(pids))
    query = query.group_by(text("month")).order_by(text("month"))

    r = await db.execute(query)
    rows = r.all()
    return [{"month": row[0], "count": row[1]} for row in rows]


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


@router.get("/super-admin")
async def super_admin_dashboard(
    period: str = Query("this_month", description="today, this_week, this_month, this_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom range start (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom range end (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    total_groups = (await db.execute(select(func.count(AdminGroup.id)))).scalar() or 0
    total_hospitals = (await db.execute(select(func.count(Hospital.id)))).scalar() or 0
    total_doctors = (await db.execute(select(func.count(User.id)).where(User.role == Role.DOCTOR.value))).scalar() or 0
    total_patients = (await db.execute(select(func.count(Patient.id)).where())).scalar() or 0

    active_case_statuses = [s.value for s in CaseStatus if s not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED)]
    total_active_cases = (await db.execute(
        select(func.count(Case.id)).where(Case.status.in_(active_case_statuses))
    )).scalar() or 0

    total_appointments = (await db.execute(select(func.count(Appointment.id)).where())).scalar() or 0

    total_revenue_result = await db.execute(select(func.sum(Billing.paid_amount)).where())
    total_revenue = float(total_revenue_result.scalar() or 0)

    monthly_revenue_result = await db.execute(
        select(func.sum(Billing.paid_amount)).where(Billing.updated_at >= current_month_start)
    )
    monthly_revenue = float(monthly_revenue_result.scalar() or 0)

    yearly_revenue_result = await db.execute(
        select(func.sum(Billing.paid_amount)).where(Billing.updated_at >= current_year_start)
    )
    yearly_revenue = float(yearly_revenue_result.scalar() or 0)

    period_revenue = await calculate_revenue(db, period=period, start_date=start_date, end_date=end_date)
    date_start, date_end = get_date_range(period, start_date, end_date)
    total_expenses = await calculate_expenses_for_date_range(db, date_start=date_start, date_end=date_end)
    net_profit = await calculate_profit(period_revenue, total_expenses)
    profit_margin = await calculate_profit_margin(period_revenue, net_profit)

    # Revenue trend (last 12 months)
    revenue_trend = await _monthly_revenue_trend(db)

    # Patient growth trend
    patient_growth_trend = await _monthly_patient_trend(db)

    # Get all case IDs for performance queries
    all_case_ids_r = await db.execute(select(Case.id).where())
    all_case_ids = [row[0] for row in all_case_ids_r.all()]

    # Admin group performance by revenue
    groups_r = await db.execute(select(AdminGroup.id, AdminGroup.name))
    admin_group_performance = []
    for gid, gname in groups_r.all():
        hids = await _get_hospital_ids_for_group(db, gid)
        pids = await _get_patient_ids_for_hospitals(db, hids)
        cids = await _get_case_ids_for_patients(db, pids)
        rev = 0.0
        if cids:
            rev_r = await db.execute(
                select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(cids))
            )
            rev = float(rev_r.scalar() or 0)
        g_exp = await calculate_expenses_for_date_range(db, hids, date_start=date_start, date_end=date_end)
        g_profit = rev - g_exp
        g_margin = round((g_profit / rev * 100), 2) if rev > 0 else 0
        if rev >= 0:
            admin_group_performance.append({
                "id": gid, "name": gname, "revenue": rev,
                "expenses": g_exp, "profit": g_profit, "profit_margin": g_margin,
                "hospitals": len(hids), "patients": len(pids),
            })
    admin_group_performance.sort(key=lambda x: x["revenue"], reverse=True)

    # Hospital performance by revenue/expenses/profit
    hospitals_r = await db.execute(select(Hospital.id, Hospital.name))
    hospital_performance = []
    for hid, hname in hospitals_r.all():
        h_pids = await _get_patient_ids_for_hospitals(db, [hid])
        h_cids = await _get_case_ids_for_patients(db, h_pids)
        rev = 0.0
        if h_cids:
            rev_r = await db.execute(
                select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(h_cids))
            )
            rev = float(rev_r.scalar() or 0)
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
        if rev >= 0:
            hospital_performance.append({
                "id": hid, "name": hname, "revenue": rev,
                "expenses": h_exp, "profit": h_profit, "profit_margin": h_margin,
                "patients": h_patient_count, "cases": h_case_count, "doctors": h_doctor_count,
            })
    hospital_performance.sort(key=lambda x: x["revenue"], reverse=True)

    # Doctor performance by revenue (system-wide)
    doctor_performance = []
    doctor_rev_r = await db.execute(
        select(
            Case.doctor_id,
            func.sum(Billing.paid_amount).label("revenue"),
        )
        .select_from(Billing)
        .join(Case, Billing.case_id == Case.id)
        .where(Case.doctor_id.isnot(None))
        .group_by(Case.doctor_id)
        .order_by(text("revenue DESC"))
    )
    for row in doctor_rev_r.all():
        did = row[0]
        rev = float(row[1] or 0)
        if rev > 0:
            dname_r = await db.execute(select(User.full_name).where(User.id == did))
            dname = dname_r.scalar() or did
            doctor_performance.append({"id": did, "name": dname, "value": rev})

    # Monthly growth trend with expenses (respect period)
    combined_trend = await revenue_trend_with_expenses(db, hospital_ids=None, period=period, start_date=start_date, end_date=end_date)

    total_pending_billing = float((await db.execute(
        select(func.coalesce(func.sum(Billing.pending_amount), 0))
    )).scalar() or 0)

    expense_breakdown_r = await db.execute(
        select(HospitalMonthlyExpense.expense_category, func.coalesce(func.sum(HospitalMonthlyExpense.amount), 0).label("total"))
        .where(HospitalMonthlyExpense.expense_date >= date_start.date(), HospitalMonthlyExpense.expense_date < date_end.date())
        .group_by(HospitalMonthlyExpense.expense_category).order_by(text("total DESC"))
    )
    expense_breakdown = [{"category": row[0], "amount": float(row[1])} for row in expense_breakdown_r.all()]

    return {
        "total_groups": total_groups,
        "total_hospitals": total_hospitals,
        "total_doctors": total_doctors,
        "total_patients": total_patients,
        "total_active_cases": total_active_cases,
        "total_appointments": total_appointments,
        "total_revenue": total_revenue,
        "monthly_revenue": monthly_revenue,
        "yearly_revenue": yearly_revenue,
        "period_revenue": period_revenue,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "profit_margin": profit_margin,
        "revenue_trend": revenue_trend,
        "patient_growth_trend": patient_growth_trend,
        "monthly_growth_trend": [{"month": t["month"], "revenue": t["revenue"], "patients": 0} for t in combined_trend],
        "revenue_expense_trend": combined_trend,
        "expense_trend": [{"month": t["month"], "expenses": t["expenses"]} for t in combined_trend],
        "profit_trend": [{"month": t["month"], "profit": t["profit"], "profit_margin": t["profit_margin"]} for t in combined_trend],
        "total_pending_billing": total_pending_billing,
        "expense_breakdown": expense_breakdown,
        "admin_group_performance": admin_group_performance[:5],
        "hospital_performance": hospital_performance[:5],
        "doctor_performance": doctor_performance[:5],
    }


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
        select(func.count(User.id)).where(User.role == Role.DOCTOR.value, User.admin_group_id == admin_group_id)
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
        monthly_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(
                Billing.case_id.in_(case_ids), Billing.updated_at >= current_month_start
            )
        )).scalar() or 0)
        yearly_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(
                Billing.case_id.in_(case_ids), Billing.updated_at >= current_year_start
            )
        )).scalar() or 0)

    period_revenue = await calculate_revenue(db, case_ids, period=period, start_date=start_date, end_date=end_date)
    date_start, date_end = get_date_range(period, start_date, end_date)
    total_expenses = await calculate_expenses_for_date_range(db, hospital_ids, date_start=date_start, date_end=date_end)
    net_profit = await calculate_profit(period_revenue, total_expenses)
    profit_margin = await calculate_profit_margin(period_revenue, net_profit)

    revenue_trend = await _monthly_revenue_trend(db, case_ids if case_ids else [])
    patient_growth_trend = await _monthly_patient_trend(db, hospital_ids)

    # Hospital performance with expenses
    hospital_performance = []
    for hid in hospital_ids:
        h_name_r = await db.execute(select(Hospital.name).where(Hospital.id == hid))
        h_name = h_name_r.scalar()
        h_pids = await _get_patient_ids_for_hospitals(db, [hid])
        h_cids = await _get_case_ids_for_patients(db, h_pids)
        rev = 0.0
        if h_cids:
            rev_r = await db.execute(
                select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(h_cids))
            )
            rev = float(rev_r.scalar() or 0)
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

    # Doctor performance — revenue scoped to hospital(s)
    doctor_performance = []
    if case_ids:
        doctor_rev_r = await db.execute(
            select(
                Case.doctor_id,
                func.sum(Billing.paid_amount).label("revenue"),
            )
            .select_from(Billing)
            .join(Case, Billing.case_id == Case.id)
            .where(Billing.case_id.in_(case_ids), Case.doctor_id.isnot(None))
            .group_by(Case.doctor_id)
            .order_by(text("revenue DESC"))
        )
        for row in doctor_rev_r.all():
            did = row[0]
            rev = float(row[1] or 0)
            if rev > 0:
                dname_r = await db.execute(select(User.full_name).where(User.id == did))
                dname = dname_r.scalar() or did
                doctor_performance.append({"id": did, "name": dname, "value": rev})
    filtered_doctor_count = len(doctor_performance)

    # Monthly growth trend with expenses (respect period)
    combined_trend = await revenue_trend_with_expenses(db, case_ids if case_ids else [], hospital_ids, period=period, start_date=start_date, end_date=end_date)

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

    return {
        "selected_hospital_id": hospital_id,
        "total_hospitals": len(group_hospital_ids),
        "total_doctors": filtered_doctor_count,
        "total_patients": total_patients,
        "total_active_cases": total_active_cases,
        "total_appointments": total_appointments,
        "total_revenue": total_revenue,
        "monthly_revenue": monthly_revenue,
        "yearly_revenue": yearly_revenue,
        "period_revenue": period_revenue,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "profit_margin": profit_margin,
        "revenue_trend": revenue_trend,
        "patient_growth_trend": patient_growth_trend,
        "monthly_growth_trend": [{"month": t["month"], "revenue": t["revenue"], "patients": 0} for t in combined_trend],
        "revenue_expense_trend": combined_trend,
        "expense_trend": [{"month": t["month"], "expenses": t["expenses"]} for t in combined_trend],
        "profit_trend": [{"month": t["month"], "profit": t["profit"], "profit_margin": t["profit_margin"]} for t in combined_trend],
        "expense_breakdown": expense_breakdown,
        "total_pending_billing": total_pending_billing,
        "hospital_performance": hospital_performance[:5],
        "doctor_performance": doctor_performance[:5],
    }

@router.get("/hospital-admin")
async def hospital_admin_dashboard(
    period: str = Query("this_month", description="today, this_week, this_month, this_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None, description="Custom range start (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Custom range end (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != Role.HOSPITAL_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    hospital_id = current_user.get("hospital_id")
    if not hospital_id:
        return {
            "today_appointments": 0, "total_revenue": 0.0, "monthly_revenue": 0.0, "yearly_revenue": 0.0,
            "total_patients": 0, "total_cases": 0, "total_active_cases": 0,
            "total_expenses": 0, "net_profit": 0, "profit_margin": 0, "period_revenue": 0,
            "revenue_trend": [], "patient_growth_trend": [], "appointment_count_trend": [], "case_count_trend": [],
            "monthly_growth_trend": [], "doctor_performance": [], "treatment_performance": [],
            "revenue_expense_trend": [], "expense_trend": [], "profit_trend": [],
            "total_pending_billing": 0,
            "total_follow_ups": 0,
            "pending_follow_ups": 0,
            "completed_follow_ups": 0,
            "missed_follow_ups": 0,
            "expense_breakdown": [],
            "capacity_most_booked_doctors": [],
            "capacity_peak_hours": [],
            "comparison": {},
        }

    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    total_patients = (await db.execute(
        select(func.count(Patient.id)).where(Patient.hospital_id == hospital_id)
    )).scalar() or 0

    patient_ids = await _get_patient_ids_for_hospitals(db, [hospital_id])
    case_ids = await _get_case_ids_for_patients(db, patient_ids)

    total_cases = len(case_ids)
    active_case_statuses = [s.value for s in CaseStatus if s not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED)]
    total_active_cases = 0
    if case_ids:
        total_active_cases = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses))
        )).scalar() or 0

    today = date.today()
    today_appointments = 0
    if patient_ids:
        today_appointments = (await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.patient_id.in_(patient_ids),
                Appointment.appointment_date == today,
            )
        )).scalar() or 0

    total_revenue = 0.0
    monthly_revenue = 0.0
    yearly_revenue = 0.0
    if case_ids:
        total_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(case_ids))
        )).scalar() or 0)
        monthly_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(
                Billing.case_id.in_(case_ids), Billing.updated_at >= current_month_start
            )
        )).scalar() or 0)
        yearly_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(
                Billing.case_id.in_(case_ids), Billing.updated_at >= current_year_start
            )
        )).scalar() or 0)

    total_pending_billing = 0.0
    if case_ids:
        total_pending_billing = float((await db.execute(
            select(func.sum(Billing.pending_amount)).where(Billing.case_id.in_(case_ids))
        )).scalar() or 0)

    period_revenue = await calculate_revenue(db, case_ids, period=period, start_date=start_date, end_date=end_date)
    date_start, date_end = get_date_range(period, start_date, end_date)
    total_expenses = await calculate_expenses_for_date_range(db, [hospital_id], date_start=date_start, date_end=date_end)
    net_profit = await calculate_profit(period_revenue, total_expenses)
    profit_margin = await calculate_profit_margin(period_revenue, net_profit)

    sd = date_start.date() if hasattr(date_start, 'date') else date_start
    ed = date_end.date() if hasattr(date_end, 'date') else date_end
    cat_r = await db.execute(
        select(HospitalMonthlyExpense.expense_category, func.coalesce(func.sum(HospitalMonthlyExpense.amount), 0).label("total"))
        .where(HospitalMonthlyExpense.hospital_id == hospital_id, HospitalMonthlyExpense.expense_date >= sd, HospitalMonthlyExpense.expense_date < ed)
        .group_by(HospitalMonthlyExpense.expense_category).order_by(text("total DESC"))
    )
    expense_breakdown = [{"category": row[0], "amount": float(row[1])} for row in cat_r.all()]

    revenue_trend = await _monthly_revenue_trend(db, case_ids if case_ids else [])
    patient_growth_trend = await _monthly_patient_trend(db, [hospital_id])

    # Doctor performance — revenue only from this hospital's cases
    doctor_performance = []
    if case_ids:
        # Single grouped query: sum billing paid_amount per doctor within this hospital's cases
        doctor_rev_r = await db.execute(
            select(
                Case.doctor_id,
                func.sum(Billing.paid_amount).label("revenue"),
            )
            .select_from(Billing)
            .join(Case, Billing.case_id == Case.id)
            .where(Billing.case_id.in_(case_ids), Case.doctor_id.isnot(None))
            .group_by(Case.doctor_id)
            .order_by(text("revenue DESC"))
        )
        for row in doctor_rev_r.all():
            did = row[0]
            rev = float(row[1] or 0)
            if rev > 0:
                dname_r = await db.execute(select(User.full_name).where(User.id == did))
                dname = dname_r.scalar() or did
                doctor_performance.append({"id": did, "name": dname, "value": rev})

    # Treatment performance
    treatment_performance = []
    if case_ids:
        tp_r = await db.execute(
            select(TreatmentPlan.treatment_name, func.count(TreatmentPlan.id).label('cnt'))
            .where(TreatmentPlan.case_id.in_(case_ids))
            .group_by(TreatmentPlan.treatment_name)
            .order_by(text("cnt DESC"))
            .limit(5)
        )
        for row in tp_r.all():
            treatment_performance.append({"name": row[0], "value": row[1]})

    # Trend data for non-financial metrics
    appointment_count_trend = await _monthly_appointment_trend(db, [hospital_id])
    case_count_trend = await _monthly_case_trend(db, case_ids if case_ids else [])

    # Period-over-period comparison
    prev_start, prev_end = get_previous_date_range(period, start_date, end_date)

    # Current period counts
    period_patient_count = (await db.execute(
        select(func.count(Patient.id)).where(Patient.hospital_id == hospital_id, Patient.created_at >= date_start, Patient.created_at < date_end)
    )).scalar() or 0
    period_appointment_count = 0
    if patient_ids:
        period_appointment_count = (await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.patient_id.in_(patient_ids),
                Appointment.appointment_date >= date_start.date(),
                Appointment.appointment_date < date_end.date(),
            )
        )).scalar() or 0
    period_active_case_count = 0
    if case_ids:
        period_active_case_count = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses),
                                               Case.created_at >= date_start, Case.created_at < date_end)
        )).scalar() or 0

    # Previous period counts
    prev_patient_count = (await db.execute(
        select(func.count(Patient.id)).where(Patient.hospital_id == hospital_id, Patient.created_at >= prev_start, Patient.created_at < prev_end)
    )).scalar() or 0
    prev_appointment_count = 0
    if patient_ids:
        prev_appointment_count = (await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.patient_id.in_(patient_ids),
                Appointment.appointment_date >= prev_start.date(),
                Appointment.appointment_date < prev_end.date(),
            )
        )).scalar() or 0
    prev_active_case_count = 0
    if case_ids:
        prev_active_case_count = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses),
                                               Case.created_at >= prev_start, Case.created_at < prev_end)
        )).scalar() or 0
    prev_period_revenue = await calculate_revenue(db, case_ids, period="custom", start_date=prev_start.isoformat(), end_date=prev_end.isoformat())

    def pct_change(current: float, previous: float) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 1)

    # Follow-Up stats
    total_follow_ups = (await db.execute(
        select(func.count(FollowUp.id)).where(FollowUp.hospital_id == hospital_id)
    )).scalar() or 0
    pending_follow_ups = (await db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.hospital_id == hospital_id,
            FollowUp.status == FollowUpStatus.PENDING.value,
        )
    )).scalar() or 0
    completed_follow_ups = (await db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.hospital_id == hospital_id,
            FollowUp.status == FollowUpStatus.COMPLETED.value,
        )
    )).scalar() or 0
    missed_follow_ups = (await db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.hospital_id == hospital_id,
            FollowUp.status == FollowUpStatus.LOST.value,
        )
    )).scalar() or 0

    # Monthly growth trend with expenses (respect period)
    combined_trend = await revenue_trend_with_expenses(db, case_ids if case_ids else [], [hospital_id], period=period, start_date=start_date, end_date=end_date)

    # --- New fields for enterprise dashboard ---

    # Today's appointments list with patient/doctor names
    today_appt_list = []
    if patient_ids:
        appt_rows = await db.execute(
            select(
                Appointment.id, Appointment.appointment_time, Appointment.status,
                Appointment.appointment_type, Appointment.notes,
                Patient.full_name.label("patient_name"),
                User.full_name.label("doctor_name"),
            )
            .join(Patient, Appointment.patient_id == Patient.id)
            .join(User, Appointment.doctor_id == User.id, isouter=True)
            .where(
                Appointment.patient_id.in_(patient_ids),
                Appointment.appointment_date == today,
            )
            .order_by(Appointment.appointment_time)
        )
        for row in appt_rows.all():
            today_appt_list.append({
                "id": row[0],
                "time": str(row[1])[:5] if row[1] else "",
                "status": row[2].value if hasattr(row[2], 'value') else str(row[2]),
                "type": row[3].value if hasattr(row[3], 'value') else str(row[3]) if row[3] else "CONSULTATION",
                "notes": row[4] or "",
                "patient_name": row[5] or "",
                "doctor_name": row[6] or "Unassigned",
            })

    # Pending actions summary
    pending_billings_count = 0
    pending_billings_amount = 0.0
    if case_ids:
        pending_billings_r = await db.execute(
            select(
                func.count(Billing.id),
                func.coalesce(func.sum(Billing.pending_amount), 0),
            )
            .where(
                Billing.case_id.in_(case_ids),
                Billing.payment_status.in_([PaymentStatus.PARTIAL.value, PaymentStatus.OVERDUE.value]),
            )
        )
        pb_row = pending_billings_r.one_or_none()
        pending_billings_count = pb_row[0] if pb_row else 0
        pending_billings_amount = float(pb_row[1]) if pb_row else 0.0

    pending_actions = {
        "follow_ups": pending_follow_ups,
        "billings_count": pending_billings_count,
        "billings_amount": pending_billings_amount,
    }

    # Recent activity (last 7 days)
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_patients_r = await db.execute(
        select(Patient.id, Patient.full_name, Patient.created_at)
        .where(Patient.hospital_id == hospital_id, Patient.created_at >= seven_days_ago)
        .order_by(Patient.created_at.desc()).limit(5)
    )
    recent_activities = []
    for row in recent_patients_r.all():
        recent_activities.append({
            "type": "patient_registered",
            "description": f"New patient: {row[1]}",
            "date": row[2].isoformat() if row[2] else "",
        })

    if patient_ids:
        recent_appts_r = await db.execute(
            select(
                Appointment.id, Appointment.appointment_date, Appointment.status,
                Patient.full_name.label("patient_name"),
            )
            .join(Patient, Appointment.patient_id == Patient.id)
            .where(
                Appointment.patient_id.in_(patient_ids),
                Appointment.created_at >= seven_days_ago,
            )
            .order_by(Appointment.created_at.desc()).limit(5)
        )
        for row in recent_appts_r.all():
            status_val = row[2].value if hasattr(row[2], 'value') else str(row[2])
            recent_activities.append({
                "type": "appointment_created",
                "description": f"Appointment for {row[3]} - {status_val}",
                "date": str(row[1]) if row[1] else "",
            })

    recent_activities.sort(key=lambda x: x.get("date", ""), reverse=True)
    recent_activities = recent_activities[:10]

    # Revenue sources (by payment method)
    revenue_sources = []
    if case_ids:
        rev_src_r = await db.execute(
            select(
                func.coalesce(Billing.payment_method, 'Other').label("method"),
                func.sum(Billing.paid_amount).label("total"),
            )
            .where(Billing.case_id.in_(case_ids), Billing.paid_amount > 0)
            .group_by(text("method"))
            .order_by(text("total DESC"))
        )
        for row in rev_src_r.all():
            revenue_sources.append({"method": row[0], "amount": float(row[1] or 0)})

    # CRM insights
    total_leads = (await db.execute(
        select(func.count(Lead.id)).where(Lead.hospital_id == hospital_id)
    )).scalar() or 0
    new_leads = (await db.execute(
        select(func.count(Lead.id)).where(Lead.hospital_id == hospital_id, Lead.status == "NEW")
    )).scalar() or 0
    converted_leads = (await db.execute(
        select(func.count(Lead.id)).where(Lead.hospital_id == hospital_id, Lead.status == "CONVERTED")
    )).scalar() or 0
    conversion_rate = round((converted_leads / total_leads * 100), 1) if total_leads > 0 else 0.0

    leads_by_source = []
    lead_src_r = await db.execute(
        select(Lead.source, func.count(Lead.id).label("cnt"))
        .where(Lead.hospital_id == hospital_id)
        .group_by(Lead.source).order_by(text("cnt DESC")).limit(5)
    )
    for row in lead_src_r.all():
        leads_by_source.append({"source": row[0], "count": row[1]})

    crm_insights = {
        "total_leads": total_leads,
        "new_leads": new_leads,
        "converted_leads": converted_leads,
        "conversion_rate": conversion_rate,
        "leads_by_source": leads_by_source,
    }

    return {
        "today_appointments": today_appointments,
        "today_appointments_list": today_appt_list,
        "total_follow_ups": total_follow_ups,
        "pending_follow_ups": pending_follow_ups,
        "completed_follow_ups": completed_follow_ups,
        "missed_follow_ups": missed_follow_ups,
        "total_revenue": total_revenue,
        "monthly_revenue": monthly_revenue,
        "yearly_revenue": yearly_revenue,
        "period_revenue": period_revenue,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "profit_margin": profit_margin,
        "total_patients": total_patients,
        "total_cases": total_cases,
        "total_active_cases": total_active_cases,
        "revenue_trend": revenue_trend,
        "patient_growth_trend": patient_growth_trend,
        "appointment_count_trend": appointment_count_trend,
        "case_count_trend": case_count_trend,
        "monthly_growth_trend": [{"month": t["month"], "revenue": t["revenue"], "patients": 0} for t in combined_trend],
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
        "capacity_most_booked_doctors": await _get_most_booked_doctors(db, hospital_id, today),
        "capacity_peak_hours": await _get_peak_hours(db, hospital_id, today),
        "comparison": {
            "revenue_change": pct_change(period_revenue, prev_period_revenue),
            "patient_change": pct_change(period_patient_count, prev_patient_count),
            "appointment_change": pct_change(period_appointment_count, prev_appointment_count),
            "case_change": pct_change(period_active_case_count, prev_active_case_count),
        },
    }


async def _get_most_booked_doctors(db: AsyncSession, hospital_id: str, today: date, limit: int = 5):
    from app.models.appointment import Appointment, AppointmentStatus
    excluded = [AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]
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
    excluded = [AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]
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

@router.get("/doctor")
async def doctor_dashboard(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != Role.DOCTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    doctor_id = current_user.get("sub")

    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

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
        )
    )).scalar() or 0

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
        monthly_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(
                Billing.case_id.in_(my_case_ids), Billing.updated_at >= current_month_start
            )
        )).scalar() or 0)
        yearly_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(
                Billing.case_id.in_(my_case_ids), Billing.updated_at >= current_year_start
            )
        )).scalar() or 0)

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

    # Revenue trend
    revenue_trend = await _monthly_revenue_trend(db, list(my_case_ids) if my_case_ids else [])

    # Case completion trend
    case_completion_trend = await _monthly_case_trend(db, list(my_case_ids) if my_case_ids else [])

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
            Appointment.status.notin_([AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]),
        )
    )).scalar() or 0

    # Estimate working hours (9 AM to 6 PM = 9 hours by default)
    working_hours = 9
    total_capacity = max_per_hour * working_hours
    available_capacity = max(0, total_capacity - today_scheduled)
    utilization_pct = round((today_scheduled / total_capacity) * 100) if total_capacity > 0 else 0

    return {
        "my_patients": my_patients,
        "today_appointments": today_appointments,
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
    }


# ---- Quick View Endpoints ----

@router.get("/quick-view/admin-group/{group_id}")
async def quick_view_admin_group(
    group_id: str,
    period: str = Query("this_month", description="today, this_week, this_month, this_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    group_r = await db.execute(select(AdminGroup).where(AdminGroup.id == group_id))
    group = group_r.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin group not found")

    hospital_ids = await _get_hospital_ids_for_group(db, group_id)
    patient_ids = await _get_patient_ids_for_hospitals(db, hospital_ids)
    case_ids = await _get_case_ids_for_patients(db, patient_ids)

    total_hospitals = len(hospital_ids)
    total_doctors = (await db.execute(
        select(func.count(User.id)).where(User.role == Role.DOCTOR.value, User.admin_group_id == group_id)
    )).scalar() or 0
    total_patients = len(patient_ids)

    total_revenue = 0.0
    if case_ids:
        total_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(case_ids))
        )).scalar() or 0)

    active_case_statuses = [s.value for s in CaseStatus if s not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED)]
    total_active_cases = 0
    if case_ids:
        total_active_cases = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses))
        )).scalar() or 0

    period_revenue = await calculate_revenue(db, case_ids, period=period, start_date=start_date, end_date=end_date)
    date_start, date_end = get_date_range(period, start_date, end_date)
    total_expenses = await calculate_expenses_for_date_range(db, hospital_ids, date_start=date_start, date_end=date_end)
    net_profit = await calculate_profit(period_revenue, total_expenses)
    profit_margin = await calculate_profit_margin(period_revenue, net_profit)

    # Top doctors
    top_doctors = []
    if case_ids:
        doctor_rev_r = await db.execute(
            select(
                Case.doctor_id,
                func.sum(Billing.paid_amount).label("revenue"),
            )
            .select_from(Billing)
            .join(Case, Billing.case_id == Case.id)
            .where(Billing.case_id.in_(case_ids), Case.doctor_id.isnot(None))
            .group_by(Case.doctor_id)
            .order_by(text("revenue DESC"))
        )
        for row in doctor_rev_r.all():
            did = row[0]
            rev = float(row[1] or 0)
            if rev > 0:
                dname_r = await db.execute(select(User.full_name).where(User.id == did))
                dname = dname_r.scalar() or did
                top_doctors.append({"id": did, "name": dname, "value": rev})

    return {
        "id": group_id,
        "name": group.name,
        "total_hospitals": total_hospitals,
        "total_doctors": total_doctors,
        "total_patients": total_patients,
        "total_revenue": total_revenue,
        "total_active_cases": total_active_cases,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "profit_margin": profit_margin,
        "top_doctors": top_doctors[:5],
    }


@router.get("/quick-view/hospital/{hospital_id}")
async def quick_view_hospital(
    hospital_id: str,
    period: str = Query("this_month", description="today, this_week, this_month, this_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role != Role.GROUP_ADMIN.value and role != Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    hosp_r = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    hosp = hosp_r.scalar_one_or_none()
    if not hosp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

    if role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if hosp.admin_group_id != agid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    patient_ids = await _get_patient_ids_for_hospitals(db, [hospital_id])
    case_ids = await _get_case_ids_for_patients(db, patient_ids)

    total_doctors = 0
    if case_ids:
        total_doctors = (await db.execute(
            select(func.count(func.distinct(Case.doctor_id))).where(
                Case.id.in_(case_ids), Case.doctor_id.isnot(None)
            )
        )).scalar() or 0
    total_patients = len(patient_ids)

    total_revenue = 0.0
    if case_ids:
        total_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(case_ids))
        )).scalar() or 0)

    active_case_statuses = [s.value for s in CaseStatus if s not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED)]
    total_active_cases = 0
    if case_ids:
        total_active_cases = (await db.execute(
            select(func.count(Case.id)).where(Case.id.in_(case_ids), Case.status.in_(active_case_statuses))
        )).scalar() or 0

    total_billings = 0
    total_pending = 0.0
    if case_ids:
        total_billings = (await db.execute(
            select(func.count(Billing.id)).where(Billing.case_id.in_(case_ids))
        )).scalar() or 0
        total_pending = float((await db.execute(
            select(func.sum(Billing.pending_amount)).where(Billing.case_id.in_(case_ids))
        )).scalar() or 0)

    today = date.today()
    today_appts = 0
    if patient_ids:
        today_appts = (await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.patient_id.in_(patient_ids), Appointment.appointment_date == today
            )
        )).scalar() or 0

    period_revenue = await calculate_revenue(db, case_ids, period=period, start_date=start_date, end_date=end_date)
    date_start, date_end = get_date_range(period, start_date, end_date)
    total_expenses = await calculate_expenses_for_date_range(db, [hospital_id], date_start=date_start, date_end=date_end)
    net_profit = await calculate_profit(period_revenue, total_expenses)
    profit_margin = await calculate_profit_margin(period_revenue, net_profit)

    # Expense breakdown by category
    from sqlalchemy import or_
    from app.models.hospital_monthly_expense import HospitalMonthlyExpense
    expense_breakdown = []
    months = set()
    d = date_start.replace(day=1)
    while d < date_end:
        months.add((d.year, d.month))
        if d.month == 12:
            d = d.replace(year=d.year + 1, month=1)
        else:
            d = d.replace(month=d.month + 1)
    if months:
        conditions = []
        for year, month in months:
            conditions.append(
                (HospitalMonthlyExpense.expense_year == year) &
                (HospitalMonthlyExpense.expense_month == month)
            )
        cat_query = select(
            HospitalMonthlyExpense.expense_category,
            func.sum(HospitalMonthlyExpense.amount).label('total')
        ).where(
            HospitalMonthlyExpense.hospital_id == hospital_id,
            or_(*conditions)
        ).group_by(HospitalMonthlyExpense.expense_category).order_by(text("total DESC"))
        cat_r = await db.execute(cat_query)
        for row in cat_r.all():
            expense_breakdown.append({"category": row[0], "amount": float(row[1] or 0)})

    return {
        "id": hospital_id,
        "name": hosp.name,
        "total_doctors": total_doctors,
        "total_patients": total_patients,
        "total_revenue": total_revenue,
        "total_active_cases": total_active_cases,
        "total_billings": total_billings,
        "total_pending": total_pending,
        "today_appointments": today_appts,
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "profit_margin": profit_margin,
        "expense_breakdown": expense_breakdown,
    }


@router.get("/quick-view/doctor/{doctor_id}")
async def quick_view_doctor(
    doctor_id: str,
    period: str = Query("this_month", description="today, this_week, this_month, this_quarter, this_year, custom"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    if role not in (Role.HOSPITAL_ADMIN.value, Role.GROUP_ADMIN.value, Role.SUPER_ADMIN.value):
        if role == Role.DOCTOR.value and doctor_id == current_user.get("sub"):
            pass
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    doctor_r = await db.execute(select(User).where(User.id == doctor_id, User.role == Role.DOCTOR.value))
    doctor = doctor_r.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

    if role == Role.HOSPITAL_ADMIN.value:
        # Validate doctor shares the same admin_group as the admin's hospital
        admin_hosp_id = current_user.get("hospital_id")
        if admin_hosp_id:
            admin_group_id_for_hosp = (
                await db.execute(select(Hospital.admin_group_id).where(Hospital.id == admin_hosp_id))
            ).scalar()
            if not admin_group_id_for_hosp or doctor.admin_group_id != admin_group_id_for_hosp:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if role == Role.GROUP_ADMIN.value and doctor.admin_group_id != current_user.get("admin_group_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Determine the hospital to scope data to
    scope_hospital_id = None
    if role == Role.HOSPITAL_ADMIN.value:
        scope_hospital_id = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        scope_hospital_id = current_user.get("hospital_id")

    # Hospital-scoped patient IDs and case IDs
    scope_pids = []
    scope_cids = []
    if scope_hospital_id:
        scope_pids = await _get_patient_ids_for_hospitals(db, [scope_hospital_id])
        scope_cids = await _get_case_ids_for_patients(db, scope_pids)

    if not scope_cids:
        return {
            "id": doctor_id, "name": doctor.full_name,
            "total_patients": 0, "today_appointments": 0,
            "total_cases": 0, "active_cases": 0, "completed_cases": 0,
            "total_revenue": 0, "period_revenue": 0,
            "active_patients": 0, "completed_patients": 0, "contribution_to_profit": 0,
        }

    # Patient count: distinct patients in scoped cases for this doctor
    my_patient_ids_r = await db.execute(
        select(func.distinct(Case.patient_id)).where(
            Case.id.in_(scope_cids), Case.doctor_id == doctor_id
        )
    )
    my_patient_ids = [r[0] for r in my_patient_ids_r.all()]
    my_patients = len(my_patient_ids)

    today = date.today()
    today_appointments = 0
    if my_patient_ids:
        today_appointments = (await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.doctor_id == doctor_id,
                Appointment.patient_id.in_(my_patient_ids),
                Appointment.appointment_date == today,
            )
        )).scalar() or 0

    # Cases for this doctor within the scoped hospital
    my_cases_r = await db.execute(
        select(Case).where(Case.id.in_(scope_cids), Case.doctor_id == doctor_id)
    )
    my_cases = my_cases_r.scalars().all()
    my_case_ids = {c.id for c in my_cases}

    total_cases = len(my_cases)
    active_statuses = {CaseStatus.IN_PROGRESS, CaseStatus.OPEN, CaseStatus.ON_HOLD}
    active_cases = len([c for c in my_cases if c.status in active_statuses])
    completed_cases = len([c for c in my_cases if c.status == CaseStatus.COMPLETED])

    total_revenue = 0.0
    period_revenue = 0.0
    if my_case_ids:
        total_revenue = float((await db.execute(
            select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(my_case_ids))
        )).scalar() or 0)
        period_revenue = await calculate_revenue(db, list(my_case_ids), period=period, start_date=start_date, end_date=end_date)

    # Active patients (patients with active cases)
    active_patients = 0
    if my_case_ids:
        active_patient_ids = set()
        for c in my_cases:
            if c.status in active_statuses:
                active_patient_ids.add(c.patient_id)
        active_patients = len(active_patient_ids)

    completed_patient_ids = set()
    for c in my_cases:
        if c.status == CaseStatus.COMPLETED:
            completed_patient_ids.add(c.patient_id)
    completed_patients = len(completed_patient_ids)

    # Hospital revenue for contribution calculation
    hospital_revenue = 0.0
    if scope_cids:
        h_rev_result = await db.execute(
            select(func.sum(Billing.paid_amount)).where(Billing.case_id.in_(scope_cids))
        )
        hospital_revenue = float(h_rev_result.scalar() or 0)
    contribution = round((period_revenue / hospital_revenue * 100), 2) if hospital_revenue > 0 else 0

    return {
        "id": doctor_id,
        "name": doctor.full_name,
        "total_patients": my_patients,
        "today_appointments": today_appointments,
        "total_cases": total_cases,
        "active_cases": active_cases,
        "completed_cases": completed_cases,
        "total_revenue": total_revenue,
        "period_revenue": period_revenue,
        "active_patients": active_patients,
        "completed_patients": len(completed_patient_ids),
        "contribution_to_profit": contribution,
    }


@router.get("/quick-view/patient/{patient_id}")
async def quick_view_patient(patient_id: str, db: AsyncSession = Depends(get_db),
                             current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in (Role.DOCTOR.value, Role.HOSPITAL_ADMIN.value, Role.GROUP_ADMIN.value, Role.SUPER_ADMIN.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    patient_r = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = patient_r.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    if role == Role.DOCTOR.value and patient.doctor_id != current_user.get("sub"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if role == Role.HOSPITAL_ADMIN.value and patient.hospital_id != current_user.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if role == Role.GROUP_ADMIN.value:
        h_r = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == patient.hospital_id))
        h_row = h_r.one_or_none()
        if not h_row or str(h_row[0]) != str(current_user.get("admin_group_id")):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Cases
    cases_r = await db.execute(
        select(Case).where(Case.patient_id == patient_id).order_by(Case.created_at.desc())
    )
    cases = cases_r.scalars().all()

    # Treatments
    case_ids = [c.id for c in cases]
    treatments = []
    if case_ids:
        treatments_r = await db.execute(
            select(TreatmentPlan).where(TreatmentPlan.case_id.in_(case_ids)).order_by(TreatmentPlan.created_at.desc())
        )
        treatments = treatments_r.scalars().all()

    # Appointments
    appointments_r = await db.execute(
        select(Appointment).where(Appointment.patient_id == patient_id).order_by(Appointment.appointment_date.desc())
    )
    appointments = appointments_r.scalars().all()

    # Billings
    billings = []
    if case_ids:
        billings_r = await db.execute(
            select(Billing).where(Billing.case_id.in_(case_ids)).order_by(Billing.created_at.desc())
        )
        billings = billings_r.scalars().all()

    total_billed = sum(b.total_amount for b in billings)
    total_paid = sum(b.paid_amount for b in billings)
    total_pending = sum(b.pending_amount for b in billings)

    # Follow-Ups
    follow_ups_r = await db.execute(
        select(FollowUp).where(FollowUp.patient_id == patient_id).order_by(FollowUp.follow_up_date.desc())
    )
    follow_ups = follow_ups_r.scalars().all()

    next_follow_up = None
    for fu in follow_ups:
        if fu.status == FollowUpStatus.PENDING.value:
            next_follow_up = {
                "id": str(fu.id),
                "date": fu.follow_up_date.isoformat(),
                "time": str(fu.follow_up_time) if fu.follow_up_time else None,
                "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
                "appointment_id": str(fu.appointment_id) if fu.appointment_id else None,
                "status": fu.status,
            }
            break

    # Pre-Ops
    pre_ops_list = []
    if case_ids:
        pre_ops_r = await db.execute(
            select(PreOp).where(PreOp.case_id.in_(case_ids)).order_by(PreOp.created_at.desc())
        )
        pre_ops_list = pre_ops_r.scalars().all()

    # Post-Ops
    post_ops_list = []
    if case_ids:
        post_ops_r = await db.execute(
            select(PostOp).where(PostOp.case_id.in_(case_ids)).order_by(PostOp.created_at.desc())
        )
        post_ops_list = post_ops_r.scalars().all()

    # Treatment Sittings progress
    treatment_ids = [t.id for t in treatments]
    sittings_progress = {"total": 0, "completed": 0}
    if treatment_ids:
        sittings_r = await db.execute(
            select(TreatmentSitting).where(TreatmentSitting.treatment_plan_id.in_(treatment_ids))
        )
        all_sittings = sittings_r.scalars().all()
        sittings_progress["total"] = len(all_sittings)
        sittings_progress["completed"] = sum(1 for s in all_sittings if s.status == "COMPLETED")

    # Status history timeline
    timeline = []
    for c in cases:
        timeline.append({
            "date": c.created_at.isoformat(),
            "event": f"Case created: {c.chief_complaint[:50]}",
            "type": "case_created",
        })
        for tp in treatments:
            if tp.case_id == c.id:
                timeline.append({
                    "date": tp.created_at.isoformat(),
                    "event": f"Treatment planned: {tp.treatment_name}",
                    "type": "treatment_planned",
                })
        for b in billings:
            if b.case_id == c.id:
                timeline.append({
                    "date": b.created_at.isoformat(),
                    "event": f"Billing: ₹{b.total_amount} - {b.payment_status}",
                    "type": "billing",
                })
    for fu in follow_ups:
        timeline.append({
            "date": fu.created_at.isoformat(),
            "event": f"Follow-up: {fu.status} - {fu.follow_up_date.isoformat()}",
            "type": "follow_up",
        })
    timeline.sort(key=lambda x: x["date"], reverse=True)

    return {
        "id": patient_id,
        "name": patient.full_name,
        "total_cases": len(cases),
        "total_treatments": len(treatments),
        "total_appointments": len(appointments),
        "total_follow_ups": len(follow_ups),
        "next_follow_up": next_follow_up,
        "total_billed": total_billed,
        "total_paid": total_paid,
        "total_pending": total_pending,
        "follow_up_history": [
            {
                "id": str(fu.id),
                "date": fu.follow_up_date.isoformat(),
                "time": str(fu.follow_up_time) if fu.follow_up_time else None,
                "doctor_id": str(fu.doctor_id) if fu.doctor_id else None,
                "appointment_id": str(fu.appointment_id) if fu.appointment_id else None,
                "status": fu.status,
                "notes": fu.notes,
            }
            for fu in follow_ups
        ],
        "cases": [
            {
                "id": c.id,
                "chief_complaint": c.chief_complaint,
                "status": c.status.value if hasattr(c.status, 'value') else str(c.status),
                "diagnosis": c.diagnosis,
                "created_at": c.created_at.isoformat(),
            }
            for c in cases
        ],
        "treatments": [
            {
                "id": t.id,
                "treatment_name": t.treatment_name,
                "cost": t.cost,
                "status": t.status.value if hasattr(t.status, 'value') else str(t.status),
            }
            for t in treatments
        ],
        "appointments": [
            {
                "id": a.id,
                "date": a.appointment_date.isoformat() if hasattr(a.appointment_date, 'isoformat') else str(a.appointment_date),
                "time": str(a.appointment_time),
                "status": a.status.value if hasattr(a.status, 'value') else str(a.status),
                "appointment_type": a.appointment_type.value if hasattr(a, 'appointment_type') and a.appointment_type else None,
            }
            for a in appointments
        ],
        "billings": [
            {
                "id": b.id,
                "total_amount": b.total_amount,
                "paid_amount": b.paid_amount,
                "pending_amount": b.pending_amount,
                "payment_status": b.payment_status.value if hasattr(b.payment_status, 'value') else str(b.payment_status),
                "created_at": b.created_at.isoformat(),
            }
            for b in billings
        ],
        "timeline": timeline[:20],
        "pre_ops": [
            {
                "id": str(p.id),
                "case_id": str(p.case_id),
                "notes": p.notes,
                "photo_urls": p.photo_urls,
                "xray_urls": p.xray_urls,
                "created_at": p.created_at.isoformat(),
            }
            for p in pre_ops_list
        ],
        "post_ops": [
            {
                "id": str(p.id),
                "case_id": str(p.case_id),
                "notes": p.notes,
                "report": p.report,
                "photo_urls": p.photo_urls,
                "created_at": p.created_at.isoformat(),
            }
            for p in post_ops_list
        ],
        "treatment_progress": sittings_progress,
    }
