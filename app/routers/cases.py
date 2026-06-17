import logging
import os
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role

logger = logging.getLogger(__name__)
from app.services.case_service import CaseService
from app.schemas.case import CaseCreate, CaseUpdate, CaseResponse
from app.schemas.common import MessageResponse
from app.models.patient import Patient, PatientStatus
from app.models.hospital import Hospital
from app.services.status_automation import StatusAutomationService

router = APIRouter(prefix="/cases", tags=["Cases"])


@router.post("/", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(data: CaseCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_CASE)
    service = CaseService(db)
    case = await service.create(data.model_dump(), user_id=current_user.get("sub"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(case.patient_id)
    await db.commit()
    return case


@router.get("/")
async def get_cases(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), patient_id: Optional[str] = Query(None), doctor_id: Optional[str] = Query(None), status_filter: Optional[str] = Query(None, alias="status"), hospital_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    try:
        verify_permission(current_user, Permission.MANAGE_CASES, Permission.VIEW_ALL_PATIENTS)
        service = CaseService(db)
        filters = {}
        if patient_id:
            filters["patient_id"] = patient_id
        if doctor_id:
            filters["doctor_id"] = doctor_id
        if status_filter:
            filters["status"] = status_filter
        role = current_user.get("role")
        if role == Role.DOCTOR.value:
            if current_user.get("sub"):
                filters["doctor_id"] = current_user.get("sub")
        elif role == Role.HOSPITAL_ADMIN.value:
            hid = hospital_id or current_user.get("hospital_id")
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
        return await service.get_all(skip=skip, limit=limit, filters=filters or None)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print("=== CASES LIST ERROR ===", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {str(e)}")


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES, Permission.VIEW_ALL_PATIENTS)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    return case


@router.put("/{case_id}", response_model=CaseResponse)
async def update_case(case_id: str, data: CaseUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    case = await service.update(case_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"))
    return case


@router.post("/{case_id}/assign-consultant", response_model=CaseResponse)
async def assign_consultant(case_id: str, consultant_id: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_CONSULTANT)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    case = await service.assign_consultant(case_id, consultant_id, user_id=current_user.get("sub"))
    return case


@router.post("/{case_id}/complete", response_model=CaseResponse)
async def complete_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.COMPLETE_TREATMENT)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    case = await service.complete(case_id, user_id=current_user.get("sub"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(case.patient_id)
    await db.commit()
    return case


@router.delete("/{case_id}", response_model=MessageResponse)
async def delete_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    deleted = await service.delete(case_id, user_id=current_user.get("sub"))
    return MessageResponse(message="Case deleted successfully")


@router.post("/{case_id}/status", response_model=CaseResponse)
async def update_case_status(case_id: str, status: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    case = await service.update(case_id, {"status": status}, user_id=current_user.get("sub"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(case.patient_id)
    await db.commit()
    return case


@router.get("/{case_id}/pdf")
async def export_case_pdf(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    from app.config import settings
    from fpdf import FPDF
    from app.models.case import ClinicalFinding

    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)

    patient = case.patient
    doctor = case.doctor
    findings_result = await db.execute(
        select(ClinicalFinding).where(ClinicalFinding.case_id == case_id).order_by(ClinicalFinding.created_at)
    )
    findings = findings_result.scalars().all()

    pdf_dir = os.path.join(settings.UPLOAD_DIR, "case_reports")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = os.path.join(pdf_dir, f"case_{case_id}.pdf")

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Case Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Case ID: {case.case_number or case.id[:8]}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Patient: {patient.full_name if patient else 'N/A'}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Doctor: {doctor.full_name if doctor else 'N/A'}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Status: {case.status}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Date: {case.created_at.strftime('%d-%b-%Y') if case.created_at else 'N/A'}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Chief Complaint", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, case.chief_complaint)
    pdf.ln(3)

    if case.diagnosis:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Diagnosis", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, case.diagnosis)
        pdf.ln(3)

    if case.initial_treatment_plan:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Initial Treatment Plan", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, case.initial_treatment_plan)
        pdf.ln(3)

    if findings:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Clinical Findings", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
        col_w = [20, 50, 30, 80]
        headers = ["Tooth", "Finding", "Severity", "Notes"]
        pdf.set_font("Helvetica", "B", 9)
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 7, h, border=1, align="C")
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for f in findings:
            row = [f.tooth_number or "-", f.finding_type, f.severity or "-", f.notes or "-"]
            for i, val in enumerate(row):
                pdf.cell(col_w[i], 6, val, border=1)
            pdf.ln()
        pdf.ln(3)

    if case.notes:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Doctor Notes", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, case.notes)

    pdf.output(pdf_path)
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"case_{case_id}.pdf")
