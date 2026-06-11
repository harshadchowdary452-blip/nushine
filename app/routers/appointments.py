from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.appointment_service import AppointmentService
from app.schemas.appointment import AppointmentCreate, AppointmentUpdate, AppointmentResponse
from app.schemas.common import MessageResponse
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.appointment import AppointmentStatus
from app.services.status_automation import StatusAutomationService

router = APIRouter(prefix="/appointments", tags=["Appointments"])


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


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(data: AppointmentCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_APPOINTMENT)
    service = AppointmentService(db)
    return await service.create(data.model_dump(), user_id=current_user.get("sub"))


@router.get("/")
async def get_appointments(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), patient_id: Optional[str] = Query(None), doctor_id: Optional[str] = Query(None), status_filter: Optional[str] = Query(None, alias="status"), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
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
