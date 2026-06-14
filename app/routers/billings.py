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
from app.services.billing_service import BillingService
from app.schemas.billing import BillingCreate, BillingUpdate, BillingDiscountUpdate, BillingResponse
from app.schemas.common import MessageResponse
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billings", tags=["Billings"])


@router.post("/", response_model=BillingResponse, status_code=status.HTTP_201_CREATED)
async def create_billing(data: BillingCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = BillingService(db)
    return await service.create(data.model_dump(), user_id=current_user.get("sub"))


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

        role_allowed_case_ids = None
        role = current_user.get("role")
        if role == Role.DOCTOR.value:
            case_result = await db.execute(select(Case.id).where(Case.doctor_id == current_user.get("sub")))
            role_allowed_case_ids = [row[0] for row in case_result.all()]
        elif role == Role.HOSPITAL_ADMIN.value:
            hid = hospital_id or current_user.get("hospital_id")
            if hid:
                patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id == hid))
                pids = [row[0] for row in patient_result.all()]
                if pids:
                    case_result = await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))
                    role_allowed_case_ids = [row[0] for row in case_result.all()]
        elif role == Role.GROUP_ADMIN.value:
            agid = current_user.get("admin_group_id")
            if agid:
                hosp_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
                hids = [row[0] for row in hosp_result.all()]
                if hids:
                    patient_result = await db.execute(select(Patient.id).where(Patient.hospital_id.in_(hids)))
                    pids = [row[0] for row in patient_result.all()]
                    if pids:
                        case_result = await db.execute(select(Case.id).where(Case.patient_id.in_(pids)))
                        role_allowed_case_ids = [row[0] for row in case_result.all()]

        if patient_case_ids is not None and role_allowed_case_ids is not None:
            cids = list(set(patient_case_ids) & set(role_allowed_case_ids))
            if not cids:
                return []
            filters["case_id__in"] = cids
        elif patient_case_ids is not None:
            filters["case_id__in"] = patient_case_ids
        elif role_allowed_case_ids is not None:
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


@router.get("/{billing_id}/pdf")
async def get_billing_pdf(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = BillingService(db)
    pdf_path, error = await service.get_pdf_path(billing_id)
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
    service = BillingService(db)
    pdf_path, error = await service.regenerate_pdf(billing_id)
    if not pdf_path:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"PDF generation failed: {error}")
    filename = f"invoice_{billing_id[:8]}.pdf"
    return FileResponse(pdf_path, media_type="application/pdf", filename=filename)


@router.delete("/{billing_id}", response_model=MessageResponse)
async def delete_billing(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    deleted = await service.delete(billing_id, user_id=current_user.get("sub"))
    return MessageResponse(message="Billing deleted successfully")


@router.get("/{billing_id}", response_model=BillingResponse)
async def get_billing(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    return billing


@router.put("/{billing_id}/payment", response_model=BillingResponse)
async def update_payment(billing_id: str, data: BillingUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.UPDATE_BILLING)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    paid_amount = data.paid_amount or 0
    billing = await service.update_payment(billing_id, paid_amount, payment_method=data.payment_method, notes=data.notes, user_id=current_user.get("sub"))
    return billing


@router.put("/{billing_id}/discount", response_model=BillingResponse)
async def apply_discount(billing_id: str, data: BillingDiscountUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.UPDATE_BILLING)
    service = BillingService(db)
    billing = await service.get(billing_id)
    if not billing:
        raise HTTPException(status_code=404, detail="Billing not found")
    await verify_tenant_access(current_user, billing, "billing", db)
    billing = await service.apply_discount(
        billing_id=billing_id,
        discount_type=data.discount_type,
        discount_percent=data.discount_percent,
        discount_amount=data.discount_amount,
        discount_reason=data.discount_reason,
    )
    return billing


@router.get("/{billing_id}/transactions")
async def get_billing_transactions(billing_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_BILLING)
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
