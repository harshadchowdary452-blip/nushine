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
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate, AppointmentResponse, ReassignDoctorRequest, DoctorSlotResponse
from app.schemas.common import PaginatedResponse
from app.schemas.common import MessageResponse
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.appointment import Appointment, AppointmentStatus
from app.models.audit_log import AuditLog
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


@router.get("/slots", response_model=DoctorSlotResponse)
async def get_doctor_slots(
    doctor_id: str = Query(...),
    date: str = Query(...),
    duration_minutes: int = Query(30),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get available time slots for a doctor on a given date."""
    from datetime import date as date_type
    from app.services.appointment_service import AppointmentService
    try:
        appointment_date = date_type.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format")
    service = AppointmentService(db)
    return await service.get_doctor_slots(doctor_id, appointment_date, duration_minutes)


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(data: AppointmentCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """
    Create appointment with TENANT ISOLATION validation.
    - Verify permission
    - Verify current user hospital matches patient & doctor
    - Verify patient and doctor belong to same hospital
    """
    verify_permission(current_user, Permission.CREATE_APPOINTMENT)
    
    logger.warning("=" * 60)
    logger.warning("POST /appointments - TENANT ISOLATION CHECK")
    logger.warning("=" * 60)
    logger.warning(f"Current User: {current_user.get('sub')}")
    logger.warning(f"Current User Role: {current_user.get('role')}")
    logger.warning(f"Current User Hospital: {current_user.get('hospital_id')}")
    logger.warning(f"Patient ID: {data.patient_id}")
    logger.warning(f"Doctor ID: {data.doctor_id}")
    
    role = current_user.get("role")
    current_user_hospital_id = current_user.get("hospital_id")
    
    # ===== HOSPITAL_ADMIN TENANT ISOLATION =====
    if role == Role.HOSPITAL_ADMIN.value:
        logger.warning("Validating HOSPITAL_ADMIN tenant isolation...")

        if not current_user_hospital_id:
            logger.warning("FAIL: HOSPITAL_ADMIN has no hospital_id assigned")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin has no hospital assigned"
            )

        # Verify patient belongs to admin's hospital
        patient_result = await db.execute(select(Patient.hospital_id).where(Patient.id == data.patient_id))
        patient_row = patient_result.one_or_none()
        if not patient_row:
            logger.warning(f"FAIL: Patient {data.patient_id} not found")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        patient_hospital_id = patient_row[0]
        if patient_hospital_id != current_user_hospital_id:
            logger.warning(f"FAIL: Patient hospital {patient_hospital_id} != Admin hospital {current_user_hospital_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient belongs to different hospital"
            )
        logger.warning(f"✓ Patient hospital matches: {patient_hospital_id}")

        # Verify doctor is in admin's admin group (group-level doctor sharing)
        doctor_result = await db.execute(select(User.admin_group_id).where(User.id == data.doctor_id))
        doctor_row = doctor_result.one_or_none()
        if not doctor_row:
            logger.warning(f"FAIL: Doctor {data.doctor_id} not found")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

        doctor_admin_group_id = doctor_row[0]
        # Resolve admin_group_id: prefer hospital's, fall back to user's
        admin_hosp_result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == current_user_hospital_id))
        admin_hosp_row = admin_hosp_result.one_or_none()
        admin_group_id = admin_hosp_row[0] if admin_hosp_row else current_user.get("admin_group_id")

        if not admin_group_id or doctor_admin_group_id != admin_group_id:
            logger.warning(f"FAIL: Doctor admin_group {doctor_admin_group_id} != expected {admin_group_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctor not in your admin group"
            )
        logger.warning(f"✓ Doctor in same admin group: {admin_group_id}")

    # ===== GROUP_ADMIN TENANT ISOLATION =====
    elif role == Role.GROUP_ADMIN.value:
        logger.warning("Validating GROUP_ADMIN tenant isolation...")

        admin_group_id = current_user.get("admin_group_id")
        if not admin_group_id:
            logger.warning("FAIL: GROUP_ADMIN has no admin_group_id assigned")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin has no group assigned"
            )

        # Verify patient's hospital belongs to admin's group
        patient_result = await db.execute(select(Patient.hospital_id).where(Patient.id == data.patient_id))
        patient_row = patient_result.one_or_none()
        if not patient_row:
            logger.warning(f"FAIL: Patient {data.patient_id} not found")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

        patient_hospital_id = patient_row[0]
        hosp_result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == patient_hospital_id))
        hosp_row = hosp_result.one_or_none()
        patient_admin_group_id = hosp_row[0] if hosp_row else None

        if patient_admin_group_id != admin_group_id:
            logger.warning(f"FAIL: Patient admin_group {patient_admin_group_id} != Group Admin group {admin_group_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Patient not in your admin group"
            )
        logger.warning(f"✓ Patient in same admin group: {admin_group_id}")

        # Verify doctor belongs to admin's group (direct admin_group_id check)
        doctor_result = await db.execute(select(User.admin_group_id).where(User.id == data.doctor_id))
        doctor_row = doctor_result.one_or_none()
        if not doctor_row:
            logger.warning(f"FAIL: Doctor {data.doctor_id} not found")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

        doctor_admin_group_id = doctor_row[0]
        if doctor_admin_group_id != admin_group_id:
            logger.warning(f"FAIL: Doctor admin_group {doctor_admin_group_id} != Admin group {admin_group_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctor not in your admin group"
            )
        logger.warning(f"✓ Doctor in same admin group: {admin_group_id}")
    
    logger.warning("=" * 60)
    logger.warning("Tenant isolation checks PASSED - Creating appointment")
    logger.warning("=" * 60)
    
    service = AppointmentService(db)
    appointment = await service.create(data.model_dump(), user_id=current_user.get("sub"))

    await record_timeline_event(
        db, current_user=current_user, patient_id=data.patient_id,
        action="Appointment Created",
        description=f"Appointment created for patient",
        module="Appointments",
    )

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
    type_filter: Optional[str] = Query(None, alias="type"),
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
    service = AppointmentService(db)
    filters = {}
    if status_filter:
        filters["status"] = status_filter
    if type_filter:
        filters["appointment_type"] = type_filter
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
    return await service.get_all(skip=skip, limit=limit, filters=filters or None)


@router.get("/upcoming")
async def get_upcoming_appointments(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    filters = {}
    result = await _scope_appointments_by_role(db, current_user, filters, None, None)
    if result == []:
        return []
    return await service.get_upcoming(filters=filters if filters else None)


@router.get("/search")
async def search_appointments(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
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
    if type:
        filters["appointment_type"] = type
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


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
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
    if data.status is not None:
        from app.models.appointment import AppointmentStatus
        svc = StatusAutomationService(db)
        await svc.update_appointment_status(appointment_id, AppointmentStatus(data.status))
        await db.commit()
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
    deleted = await service.delete(appointment_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Appointment Deleted",
        description=f"Appointment on {appointment.appointment_date} deleted",
        module="Appointments",
    )
    return MessageResponse(message="Appointment deleted successfully")


@router.post("/{appointment_id}/cancel", response_model=MessageResponse)
async def cancel_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
    patient_id = appointment.patient_id
    appointment = await service.cancel(appointment_id, user_id=current_user.get("sub"))
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    svc = StatusAutomationService(db)
    await svc.update_appointment_status(appointment_id, AppointmentStatus.CANCELLED)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Appointment Cancelled",
        description=f"Appointment on {appointment.appointment_date} cancelled",
        module="Appointments",
    )
    return MessageResponse(message="Appointment cancelled successfully")


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
