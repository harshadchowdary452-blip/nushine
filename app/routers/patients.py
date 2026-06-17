from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import os, shutil, uuid
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.patient_service import PatientService
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse
from app.schemas.common import MessageResponse
from app.config import settings

router = APIRouter(prefix="/patients", tags=["Patients"])


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
    return await service.create(data_dict, user_id=current_user.get("sub"))


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
            filters["doctor_id"] = current_user.get("sub")
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.HOSPITAL_ADMIN.value:
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        from app.models.hospital import Hospital
        from sqlalchemy import select
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
        from sqlalchemy import select
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


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(patient_id: str, data: PatientUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    patient = await service.update(patient_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    return patient


@router.delete("/{patient_id}", response_model=MessageResponse)
async def delete_patient(patient_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
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
    return patient
