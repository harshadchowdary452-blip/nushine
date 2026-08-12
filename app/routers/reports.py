from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, or_
import csv
import io
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, Role
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient
from app.models.case import Case
from app.models.billing import Billing
from app.models.hospital_monthly_expense import HospitalMonthlyExpense
from app.utils.dashboard_helpers import get_date_range, calculate_expenses_for_date_range

router = APIRouter(prefix="/reports", tags=["Reports"])


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


async def _get_scope(db: AsyncSession, current_user: dict):
    role = current_user.get("role")
    hospital_ids = None
    case_ids = None
    admin_group_id = None

    if role == Role.SUPER_ADMIN.value:
        pass  # all data
    elif role == Role.GROUP_ADMIN.value:
        admin_group_id = current_user.get("admin_group_id")
        hospital_ids = await _get_hospital_ids_for_group(db, admin_group_id)
        patient_ids = await _get_patient_ids_for_hospitals(db, hospital_ids)
        case_ids = await _get_case_ids_for_patients(db, patient_ids)
    elif role == Role.HOSPITAL_ADMIN.value:
        hospital_ids = [current_user.get("hospital_id")] if current_user.get("hospital_id") else []
        patient_ids = await _get_patient_ids_for_hospitals(db, hospital_ids)
        case_ids = await _get_case_ids_for_patients(db, patient_ids)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return hospital_ids, case_ids, admin_group_id


@router.get("/revenue")
async def revenue_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REVENUE, Permission.VIEW_REVENUE_ANALYTICS)
    hospital_ids, case_ids, _ = await _get_scope(db, current_user)
    date_start, date_end = get_date_range(period, start_date, end_date)

    query = select(
        Billing.id, Billing.case_id, Billing.total_amount, Billing.paid_amount,
        Billing.pending_amount, Billing.payment_status, Billing.created_at, Billing.updated_at,
    )
    if case_ids is not None:
        query = query.where(Billing.case_id.in_(case_ids))
    query = query.where(Billing.updated_at >= date_start, Billing.updated_at < date_end)
    query = query.order_by(Billing.updated_at.desc())

    r = await db.execute(query)
    rows = r.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Case ID", "Total Amount", "Paid Amount", "Pending Amount", "Status", "Created At", "Updated At"])
    for row in rows:
        writer.writerow([str(row[0]), str(row[1]), row[2], row[3], row[4], row[5], str(row[6]), str(row[7])])

    output.seek(0)
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    filename = f"revenue_report_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/expenses")
async def expense_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_EXPENSES, Permission.MANAGE_EXPENSES)
    hospital_ids, _, _ = await _get_scope(db, current_user)
    date_start, date_end = get_date_range(period, start_date, end_date)

    months = set()
    d = date_start.replace(day=1)
    while d < date_end:
        months.add((d.year, d.month))
        if d.month == 12:
            d = d.replace(year=d.year + 1, month=1)
        else:
            d = d.replace(month=d.month + 1)

    conditions = []
    for year, month in months:
        conditions.append(
            (HospitalMonthlyExpense.expense_year == year) &
            (HospitalMonthlyExpense.expense_month == month)
        )

    query = select(
        HospitalMonthlyExpense.id, HospitalMonthlyExpense.hospital_id,
        HospitalMonthlyExpense.expense_category, HospitalMonthlyExpense.expense_name,
        HospitalMonthlyExpense.description, HospitalMonthlyExpense.amount,
        HospitalMonthlyExpense.expense_month, HospitalMonthlyExpense.expense_year,
        HospitalMonthlyExpense.created_at,
    )
    if conditions:
        query = query.where(or_(*conditions))
    if hospital_ids is not None:
        query = query.where(HospitalMonthlyExpense.hospital_id.in_(hospital_ids))
    query = query.order_by(HospitalMonthlyExpense.expense_year.desc(), HospitalMonthlyExpense.expense_month.desc())

    r = await db.execute(query)
    rows = r.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Hospital ID", "Category", "Name", "Description", "Amount", "Month", "Year", "Created At"])
    for row in rows:
        writer.writerow([str(row[0]), str(row[1]), row[2], row[3], row[4], row[5], row[6], row[7], str(row[8])])

    output.seek(0)
    filename = f"expense_report_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/profit")
