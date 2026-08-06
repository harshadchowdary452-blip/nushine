from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timezone
import logging
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.appointment_service import AppointmentService
from app.schemas.appointment import (
    AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    ReassignDoctorRequest, RescheduleRequest, CompleteRequest, CancelRequest,
    DoctorSlotResponse,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.appointment import Appointment, AppointmentStatus
from app.models.audit_log import AuditLog
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan
from app.models.billing import Billing
from app.models.patient_timeline import PatientTimeline
from app.services.status_automation import StatusAutomationService
from app.services.timeline_helper import record_timeline_event, build_changes

router = APIRouter(prefix="/appointments", tags=["Appointments"])
logger = logging.getLogger(__name__)


async def _scope_appointments_by_role(db: AsyncSession, current_user: dict, filters: dict, patient_id: Optional[str], doctor_id: Optional[str]):
    role = current_user.get("role")
    if patient_id:
        filters["patient_id"] = patient_id
    if doctor_id:
        filters["doctor_id"] = doctor_id
    if role == Role.DOCTOR.value:
        filters["doctor_id"] = current_user.get("sub")
    elif role == Role.HOSPITAL_ADMIN.value:
        hid = current_user.get("hospital_id")
        if hid:
            patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id == hid))
            pids = [row[0] for row in patient_result.all()]
            if not pids:
                return []
            filters["patient_id__in"] = pids
    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if agid:
            hosp_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hids = [row[0] for row in hosp_result.all()]
            if not hids:
                return []
            patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))
            pids = [row[0] for row in patient_result.all()]
            if not pids:
                return []
            filters["patient_id__in"] = pids
    return filters


async def _resolve_user_name(db: AsyncSession, user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    result = await db.execute(select(User.full_name).where(User.id == user_id))
    row = result.one_or_none()
    return row[0] if row else None


@router.get("/slots", response_model=DoctorSlotResponse)
async def get_doctor_slots(
    doctor_id: str = Query(...),
    date: str = Query(...),
    duration_minutes: Optional[int] = Query(None),
    procedure_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from datetime import date as date_type
    try:
        appointment_date = date_type.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format")
    service = AppointmentService(db)
    return await service.get_doctor_slots(
        doctor_id,
        appointment_date,
        duration_minutes=duration_minutes,
        procedure_name=procedure_name,
    )


@router.get("/procedure-durations")
async def get_procedure_durations(
    current_user: dict = Depends(get_current_user),
):
    from app.models.appointment import PROCEDURE_DURATIONS
    return {
        "procedures": PROCEDURE_DURATIONS,
    }


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(data: AppointmentCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_APPOINTMENT)

    role = current_user.get("role")
    current_user_hospital_id = current_user.get("hospital_id")

    if role == Role.HOSPITAL_ADMIN.value:
        if not current_user_hospital_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin has no hospital assigned")
        patient_result = await db.execute(select(Patient.hospital_id).where(Patient.id == data.patient_id))
        patient_row = patient_result.one_or_none()
        if not patient_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
        if patient_row[0] != current_user_hospital_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient belongs to different hospital")
        doctor_result = await db.execute(select(User.admin_group_id).where(User.id == data.doctor_id))
        doctor_row = doctor_result.one_or_none()
        if not doctor_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")
        admin_hosp_result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == current_user_hospital_id))
        admin_hosp_row = admin_hosp_result.one_or_none()
        admin_group_id = admin_hosp_row[0] if admin_hosp_row else current_user.get("admin_group_id")
        if not admin_group_id or doctor_row[0] != admin_group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor not in your admin group")

    elif role == Role.GROUP_ADMIN.value:
        admin_group_id = current_user.get("admin_group_id")
        if not admin_group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin has no group assigned")
        patient_result = await db.execute(select(Patient.hospital_id).where(Patient.id == data.patient_id))
        patient_row = patient_result.one_or_none()
        if not patient_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
        hosp_result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == patient_row[0]))
        hosp_row = hosp_result.one_or_none()
        if not hosp_row or hosp_row[0] != admin_group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient not in your admin group")
        doctor_result = await db.execute(select(User.admin_group_id).where(User.id == data.doctor_id))
        doctor_row = doctor_result.one_or_none()
        if not doctor_row or doctor_row[0] != admin_group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor not in your admin group")

    service = AppointmentService(db)
    appointment = await service.create(data.model_dump(), user_id=current_user.get("sub"))

    await record_timeline_event(
        db, current_user=current_user, patient_id=data.patient_id,
        action="Appointment Scheduled",
        description=f"Appointment scheduled for {data.appointment_date} at {data.appointment_time}",
        module="Appointments",
    )

    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.APPOINTMENT_CREATED,
            source_module=EventSource.APPOINTMENT,
            entity_type="APPOINTMENT",
            entity_id=appointment.id,
            hospital_id=getattr(appointment, 'hospital_id', None),
            patient_id=appointment.patient_id,
            doctor_id=getattr(appointment, 'doctor_id', None),
            payload={
                "appointment_id": str(appointment.id),
                "patient_id": str(appointment.patient_id),
                "appointment_date": appointment.appointment_date.isoformat() if appointment.appointment_date else None,
                "status": str(appointment.status.value) if hasattr(appointment.status, 'value') else str(appointment.status),
            },
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)

    return appointment


