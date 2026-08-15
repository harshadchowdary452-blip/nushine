from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import date
import logging
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.core.tenant import get_user_admin_group_id, get_group_hospital_ids
from app.models.appointment import Appointment
from app.models.case import Case
from app.models.patient import Patient
from app.services.patient_service import PatientService
from app.services.timeline_service import TimelineService
from app.services.timeline_helper import record_timeline_event, build_changes
from app.schemas.patient import PatientCreate, PatientUpdate, PatientResponse
from app.schemas.common import MessageResponse
from app.config import settings
from app.utils.uploads import save_upload

logger = logging.getLogger(__name__)

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
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.PATIENT_REGISTERED,
            source_module=EventSource.PATIENT,
            entity_type="PATIENT",
            entity_id=patient.id,
            hospital_id=patient.hospital_id,
            patient_id=patient.id,
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    return patient


@router.get("/")
async def get_patients(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    gender: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    op_no: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    abha_id: Optional[str] = Query(None),
    patient_source: Optional[str] = Query(None),
    age_from: Optional[int] = Query(None),
    age_to: Optional[int] = Query(None),
    case_status: Optional[str] = Query(None),
    treatment_status: Optional[str] = Query(None),
    billing_status: Optional[str] = Query(None),
    created_at_from: Optional[str] = Query(None),
    created_at_to: Optional[str] = Query(None),
    last_visit_from: Optional[str] = Query(None),
    last_visit_to: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query(None, pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    service = PatientService(db)
    filters = {}
    if search:
        filters["search"] = search
    if doctor_id:
        filters["doctor_id"] = doctor_id
    if status_filter:
        filters["status"] = status_filter
    if gender:
        filters["gender"] = gender
    if op_no:
        filters["op_no"] = op_no
    if phone:
        filters["phone"] = phone
    if abha_id:
        filters["abha_id"] = abha_id
    if patient_source:
        filters["patient_source"] = patient_source
    if age_from is not None:
        filters["age_from"] = age_from
    if age_to is not None:
        filters["age_to"] = age_to
    if case_status:
        filters["case_status"] = case_status
    if treatment_status:
        filters["treatment_status"] = treatment_status
    if billing_status:
        filters["billing_status"] = billing_status
    if created_at_from:
        filters["created_at_from"] = created_at_from
    if created_at_to:
        filters["created_at_to"] = created_at_to
    if last_visit_from:
        filters["last_visit_from"] = last_visit_from
    if last_visit_to:
        filters["last_visit_to"] = last_visit_to
    if sort_by:
        filters["sort_by"] = sort_by
    if sort_order:
        filters["sort_order"] = sort_order
    role = current_user.get("role")
    if role == Role.DOCTOR.value:
        # Doctors see patients of all hospitals in their admin group (the group
        # admin's hospitals) so they can pick a patient when writing case reports.
        agid = await get_user_admin_group_id(db, current_user)
        if agid:
            hids = await get_group_hospital_ids(db, agid)
            if hids:
                filters["hospital_id__in"] = hids
            else:
                return []
        elif current_user.get("sub"):
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
        agid = await get_user_admin_group_id(db, current_user)
        if agid:
            hids = await get_group_hospital_ids(db, agid)
            if hids:
                return await service.search(q, hospital_ids_in=hids, doctor_id=None, status_filter=status_filter)
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


@router.get("/search-advanced")
async def search_patients_advanced(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    op_no: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    abha_id: Optional[str] = Query(None),
    patient_source: Optional[str] = Query(None),
    age_from: Optional[int] = Query(None),
    age_to: Optional[int] = Query(None),
    case_status: Optional[str] = Query(None),
    treatment_status: Optional[str] = Query(None),
    billing_status: Optional[str] = Query(None),
    created_at_from: Optional[str] = Query(None),
    created_at_to: Optional[str] = Query(None),
    last_visit_from: Optional[str] = Query(None),
    last_visit_to: Optional[str] = Query(None),
    created_by_id: Optional[str] = Query(None),
    updated_by_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    filters = {}
    if search:
        filters["search"] = search
    if status:
        filters["status"] = status
    if gender:
        filters["gender"] = gender
    if op_no:
        filters["op_no"] = op_no
    if phone:
        filters["phone"] = phone
    if email:
        filters["email"] = email
    if abha_id:
        filters["abha_id"] = abha_id
    if patient_source:
        filters["patient_source"] = patient_source
    if age_from is not None:
        filters["age_from"] = age_from
    if age_to is not None:
        filters["age_to"] = age_to
    if case_status:
        filters["case_status"] = case_status
    if treatment_status:
        filters["treatment_status"] = treatment_status
    if billing_status:
        filters["billing_status"] = billing_status
    if created_at_from:
        filters["created_at_from"] = created_at_from
    if created_at_to:
        filters["created_at_to"] = created_at_to
    if last_visit_from:
        filters["last_visit_from"] = last_visit_from
    if last_visit_to:
        filters["last_visit_to"] = last_visit_to
    if created_by_id:
        filters["created_by_id"] = created_by_id
    if updated_by_id:
        filters["updated_by_id"] = updated_by_id

    role = current_user.get("role")
    if role == Role.DOCTOR.value:
        agid = await get_user_admin_group_id(db, current_user)
        if agid:
            hids = await get_group_hospital_ids(db, agid)
            if hids:
                filters["hospital_id__in"] = hids
            else:
                return {"items": [], "total": 0, "page": 1, "size": page_size, "pages": 0}
        elif current_user.get("sub"):
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
                return {"items": [], "total": 0, "page": 1, "size": page_size, "pages": 0}
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
                return {"items": [], "total": 0, "page": 1, "size": page_size, "pages": 0}
    else:
        pass

    if doctor_id:
        filters["doctor_id"] = doctor_id

    skip = (page - 1) * page_size
    service = PatientService(db)
    repo = service.repo
    count_filters = {k: v for k, v in filters.items()}
    total = await repo.count(filters=count_filters or None)
    descending = sort_order == "desc"
    patients = await repo.get_all(skip=skip, limit=page_size, filters=filters or None, order_by=sort_by, descending=descending)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {
        "items": patients,
        "total": total,
        "page": page,
        "size": page_size,
        "pages": total_pages,
    }


@router.get("/duplicates")
async def check_patient_duplicates(
    full_name: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    hospital_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    if not any([full_name, phone, email]):
        return {"candidates": [], "total": 0, "checked": False}
    from app.services.duplicate_service import find_duplicate_patients
    from app.models.hospital import Hospital

    role = current_user.get("role")
    effective_hospital_id = hospital_id
    hospital_ids_in = None
    if role == Role.DOCTOR.value:
        agid = await get_user_admin_group_id(db, current_user)
        if agid:
            hospital_ids_in = await get_group_hospital_ids(db, agid)
        elif not effective_hospital_id and current_user.get("hospital_id"):
            effective_hospital_id = current_user.get("hospital_id")
    elif role == Role.HOSPITAL_ADMIN.value:
        if not effective_hospital_id and current_user.get("hospital_id"):
            effective_hospital_id = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if agid:
            hospital_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hospital_ids_in = [row[0] for row in hospital_result.all()]

    candidates = await find_duplicate_patients(
        db,
        full_name=full_name,
        phone=phone,
        email=email,
        hospital_id=effective_hospital_id,
        hospital_ids_in=hospital_ids_in,
        limit=limit,
    )
    return {"candidates": candidates, "total": len(candidates), "checked": True}


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


@router.get("/{patient_id}/medications")
async def get_patient_medications(patient_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    patient = await db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    from app.services.medication_prescription_service import MedicationPrescriptionService
    service = MedicationPrescriptionService(db)
    items = await service.get_patient_medication_timeline(patient_id)
    return {"patient_id": patient_id, "items": items, "total": len(items)}


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(patient_id: str, data: PatientUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    old_data = {f: getattr(patient, f, None) for f in TRACKED_PATIENT_FIELDS}
    old_status = patient.status.value if hasattr(patient.status, 'value') else str(patient.status)
    update_data = data.model_dump(exclude_none=True)
    patient = await service.update(patient_id, update_data, user_id=current_user.get("sub"))
    if patient:
        changes = build_changes(update_data, old_data, TRACKED_PATIENT_FIELDS)
        await record_timeline_event(db, patient_id=patient_id, action="Patient Updated",
            module="patient", description=f"Patient '{patient.full_name}' updated",
            current_user=current_user, changes=changes)
    new_status = patient.status.value if hasattr(patient.status, 'value') else str(patient.status) if patient else None
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        if new_status == "OPD" and old_status != "OPD":
            await publish_event(
                event_type=EventType.OPD_CONSULTATION_COMPLETED,
                source_module=EventSource.PATIENT,
                entity_type="PATIENT",
                entity_id=patient.id,
                hospital_id=patient.hospital_id,
                patient_id=patient.id,
                db=db,
            )
        else:
            await publish_event(
                event_type=EventType.PATIENT_UPDATED,
                source_module=EventSource.PATIENT,
                entity_type="PATIENT",
                entity_id=patient.id,
                hospital_id=patient.hospital_id,
                patient_id=patient.id,
                db=db,
            )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
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
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.PATIENT_DEACTIVATED,
            source_module=EventSource.PATIENT,
            entity_type="PATIENT",
            entity_id=patient_id,
            hospital_id=getattr(patient, 'hospital_id', None),
            patient_id=patient_id,
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    return MessageResponse(message="Patient deleted successfully")


@router.post("/{patient_id}/photo", response_model=PatientResponse)
async def upload_patient_photo(patient_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    service = PatientService(db)
    patient = await service.get(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    await verify_tenant_access(current_user, patient, "patient", db)
    photo_url = await save_upload(file, "patient_photos")
    patient = await service.update(patient_id, {"photo_url": photo_url}, user_id=current_user.get("sub"))
    await record_timeline_event(db, patient_id=patient_id, action="Photo Uploaded",
        module="patient", description="Patient photo uploaded",
        current_user=current_user)
    return patient
