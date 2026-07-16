import logging
import os
import json
import io
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from fastapi.responses import StreamingResponse

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
from app.services.treatment_plan_item_service import TreatmentPlanItemService

router = APIRouter(prefix="/cases", tags=["Case Reports"])


async def _load_case_with_findings(db: AsyncSession, case_id: str) -> Case:
    result = await db.execute(
        select(Case).where(Case.id == case_id).options(
            selectinload(Case.findings),
            selectinload(Case.clinical_progress_notes),
            selectinload(Case.patient).selectinload(Patient.hospital),
            selectinload(Case.doctor),
            selectinload(Case.created_by),
            selectinload(Case.updated_by),
            selectinload(Case.appointment),
            selectinload(Case.treatment_plans),
        )
    )
    case = result.scalar_one_or_none()
    if case:
        svc = CaseService(db)
        await svc.attach_names(case)
        if case.treatment_plans:
            from app.services.treatment_plan_service import _enrich_plan
            for tp in case.treatment_plans:
                _enrich_plan(tp)
    return case


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
        action="Case Report Created",
        description=f"Case report created: {case.chief_complaint or 'No chief complaint'}",
        module="Case Reports",
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
            selectinload(Case.patient).selectinload(Patient.hospital),
            selectinload(Case.doctor),
            selectinload(Case.created_by),
            selectinload(Case.updated_by),
            selectinload(Case.appointment),
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


