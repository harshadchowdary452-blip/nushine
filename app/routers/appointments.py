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
from app.schemas.common import MessageResponse
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.user import User
from app.models.appointment import Appointment, AppointmentStatus
from app.models.audit_log import AuditLog
from app.services.status_automation import StatusAutomationService

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

        # Verify doctor belongs to admin's admin group (group-level doctor sharing)
        doctor_result = await db.execute(select(User.admin_group_id).where(User.id == data.doctor_id))
        doctor_row = doctor_result.one_or_none()
        if not doctor_row:
            logger.warning(f"FAIL: Doctor {data.doctor_id} not found")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

        doctor_admin_group_id = doctor_row[0]
        # Get admin's admin_group_id from their hospital
        admin_hosp_result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == current_user_hospital_id))
        admin_hosp_row = admin_hosp_result.one_or_none()
        admin_group_id_from_hospital = admin_hosp_row[0] if admin_hosp_row else None

        if not admin_group_id_from_hospital or doctor_admin_group_id != admin_group_id_from_hospital:
            logger.warning(f"FAIL: Doctor admin_group {doctor_admin_group_id} != Admin's hospital admin_group {admin_group_id_from_hospital}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Doctor not in your admin group"
            )
        logger.warning(f"✓ Doctor in same admin group: {admin_group_id_from_hospital}")

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
    
    # Auto-create case if patient has no active case
    from app.models.case import Case
    existing = await db.execute(
        select(Case).where(Case.patient_id == data.patient_id, Case.is_active == True).limit(1)
    )
    if not existing.scalar_one_or_none():
        svc = StatusAutomationService(db)
        await svc._auto_create_case_from_appointment(appointment)
    
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
async def get_appointments(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), patient_id: Optional[str] = Query(None), doctor_id: Optional[str] = Query(None), status_filter: Optional[str] = Query(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    filters = {}
    if status_filter:
        filters["status"] = status_filter
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
    appointment = await service.update(appointment_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    if data.status is not None:
        from app.models.appointment import AppointmentStatus
        svc = StatusAutomationService(db)
        await svc.update_appointment_status(appointment_id, AppointmentStatus(data.status))
        await db.commit()
    return appointment


@router.delete("/{appointment_id}", response_model=MessageResponse)
async def delete_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
    deleted = await service.delete(appointment_id, user_id=current_user.get("sub"))
    return MessageResponse(message="Appointment deleted successfully")


@router.post("/{appointment_id}/cancel", response_model=MessageResponse)
async def cancel_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)
    service = AppointmentService(db)
    appointment = await service.get(appointment_id)
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    await verify_tenant_access(current_user, appointment, "appointment", db)
    appointment = await service.cancel(appointment_id, user_id=current_user.get("sub"))
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    svc = StatusAutomationService(db)
    await svc.update_appointment_status(appointment_id, AppointmentStatus.CANCELLED)
    await db.commit()
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
