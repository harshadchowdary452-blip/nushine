from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, or_
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Role
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient
from app.models.case import Case, CaseStatus
from app.models.appointment import Appointment
from app.models.follow_up import FollowUp, FollowUpStatus
from app.models.billing import Billing
from app.models.treatment_plan import TreatmentPlan
from app.models.pre_op import PreOp
from app.models.post_op import PostOp
from app.models.treatment_sitting import TreatmentSitting
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.utils.dashboard_helpers import (
    get_date_range, calculate_revenue,
    calculate_expenses_for_date_range, calculate_profit, calculate_profit_margin,
    revenue_by_doctor_for_range,
)
from app.routers.dashboards.helpers import (
    _get_hospital_ids_for_group,
    _get_patient_ids_for_hospitals,
    _get_case_ids_for_patients,
)

router = APIRouter()


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

    # Top doctors (period-filtered)
    top_doctors = []
    if case_ids:
        doctor_rev_map = await revenue_by_doctor_for_range(db, case_ids, date_start, date_end)
        for did, rev in doctor_rev_map.items():
            dname_r = await db.execute(select(User.full_name).where(User.id == did))
            dname = dname_r.scalar() or did
            top_doctors.append({"id": did, "name": dname, "value": rev})
        top_doctors.sort(key=lambda x: x["value"], reverse=True)

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