@router.get("/{case_id}/pdf")
async def generate_case_pdf(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate a proper PDF for a case report.

    The backend fetches the case data and renders HTML matching CaseReportPrint.tsx,
    then converts to a real PDF via WeasyPrint — no screenshot, no rasterization.
    """
    verify_permission(current_user, Permission.MANAGE_CASES)
    case = await _load_case_with_findings(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    from app.utils.case_report_html import render_case_to_html
    html = render_case_to_html(case)

    from app.utils.case_pdf import html_to_pdf
    pdf_bytes = await html_to_pdf(html)
    if pdf_bytes is None:
        raise HTTPException(status_code=500, detail="PDF generation failed")

    filename = f"CaseReport_{case_id.replace('/', '_')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES, Permission.VIEW_ALL_PATIENTS)
    case = await _load_case_with_findings(db, case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    await verify_tenant_access(current_user, case, "case", db)
    return case


@router.put("/{case_id}", response_model=CaseResponse)
async def update_case(case_id: str, data: CaseUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    await verify_tenant_access(current_user, case, "case", db)
    old_data = {"chief_complaint": case.chief_complaint, "diagnosis": case.diagnosis, "status": case.status.value if hasattr(case.status, 'value') else case.status, "notes": case.notes}
    updated = await service.update(case_id, data.model_dump(exclude_none=True), user_id=current_user.get("sub"), user_role=current_user.get("role"))
    new_data = {"chief_complaint": updated.chief_complaint, "diagnosis": updated.diagnosis, "status": updated.status.value if hasattr(updated.status, 'value') else updated.status, "notes": updated.notes}
    changes = build_changes(old_data, new_data)
    await record_timeline_event(
        db, current_user=current_user, patient_id=updated.patient_id,
        action="Case Report Updated",
        description="Case report updated",
        module="Case Reports",
        changes=changes,
    )
    updated = await _load_case_with_findings(db, case_id)
    return updated


@router.post("/{case_id}/assign-consultant", response_model=CaseResponse)
async def assign_consultant(case_id: str, consultant_id: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ASSIGN_CONSULTANT)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    await verify_tenant_access(current_user, case, "case", db)
    old_consultant_id = case.consultant_id
    updated = await service.assign_consultant(case_id, consultant_id, user_id=current_user.get("sub"), user_role=current_user.get("role"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=updated.patient_id,
        action="Consultant Assigned",
        description=f"Consultant changed from {old_consultant_id or 'None'} to {consultant_id}",
        module="Case Reports",
        changes=[{"field": "consultant_id", "old_value": old_consultant_id, "new_value": consultant_id}],
    )
    return updated


@router.post("/{case_id}/complete", response_model=CaseResponse)
async def complete_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.COMPLETE_TREATMENT)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    await verify_tenant_access(current_user, case, "case", db)
    patient_id = case.patient_id
    updated = await service.complete(case_id, user_id=current_user.get("sub"), user_role=current_user.get("role"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(patient_id)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Case Report Completed",
        description="Case report completed",
        module="Case Reports",
    )
    updated = await _load_case_with_findings(db, case.id)
    return updated


@router.delete("/{case_id}", response_model=MessageResponse)
async def delete_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    await verify_tenant_access(current_user, case, "case", db)
    patient_id = case.patient_id
    await service.delete(case_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Case Report Deleted",
        description="Case report deleted",
        module="Case Reports",
    )
    return MessageResponse(message="Case Report deleted successfully")


@router.post("/{case_id}/status", response_model=CaseResponse)
async def update_case_status(case_id: str, status: str = Query(...), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    await verify_tenant_access(current_user, case, "case", db)
    old_status = case.status.value if hasattr(case.status, 'value') else case.status
    updated = await service.update(case_id, {"status": status}, user_id=current_user.get("sub"), user_role=current_user.get("role"))
    svc = StatusAutomationService(db)
    await svc.update_patient_status(updated.patient_id)
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=updated.patient_id,
        action="Case Report Status Changed",
        description=f"Status changed from {old_status} to {status}",
        module="Case Reports",
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    await verify_tenant_access(current_user, case, "case", db)
    entries = await service.get_timeline(case_id, skip=skip, limit=limit)
    return entries


@router.get("/{case_id}/odontogram")
async def get_case_odontogram(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    from app.services.odontogram_renderer import render_odontogram, FindingData
    case = await _load_case_with_findings(db, case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case Report not found")
    findings = case.findings or []
    fd_list = [
        FindingData(finding_type=f.finding_type, tooth_number=f.tooth_number, notes=f.notes)
        for f in findings
    ]
    try:
        img_bytes = render_odontogram(fd_list, dpi=200)
        return Response(content=img_bytes, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Odontogram render failed: {str(e)}")


@router.post("/{case_id}/approve-treatment-plan", response_model=CaseResponse)
async def approve_treatment_plan(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.APPROVE_TREATMENT_PLAN)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    from app.models.case import CaseTreatmentPlanStatus
    if case.treatment_plan_status == CaseTreatmentPlanStatus.APPROVED:
        case = await _load_case_with_findings(db, case_id)
        return case

    if case.initial_treatment_plan and case.initial_treatment_plan.startswith("_JSON_"):
        await service._sync_treatment_items(case_id, case.initial_treatment_plan, current_user.get("sub"))

    item_svc = TreatmentPlanItemService(db)
    items = await item_svc.get_current_items(case_id)
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot approve: no treatment plan items found. Add items first.")

    unassigned = [i for i in items if not i.assigned_doctor_id]
    if unassigned:
        names = [i.procedure_name for i in unassigned]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve: {len(unassigned)} item(s) missing a Primary Doctor: {', '.join(names)}",
        )

    case.treatment_plan_status = CaseTreatmentPlanStatus.APPROVED
    case.treatment_plan_approved = True
    case.treatment_plan_approved_by_id = current_user.get("sub")
    case.treatment_plan_approved_at = datetime.now(timezone.utc)
    await db.flush()
    from app.services.treatment_generator import TreatmentGenerator
    generator = TreatmentGenerator(db)
    await generator.generate_from_items(items, user_id=current_user.get("sub"))
    await db.commit()
    await service._add_timeline(
        case_id, "Treatment Plan Approved",
        new_value=f"{len(items)} item(s) generated as treatments",
        user_id=current_user.get("sub"), performer_role=current_user.get("role"),
    )
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=case.patient_id,
        action="Treatment Plan Approved",
        description=f"Treatment plan approved — {len(items)} item(s) generated as treatments",
        module="Treatments",
    )
    case = await _load_case_with_findings(db, case_id)
    return case


@router.post("/{case_id}/reject-treatment-plan", response_model=CaseResponse)
async def reject_treatment_plan(case_id: str, reason: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.APPROVE_TREATMENT_PLAN)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    from app.models.case import CaseTreatmentPlanStatus
    case.treatment_plan_status = CaseTreatmentPlanStatus.REJECTED
    case.treatment_plan_approved = False
    case.treatment_plan_rejection_reason = reason
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=case.patient_id,
        action="Treatment Plan Rejected",
        description=f"Treatment plan rejected: {reason}",
        module="Treatments",
    )
    case = await _load_case_with_findings(db, case_id)
    return case


@router.post("/{case_id}/submit-treatment-plan", response_model=CaseResponse)
async def submit_treatment_plan(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = CaseService(db)
    case = await service.get(case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)

    if case.initial_treatment_plan and case.initial_treatment_plan.startswith("_JSON_"):
        await service._sync_treatment_items(case_id, case.initial_treatment_plan, current_user.get("sub"))

    from app.services.treatment_plan_item_service import TreatmentPlanItemService
    item_svc = TreatmentPlanItemService(db)
    items = await item_svc.get_current_items(case_id)
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot submit: no treatment plan items found. Add items first.")

    unassigned = [i for i in items if not i.assigned_doctor_id]
    if unassigned:
        names = [i.procedure_name for i in unassigned]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit: {len(unassigned)} item(s) missing a Primary Doctor: {', '.join(names)}",
        )

    from app.models.case import CaseTreatmentPlanStatus
    case.treatment_plan_status = CaseTreatmentPlanStatus.PENDING_APPROVAL
    await db.commit()
    await record_timeline_event(
        db, current_user=current_user, patient_id=case.patient_id,
        action="Treatment Plan Submitted for Approval",
        description="Treatment plan submitted for approval",
        module="Treatments",
    )
    case = await _load_case_with_findings(db, case_id)
    return case
