import logging
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.repositories.billing_repository import BillingRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.billing import Billing, PaymentStatus
from app.models.case import Case

logger = logging.getLogger(__name__)


class BillingService:
    def __init__(self, db: AsyncSession):
        self.repo = BillingRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Billing:
        try:
            logger.info("CREATE_BILLING - Request data: %s", data)

            case_id = data.get("case_id")
            if not case_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="case_id is required")

            case_result = await self.db.execute(select(Case).where(Case.id == case_id))
            case = case_result.scalar_one_or_none()
            if not case:
                logger.error("CREATE_BILLING - Case not found: %s", case_id)
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Case with id {case_id} not found")

            total_amount = data.get("total_amount", 0)
            if total_amount <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="total_amount must be greater than 0")

            paid_amount = data.get("paid_amount", 0)
            pending_amount = total_amount - paid_amount
            if pending_amount <= 0:
                data["payment_status"] = PaymentStatus.PAID.value
            elif paid_amount > 0:
                data["payment_status"] = PaymentStatus.PARTIAL.value
            else:
                data["payment_status"] = PaymentStatus.PENDING.value

            data["pending_amount"] = pending_amount

            billing = await self.repo.create(**data)
            logger.info("CREATE_BILLING - Success: %s", billing.id)
            await self.audit_log_repo.create(user_id=user_id, action="CREATE_BILLING", entity_type="BILLING", entity_id=str(billing.id), details="Billing created")
            return billing
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("CREATE_BILLING - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create billing: {str(e)}")

    async def _attach_names(self, billing: Billing):
        from app.models.patient import Patient
        if billing.case_id:
            case_result = await self.db.execute(select(Case).where(Case.id == billing.case_id))
            c = case_result.scalar_one_or_none()
            if c:
                billing.case_chief_complaint = c.chief_complaint
                p_result = await self.db.execute(select(Patient).where(Patient.id == c.patient_id))
                p = p_result.scalar_one_or_none()
                if p:
                    billing.patient_name = p.full_name
        return billing

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Billing]:
        billings = await self.repo.get_all(skip=skip, limit=limit, filters=filters)
        for b in billings:
            await self._attach_names(b)
        return billings

    async def get(self, billing_id: str) -> Optional[Billing]:
        billing = await self.repo.get(billing_id)
        if billing:
            await self._attach_names(billing)
        return billing

    async def get_by_case(self, case_id: str) -> List[Billing]:
        return await self.repo.get_all(filters={"case_id": case_id})

    async def update_payment(self, billing_id: str, paid_amount: float, user_id: str = None) -> Optional[Billing]:
        try:
            billing = await self.repo.get(billing_id)
            if not billing:
                return None
            billing.paid_amount += paid_amount
            billing.pending_amount = billing.total_amount - billing.paid_amount
            if billing.pending_amount <= 0:
                billing.payment_status = PaymentStatus.PAID
            else:
                billing.payment_status = PaymentStatus.PARTIAL
            await self.db.flush()
            await self.db.refresh(billing)
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_BILLING_PAYMENT", entity_type="BILLING", entity_id=billing_id, details=f"Payment of {paid_amount} received")
            if billing.payment_status == PaymentStatus.PAID:
                from app.services.patient_service import PatientService
                from app.models.case import Case
                from sqlalchemy import select
                case_result = await self.db.execute(select(Case).where(Case.id == billing.case_id))
                case = case_result.scalar_one_or_none()
                if case and case.patient_id:
                    patient_svc = PatientService(self.db)
                    await patient_svc.auto_update_patient_status(case.patient_id, user_id=user_id)
            return billing
        except Exception as e:
            logger.exception("UPDATE_BILLING_PAYMENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update payment: {str(e)}")

    async def get_revenue(self, hospital_id: str = None) -> Dict[str, Any]:
        filters = {}
        if hospital_id:
            from app.models.patient import Patient
            from app.models.case import Case
            from sqlalchemy import select
            patient_result = await self.db.execute(select(Patient.id).where(Patient.hospital_id == hospital_id))
            patient_ids = [row[0] for row in patient_result.all()]
            if patient_ids:
                case_result = await self.db.execute(select(Case.id).where(Case.patient_id.in_(patient_ids)))
                case_ids = [row[0] for row in case_result.all()]
                if case_ids:
                    filters["case_id__in"] = case_ids
                else:
                    return {"total_revenue": 0, "total_pending": 0, "total_billings": 0}
            else:
                return {"total_revenue": 0, "total_pending": 0, "total_billings": 0}
        billings = await self.repo.get_all(filters=filters or None)
        return {"total_revenue": sum(b.paid_amount for b in billings), "total_pending": sum(b.pending_amount for b in billings), "total_billings": len(billings)}