from datetime import date, time


@router.get("/availability")
async def check_appointment_availability(
    doctor_id: str = Query(...),
    appointment_date: date = Query(...),
    appointment_time: time = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.CREATE_APPOINTMENT)
    service = AppointmentService(db)
    return await service.check_availability(doctor_id, appointment_date, appointment_time)


@router.get("/")
async def get_appointments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    patient_id: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    patient_name: Optional[str] = Query(None),
    op_no: Optional[str] = Query(None),
    mobile: Optional[str] = Query(None),
    abha_id: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query(None, pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    filters = {}
    if status_filter:
        filters["status"] = status_filter
    if date_from:
        filters["date_from"] = date_from
    if date_to:
        filters["date_to"] = date_to
    if patient_name:
        filters["patient_name"] = patient_name
    if op_no:
        filters["op_no"] = op_no
    if mobile:
        filters["mobile"] = mobile
    if abha_id:
        filters["abha_id"] = abha_id
    if payment_status:
        filters["payment_status"] = payment_status
    if search:
        filters["search"] = search
    if sort_by:
        filters["sort_by"] = sort_by
    if sort_order:
        filters["sort_order"] = sort_order
    result = await _scope_appointments_by_role(db, current_user, filters, patient_id, doctor_id)
    if result == []:
        return []
    return await service_get_all(db, skip=skip, limit=limit, filters=filters or None)


@router.get("/upcoming")
async def get_upcoming_appointments(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    filters = {}
    result = await _scope_appointments_by_role(db, current_user, filters, None, None)
    if result == []:
        return []
    service = AppointmentService(db)
    return await service.get_upcoming(filters=filters if filters else None)


@router.get("/search")
async def search_appointments(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    time_from: Optional[str] = Query(None),
    time_to: Optional[str] = Query(None),
    patient_name: Optional[str] = Query(None),
    op_no: Optional[str] = Query(None),
    mobile: Optional[str] = Query(None),
    abha_id: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    created_by_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort_by: Optional[str] = Query("appointment_date"),
    sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    filters = {}
    if search:
        filters["search"] = search
    if status:
        filters["status"] = status
    if date_from:
        filters["date_from"] = date_from
    if date_to:
        filters["date_to"] = date_to
    if time_from:
        filters["time_from"] = time_from
    if time_to:
        filters["time_to"] = time_to
    if patient_name:
        filters["patient_name"] = patient_name
    if op_no:
        filters["op_no"] = op_no
    if mobile:
        filters["mobile"] = mobile
    if abha_id:
        filters["abha_id"] = abha_id
    if payment_status:
        filters["payment_status"] = payment_status
    if created_by_id:
        filters["created_by_id"] = created_by_id

    role = current_user.get("role")
    if role == Role.DOCTOR.value:
        filters["doctor_id"] = current_user.get("sub")
    elif doctor_id:
        filters["doctor_id"] = doctor_id
    elif role == Role.HOSPITAL_ADMIN.value:
        hid = current_user.get("hospital_id")
        if hid:
            patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id == hid))
            pids = [row[0] for row in patient_result.all()]
            if not pids:
                return {"items": [], "total": 0, "page": 1, "size": page_size, "pages": 0}
            filters["patient_id__in"] = pids
    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if agid:
            hosp_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hids = [row[0] for row in hosp_result.all()]
            if not hids:
                return {"items": [], "total": 0, "page": 1, "size": page_size, "pages": 0}
            patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))
            pids = [row[0] for row in patient_result.all()]
            if not pids:
                return {"items": [], "total": 0, "page": 1, "size": page_size, "pages": 0}
            filters["patient_id__in"] = pids

    skip = (page - 1) * page_size
    service = AppointmentService(db)
    repo = service.repo
    count_filters = {k: v for k, v in filters.items()}
    total = await repo.count(filters=count_filters or None)
    descending = sort_order == "desc"
    appointments = await repo.get_all(skip=skip, limit=page_size, filters=filters or None, order_by=sort_by, descending=descending)
    for a in appointments:
        await service._attach_names(a)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": appointments,
        "total": total,
        "page": page,
        "size": page_size,
        "pages": total_pages,
    }


