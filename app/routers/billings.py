import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
import os
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from app.core.tenant import get_hospital_filter
from app.services.billing_service import BillingService
from app.schemas.billing import BillingCreate, BillingUpdate, BillingDiscountUpdate, BillingResponse, BillingHistoryResponse
from app.schemas.common import MessageResponse
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.billing import Billing as BillingModel
from app.models.billing_history import BillingHistory
from app.services.timeline_helper import record_timeline_event, build_changes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billings", tags=["Billings"])


async def _get_patient_id_from_billing(db: AsyncSession, billing_id: str) -> str:
    q = select(Patient.id).select_from(BillingModel).join(Case, BillingModel.case_id == Case.id).join(Patient, Case.patient_id == Patient.id).where(BillingModel.id == billing_id)
    r = await db.execute(q)
    row = r.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Associated patient not found")
    return row[0]


@router.post("/", response_model=BillingResponse, status_code=status.HTTP_201_CREATED)
async def create_billing(data: BillingCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    case_result = await db.execute(select(Case).where(Case.id == data.case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    service = BillingService(db)
    billing = await service.create(data.model_dump(), user_id=current_user.get("sub"))
    billing_id = billing.id
    patient_id = await _get_patient_id_from_billing(db, billing_id)
    billing_obj = await db.get(BillingModel, billing_id)
    if billing_obj:
        await record_timeline_event(
            db, current_user=current_user, patient_id=patient_id,
            action="Billing Created",
            description=f"Billing created (amount: {billing_obj.total_amount}, status: {billing_obj.payment_status})",
            module="Billing",
        )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.PAYMENT_CREATED,
            source_module=EventSource.BILLING,
            entity_type="BILLING",
            entity_id=billing.id,
            hospital_id=getattr(billing, 'hospital_id', None),
            patient_id=patient_id,
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    return billing


@router.get("/")
async def get_billings(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
                        case_id: Optional[str] = Query(None),
                        hospital_id: Optional[str] = Query(None),
                        patient_id: Optional[str] = Query(None),
                        search: Optional[str] = Query(None),
                        db: AsyncSession = Depends(get_db),
                        current_user: dict = Depends(get_current_user)):
    try:
        verify_permission(current_user, Permission.MANAGE_BILLING)
        service = BillingService(db)
        filters = {}
        if case_id:
            filters["case_id"] = case_id
        if search and search.strip():
            filters["search"] = search.strip()

        # The explicit patient_id filter must ALWAYS be honoured. It is
        # intersected with the role-scoped case set below, never dropped.
        patient_case_ids = None
        if patient_id:
            case_result = await db.execute(select(Case.id).where(Case.patient_id == patient_id))
            patient_case_ids = {row[0] for row in case_result.all()}
            if not patient_case_ids:
                return []

        role = current_user.get("role")

        if role == Role.SUPER_ADMIN.value:
            if hospital_id:
                filters["hospital_id"] = hospital_id
        elif role == Role.HOSPITAL_ADMIN.value:
            hid = current_user.get("hospital_id")
            if not hid:
                return []
            patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id == hid))
            pids = [row[0] for row in patient_result.all()]
            if not pids:
                return []
            case_result = await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))
            role_allowed_case_ids = {row[0] for row in case_result.all()}
            if not role_allowed_case_ids:
                return []
            filters["case_id__in"] = role_allowed_case_ids
        elif role == Role.DOCTOR.value:
            case_result = await db.execute(select(Case.id).where(Case.doctor_id == current_user.get("sub")))
            role_allowed_case_ids = {row[0] for row in case_result.all()}
            if not role_allowed_case_ids:
                return []
            filters["case_id__in"] = role_allowed_case_ids
        elif role == Role.GROUP_ADMIN.value:
            tenant_filter = await get_hospital_filter(current_user, db)
            if tenant_filter is None or "id" in tenant_filter:
                return []
            if "hospital_id__in" in tenant_filter:
                hids = tenant_filter["hospital_id__in"]
                patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))
                pids = [row[0] for row in patient_result.all()]
                if not pids:
                    return []
                case_result = await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))
                role_allowed_case_ids = {row[0] for row in case_result.all()}
                if not role_allowed_case_ids:
                    return []
                filters["case_id__in"] = role_allowed_case_ids

        # Enforce the patient_id filter on top of role scoping.
        if patient_case_ids is not None:
            scoped = filters.get("case_id__in")
            if scoped is None:
                filters["case_id__in"] = patient_case_ids
            else:
                filters["case_id__in"] = scoped & patient_case_ids
                if not filters["case_id__in"]:
                    return []

        return await service.get_all(skip=skip, limit=limit, filters=filters or None)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Billing list failed: %s", e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