async def profit_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REVENUE, Permission.VIEW_REVENUE_ANALYTICS)
    hospital_ids, _, _ = await _get_scope(db, current_user)
    date_start, date_end = get_date_range(period, start_date, end_date)

    revenue_query = select(func.sum(Billing.paid_amount))
    if hospital_ids is not None:
        patient_ids = await _get_patient_ids_for_hospitals(db, hospital_ids)
        case_ids = await _get_case_ids_for_patients(db, patient_ids)
        if case_ids:
            revenue_query = revenue_query.where(Billing.case_id.in_(case_ids))
    revenue_query = revenue_query.where(Billing.updated_at >= date_start, Billing.updated_at < date_end)
    r = await db.execute(revenue_query)
    revenue = float(r.scalar() or 0)

    expenses = await calculate_expenses_for_date_range(db, hospital_ids, date_start=date_start, date_end=date_end)
    profit = revenue - expenses
    profit_margin = round((profit / revenue * 100), 2) if revenue > 0 else 0

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Period Start", date_start.strftime('%Y-%m-%d')])
    writer.writerow(["Period End", (date_end - timedelta(days=1)).strftime('%Y-%m-%d')])
    writer.writerow(["Revenue", revenue])
    writer.writerow(["Expenses", expenses])
    writer.writerow(["Net Profit", profit])
    writer.writerow(["Profit Margin %", profit_margin])

    output.seek(0)
    filename = f"profit_report_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/hospitals")
async def hospital_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REVENUE, Permission.VIEW_REVENUE_ANALYTICS,
                      Permission.VIEW_OWN_HOSPITALS, Permission.VIEW_ALL_HOSPITALS)
    hospital_ids, _, _ = await _get_scope(db, current_user)
    date_start, date_end = get_date_range(period, start_date, end_date)

    h_query = select(Hospital.id, Hospital.name, Hospital.is_active)
    if hospital_ids is not None:
        h_query = h_query.where(Hospital.id.in_(hospital_ids))
    h_query = h_query.order_by(Hospital.name)
    r = await db.execute(h_query)
    hospitals = r.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Hospital ID", "Name", "Active", "Revenue", "Expenses", "Profit", "Profit Margin %"])

    for hid, hname, active in hospitals:
        h_pids = await _get_patient_ids_for_hospitals(db, [hid])
        h_cids = await _get_case_ids_for_patients(db, h_pids)
        rev = 0.0
        if h_cids:
            rev_r = await db.execute(
                select(func.sum(Billing.paid_amount)).where(
                    Billing.case_id.in_(h_cids),
                    Billing.updated_at >= date_start, Billing.updated_at < date_end
                )
            )
            rev = float(rev_r.scalar() or 0)
        exp = await calculate_expenses_for_date_range(db, [hid], date_start=date_start, date_end=date_end)
        profit = rev - exp
        margin = round((profit / rev * 100), 2) if rev > 0 else 0
        writer.writerow([str(hid), hname, "Yes" if active else "No", rev, exp, profit, margin])

    output.seek(0)
    filename = f"hospital_report_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/doctors")
async def doctor_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_DOCTOR_PERFORMANCE)
    _, _, admin_group_id = await _get_scope(db, current_user)

    doc_query = select(User.id, User.full_name, User.hospital_id, User.is_active).where(User.role == Role.DOCTOR.value)
    if admin_group_id:
        doc_query = doc_query.where(User.admin_group_id == admin_group_id)
    elif current_user.get("role") == Role.HOSPITAL_ADMIN.value:
        doc_query = doc_query.where(User.hospital_id == current_user.get("hospital_id"))
    doc_query = doc_query.order_by(User.full_name)
    r = await db.execute(doc_query)
    doctors = r.all()

    date_start, date_end = get_date_range(period, start_date, end_date)

    # Scope case revenue to the caller's tenant so a HOSPITAL_ADMIN never sees
    # a doctor's cases from other hospitals.
    patient_ids = None
    if current_user.get("role") == Role.HOSPITAL_ADMIN.value:
        hospital_id = current_user.get("hospital_id")
        patient_ids = await _get_patient_ids_for_hospitals(db, [hospital_id]) if hospital_id else []
    elif admin_group_id:
        hids = await _get_hospital_ids_for_group(db, admin_group_id)
        patient_ids = await _get_patient_ids_for_hospitals(db, hids)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Doctor ID", "Name", "Hospital ID", "Active", "Revenue"])

    for did, dname, hid, active in doctors:
        d_cases_q = select(Case.id).where(Case.doctor_id == did)
        if patient_ids is not None:
            d_cases_q = d_cases_q.where(Case.patient_id.in_(patient_ids))
        d_cases_r = await db.execute(d_cases_q)
        d_cids = [row[0] for row in d_cases_r.all()]
        rev = 0.0
        if d_cids:
            rev_r = await db.execute(
                select(func.sum(Billing.paid_amount)).where(
                    Billing.case_id.in_(d_cids),
                    Billing.updated_at >= date_start, Billing.updated_at < date_end
                )
            )
            rev = float(rev_r.scalar() or 0)
        writer.writerow([str(did), dname, str(hid) if hid else "", "Yes" if active else "No", rev])

    output.seek(0)
    filename = f"doctor_report_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/admin-groups")
