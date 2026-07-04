import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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
    return billing


@router.get("/")
async def get_billings(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200),
                        case_id: Optional[str] = Query(None),
                        hospital_id: Optional[str] = Query(None),
                        patient_id: Optional[str] = Query(None),
                        db: AsyncSession = Depends(get_db),
                        current_user: dict = Depends(get_current_user)):
    try:
        verify_permission(current_user, Permission.MANAGE_BILLING)
        service = BillingService(db)
        filters = {}
        if case_id:
            filters["case_id"] = case_id

        patient_case_ids = None
        if patient_id:
            case_result = await db.execute(select(Case.id).where(Case.patient_id == patient_id))
            patient_case_ids = [row[0] for row in case_result.all()]
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
            role_allowed_case_ids = [row[0] for row in case_result.all()]
            if not role_allowed_case_ids:
                return []
            filters["case_id__in"] = role_allowed_case_ids
        elif role == Role.DOCTOR.value:
            case_result = await db.execute(select(Case.id).where(Case.doctor_id == current_user.get("sub")))
            role_allowed_case_ids = [row[0] for row in case_result.all()]
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
                role_allowed_case_ids = [row[0] for row in case_result.all()]
                if not role_allowed_case_ids:
                    return []
                filters["case_id__in"] = role_allowed_case_ids

        return await service.get_all(skip=skip, limit=limit, filters=filters or None)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print("=== BILLINGS LIST ERROR ===", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Server Error: {str(e)}")


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