@router.get("/by-case/{case_id}")
async def get_billings_by_case(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    from app.models.case import Case
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)
    service = BillingService(db)
    return await service.get_by_case(case_id)


async def _build_patient_filters(current_user: dict, db: AsyncSession, hospital_id: Optional[str] = None) -> dict:
    """Role-scoped patient filter for billing patient search (mirrors /patients)."""
    from app.models.hospital import Hospital
    from app.core.tenant import get_user_admin_group_id, get_group_hospital_ids

    filters = {}
    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        if hospital_id:
            filters["hospital_id"] = hospital_id
    elif role == Role.DOCTOR.value:
        agid = await get_user_admin_group_id(db, current_user)
        if agid:
            hids = await get_group_hospital_ids(db, agid)
            if hids:
                filters["hospital_id__in"] = hids
        elif current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.HOSPITAL_ADMIN.value:
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if agid:
            hr = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hids = [row[0] for row in hr.all()]
            if hids:
                filters["hospital_id__in"] = hids
    return filters


@router.get("/search")
async def billing_patient_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=25),
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Patient-first invoice search: match by OP number, name or mobile and return
    each patient together with their active cases and financial summary."""
    verify_permission(current_user, Permission.MANAGE_BILLING)
    from app.repositories.patient_repository import PatientRepository
    from app.services.billing_sync_service import BillingSyncService
    from app.models.user import User

    filters = {"search": q}
    filters.update(await _build_patient_filters(current_user, db, hospital_id))
    repo = PatientRepository(db)
    total = await repo.count(filters=filters or None)
    patients = await repo.get_all(skip=0, limit=limit, filters=filters or None)
    if not patients:
        return {"items": [], "total": 0}

    pids = [p.id for p in patients]
    case_result = await db.execute(
        select(Case)
        .where(Case.patient_id.in_(pids), Case.is_active == True)
        .options(selectinload(Case.doctor))
        .order_by(Case.created_at.desc())
    )
    all_cases = list(case_result.scalars().all())
    cases_by_patient: dict = {}
    for c in all_cases:
        cases_by_patient.setdefault(str(c.patient_id), []).append(c)

    sync_svc = BillingSyncService(db)
    items = []
    for p in patients:
        cases = cases_by_patient.get(str(p.id), [])
        active_cases = [
            {
                "id": c.id,
                "case_number": c.case_number,
                "chief_complaint": c.chief_complaint,
                "doctor_name": c.doctor.full_name if c.doctor else None,
                "status": str(c.status.value) if hasattr(c.status, "value") else str(c.status),
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "estimated_cost": c.estimated_cost,
                "total_billed": c.total_billed,
                "total_paid": c.total_paid,
                "outstanding_balance": c.outstanding_balance,
                "payment_status": c.payment_status,
            }
            for c in cases
        ]
        financial = await sync_svc.get_patient_summary(str(p.id))
        items.append({
            "id": p.id,
            "full_name": p.full_name,
            "op_no": p.op_no,
            "phone": p.phone,
            "gender": p.gender,
            "age": p.age,
            "status": getattr(p, "status", None),
            "financial_summary": financial,
            "active_cases": active_cases,
        })
    return {"items": items, "total": total}


@router.get("/unbilled")
async def get_unbilled_outstanding(
    skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cases with completed treatments that have NOT been invoiced yet (₹0 billed).
    Each row is the 'Start Billing' entry point from the billing tab."""
    verify_permission(current_user, Permission.MANAGE_BILLING)
    from app.services.billing_sync_service import BillingSyncService
    from app.models.treatment_plan import TreatmentPlan as TP, TreatmentPlanStatus
    from app.models.user import User

    role = current_user.get("role")
    scoped: Optional[set] = None
    if role == Role.HOSPITAL_ADMIN.value:
        hid = current_user.get("hospital_id")
        if not hid:
            return {"items": [], "total": 0}
        pids = [r[0] for r in (await db.execute(select(Patient.id).where(Patient.hospital_id == hid))).all()]
        if not pids:
            return {"items": [], "total": 0}
        scoped = {r[0] for r in (await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))).all()}
    elif role == Role.DOCTOR.value:
        scoped = {r[0] for r in (await db.execute(select(Case.id).where(Case.doctor_id == current_user.get("sub")))).all()}
    elif role == Role.GROUP_ADMIN.value:
        tenant_filter = await get_hospital_filter(current_user, db)
        if tenant_filter is None or "id" in tenant_filter:
            return {"items": [], "total": 0}
        if "hospital_id__in" in tenant_filter:
            hids = tenant_filter["hospital_id__in"]
            pids = [r[0] for r in (await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))).all()]
            if not pids:
                return {"items": [], "total": 0}
            scoped = {r[0] for r in (await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))).all()}

    candidate = select(Case.id).join(TP, TP.case_id == Case.id).where(
        TP.is_active == True, TP.status == TreatmentPlanStatus.COMPLETED.value,
    )
    if role == Role.SUPER_ADMIN.value and hospital_id:
        pids = [r[0] for r in (await db.execute(select(Patient.id).where(Patient.hospital_id == hospital_id))).all()]
        if not pids:
            return {"items": [], "total": 0}
        scoped = {r[0] for r in (await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))).all()}
    if scoped is not None:
        candidate = candidate.where(Case.id.in_(scoped))
    case_ids = [r[0] for r in (await db.execute(candidate.distinct())).all()]

    sync_svc = BillingSyncService(db)
    items = []
    for cid in case_ids:
        await sync_svc.sync_case(cid)
        case = await db.get(Case, cid)
        if not case or not case.outstanding_balance or case.outstanding_balance <= 0:
            continue
        patient = await db.get(Patient, case.patient_id) if case.patient_id else None
        doctor = await db.get(User, case.doctor_id) if case.doctor_id else None
        hospital = await db.get(Hospital, patient.hospital_id) if patient and patient.hospital_id else None
        plan_rows = await db.execute(select(TP).where(
            TP.case_id == cid, TP.is_active == True, TP.status == TreatmentPlanStatus.COMPLETED.value,
        ))
        treatment_names = [tp.treatment_name for tp in plan_rows.scalars().all() if tp.treatment_name]
        items.append({
            "case_id": cid,
            "case_number": case.case_number,
            "patient_id": str(patient.id) if patient else None,
            "patient_name": patient.full_name if patient else None,
            "op_no": getattr(patient, "op_no", None) if patient else None,
            "hospital_id": str(patient.hospital_id) if patient and patient.hospital_id else None,
            "hospital_name": hospital.name if hospital else None,
            "doctor_id": str(case.doctor_id) if case.doctor_id else None,
            "doctor_name": doctor.full_name if doctor else None,
            "treatment_names": treatment_names,
            "outstanding_balance": case.outstanding_balance,
            "payment_status": case.payment_status,
        })
    return {"items": items, "total": len(items)}