async def admin_group_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REVENUE, Permission.VIEW_GLOBAL_REPORTS)

    date_start, date_end = get_date_range(period, start_date, end_date)

    groups_r = await db.execute(select(AdminGroup.id, AdminGroup.name, AdminGroup.is_active).order_by(AdminGroup.name))
    groups = groups_r.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Group ID", "Name", "Active", "Revenue", "Expenses", "Profit", "Profit Margin %"])

    for gid, gname, active in groups:
        hids = await _get_hospital_ids_for_group(db, gid)
        if not hids:
            writer.writerow([str(gid), gname, "Yes" if active else "No", 0, 0, 0, 0])
            continue
        pids = await _get_patient_ids_for_hospitals(db, hids)
        cids = await _get_case_ids_for_patients(db, pids)
        rev = 0.0
        if cids:
            rev_r = await db.execute(
                select(func.sum(Billing.paid_amount)).where(
                    Billing.case_id.in_(cids),
                    Billing.updated_at >= date_start, Billing.updated_at < date_end
                )
            )
            rev = float(rev_r.scalar() or 0)
        exp = await calculate_expenses_for_date_range(db, hids, date_start=date_start, date_end=date_end)
        profit = rev - exp
        margin = round((profit / rev * 100), 2) if rev > 0 else 0
        writer.writerow([str(gid), gname, "Yes" if active else "No", rev, exp, profit, margin])

    output.seek(0)
    filename = f"admin_group_report_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/patient-acquisition")
async def patient_acquisition_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REVENUE, Permission.MANAGE_PATIENTS)
    hospital_ids, _, _ = await _get_scope(db, current_user)
    date_start, date_end = get_date_range(period, start_date, end_date)

    query = select(
        Patient.id, Patient.full_name, Patient.patient_source,
        Patient.source_campaign_name, Patient.source_campaign_id,
        Patient.source_campaign_date, Patient.created_at, Patient.hospital_id,
    ).where(Patient.created_at >= date_start, Patient.created_at < date_end)
    if hospital_ids is not None:
        query = query.where(Patient.hospital_id.in_(hospital_ids))
    query = query.order_by(Patient.created_at.desc())

    r = await db.execute(query)
    rows = r.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Patient Name", "Source", "Campaign Name", "Campaign ID", "Campaign Date", "Registered At", "Hospital ID"])
    for row in rows:
        writer.writerow([str(row[0]), row[1], row[2] or "", row[3] or "", row[4] or "", str(row[5]) if row[5] else "", str(row[6]), str(row[7])])

    output.seek(0)
    filename = f"patient_acquisition_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/source-revenue")
async def source_revenue_report(
    format: str = Query("csv", pattern="^(csv|excel)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REVENUE, Permission.VIEW_REVENUE_ANALYTICS)
    hospital_ids, _, _ = await _get_scope(db, current_user)
    date_start, date_end = get_date_range(period, start_date, end_date)

    patient_q = select(
        Patient.patient_source,
        func.count(Patient.id).label("patient_count"),
    ).where(
        Patient.patient_source.isnot(None),
        Patient.created_at >= date_start, Patient.created_at < date_end,
    )
    if hospital_ids is not None:
        patient_q = patient_q.where(Patient.hospital_id.in_(hospital_ids))
    patient_q = patient_q.group_by(Patient.patient_source)

    revenue_q = select(
        Patient.patient_source,
        func.coalesce(func.sum(Billing.total_amount), 0).label("total_billed"),
        func.coalesce(func.sum(Billing.paid_amount), 0).label("total_revenue"),
    ).join(Case, Case.patient_id == Patient.id
    ).join(Billing, Billing.case_id == Case.id
    ).where(
        Patient.patient_source.isnot(None),
        Billing.updated_at >= date_start, Billing.updated_at < date_end,
    )
    if hospital_ids is not None:
        revenue_q = revenue_q.where(Patient.hospital_id.in_(hospital_ids))
    revenue_q = revenue_q.group_by(Patient.patient_source)

    patient_rows = (await db.execute(patient_q)).all()
    revenue_rows = {r[0]: (float(r[1]), float(r[2])) for r in (await db.execute(revenue_q)).all()}

    rows = []
    for source, pcount in patient_rows:
        billed, rev = revenue_rows.get(source, (0.0, 0.0))
        rows.append([source, pcount, billed, rev])
    for source, (billed, rev) in revenue_rows.items():
        if source not in {r[0] for r in rows}:
            rows.append([source, 0, billed, rev])
    rows.sort(key=lambda r: r[3], reverse=True)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Source", "Patient Count", "Total Billed", "Total Revenue"])
    for row in rows:
        writer.writerow([row[0], row[1], float(row[2]), float(row[3])])

    output.seek(0)
    filename = f"source_revenue_{date_start.strftime('%Y%m%d')}_{date_end.strftime('%Y%m%d')}.{format}"
    media_type = "text/csv" if format == "csv" else "application/vnd.ms-excel"
    return StreamingResponse(iter([output.getvalue()]), media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})
