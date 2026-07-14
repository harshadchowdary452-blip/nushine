import logging
from typing import Optional, List
from datetime import date, timedelta, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from fastapi import HTTPException, status
from app.repositories.base import BaseRepository
from app.repositories.patient_repository import PatientRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.billing_repository import BillingRepository
from app.repositories.treatment_plan_repository import TreatmentPlanRepository
from app.repositories.appointment_repository import AppointmentRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus, ClinicalFinding
from app.models.billing import Billing, PaymentStatus
from app.models.appointment import Appointment
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_sitting import TreatmentSitting
from app.models.follow_up import FollowUp
from app.models.communication_log import CommunicationLog
from app.models.patient_feedback import PatientFeedback
from app.models.lead import Lead
from app.models.pre_op import PreOp
from app.models.post_op import PostOp
from app.models.consultant_note import ConsultantNote
from app.models.case_timeline import CaseTimeline
from app.models.consent_form import ConsentForm
from app.models.billing_history import BillingHistory
from app.models.payment_transaction import PaymentTransaction
from app.models.enquiry import Enquiry, EnquiryStatus
from app.models.crm_opd_setting import CrmOpdSetting

logger = logging.getLogger(__name__)


class PatientService:
    def __init__(self, db: AsyncSession):
        self.repo = PatientRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.case_repo = CaseRepository(db)
        self.billing_repo = BillingRepository(db)
        self.treatment_plan_repo = TreatmentPlanRepository(db)
        self.appointment_repo = AppointmentRepository(db)
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
        sort_by = None
        descending = False
        if filters:
            sort_by = filters.pop("sort_by", None)
            descending = filters.get("sort_order") == "desc" if filters.get("sort_order") else False
            filters.pop("sort_order", None)
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters, order_by=sort_by, descending=descending)

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
            ql = query.lower()
            patients = [p for p in patients if ql in p.full_name.lower() or (p.phone and query in p.phone) or (p.email and ql in p.email.lower()) or (p.op_no and query in p.op_no) or (p.abha_id and query in p.abha_id)]
        return patients

    async def update(self, patient_id: str, data: dict, user_id: str = None) -> Optional[Patient]:
        try:
            if "status" in data and data["status"]:
                data["status"] = PatientStatus(data["status"])
            clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
            patient = await self.repo.update(patient_id, **clean_data)
            if patient:
                await self.audit_log_repo.create(user_id=user_id, action="UPDATE_PATIENT", entity_type="PATIENT", entity_id=patient_id, details="Patient updated")
            if clean_data.get("status") == PatientStatus.OPD:
                await self._auto_create_opd_enquiry(patient, user_id)
            return patient
        except Exception as e:
            logger.exception("UPDATE_PATIENT - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update patient: {str(e)}")

    async def _auto_create_opd_enquiry(self, patient: Patient, user_id: str = None):
        try:
            # Check if all treatment plans are completed (treatment fully done)
            cases = await self.case_repo.get_all(filters={"patient_id": patient.id})
            all_treatment_completed = True
            for c in cases:
                tps = await self.treatment_plan_repo.get_all(filters={"case_id": c.id})
                for tp in tps:
                    if tp.status != TreatmentPlanStatus.COMPLETED:
                        all_treatment_completed = False
                        break
                if not all_treatment_completed:
                    break
            if cases and all_treatment_completed:
                logger.info("AUTO_CREATE_OPD_ENQUIRY - Skipped (all treatment completed) for patient %s", patient.id)
                return
            # Check for existing OPD enquiry for this patient
            existing = await self.db.execute(
                select(Enquiry).where(
                    Enquiry.patient_id == patient.id,
                    Enquiry.treatment_interest == "OPD_FOLLOW_UP",
                    Enquiry.status != EnquiryStatus.CONVERTED.value,
                )
            )
            if existing.scalar_one_or_none():
                logger.info("AUTO_CREATE_OPD_ENQUIRY - Skipped (already exists) for patient %s", patient.id)
                return
            # Get OPD settings (gracefully handle missing table)
            due_days = 1
            assigned_staff = None
            try:
                opd_settings = await self.db.execute(
                    select(CrmOpdSetting).where(CrmOpdSetting.hospital_id == patient.hospital_id, CrmOpdSetting.is_active == True)
                )
                opd_setting = opd_settings.scalar_one_or_none()
                if opd_setting:
                    due_days = opd_setting.default_due_days
                    assigned_staff = opd_setting.assigned_staff_id
            except Exception:
                pass
            due_date = date.today() + timedelta(days=due_days)
            enquiry = Enquiry(
                hospital_id=patient.hospital_id,
                patient_id=patient.id,
                assigned_staff_id=assigned_staff or user_id,
                treatment_interest="OPD_FOLLOW_UP",
                notes="Patient completed OP consultation but treatment has not started. Follow up with the patient regarding the proposed treatment plan.",
                status=EnquiryStatus.NEW.value,
                next_follow_up_date=due_date,
            )
            self.db.add(enquiry)
            await self.db.flush()
            await self.audit_log_repo.create(
                user_id=user_id, action="AUTO_CREATE_OPD_ENQUIRY",
                entity_type="ENQUIRY", entity_id=str(enquiry.id),
                details=f"OPD Follow-Up enquiry auto-created for patient {patient.full_name}",
            )
        except Exception as e:
            logger.exception("AUTO_CREATE_OPD_ENQUIRY - Error: %s", str(e))

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
                    if b.payment_status not in (PaymentStatus.PAID, PaymentStatus.CANCELLED):
                        all_billing_settled = False
                        break
                if not all_billing_settled:
                    break

            if all_cases_completed and all_billing_settled:
                new_status = PatientStatus.COMPLETED
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

    async def delete(self, patient_id: str, user_id: str = None) -> bool:
        try:
            await self.db.execute(sa_delete(Appointment).where(Appointment.patient_id == patient_id))
            await self.db.execute(sa_delete(FollowUp).where(FollowUp.patient_id == patient_id))
            await self.db.execute(sa_delete(CommunicationLog).where(CommunicationLog.patient_id == patient_id))
            await self.db.execute(sa_delete(PatientFeedback).where(PatientFeedback.patient_id == patient_id))
            await self.db.execute(sa_delete(Lead).where(Lead.converted_patient_id == patient_id))
            cases = (await self.db.execute(select(Case).where(Case.patient_id == patient_id))).scalars().all()
            for c in cases:
                await self.db.execute(sa_delete(PreOp).where(PreOp.case_id == c.id))
                await self.db.execute(sa_delete(PostOp).where(PostOp.case_id == c.id))
                await self.db.execute(sa_delete(ConsultantNote).where(ConsultantNote.case_id == c.id))
                await self.db.execute(sa_delete(ClinicalFinding).where(ClinicalFinding.case_id == c.id))
                await self.db.execute(sa_delete(ConsentForm).where(ConsentForm.case_id == c.id))
                tps = (await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.case_id == c.id))).scalars().all()
                for tp in tps:
                    await self.db.execute(sa_delete(TreatmentSitting).where(TreatmentSitting.treatment_plan_id == tp.id))
                await self.db.execute(sa_delete(TreatmentPlan).where(TreatmentPlan.case_id == c.id))
                billing_ids = (await self.db.execute(select(Billing.id).where(Billing.case_id == c.id))).scalars().all()
                for bid in billing_ids:
                    await self.db.execute(sa_delete(BillingHistory).where(BillingHistory.billing_id == bid))
                    await self.db.execute(sa_delete(PaymentTransaction).where(PaymentTransaction.billing_id == bid))
                await self.db.execute(sa_delete(Billing).where(Billing.case_id == c.id))
                await self.db.execute(sa_delete(CaseTimeline).where(CaseTimeline.case_id == c.id))
            await self.db.execute(sa_delete(Case).where(Case.patient_id == patient_id))
            result = await self.repo.delete(patient_id)
            if result:
                await self.audit_log_repo.create(user_id=user_id, action="DELETE_PATIENT", entity_type="PATIENT", entity_id=patient_id, details="Patient deleted")
            return result
        except Exception as e:
            logger.exception("DELETE_PATIENT - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete patient: {str(e)}")