@router.get("/{appointment_id}/full-detail")
async def get_appointment_full_detail(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
    await service._attach_names(appointment)

    patient = appointment.patient
    patient_id = appointment.patient_id

    patient_data = {
        "id": patient.id,
        "full_name": patient.full_name,
        "op_no": patient.op_no,
        "phone": patient.phone,
        "email": patient.email,
        "gender": patient.gender,
        "age": patient.age,
        "date_of_birth": str(patient.date_of_birth) if patient.date_of_birth else None,
        "status": patient.status.value if hasattr(patient.status, "value") else patient.status,
        "hospital_id": patient.hospital_id,
        "doctor_id": patient.doctor_id,
        "created_at": patient.created_at.isoformat() if patient.created_at else None,
        "medical_history": patient.medical_history,
    }

    cases_result = await db.execute(select(Case).where(Case.patient_id == patient_id))
    cases = cases_result.scalars().all()

    case_ids = [c.id for c in cases]
    doctor_ids = {c.doctor_id for c in cases if c.doctor_id}

    doctor_names = {}
    if doctor_ids:
        users_result = await db.execute(select(User.id, User.full_name).where(User.id.in_(doctor_ids)))
        for row in users_result.all():
            doctor_names[row[0]] = row[1]

    cases_data = [
        {
            "id": c.id,
            "case_number": c.case_number,
            "chief_complaint": c.chief_complaint,
            "status": c.status.value if hasattr(c.status, "value") else c.status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "doctor_name": doctor_names.get(c.doctor_id),
            "diagnosis": c.diagnosis,
        }
        for c in cases
    ]

    treatments_data = []
    if case_ids:
        treatments_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.case_id.in_(case_ids)))
        treatments = treatments_result.scalars().all()

        case_doctor_name_map = {c.id: doctor_names.get(c.doctor_id) for c in cases}
        case_number_map = {c.id: c.case_number for c in cases}

        treatments_data = [
            {
                "id": t.id,
                "treatment_number": t.treatment_number,
                "treatment_name": t.treatment_name,
                "status": t.status.value if hasattr(t.status, "value") else t.status,
                "cost": t.cost,
                "paid_amount": t.paid_amount,
                "total_sittings": t.total_sittings,
                "completed_sittings": t.completed_sittings,
                "case_id": t.case_id,
                "case_number": case_number_map.get(t.case_id),
                "doctor_name": case_doctor_name_map.get(t.case_id),
            }
            for t in treatments
        ]

    billings_data = []
    if case_ids:
        billings_result = await db.execute(select(Billing).where(Billing.case_id.in_(case_ids)))
        billings = billings_result.scalars().all()

        case_number_map = {c.id: c.case_number for c in cases}

        billings_data = [
            {
                "id": b.id,
                "invoice_number": b.invoice_number,
                "total_amount": b.total_amount,
                "paid_amount": b.paid_amount,
                "pending_amount": b.pending_amount,
                "payment_status": b.payment_status.value if hasattr(b.payment_status, "value") else b.payment_status,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "case_number": case_number_map.get(b.case_id),
            }
            for b in billings
        ]

    timeline_result = await db.execute(
        select(PatientTimeline).where(PatientTimeline.patient_id == patient_id).order_by(PatientTimeline.created_at.desc()).limit(50)
    )
    timeline_entries = timeline_result.scalars().all()

    timeline_data = [
        {
            "id": t.id,
            "action": t.action,
            "description": t.description,
            "module": t.module,
            "user_name": t.user_name,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "changes": t.changes,
        }
        for t in timeline_entries
    ]

    related_result = await db.execute(
        select(Appointment).where(
            Appointment.patient_id == patient_id,
            Appointment.id != appointment_id,
        ).order_by(Appointment.appointment_date.desc())
    )
    related_appointments = related_result.scalars().all()

    related_case_ids = {a.id for a in related_appointments if a.id}
    related_case_number_map = {}
    if related_case_ids:
        rel_cases_result = await db.execute(
            select(Case.appointment_id, Case.case_number).where(Case.appointment_id.in_(related_case_ids))
        )
        for row in rel_cases_result.all():
            related_case_number_map[row[0]] = row[1]

    related_doctor_ids = {a.doctor_id for a in related_appointments if a.doctor_id}
    if related_doctor_ids - doctor_names.keys():
        extra_users = await db.execute(select(User.id, User.full_name).where(User.id.in_(related_doctor_ids - doctor_names.keys())))
        for row in extra_users.all():
            doctor_names[row[0]] = row[1]

    related_appointments_data = [
        {
            "id": a.id,
            "appointment_number": a.appointment_number,
            "appointment_date": str(a.appointment_date) if a.appointment_date else None,
            "appointment_time": str(a.appointment_time) if a.appointment_time else None,
            "status": a.status.value if hasattr(a.status, "value") else a.status,
            "doctor_name": doctor_names.get(a.doctor_id),
            "case_number": related_case_number_map.get(a.id),
        }
        for a in related_appointments
    ]

    appointment_data = {
        "id": appointment.id,
        "appointment_number": appointment.appointment_number,
        "patient_id": appointment.patient_id,
        "doctor_id": appointment.doctor_id,
        "patient_name": appointment.patient_name if hasattr(appointment, "patient_name") else None,
        "doctor_name": appointment.doctor_name if hasattr(appointment, "doctor_name") else None,
        "appointment_date": str(appointment.appointment_date) if appointment.appointment_date else None,
        "appointment_time": str(appointment.appointment_time) if appointment.appointment_time else None,
        "duration_minutes": appointment.duration_minutes,
        "end_time": str(appointment.end_time) if appointment.end_time else None,
        "status": appointment.status.value if hasattr(appointment.status, "value") else appointment.status,
        "notes": appointment.notes,
        "is_active": appointment.is_active,
        "created_at": appointment.created_at.isoformat() if appointment.created_at else None,
        "updated_at": appointment.updated_at.isoformat() if appointment.updated_at else None,
        "created_by_name": appointment.created_by.full_name if appointment.created_by else None,
        "updated_by_name": appointment.updated_by.full_name if appointment.updated_by else None,
        "previous_date": str(appointment.previous_date) if appointment.previous_date else None,
        "previous_time": str(appointment.previous_time) if appointment.previous_time else None,
        "rescheduled_by_name": appointment.rescheduled_by.full_name if appointment.rescheduled_by else None,
        "rescheduled_at": appointment.rescheduled_at.isoformat() if appointment.rescheduled_at else None,
        "reschedule_reason": appointment.reschedule_reason,
        "cancelled_by_name": appointment.cancelled_by.full_name if appointment.cancelled_by else None,
        "cancelled_at": appointment.cancelled_at.isoformat() if appointment.cancelled_at else None,
        "cancellation_reason": appointment.cancellation_reason,
        "completed_by_name": appointment.completed_by.full_name if appointment.completed_by else None,
        "completed_at": appointment.completed_at.isoformat() if appointment.completed_at else None,
    }

    return {
        "appointment": appointment_data,
        "patient": patient_data,
        "cases": cases_data,
        "treatments": treatments_data,
        "billings": billings_data,
        "timeline": timeline_data,
        "related_appointments": related_appointments_data,
    }


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
    await service._attach_names(appointment)
    return appointment


