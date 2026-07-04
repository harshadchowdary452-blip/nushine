from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import os, shutil, uuid
from datetime import date
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.models.appointment import Appointment
from app.models.case import Case
from app.models.patient import Patient
from app.services.patient_service import PatientService
from app.services.timeline_service import TimelineService
from app.services.timeline_helper import record_timeline_event, build_changes
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse
from app.schemas.common import MessageResponse
from app.config import settings

router = APIRouter(prefix="/patients", tags=["Patients"])

TRACKED_PATIENT_FIELDS = ["full_name", "gender", "phone", "email", "address", "age", "abha_id",
                          "op_no", "height", "weight", "bp", "sugar", "spo2", "medical_history",
                          "emergency_contact", "patient_source", "doctor_id", "status", "date_of_birth"]


@router.post("/", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(data: PatientCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_PATIENT)
    service = PatientService(db)
    data_dict = data.model_dump(exclude_none=True)
    role = current_user.get("role")
    if role in (Role.DOCTOR.value, Role.HOSPITAL_ADMIN.value):
        data_dict["hospital_id"] = current_user.get("hospital_id")
    elif not data_dict.get("hospital_id") and current_user.get("hospital_id"):
        data_dict["hospital_id"] = current_user.get("hospital_id")
    if not data_dict.get("hospital_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
    if role == Role.DOCTOR.value:
        if not data_dict.get("doctor_id"):
            data_dict["doctor_id"] = current_user.get("sub")
    patient = await service.create(data_dict, user_id=current_user.get("sub"))
    await record_timeline_event(db, patient_id=str(patient.id), action="Patient Created",
        module="patient", description=f"Patient '{patient.full_name}' created",
        current_user=current_user)
    return patient


@router.get("/")
async def get_patients(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), hospital_id: Optional[str] = Query(None), doctor_id: Optional[str] = Query(None), status_filter: Optional[str] = Query(None, alias="status"), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    service = PatientService(db)
    filters = {}
    if doctor_id:
        filters["doctor_id"] = doctor_id
    if status_filter:
        filters["status"] = status_filter
    role = current_user.get("role")
    if role == Role.DOCTOR.value:
        if current_user.get("sub"):
            did = current_user.get("sub")
            direct_ids = select(Patient.id).where(Patient.doctor_id == did)
            appt_ids = select(Appointment.patient_id).where(Appointment.doctor_id == did, Appointment.is_active == True)
            case_ids = select(Case.patient_id).where(Case.doctor_id == did)
            union_query = direct_ids.union(appt_ids, case_ids)
            result = await db.execute(union_query)
            pids = [row[0] for row in result.all()]
            if pids:
                filters["id__in"] = pids
            else:
                return []
        elif current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.HOSPITAL_ADMIN.value:
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        from app.models.hospital import Hospital
        agid = current_user.get("admin_group_id")
        if agid:
            hospital_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hids = [row[0] for row in hospital_result.all()]
            if hids:
                filters["hospital_id__in"] = hids
            else:
                return []
    else:
        if hospital_id:
            filters["hospital_id"] = hospital_id
    return await service.get_all(skip=skip, limit=limit, filters=filters or None)


@router.get("/search")
async def search_patients(q: str = Query(..., min_length=1), hospital_id: Optional[str] = Query(None), doctor_id: Optional[str] = Query(None), status_filter: Optional[str] = Query(None, alias="status"), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    service = PatientService(db)
    role = current_user.get("role")
    effective_hospital_id = hospital_id
    effective_doctor_id = doctor_id
    if role == Role.DOCTOR.value:
        effective_doctor_id = current_user.get("sub")
        if not effective_hospital_id and current_user.get("hospital_id"):
            effective_hospital_id = current_user.get("hospital_id")
    elif role == Role.HOSPITAL_ADMIN.value:
        if not effective_hospital_id and current_user.get("hospital_id"):
            effective_hospital_id = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        from app.models.hospital import Hospital
        agid = current_user.get("admin_group_id")
        if agid:
            hospital_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hospital_ids = [row[0] for row in hospital_result.all()]
            if hospital_ids:
                return await service.search(q, hospital_ids_in=hospital_ids, doctor_id=effective_doctor_id, status_filter=status_filter)
    return await service.search(q, hospital_id=effective_hospital_id, doctor_id=effective_doctor_id, status_filter=status_filter)


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(patient_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    return patient


@router.get("/{patient_id}/timeline")
async def get_patient_timeline(
    patient_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    module: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    service = TimelineService(db)
    entries, total = await service.get_timeline(
        patient_id=patient_id, skip=skip, limit=limit,
        module=module, user_id=user_id, action_type=action_type,
        search=search, start_date=start_date, end_date=end_date,
    )
    return {"entries": entries, "total": total, "skip": skip, "limit": limit}


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(patient_id: str, data: PatientUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    old_data = {f: getattr(patient, f, None) for f in TRACKED_PATIENT_FIELDS}
    update_data = data.model_dump(exclude_none=True)
    patient = await service.update(patient_id, update_data, user_id=current_user.get("sub"))
    if patient:
        changes = build_changes(update_data, old_data, TRACKED_PATIENT_FIELDS)
        await record_timeline_event(db, patient_id=patient_id, action="Patient Updated",
            module="patient", description=f"Patient '{patient.full_name}' updated",
            current_user=current_user, changes=changes)
    return patient


@router.delete("/{patient_id}", response_model=MessageResponse)
async def delete_patient(patient_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    await record_timeline_event(db, patient_id=patient_id, action="Patient Deleted",
        module="patient", description=f"Patient '{patient.full_name}' deleted",
        current_user=current_user)
    deleted = await service.delete(patient_id, user_id=current_user.get("sub"))
    return MessageResponse(message="Patient deleted successfully")


@router.post("/{patient_id}/photo", response_model=PatientResponse)
async def upload_patient_photo(patient_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    upload_path = os.path.join(settings.UPLOAD_DIR, "patient_photos")
    os.makedirs(upload_path, exist_ok=True)
    with open(os.path.join(upload_path, filename), "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    patient = await service.update(patient_id, {"photo_url": f"/uploads/patient_photos/{filename}"}, user_id=current_user.get("sub"))
    await record_timeline_event(db, patient_id=patient_id, action="Photo Uploaded",
        module="patient", description="Patient photo uploaded",
        current_user=current_user)
    return patient
