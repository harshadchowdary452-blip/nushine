import logging, os
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.services.consent_form_service import ConsentFormService
from app.schemas.consent_form import ConsentFormCreate, ConsentFormUpdate, ConsentFormResponse, ConsentFormListResponse
from app.schemas.common import MessageResponse
from app.models.hospital import Hospital
from app.models.consent_form import ConsentForm
from app.services.timeline_helper import record_timeline_event, build_changes
from app.utils.uploads import save_upload, PDF_EXTENSIONS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/consent-forms", tags=["Consent Forms"])

ALLOWED_EXTENSIONS = PDF_EXTENSIONS


async def _verify_hospital_access(current_user: dict, cf: ConsentForm, db: AsyncSession = None):
    """Scope a consent form to the caller's tenant.

    SUPER_ADMIN -> unrestricted.
    GROUP_ADMIN -> the form's hospital must belong to the caller's admin group.
    HOSPITAL_ADMIN / DOCTOR -> the form must belong to the caller's hospital.
    """
    if current_user.get("role") == Role.SUPER_ADMIN.value:
        return
    await verify_tenant_access(current_user, cf, "consent_form", db)


@router.post("/", response_model=ConsentFormResponse, status_code=status.HTTP_201_CREATED)
async def create_consent_form(
    patient_id: Optional[str] = Form(None),
    patient_name: str = Form(...),
    op_number: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    doctor_id: Optional[str] = Form(None),
    consent_type: str = Form(...),
    remarks: Optional[str] = Form(None),
    hospital_id: str = Form(...),
    case_id: Optional[str] = Form(None),
    treatment_plan_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    role = current_user.get("role")
    if role == Role.DOCTOR.value:
        if current_user.get("hospital_id") and current_user.get("hospital_id") != hospital_id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == Role.HOSPITAL_ADMIN.value:
        if current_user.get("hospital_id") and current_user.get("hospital_id") != hospital_id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif role == Role.GROUP_ADMIN.value:
        hr = await db.execute(select(Hospital.id).where(Hospital.id == hospital_id, Hospital.admin_group_id == current_user.get("admin_group_id")))
        if not hr.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Access denied")

    # Validate extension + size while streaming to disk under a random UUID
    # (unpredictable filename) instead of buffering the whole PDF in memory.
    sub = f"consent_forms/{hospital_id}"
    url = await save_upload(file, sub, allowed=PDF_EXTENSIONS)
    pdf_path = os.path.join(settings.UPLOAD_DIR, sub, os.path.basename(url))

    service = ConsentFormService(db)
    data = {
        "patient_id": patient_id,
        "patient_name": patient_name,
        "op_number": op_number,
        "phone": phone,
        "doctor_id": doctor_id,
        "consent_type": consent_type,
        "remarks": remarks,
        "hospital_id": hospital_id,
        "case_id": case_id,
        "treatment_plan_id": treatment_plan_id,
    }
    cf = await service.create(data, pdf_path, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=cf.patient_id or patient_id,
        action="Consent Form Created",
        description=f"Consent form '{cf.consent_type}' created for {cf.patient_name}",
        module="Consent",
    )
    return cf


@router.get("/", response_model=ConsentFormListResponse)
async def list_consent_forms(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    patient_id: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    consent_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    is_deleted: Optional[bool] = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    filters = {"is_deleted": is_deleted}
    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        pass
    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if agid:
            hr = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hids = [row[0] for row in hr.all()]
            if hids:
                filters["hospital_id__in"] = hids
            else:
                return ConsentFormListResponse(items=[], total=0)
    else:
        hid = current_user.get("hospital_id")
        if hid:
            filters["hospital_id"] = hid
        if role == Role.DOCTOR.value and current_user.get("sub"):
            filters["doctor_id"] = current_user.get("sub")
    if patient_id:
        filters["patient_id"] = patient_id
    if doctor_id:
        filters["doctor_id"] = doctor_id
    if consent_type:
        filters["consent_type"] = consent_type
    if search:
        filters["search"] = search
    if date_from:
        filters["date_from"] = date_from
    if date_to:
        filters["date_to"] = date_to

    items = await service.get_all(skip=skip, limit=limit, filters=filters)
    total = len(items)
    return ConsentFormListResponse(items=items, total=total)


@router.get("/{cf_id}", response_model=ConsentFormResponse)
async def get_consent_form(
    cf_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    cf = await service.get(cf_id)
    if not cf:
        raise HTTPException(status_code=404, detail="Consent form not found")
    await _verify_hospital_access(current_user, cf, db)
    return cf


@router.put("/{cf_id}", response_model=ConsentFormResponse)
async def update_consent_form(
    cf_id: str,
    data: ConsentFormUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    cf = await service.get(cf_id)
    if not cf:
        raise HTTPException(status_code=404, detail="Consent form not found")
    await _verify_hospital_access(current_user, cf, db)
    old_data = {"remarks": cf.remarks, "consent_type": cf.consent_type}
    updated = await service.update(cf_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    new_data = {"remarks": updated.remarks, "consent_type": updated.consent_type}
    changes = build_changes(old_data, new_data)
    await record_timeline_event(
        db, current_user=current_user, patient_id=cf.patient_id,
        action="Consent Form Updated",
        description=f"Consent form '{cf.consent_type}' updated",
        module="Consent",
        changes=changes,
    )
    return updated


@router.post("/{cf_id}/replace-pdf", response_model=ConsentFormResponse)
async def replace_consent_form_pdf(
    cf_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    cf = await service.get(cf_id)
    if not cf:
        raise HTTPException(status_code=404, detail="Consent form not found")
    await _verify_hospital_access(current_user, cf, db)
    sub = f"consent_forms/{cf.hospital_id}"
    url = await save_upload(file, sub, allowed=PDF_EXTENSIONS)
    pdf_path = os.path.join(settings.UPLOAD_DIR, sub, os.path.basename(url))
    updated = await service.replace_pdf(cf_id, pdf_path, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=cf.patient_id,
        action="Consent Form PDF Replaced",
        description=f"PDF replaced for consent form '{cf.consent_type}'",
        module="Consent",
    )
    return updated


@router.get("/{cf_id}/pdf")
async def get_consent_form_pdf(
    cf_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    cf = await service.get(cf_id)
    if not cf:
        raise HTTPException(status_code=404, detail="Consent form not found")
    await _verify_hospital_access(current_user, cf, db)
    if not cf.pdf_path or not os.path.exists(cf.pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")
    await service.log_view(cf_id, user_id=current_user.get("sub"))
    filename = f"consent_{cf.consent_type.replace(' ', '_')}_{cf_id[:8]}.pdf"
    return FileResponse(cf.pdf_path, media_type="application/pdf", filename=filename)


@router.get("/{cf_id}/download")
async def download_consent_form_pdf(
    cf_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    cf = await service.get(cf_id)
    if not cf:
        raise HTTPException(status_code=404, detail="Consent form not found")
    await _verify_hospital_access(current_user, cf, db)
    if not cf.pdf_path or not os.path.exists(cf.pdf_path):
        raise HTTPException(status_code=404, detail="PDF file not found")
    await service.log_download(cf_id, user_id=current_user.get("sub"))
    filename = f"consent_{cf.consent_type.replace(' ', '_')}_{cf_id[:8]}.pdf"
    return FileResponse(cf.pdf_path, media_type="application/pdf", filename=filename, headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})


@router.delete("/{cf_id}", response_model=MessageResponse)
async def delete_consent_form(
    cf_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    cf = await service.get(cf_id)
    if not cf:
        raise HTTPException(status_code=404, detail="Consent form not found")
    await _verify_hospital_access(current_user, cf, db)
    await service.soft_delete(cf_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=cf.patient_id,
        action="Consent Form Deleted",
        description=f"Consent form '{cf.consent_type}' deleted",
        module="Consent",
    )
    return MessageResponse(message="Consent form deleted successfully")


@router.post("/{cf_id}/restore", response_model=ConsentFormResponse)
async def restore_consent_form(
    cf_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    cf = await service.restore(cf_id, user_id=current_user.get("sub"))
    if not cf:
        raise HTTPException(status_code=404, detail="Consent form not found")
    await _verify_hospital_access(current_user, cf, db)
    await record_timeline_event(
        db, current_user=current_user, patient_id=cf.patient_id,
        action="Consent Form Restored",
        description=f"Consent form '{cf.consent_type}' restored",
        module="Consent",
    )
    return cf


@router.get("/patient/{patient_id}", response_model=List[ConsentFormResponse])
async def get_patient_consent_forms(
    patient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    return await service.get_by_patient(patient_id)


@router.get("/by-case/{case_id}", response_model=List[ConsentFormResponse])
async def get_case_consent_forms(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    return await service.get_by_case(case_id)


@router.get("/by-treatment/{treatment_plan_id}", response_model=List[ConsentFormResponse])
async def get_treatment_consent_forms(
    treatment_plan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    return await service.get_by_treatment(treatment_plan_id)


@router.get("/stats/hospital/{hospital_id}")
async def get_consent_form_stats(
    hospital_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = ConsentFormService(db)
    return await service.get_stats(hospital_id)
