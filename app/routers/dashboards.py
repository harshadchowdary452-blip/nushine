from datetime import datetime, date, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case as sql_case
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
from app.models.treatment_plan import TreatmentPlan

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])


@router.get("/super-admin")
async def super_admin_dashboard(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    now = datetime.now(timezone.utc)
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    quarter_month = ((now.month - 1) // 3) * 3 + 1
    current_quarter_start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)

    total_groups = (await db.execute(select(func.count(AdminGroup.id)))).scalar() or 0
    total_hospitals = (await db.execute(select(func.count(Hospital.id)))).scalar() or 0
    total_doctors = (await db.execute(select(func.count(User.id)).where(User.role == Role.DOCTOR.value))).scalar() or 0
    total_patients = (await db.execute(select(func.count(Patient.id)))).scalar() or 0

    all_billings = await db.execute(select(Billing))
    billings = all_billings.scalars().all()
    total_revenue = sum(b.paid_amount for b in billings)

    revenue_this_month = sum(b.paid_amount for b in billings if b.updated_at and b.updated_at >= current_month_start)
    revenue_this_quarter = sum(b.paid_amount for b in billings if b.updated_at and b.updated_at >= current_quarter_start)
    revenue_this_year = sum(b.paid_amount for b in billings if b.updated_at and b.updated_at >= current_year_start)

    groups_result = await db.execute(select(AdminGroup))
    groups = groups_result.scalars().all()
    hospitals_result = await db.execute(select(Hospital))
    hospitals_list = hospitals_result.scalars().all()
    cases_result = await db.execute(select(Case))
    all_cases = cases_result.scalars().all()

    top_groups = []
    for g in groups:
        group_hospitals = [h for h in hospitals_list if h.admin_group_id == g.id]
        group_patient_ids = set()
        for h in group_hospitals:
            result = await db.execute(select(Patient.id).where(Patient.hospital_id == h.id))
            group_patient_ids.update(row[0] for row in result.all())
        group_cases = [c for c in all_cases if c.patient_id in group_patient_ids]
        group_case_ids = {c.id for c in group_cases}
        group_rev = sum(b.paid_amount for b in billings if b.case_id in group_case_ids)
        top_groups.append({"name": g.name, "value": group_rev})
    top_groups.sort(key=lambda x: x["value"], reverse=True)

    top_hospitals = []
    for h in hospitals_list:
        result_p = await db.execute(select(Patient.id).where(Patient.hospital_id == h.id))
        h_patient_ids = {row[0] for row in result_p.all()}
        h_cases = [c for c in all_cases if c.patient_id in h_patient_ids]
        h_case_ids = {c.id for c in h_cases}
        h_rev = sum(b.paid_amount for b in billings if b.case_id in h_case_ids)
        top_hospitals.append({"name": h.name, "value": h_rev})
    top_hospitals.sort(key=lambda x: x["value"], reverse=True)

    return {
        "total_groups": total_groups,
        "total_hospitals": total_hospitals,
        "total_doctors": total_doctors,
        "total_patients": total_patients,
        "total_revenue": total_revenue,
        "revenue_this_month": revenue_this_month,
        "revenue_this_quarter": revenue_this_quarter,
        "revenue_this_year": revenue_this_year,
        "revenue_growth": 0,
        "patient_growth": 0,
        "hospital_growth": 0,
        "doctor_growth": 0,
        "top_groups": top_groups[:5],
        "top_hospitals": top_hospitals[:5],
    }


@router.get("/group-admin")
async def group_admin_dashboard(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != Role.GROUP_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    admin_group_id = current_user.get("admin_group_id")
    if not admin_group_id:
        return {"total_hospitals": 0, "total_doctors": 0, "total_patients": 0, "total_revenue": 0, "revenue_growth": 0, "top_hospitals": [], "top_doctors": []}

    hospitals_result = await db.execute(select(Hospital).where(Hospital.admin_group_id == admin_group_id))
    hospitals = hospitals_result.scalars().all()
    hospital_ids = [h.id for h in hospitals]

    total_hospitals = len(hospitals)
    total_doctors = (await db.execute(select(func.count(User.id)).where(User.role == Role.DOCTOR.value, User.admin_group_id == admin_group_id))).scalar() or 0

    all_billings = await db.execute(select(Billing))
    billings = all_billings.scalars().all()
    cases_result = await db.execute(select(Case))
    all_cases = cases_result.scalars().all()

    total_patients = 0
    total_revenue = 0
    top_hospitals = []
    for h in hospitals:
        p_result = await db.execute(select(Patient).where(Patient.hospital_id == h.id))
        patients = p_result.scalars().all()
        total_patients += len(patients)
        patient_ids = {p.id for p in patients}
        h_cases = [c for c in all_cases if c.patient_id in patient_ids]
        h_case_ids = {c.id for c in h_cases}
        h_rev = sum(b.paid_amount for b in billings if b.case_id in h_case_ids)
        total_revenue += h_rev
        top_hospitals.append({"name": h.name, "value": h_rev})
    top_hospitals.sort(key=lambda x: x["value"], reverse=True)

    doctors_result = await db.execute(select(User).where(User.role == Role.DOCTOR.value, User.admin_group_id == admin_group_id))
    doctors = doctors_result.scalars().all()
    top_doctors = []
    for d in doctors:
        d_cases = [c for c in all_cases if c.doctor_id == d.id]
        d_case_ids = {c.id for c in d_cases}
        d_rev = sum(b.paid_amount for b in billings if b.case_id in d_case_ids)
        top_doctors.append({"name": d.full_name, "value": d_rev})
    top_doctors.sort(key=lambda x: x["value"], reverse=True)

    return {
        "total_hospitals": total_hospitals,
        "total_doctors": total_doctors,
        "total_patients": total_patients,
        "total_revenue": total_revenue,
        "revenue_growth": 0,
        "top_hospitals": top_hospitals[:5],
        "top_doctors": top_doctors[:5],
    }


@router.get("/hospital-admin")
async def hospital_admin_dashboard(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != Role.HOSPITAL_ADMIN.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    hospital_id = current_user.get("hospital_id")

    if not hospital_id:
        return {"today_appointments": 0, "total_revenue": 0.0, "total_patients": 0, "total_cases": 0, "revenue_growth": 0, "top_doctors": [], "top_treatments": []}

    total_patients = (await db.execute(select(func.count(Patient.id)).where(Patient.hospital_id == hospital_id))).scalar() or 0

    patients_result = await db.execute(select(Patient.id).where(Patient.hospital_id == hospital_id))
    patient_ids = {row[0] for row in patients_result.all()}

    cases_result = await db.execute(select(Case))
    all_cases = cases_result.scalars().all()
    hospital_cases = [c for c in all_cases if c.patient_id in patient_ids]
    hospital_case_ids = {c.id for c in hospital_cases}

    billings_result = await db.execute(select(Billing))
    all_billings = billings_result.scalars().all()
    hospital_billings = [b for b in all_billings if b.case_id in hospital_case_ids]
    total_revenue = sum(b.paid_amount for b in hospital_billings)

    doctors_result = await db.execute(select(User).where(User.role == Role.DOCTOR.value, User.hospital_id == hospital_id))
    doctors = doctors_result.scalars().all()
    doctor_ids = {d.id for d in doctors}

    today = date.today()
    today_appointments = (await db.execute(select(func.count(Appointment.id)).where(Appointment.doctor_id.in_(doctor_ids), Appointment.appointment_date == today, Appointment.is_active == True))).scalar() or 0

    top_doctors = []
    for d in doctors:
        d_cases = [c for c in all_cases if c.doctor_id == d.id]
        d_case_ids = {c.id for c in d_cases}
        d_rev = sum(b.paid_amount for b in hospital_billings if b.case_id in d_case_ids)
        top_doctors.append({"name": d.full_name, "value": d_rev})
    top_doctors.sort(key=lambda x: x["value"], reverse=True)

    treatment_name_counts = {}
    for c in hospital_cases:
        tp_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.case_id == c.id))
        plans = tp_result.scalars().all()
        for tp in plans:
            treatment_name_counts[tp.treatment_name] = treatment_name_counts.get(tp.treatment_name, 0) + 1

    top_treatments = sorted([{"name": n, "value": v} for n, v in treatment_name_counts.items()], key=lambda x: x["value"], reverse=True)

    return {
        "today_appointments": today_appointments,
        "total_revenue": total_revenue,
        "total_patients": total_patients,
        "total_cases": len(hospital_cases),
        "revenue_growth": 0,
        "top_doctors": top_doctors[:5],
        "top_treatments": top_treatments[:5],
    }


@router.get("/doctor")
async def doctor_dashboard(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != Role.DOCTOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    doctor_id = current_user.get("sub")

    my_patients = (await db.execute(select(func.count(Patient.id)).where(Patient.doctor_id == doctor_id))).scalar() or 0

    today = date.today()
    today_appointments = (await db.execute(select(func.count(Appointment.id)).where(Appointment.doctor_id == doctor_id, Appointment.appointment_date == today, Appointment.status == AppointmentStatus.SCHEDULED, Appointment.is_active == True))).scalar() or 0

    cases_result = await db.execute(select(Case).where(Case.doctor_id == doctor_id))
    my_cases = cases_result.scalars().all()

    active_statuses = {CaseStatus.IN_PROGRESS, CaseStatus.DIAGNOSIS_PENDING, CaseStatus.TREATMENT_PLANNED, CaseStatus.FOLLOW_UP}
    active_cases = [c for c in my_cases if c.status in active_statuses]
    completed_cases = [c for c in my_cases if c.status == CaseStatus.COMPLETED]

    my_case_ids = {c.id for c in my_cases}
    billings_result = await db.execute(select(Billing))
    all_billings = billings_result.scalars().all()
    personal_revenue = sum(b.paid_amount for b in all_billings if b.case_id in my_case_ids)

    follow_ups = [c for c in my_cases if c.status == CaseStatus.FOLLOW_UP]
    treatment_success_rate = round((len(completed_cases) / len(my_cases) * 100) if my_cases else 0, 1)
    follow_up_rate = round((len(follow_ups) / len(my_cases) * 100) if my_cases else 0, 1)

    return {
        "my_patients": my_patients,
        "today_appointments": today_appointments,
        "active_cases": len(active_cases),
        "personal_revenue": personal_revenue,
        "cases_completed": len(completed_cases),
        "treatment_success_rate": treatment_success_rate,
        "follow_up_rate": follow_up_rate,
        "pending_follow_ups": len(follow_ups),
    }