@router.get("/cases/{case_id}/billable")
async def get_billable_treatments(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Billable treatments for a case: treatment plans + their visits with
    charges, already-paid amounts and balances."""
    verify_permission(current_user, Permission.MANAGE_BILLING)
    from sqlalchemy.orm import selectinload
    from app.models.treatment_sitting import TreatmentSitting
    from app.models.treatment_plan import TreatmentPlan as TPModel

    case_result = await db.execute(
        select(Case)
        .where(Case.id == case_id)
        .options(selectinload(Case.doctor), selectinload(Case.patient))
    )
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case, "case", db)

    plans_result = await db.execute(
        select(TPModel)
        .where(TPModel.case_id == case_id, TPModel.is_active == True, TPModel.status != "CANCELLED")
        .order_by(TPModel.sequence_order, TPModel.created_at)
    )
    plans = list(plans_result.scalars().all())
    sittings_result = await db.execute(
        select(TreatmentSitting)
        .where(TreatmentSitting.treatment_plan_id.in_([p.id for p in plans]) if plans else TreatmentSitting.treatment_plan_id == "")
        .order_by(TreatmentSitting.sitting_number)
    )
    sittings_by_plan: dict = {}
    for s in list(sittings_result.scalars().all()):
        sittings_by_plan.setdefault(str(s.treatment_plan_id), []).append(s)

    treatment_plans = []
    for p in plans:
        sittings = sittings_by_plan.get(str(p.id), [])
        treatment_plans.append({
            "id": p.id,
            "treatment_name": p.treatment_name,
            "description": p.description,
            "cost": p.cost,
            "paid_amount": p.paid_amount,
            "pending_amount": max(0.0, (p.cost or 0) - (p.paid_amount or 0)),
            "status": str(p.status.value) if hasattr(p.status, "value") else str(p.status),
            "total_sittings": p.total_sittings,
            "completed_sittings": p.completed_sittings,
            "remaining_sittings": p.remaining_sittings,
            "sittings": [
                {
                    "id": s.id,
                    "sitting_number": s.sitting_number,
                    "sitting_date": s.sitting_date.isoformat() if s.sitting_date else None,
                    "status": str(s.status.value) if hasattr(s.status, "value") else str(s.status),
                    "charge": s.charge,
                    "paid_amount": s.paid_amount,
                    "invoice_status": s.invoice_status,
                }
                for s in sittings
            ],
        })

    return {
        "case": {
            "id": case.id,
            "case_number": case.case_number,
            "patient_id": case.patient_id,
            "patient_name": case.patient.full_name if case.patient else None,
            "chief_complaint": case.chief_complaint,
            "doctor_name": case.doctor.full_name if case.doctor else None,
            "status": str(case.status.value) if hasattr(case.status, "value") else str(case.status),
            "created_at": case.created_at.isoformat() if case.created_at else None,
            "estimated_cost": case.estimated_cost,
            "total_billed": case.total_billed,
            "total_paid": case.total_paid,
            "outstanding_balance": case.outstanding_balance,
            "payment_status": case.payment_status,
        },
        "treatment_plans": treatment_plans,
    }


async def _check_billing_hospital(billing_id: str, current_user: dict, db: AsyncSession):
    """Verify HOSPITAL_ADMIN/DOCTOR can access this billing via its patient's hospital."""
    role = current_user.get("role")
    if role not in ("HOSPITAL_ADMIN", "DOCTOR"):
        return
    from app.models.billing import Billing as BillingModel
    q = select(Patient.hospital_id).select_from(BillingModel).join(Case, BillingModel.case_id == Case.id).join(Patient, Case.patient_id == Patient.id).where(BillingModel.id == billing_id)
    r = await db.execute(q)
    row = r.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Billing not found")
    if str(row[0]) != str(current_user.get("hospital_id")):
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/{billing_id}/pdf")
async def get_billing_pdf(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    billing_obj = await db.get(BillingModel, billing_id)
    if not billing_obj:
        raise HTTPException(status_code=404, detail="Billing not found")
    await verify_tenant_access(current_user, billing_obj, "billing", db)
    service = BillingService(db)
    pdf_path, error = await service.get_pdf_path(billing_id, user_id=current_user.get("sub"))
    if not pdf_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if error == "Billing not found" else status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF generation failed: {error}" if error else "PDF not found for this billing"
        )
    filename = f"invoice_{billing_id[:8]}.pdf"
    return FileResponse(pdf_path, media_type="application/pdf", filename=filename)


@router.post("/{billing_id}/pdf/regenerate")
async def regenerate_billing_pdf(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    billing_obj = await db.get(BillingModel, billing_id)
    if not billing_obj:
        raise HTTPException(status_code=404, detail="Billing not found")
    await verify_tenant_access(current_user, billing_obj, "billing", db)
    service = BillingService(db)
    pdf_path, error = await service.regenerate_pdf(billing_id, user_id=current_user.get("sub"))
    if not pdf_path:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF generation failed: {error}")
    filename = f"invoice_{billing_id[:8]}.pdf"
    return FileResponse(pdf_path, media_type="application/pdf", filename=filename)


@router.delete("/{billing_id}", response_model=MessageResponse)
async def delete_billing(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    patient_id = await _get_patient_id_from_billing(db, billing_id)
    deleted = await service.delete(billing_id, user_id=current_user.get("sub"))
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Billing Deleted",
        description=f"Billing deleted",
        module="Billing",
    )
    return MessageResponse(message="Billing deleted successfully")


@router.get("/{billing_id}", response_model=BillingResponse)
async def get_billing(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    return billing


@router.put("/{billing_id}/payment", response_model=BillingResponse)
async def update_payment(billing_id: str, data: BillingUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.UPDATE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    old_paid = billing.paid_amount
    paid_amount = data.paid_amount or 0
    updated = await service.update_payment(billing_id, paid_amount, payment_method=data.payment_method, notes=data.notes, user_id=current_user.get("sub"))
    patient_id = await _get_patient_id_from_billing(db, billing_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Payment Updated",
        description=f"Payment of ₹{paid_amount} received (total paid: ₹{updated.paid_amount})",
        module="Billing",
        changes=[{"field": "paid_amount", "old_value": str(old_paid), "new_value": str(updated.paid_amount)}],
    )
    try:
        from app.crm.services.event_dispatcher import publish_event
        from app.crm.enums import EventType, EventSource
        await publish_event(
            event_type=EventType.PAYMENT_RECEIVED,
            source_module=EventSource.BILLING,
            entity_type="BILLING",
            entity_id=updated.id,
            hospital_id=getattr(updated, 'hospital_id', None),
            patient_id=patient_id,
            db=db,
        )
    except Exception:
        logger.warning("Failed to publish CRM event", exc_info=True)
    return updated


@router.put("/{billing_id}/discount", response_model=BillingResponse)
async def apply_discount(billing_id: str, data: BillingDiscountUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.UPDATE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    old_discount = billing.discount_amount
    updated = await service.apply_discount(
        billing_id=billing_id,
        discount_type=data.discount_type,
        discount_percent=data.discount_percent,
        discount_amount=data.discount_amount,
        discount_reason=data.discount_reason,
        user_id=current_user.get("sub"),
    )
    patient_id = await _get_patient_id_from_billing(db, billing_id)
    await record_timeline_event(
        db, current_user=current_user, patient_id=patient_id,
        action="Discount Applied",
        description=f"Discount of {data.discount_percent or 0}% / ₹{data.discount_amount or 0} applied",
        module="Billing",
        changes=[{"field": "discount_amount", "old_value": str(old_discount), "new_value": str(updated.discount_amount)}],
    )
    return updated


@router.get("/{billing_id}/transactions")
async def get_billing_transactions(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    transactions = await service.get_payment_history(billing_id)
    return [
        {
            "id": t.id,
            "amount": t.amount,
            "payment_method": t.payment_method,
            "notes": t.notes,
            "created_at": t.created_at.isoformat(),
        }
        for t in transactions
    ]


@router.get("/{billing_id}/history", response_model=List[BillingHistoryResponse])
async def get_billing_history(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    await _check_billing_hospital(billing_id, current_user, db)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    r = await db.execute(
        select(BillingHistory).where(BillingHistory.billing_id == billing_id).order_by(BillingHistory.created_at.desc())
    )
    return r.scalars().all()
