import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.patient_repository import PatientRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.billing_repository import BillingRepository
from app.repositories.treatment_plan_repository import TreatmentPlanRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.patient import Patient, PatientStatus
from app.models.case import CaseStatus
from app.models.billing import PaymentStatus

logger = logging.getLogger(__name__)


class PatientService:
    def __init__(self, db: AsyncSession):
        self.repo = PatientRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.case_repo = CaseRepository(db)
        self.billing_repo = BillingRepository(db)
        self.treatment_plan_repo = TreatmentPlanRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Patient:
        try:
            logger.info("CREATE_PATIENT - Request data: %s", data)
            clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
            patient = await self.repo.create(**clean_data)
            logger.info("CREATE_PATIENT - Success: %s", patient.id)
            await self.audit_log_repo.create(user_id=user_id, action="CREATE_PATIENT", entity_type="PATIENT", entity_id=str(patient.id), details=f"Patient '{patient.full_name}' created")
            return patient
        except Exception as e:
            logger.exception("CREATE_PATIENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create patient: {str(e)}")

    async def get(self, patient_id: str) -> Optional[Patient]:
        return await self.repo.get(patient_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[Patient]:
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters)

    async def search(self, query: str, hospital_id: str = None, doctor_id: str = None, status_filter: str = None, hospital_ids_in: list = None) -> List[Patient]:
        filters = {}
        if hospital_id:
            filters["hospital_id"] = hospital_id
        if hospital_ids_in:
            filters["hospital_id__in"] = hospital_ids_in
        if doctor_id:
            filters["doctor_id"] = doctor_id
        if status_filter:
            filters["status"] = status_filter
        patients = await self.repo.get_all(filters=filters or None)
        if query:
            patients = [p for p in patients if query.lower() in p.full_name.lower() or (p.phone and query in p.phone) or (p.email and query.lower() in p.email.lower())]
        return patients

    async def update(self, patient_id: str, data: dict, user_id: str = None) -> Optional[Patient]:
        try:
            if "status" in data and data["status"]:
                data["status"] = PatientStatus(data["status"])
            patient = await self.repo.update(patient_id, **data)
            if patient:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_PATIENT", entity_type="PATIENT", entity_id=patient_id, details="Patient updated")
            return patient
        except Exception as e:
            logger.exception("UPDATE_PATIENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update patient: {str(e)}")

    async def auto_update_patient_status(self, patient_id: str, user_id: str = None) -> Optional[Patient]:
        try:
            logger.info("AUTO_UPDATE_PATIENT_STATUS - Checking patient: %s", patient_id)
            cases = await self.case_repo.get_all(filters={"patient_id": patient_id})
            if not cases:
                return None

            all_cases_completed = all(c.status == CaseStatus.COMPLETED for c in cases)
            if not all_cases_completed:
                return None

            all_billing_settled = True
            for c in cases:
                billings = await self.billing_repo.get_all(filters={"case_id": c.id})
                for b in billings:
                    if b.payment_status not in (PaymentStatus.PAID, PaymentStatus.REFUNDED):
                        all_billing_settled = False
                        break
                if not all_billing_settled:
                    break

            if all_cases_completed and all_billing_settled:
                new_status = PatientStatus.TREATMENT_COMPLETED
                patient = await self.repo.update(patient_id, status=new_status)
                if patient:
                    logger.info("AUTO_UPDATE_PATIENT_STATUS - Patient %s updated to %s", patient_id, new_status.value)
                    await self.audit_log_repo.create(
                        user_id=user_id, action="AUTO_UPDATE_PATIENT_STATUS",
                        entity_type="PATIENT", entity_id=patient_id,
                        details=f"Patient status auto-updated to {new_status.value}"
                    )
                return patient

            return await self.repo.get(patient_id)
        except Exception as e:
            logger.exception("AUTO_UPDATE_PATIENT_STATUS - Error: %s", str(e))
            return None
