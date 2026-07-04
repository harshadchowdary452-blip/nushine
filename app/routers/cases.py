import logging
import os
import json
import io
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, timezone
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.config import settings
from fpdf import FPDF
from app.services.odontogram_renderer import render_odontogram, FindingData

logger = logging.getLogger(__name__)
from app.services.case_service import CaseService
from app.schemas.case import CaseCreate, CaseUpdate, CaseResponse, CaseTimelineResponse
from app.schemas.common import MessageResponse
from app.models.case import Case, CaseStatus, ClinicalFinding
from app.models.patient import Patient, PatientStatus
from app.models.hospital import Hospital
from app.models.user import User
from app.services.status_automation import StatusAutomationService
from app.services.timeline_helper import record_timeline_event, build_changes

router = APIRouter(prefix="/cases", tags=["Case History"])


async def _load_case_with_findings(db: AsyncSession, case_id: str) -> Case:
    result = await db.execute(
        select(Case).where(Case.id == case_id).options(
            selectinload(Case.findings),
            selectinload(Case.patient),
            selectinload(Case.doctor),
            selectinload(Case.created_by),
            selectinload(Case.updated_by),
        )
    )
    return result.scalar_one_or_none()


@router.post("/", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(data: CaseCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_CASE)
    service = CaseService(db)
    case_data = data.model_dump()
    case = await service.create(case_data, user_id=current_user.get("sub"), user_role=current_user.get("role"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(case.patient_id)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=case.patient_id,
        action="Case History Created",
        description=f"Case history created: {case.chief_complaint or 'No chief complaint'}",
        module="Case History",
    )
    case = await _load_case_with_findings(db, case.id)
    return case


@router.get("/")
async def get_cases(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    patient_id: Optional[str] = Query(None),
    patient_name: Optional[str] = Query(None),
    op_number: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    hospital_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_desc: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    try:
        verify_permission(current_user, Permission.MANAGE_CASES, Permission.VIEW_ALL_PATIENTS)
        service = CaseService(db)
        q = select(Case).options(
            selectinload(Case.patient),
            selectinload(Case.doctor),
            selectinload(Case.created_by),
            selectinload(Case.updated_by),
        )
        if patient_id:
            q = q.where(Case.patient_id == patient_id)
        if doctor_id:
            q = q.where(Case.doctor_id == doctor_id)
        if status_filter:
            q = q.where(Case.status == status_filter)
        if date_from:
            q = q.where(Case.created_at >= datetime.fromisoformat(date_from))
        if date_to:
            q = q.where(Case.created_at <= datetime.fromisoformat(date_to))
        # Search by patient name or OP number via Patient join
        if search or patient_name or op_number:
            q = q.join(Patient, Case.patient_id == Patient.id)
            if search:
                q = q.where(
                    or_(
                        Patient.full_name.ilike(f"%{search}%"),
                        Patient.op_no.ilike(f"%{search}%"),
                    )
                )
            if patient_name:
                q = q.where(Patient.full_name.ilike(f"%{patient_name}%"))
            if op_number:
                q = q.where(Patient.op_no == op_number)

        role = current_user.get("role")
        if role == Role.DOCTOR.value:
            uid = current_user.get("sub")
            if uid:
                q = q.where(Case.doctor_id == uid)
        elif role == Role.HOSPITAL_ADMIN.value:
            hid = hospital_id or current_user.get("hospital_id")
            if hid:
                q = q.join(Patient, Case.patient_id == Patient.id).where(Patient.hospital_id == hid)
        elif role == Role.GROUP_ADMIN.value:
            agid = current_user.get("admin_group_id")
            if agid:
                q = q.join(Patient, Case.patient_id == Patient.id).join(Hospital, Patient.hospital_id == Hospital.id).where(Hospital.admin_group_id == agid)

        # Sorting
        if sort_by == "patient_name":
            q = q.join(Patient, Case.patient_id == Patient.id).order_by(Patient.full_name.desc() if sort_desc else Patient.full_name)
        elif sort_by == "doctor":
            q = q.join(User, Case.doctor_id == User.id).order_by(User.full_name.desc() if sort_desc else User.full_name)
        elif sort_by == "updated_at":
            q = q.order_by(Case.updated_at.desc() if sort_desc else Case.updated_at)
        else:
            q = q.order_by(Case.created_at.desc() if sort_desc else Case.created_at)

        q = q.offset(skip).limit(limit)
        result = await db.execute(q)
        cases = list(result.scalars().all())
        svc = CaseService(db)
        for c in cases:
            await svc.attach_names(c)
        return cases
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print("=== CASE HISTORY LIST ERROR ===", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {str(e)}")


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES, Permission.VIEW_ALL_PATIENTS)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)
    return case


@router.put("/{case_id}", response_model=CaseResponse)
async def update_case(case_id: str, data: CaseUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)
    old_data = {"chief_complaint": case.chief_complaint, "diagnosis": case.diagnosis, "status": case.status.value if hasattr(case.status, 'value') else case.status, "notes": case.notes}
    updated = await service.update(case_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"), user_role=current_user.get("role"))
    new_data = {"chief_complaint": updated.chief_complaint, "diagnosis": updated.diagnosis, "status": updated.status.value if hasattr(updated.status, 'value') else updated.status, "notes": updated.notes}
    changes = build_changes(old_data, new_data)
    await record_timeline_event(
        db, current_user=current_user, patient_id=updated.patient_id,
        action="Case History Updated",
        description="Case history updated",
        module="Case History",
        changes=changes,
    )
    return updated


@router.post("/{case_id}/assign-consultant", response_model=CaseResponse)
async def assign_consultant(case_id: str, consultant_id: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_CONSULTANT)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)
    old_consultant_id = case.consultant_id
    updated = await service.assign_consultant(case_id, consultant_id, user_id=current_user.get("sub"), user_role=current_user.get("role"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=updated.patient_id,
        action="Consultant Assigned",
        description=f"Consultant changed from {old_consultant_id or 'None'} to {consultant_id}",
        module="Case History",
        changes=[{"field": "consultant_id", "old_value": old_consultant_id, "new_value": consultant_id}],
    )
    return updated


@router.post("/{case_id}/complete", response_model=CaseResponse)
async def complete_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.COMPLETE_TREATMENT)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)
    patient_id = case.patient_id
    updated = await service.complete(case_id, user_id=current_user.get("sub"), user_role=current_user.get("role"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(patient_id)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Case History Completed",
        description="Case history completed",
        module="Case History",
    )
    updated = await _load_case_with_findings(db, case.id)
    return updated


@router.delete("/{case_id}", response_model=MessageResponse)
async def delete_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)
    patient_id = case.patient_id
    await service.delete(case_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Case History Deleted",
        description="Case history deleted",
        module="Case History",
    )
    return MessageResponse(message="Case History deleted successfully")


@router.post("/{case_id}/status", response_model=CaseResponse)
async def update_case_status(case_id: str, status: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)
    old_status = case.status.value if hasattr(case.status, 'value') else case.status
    updated = await service.update(case_id, {"status": status}, user_id=current_user.get("sub"), user_role=current_user.get("role"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(updated.patient_id)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=updated.patient_id,
        action="Case History Status Changed",
        description=f"Status changed from {old_status} to {status}",
        module="Case History",
        changes=[{"field": "status", "old_value": old_status, "new_value": status}],
    )
    updated = await _load_case_with_findings(db, case.id)
    return updated


@router.get("/{case_id}/timeline")
async def get_case_timeline(case_id: str, skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)
    entries = await service.get_timeline(case_id, skip=skip, limit=limit)
    return entries


@router.get("/{case_id}/pdf")
async def export_case_pdf(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    from sqlalchemy import select
    from app.models.hospital import Hospital
    result = await db.execute(select(Case).where(Case.id == case_id).options(
        selectinload(Case.patient).selectinload(Patient.hospital),
        selectinload(Case.doctor),
        selectinload(Case.created_by),
        selectinload(Case.updated_by),
        selectinload(Case.findings),
    ))
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case History not found")
    await verify_tenant_access(current_user, case, "case", db)

    patient = case.patient
    doctor = case.doctor
    findings = case.findings or []
    service = CaseService(db)
    timeline = await service.get_timeline(case_id, limit=50)

    pdf_dir = os.path.join(settings.UPLOAD_DIR, "case_reports")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = os.path.join(pdf_dir, f"case_{case_id}.pdf")

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Hospital Logo & Header
    if patient and patient.hospital:
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 7, (patient.hospital.name or "Hospital"), new_x="LMARGIN", new_y="NEXT", align="C")
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, f"Case History Report", new_x="LMARGIN", new_y="NEXT", align="C")
    else:
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "Case History Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)

    # Case Info
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, f"Case #: {case.case_number or case.id[:8]}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Date: {case.created_at.strftime('%d-%b-%Y %H:%M') if case.created_at else 'N/A'}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Status: {case.status}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Doctor Details
    if doctor:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Doctor Details", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        doc_lines = [f"Name: Dr. {doctor.full_name or ''}"]
        if case.doctor_registration_number:
            doc_lines.append(f"Reg No: {case.doctor_registration_number}")
        if case.doctor_specialization:
            doc_lines.append(f"Specialization: {case.doctor_specialization}")
        if patient and patient.hospital:
            doc_lines.append(f"Hospital: {patient.hospital.name}")
        for line in doc_lines:
            pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # Patient Details
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Patient Details", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pat_lines = [f"Name: {patient.full_name if patient else 'N/A'}"]
    if patient:
        if patient.op_no:
            pat_lines.append(f"OP No: {patient.op_no}")
        if patient.abha_id:
            pat_lines.append(f"ABHA ID: {patient.abha_id}")
    pdf.cell(0, 5, f"Case History #: {case.case_number or case.id[:8]}", new_x="LMARGIN", new_y="NEXT")
    for line in pat_lines:
        pdf.cell(0, 5, line, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Helper to write section
    def write_section(title, content):
        if not content:
            return
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, content)
        pdf.ln(2)

    write_section("Chief Complaint", case.chief_complaint)
    if case.chief_complaint_duration or case.chief_complaint_severity or case.chief_complaint_associated_symptoms:
        cc_detail = ""
        if case.chief_complaint_duration:
            cc_detail += f"Duration: {case.chief_complaint_duration}\n"
        if case.chief_complaint_severity:
            cc_detail += f"Severity: {case.chief_complaint_severity}\n"
        if case.chief_complaint_associated_symptoms:
            cc_detail += f"Associated Symptoms: {case.chief_complaint_associated_symptoms}"
        write_section("Chief Complaint Details", cc_detail)

    write_section("History of Present Illness (HPI)", case.hpi)
    write_section("Personal History", case.personal_history)
    write_section("Family History", case.family_history)
    write_section("Medical History", case.medical_history)
    write_section("Dental History", case.dental_history)
    write_section("Extra Oral Examination", case.extra_oral_examination)
    write_section("Intra Oral Examination", case.intra_oral_examination)

    # Clinical Findings - Odontogram
    if findings or case.clinical_findings_summary:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Clinical Findings — Odontogram", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)

    # Render odontogram as PNG and embed
    if findings:
        try:
            fd_list = [
                FindingData(finding_type=f.finding_type, tooth_number=f.tooth_number, notes=f.notes)
                for f in findings
            ]
            img_bytes = render_odontogram(fd_list, dpi=120)
            img_path = os.path.join(pdf_dir, f"odontogram_{case_id}.png")
            with open(img_path, "wb") as img_f:
                img_f.write(img_bytes)
            pdf.image(img_path, x=10, w=180)
            pdf.ln(3)
        except Exception as e:
            logger.warning("Failed to render odontogram image: %s", str(e))

    # Findings table
    if findings:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Detailed Findings", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        col_w = [20, 50, 110]
        headers = ["Tooth", "Finding", "Notes"]
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_x(10)
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 7, h, border=1, align="C")
        pdf.ln()
        pdf.set_font("Helvetica", "", 9)
        for f in findings:
            pdf.set_x(10)
            row = [f.tooth_number or "-", f.finding_type, f.notes or "-"]
            for i, val in enumerate(row):
                pdf.cell(col_w[i], 6, val, border=1)
            pdf.ln()
        pdf.ln(2)

    if case.clinical_findings_summary:
        write_section("Clinical Findings Summary", case.clinical_findings_summary)

    write_section("Periodontal Examination", case.periodontal_examination)
    write_section("Investigations", case.investigations)

    if case.provisional_diagnosis:
        write_section("Provisional Diagnosis", case.provisional_diagnosis)
    if case.final_diagnosis:
        write_section("Final Diagnosis", case.final_diagnosis)
    if case.diagnosis:
        write_section("Diagnosis", case.diagnosis)

    if case.initial_treatment_plan:
        write_section("Initial Treatment Plan", case.initial_treatment_plan)
        plan_detail = ""
        if case.treatment_plan_estimated_visits:
            plan_detail += f"Estimated Visits: {case.treatment_plan_estimated_visits}\n"
        if case.treatment_plan_estimated_cost:
            plan_detail += f"Estimated Cost: {case.treatment_plan_estimated_cost}"
        if plan_detail:
            write_section("Treatment Plan Details", plan_detail)

    write_section("Clinical Notes", case.notes)

    # Timeline
    if timeline:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Case History Timeline", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        pdf.set_font("Helvetica", "", 8)
        for entry in timeline:
            date_str = entry.created_at.strftime("%d-%b-%Y %H:%M") if entry.created_at else ""
            name = getattr(entry, "performer_name", None) or ""
            action = entry.action or ""
            detail = ""
            if entry.old_value and entry.new_value:
                detail = f"Old: {entry.old_value} | New: {entry.new_value}"
            elif entry.new_value:
                detail = entry.new_value
            pdf.set_x(10)
            line = f"{date_str} | {name} | {action}"
            if detail:
                line += f" | {detail}"
            pdf.multi_cell(190, 4, line)
        pdf.ln(3)

    # Audit Footer
    pdf.ln(6)
    pdf.set_draw_color(180, 180, 180)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, "Audit Information", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    created_by_name = getattr(case, "created_by_name", None) or (case.created_by.full_name if case.created_by else "—")
    created_by_role = getattr(case, "created_by_role", None) or (case.created_by.role if case.created_by else "—")
    updated_by_name = getattr(case, "updated_by_name", None) or (case.updated_by.full_name if case.updated_by else "—")
    updated_by_role = getattr(case, "updated_by_role", None) or (case.updated_by.role if case.updated_by else "—")
    pdf.cell(0, 4, f"Prepared By: Dr. {doctor.full_name if doctor else '—'}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, f"Created By: {created_by_name} ({created_by_role})", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, f"Created Date & Time: {case.created_at.strftime('%d-%b-%Y %H:%M') if case.created_at else 'N/A'}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, f"Last Updated By: {updated_by_name} ({updated_by_role})", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 4, f"Last Updated Date & Time: {case.updated_at.strftime('%d-%b-%Y %H:%M') if case.updated_at else 'N/A'}", new_x="LMARGIN", new_y="NEXT")
    if patient and patient.hospital:
        pdf.cell(0, 4, f"Hospital: {patient.hospital.name}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Doctor Signature Area
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Doctor's Signature: ___________________________", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.cell(0, 6, "Hospital Seal: ___________________________", new_x="LMARGIN", new_y="NEXT")

    pdf.output(pdf_path)
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"case_history_{case_id}.pdf")
