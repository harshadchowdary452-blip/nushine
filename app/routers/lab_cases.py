import asyncio
import os
import tempfile
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission, verify_tenant_access
from app.services.lab_case_service import LabCaseService, LAB_STATUSES
from app.models.treatment_plan import TreatmentPlan
from app.schemas.lab_case import (
    LabCaseCreate, LabCaseUpdate, LabCaseStatusUpdate,
    WhatsAppSendBody, CallLogBody, LabCaseEventCreate, LabCaseBatchSend,
)
from app.schemas.common import MessageResponse
from app.services.export_service import _generate_lab_report_pdf, _generate_excel, _stream_csv, _hospital_info, EXPORT_DIR

router = APIRouter(prefix="/lab-cases", tags=["Lab Cases"])


def _serialize_event(e):
    return {
        "id": e.id,
        "lab_case_id": e.lab_case_id,
        "event_type": e.event_type,
        "from_status": e.from_status,
        "to_status": e.to_status,
        "note": e.note,
        "actor_id": e.actor_id,
        "actor_name": getattr(e, "actor_name", None),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def _serialize(lc):
    return {
        "id": lc.id,
        "treatment_plan_id": lc.treatment_plan_id,
        "laboratory_id": lc.laboratory_id,
        "lab_status": lc.lab_status,
        "order_number": lc.order_number,
        "tooth_number": lc.tooth_number or getattr(lc, "tooth_numbers", None),
        "material": lc.material,
        "sent_date": lc.sent_date.isoformat() if lc.sent_date else None,
        "due_date": lc.due_date.isoformat() if lc.due_date else None,
        "returned_date": lc.returned_date.isoformat() if lc.returned_date else None,
        "lab_cost": lc.lab_cost,
        "remarks": lc.remarks,
        "created_by": lc.created_by,
        "created_at": lc.created_at.isoformat() if lc.created_at else None,
        "updated_at": lc.updated_at.isoformat() if lc.updated_at else None,
        "treatment_id": lc.treatment_plan_id,
        "treatment_name": getattr(lc, "treatment_name", None),
        "treatment_number": getattr(lc, "treatment_number", None),
        "patient_id": getattr(lc, "patient_id", None),
        "patient_name": getattr(lc, "patient_name", None),
        "op_number": getattr(lc, "op_number", None),
        "patient_phone": getattr(lc, "patient_phone", None),
        "hospital_id": getattr(lc, "hospital_id", None),
        "hospital_name": getattr(lc, "hospital_name", None),
        "doctor_name": getattr(lc, "doctor_name", None),
        "case_id": getattr(lc, "case_id", None),
        "case_number": getattr(lc, "case_number", None),
        "laboratory_name": getattr(lc, "laboratory_name", None),
        "laboratory_phone": getattr(lc, "laboratory_phone", None),
        "laboratory_whatsapp_number": getattr(lc, "laboratory_whatsapp_number", None),
        "events": [_serialize_event(e) for e in lc.events] if getattr(lc, "events", None) else [],
    }


async def _get_verified_case(db, current_user, lab_case_id):
    service = LabCaseService(db)
    lab_case = await service.get(lab_case_id)
    if not lab_case:
        raise HTTPException(status_code=404, detail="Lab case not found")
    plan_result = await db.execute(select(TreatmentPlan).where(TreatmentPlan.id == lab_case.treatment_plan_id))
    plan = plan_result.scalar_one_or_none()
    if plan:
        await verify_tenant_access(current_user, plan, "treatment_plan", db)
    return lab_case


@router.get("/candidates")
async def lab_case_candidates(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LABORATORIES)
    service = LabCaseService(db)
    return await service.candidates(current_user, search)


@router.get("/by-treatment/{plan_id}")
async def get_by_treatment(plan_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LABORATORIES)
    service = LabCaseService(db)
    lab_case = await service.get_by_treatment(plan_id)
    if not lab_case:
        raise HTTPException(status_code=404, detail="No lab case for this treatment")
    await service._enrich_many([lab_case])
    return _serialize(lab_case)


@router.post("/from-treatment/{plan_id}", status_code=200)
async def create_from_treatment(plan_id: str, data: LabCaseCreate = Body(default=None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = LabCaseService(db)
    payload = data.model_dump(exclude_none=True) if data else {}
    lab_case, _ = await service.create_from_treatment(current_user, plan_id, payload)
    await db.commit()
    return _serialize(await service.get(lab_case.id))


@router.get("/report")
async def monthly_report(
    month: str = Query(None, pattern=r"^\d{4}-\d{2}$"),
    format: str = Query("json", pattern="^(json|csv|excel|pdf)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LABORATORIES)
    service = LabCaseService(db)
    if not month:
        now = datetime.now(timezone.utc)
        month = f"{now.year}-{now.month:02d}"
    report = await service.monthly_report(current_user, month)
    if format == "json":
        return report
    headers = report["headers"]
    rows = report["rows"]
    summary = report["summary"]
    date_str = datetime.now(timezone.utc).strftime("%Y_%m_%d")
    hid = current_user.get("hospital_id")
    info = await _hospital_info(db, hid)
    label = f"Laboratory Report {month}"
    if format == "csv":
        return _stream_csv(rows, headers, f"lab_report_{month}.csv")
    if format == "excel":
        filename = f"lab_report_{month}.xlsx"
        fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=EXPORT_DIR)
        os.close(fd)
        filepath = await asyncio.to_thread(_generate_excel, rows, headers, filename, summary=summary, filepath=tmp)
        return FileResponse(filepath, filename=filename,
                            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            background=BackgroundTask(os.remove, filepath))
    if format == "pdf":
        filename = f"lab_report_{month}.pdf"
        fd, tmp = tempfile.mkstemp(suffix=".pdf", dir=EXPORT_DIR)
        os.close(fd)
        filepath = await _generate_lab_report_pdf(label, info, report, filename, filepath=tmp)
        return FileResponse(filepath, filename=filename, media_type="application/pdf",
                            background=BackgroundTask(os.remove, filepath))
    raise HTTPException(status_code=400, detail=f"Unknown format: {format}")


@router.get("/{lab_case_id}")
async def get_lab_case(lab_case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LABORATORIES)
    service = LabCaseService(db)
    lab_case = await service.get(lab_case_id)
    if not lab_case:
        raise HTTPException(status_code=404, detail="Lab case not found")
    return _serialize(lab_case)


@router.get("/")
async def get_lab_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    search: Optional[str] = Query(None),
    lab_status: Optional[str] = Query(None),
    laboratory_id: Optional[str] = Query(None),
    hospital_id: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    order_by: Optional[str] = Query(None),
    descending: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LABORATORIES)
    if lab_status and lab_status not in LAB_STATUSES:
        raise HTTPException(status_code=400, detail=f"lab_status must be one of {LAB_STATUSES}")
    service = LabCaseService(db)
    filters = {}
    if search:
        filters["search"] = search
    if lab_status:
        filters["lab_status"] = lab_status
    if laboratory_id:
        filters["laboratory_id"] = laboratory_id
    if hospital_id:
        filters["hospital_id"] = hospital_id
    if overdue_only:
        filters["overdue_only"] = True
    total = await service.count(current_user, filters=filters or None)
    lab_cases = await service.get_all(current_user, filters=filters or None, skip=(page - 1) * page_size, limit=page_size, order_by=order_by, descending=descending)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0
    return {"items": [_serialize(lc) for lc in lab_cases], "total": total, "page": page, "size": page_size, "pages": total_pages}


@router.put("/{lab_case_id}")
async def update_lab_case(lab_case_id: str, data: LabCaseUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = LabCaseService(db)
    lab_case = await _get_verified_case(db, current_user, lab_case_id)
    updated = await service.update(lab_case_id, data.model_dump(exclude_none=True), current_user)
    await db.commit()
    return _serialize(await service.get(lab_case_id))


@router.post("/{lab_case_id}/status")
async def set_lab_case_status(lab_case_id: str, data: LabCaseStatusUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = LabCaseService(db)
    await _get_verified_case(db, current_user, lab_case_id)
    updated = await service.set_status(lab_case_id, data.status, data.note, current_user)
    await db.commit()
    return _serialize(await service.get(lab_case_id))


@router.get("/{lab_case_id}/events")
async def list_events(lab_case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_LABORATORIES)
    service = LabCaseService(db)
    lab_case = await service.get(lab_case_id)
    if not lab_case:
        raise HTTPException(status_code=404, detail="Lab case not found")
    return [_serialize_event(e) for e in lab_case.events]


@router.post("/{lab_case_id}/events", status_code=201)
async def add_event(lab_case_id: str, data: LabCaseEventCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = LabCaseService(db)
    await _get_verified_case(db, current_user, lab_case_id)
    event = await service.add_event(lab_case_id, data.event_type, data.note, current_user)
    await db.commit()
    return _serialize_event(event)


@router.post("/{lab_case_id}/whatsapp")
async def send_whatsapp(lab_case_id: str, data: WhatsAppSendBody, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = LabCaseService(db)
    await _get_verified_case(db, current_user, lab_case_id)
    result = await service.whatsapp(lab_case_id, data.message, data.phone, current_user)
    await db.commit()
    return result


@router.post("/{lab_case_id}/call", status_code=201)
async def log_call(lab_case_id: str, data: CallLogBody, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = LabCaseService(db)
    await _get_verified_case(db, current_user, lab_case_id)
    event = await service.call(lab_case_id, data.note, data.duration_seconds, current_user)
    await db.commit()
    return _serialize_event(event)


@router.post("/batch-send")
async def batch_send_lab_cases(data: LabCaseBatchSend, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.CREATE_TREATMENT_PLAN)
    service = LabCaseService(db)
    result = await service.batch_send(current_user, data.model_dump())
    await db.commit()
    return result


@router.delete("/{lab_case_id}", response_model=MessageResponse)
async def delete_lab_case(lab_case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_LABORATORIES)
    service = LabCaseService(db)
    lab_case = await _get_verified_case(db, current_user, lab_case_id)
    deleted = await service.repo.delete(lab_case_id)
    await db.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="Lab case not found")
    return MessageResponse(message="Lab case deleted successfully")