@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(appointment_id: str, data: AppointmentUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
    old_data = {"status": appointment.status.value if hasattr(appointment.status, 'value') else appointment.status, "appointment_date": str(appointment.appointment_date) if appointment.appointment_date else None, "appointment_time": str(appointment.appointment_time) if appointment.appointment_time else None, "notes": appointment.notes}
    updated = await service.update(appointment_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    new_data = {"status": updated.status.value if hasattr(updated.status, 'value') else updated.status, "appointment_date": str(updated.appointment_date) if updated.appointment_date else None, "appointment_time": str(updated.appointment_time) if updated.appointment_time else None, "notes": updated.notes}
    changes = build_changes(old_data, new_data)
    await record_timeline_event(
        db, current_user=current_user, patient_id=appointment.patient_id,
        action="Appointment Updated",
        description=f"Appointment updated",
        module="Appointments",
        changes=changes,
    )
    return updated


@router.delete("/{appointment_id}", response_model=MessageResponse)
async def delete_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
    patient_id = appointment.patient_id
    await service.delete(appointment_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Appointment Deleted",
        description=f"Appointment on {appointment.appointment_date} deleted",
        module="Appointments",
    )
    return MessageResponse(message="Appointment deleted successfully")


# ── CANCEL ──────────────────────────────────────────────────────────────
@router.post("/{appointment_id}/cancel", response_model=MessageResponse)
async def cancel_appointment(appointment_id: str, req: CancelRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)

    now = datetime.now(timezone.utc)
    appointment.status = AppointmentStatus.CANCELLED
    appointment.cancelled_by_id = current_user.get("sub")
    appointment.cancelled_at = now
    appointment.cancellation_reason = req.reason
    appointment.updated_at = now
    appointment.updated_by_id = current_user.get("sub")

    audit = AuditLog(
        user_id=current_user.get("sub"),
        action="CANCEL_APPOINTMENT",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        details=f"Appointment cancelled. Reason: {req.reason or 'Not specified'}",
    )
    db.add(audit)
    await db.refresh(appointment)

    cancelled_by_name = await _resolve_user_name(db, current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=appointment.patient_id,
        action="Appointment Cancelled",
        description=f"Appointment on {appointment.appointment_date} cancelled by {cancelled_by_name or 'system'}{': ' + req.reason if req.reason else ''}",
        module="Appointments",
        changes=[{"field": "status", "old_value": "SCHEDULED", "new_value": "CANCELLED"}],
    )

    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.APPOINTMENT_CANCELLED,
            source_module=EventSource.APPOINTMENT,
            entity_type="APPOINTMENT",
            entity_id=appointment.id,
            hospital_id=getattr(appointment, 'hospital_id', None),
            patient_id=appointment.patient_id,
            doctor_id=getattr(appointment, 'doctor_id', None),
            payload={
                "appointment_id": str(appointment.id),
                "patient_id": str(appointment.patient_id),
            },
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    await db.commit()

    return MessageResponse(message="Appointment cancelled successfully")


# ── COMPLETE ────────────────────────────────────────────────────────────
@router.post("/{appointment_id}/complete", response_model=AppointmentResponse)
async def complete_appointment(appointment_id: str, req: CompleteRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)

    now = datetime.now(timezone.utc)
    appointment.status = AppointmentStatus.COMPLETED
    appointment.completed_by_id = current_user.get("sub")
    appointment.completed_at = now
    if req.notes:
        appointment.notes = req.notes
    appointment.updated_at = now
    appointment.updated_by_id = current_user.get("sub")

    audit = AuditLog(
        user_id=current_user.get("sub"),
        action="COMPLETE_APPOINTMENT",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        details="Appointment marked as completed",
    )
    db.add(audit)

    svc = StatusAutomationService(db)
    await svc.update_appointment_status(appointment_id, AppointmentStatus.COMPLETED)
    await db.refresh(appointment)

    completed_by_name = await _resolve_user_name(db, current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=appointment.patient_id,
        action="Appointment Completed",
        description=f"Appointment on {appointment.appointment_date} completed by {completed_by_name or 'system'}",
        module="Appointments",
        changes=[{"field": "status", "old_value": "SCHEDULED", "new_value": "COMPLETED"}],
    )

    await service._attach_names(appointment)

    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.APPOINTMENT_COMPLETED,
            source_module=EventSource.APPOINTMENT,
            entity_type="APPOINTMENT",
            entity_id=appointment.id,
            hospital_id=getattr(appointment, 'hospital_id', None),
            patient_id=appointment.patient_id,
            doctor_id=getattr(appointment, 'doctor_id', None),
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    await db.commit()

    return appointment


# ── RESCHEDULE ──────────────────────────────────────────────────────────
@router.post("/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appointment(appointment_id: str, req: RescheduleRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)

    await service._validate_appointment_slot(
        appointment.doctor_id, req.appointment_date, req.appointment_time, appointment.duration_minutes
    )

    old_date = appointment.appointment_date
    old_time = appointment.appointment_time
    now = datetime.now(timezone.utc)

    appointment.previous_date = old_date
    appointment.previous_time = old_time
    appointment.appointment_date = req.appointment_date
    appointment.appointment_time = req.appointment_time
    appointment.status = AppointmentStatus.SCHEDULED
    appointment.rescheduled_by_id = current_user.get("sub")
    appointment.rescheduled_at = now
    appointment.reschedule_reason = req.reason
    appointment.updated_at = now
    appointment.updated_by_id = current_user.get("sub")

    from app.services.appointment_service import compute_end_time
    appointment.end_time = compute_end_time(req.appointment_time, appointment.duration_minutes)

    audit = AuditLog(
        user_id=current_user.get("sub"),
        action="RESCHEDULE_APPOINTMENT",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        details=f"Rescheduled from {old_date} {old_time} to {req.appointment_date} {req.appointment_time}. Reason: {req.reason or 'Not specified'}",
    )
    db.add(audit)
    await db.flush()

    rescheduled_by_name = await _resolve_user_name(db, current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=appointment.patient_id,
        action="Appointment Rescheduled",
        description=f"Rescheduled from {old_date} {old_time} to {req.appointment_date} {req.appointment_time} by {rescheduled_by_name or 'system'}{': ' + req.reason if req.reason else ''}",
        module="Appointments",
        changes=[
            {"field": "appointment_date", "old_value": str(old_date), "new_value": str(req.appointment_date)},
            {"field": "appointment_time", "old_value": str(old_time), "new_value": str(req.appointment_time)},
        ],
    )

    await service._attach_names(appointment)

    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.APPOINTMENT_RESCHEDULED,
            source_module=EventSource.APPOINTMENT,
            entity_type="APPOINTMENT",
            entity_id=appointment.id,
            hospital_id=getattr(appointment, 'hospital_id', None),
            patient_id=appointment.patient_id,
            doctor_id=getattr(appointment, 'doctor_id', None),
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    await db.commit()

    return appointment


@router.post("/{appointment_id}/reassign-doctor")
async def reassign_appointment_doctor(
    appointment_id: str,
    req: ReassignDoctorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    user_id = current_user.get("sub")

    appointment = await db.get(Appointment, appointment_id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)

    old_doctor_id = appointment.doctor_id
    old_doctor = await db.get(User, old_doctor_id) if old_doctor_id else None

    new_doctor = await db.get(User, req.doctor_id)
    if not new_doctor:
        raise HTTPException(status_code=404, detail="New doctor not found")

    appointment.doctor_id = req.doctor_id
    appointment.updated_at = datetime.now(timezone.utc)

    audit = AuditLog(
        user_id=user_id,
        action="REASSIGN_DOCTOR",
        entity_type="APPOINTMENT",
        entity_id=appointment_id,
        details=f"Doctor changed from {old_doctor.full_name if old_doctor else old_doctor_id} to {new_doctor.full_name}. Reason: {req.reason or 'Not specified'}",
    )
    db.add(audit)
    await record_timeline_event(
        db, current_user=current_user, patient_id=appointment.patient_id,
        action="Doctor Reassigned",
        description=f"Doctor changed from {old_doctor.full_name if old_doctor else old_doctor_id} to {new_doctor.full_name}",
        module="Appointments",
        changes=[{"field": "doctor", "old_value": old_doctor.full_name if old_doctor else old_doctor_id, "new_value": new_doctor.full_name}],
    )
    await db.commit()
    await db.refresh(appointment)

    return {
        "success": True,
        "appointment_id": appointment_id,
        "old_doctor_id": old_doctor_id,
        "new_doctor_id": req.doctor_id,
        "new_doctor_name": new_doctor.full_name,
        "reason": req.reason,
    }


# ── Helper: get_all with service ────────────────────────────────────────
async def service_get_all(db: AsyncSession, skip=0, limit=100, filters=None):
    service = AppointmentService(db)
    return await service.get_all(skip=skip, limit=limit, filters=filters)
