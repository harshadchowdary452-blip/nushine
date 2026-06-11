import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.appointment import Appointment, AppointmentStatus
from app.models.follow_up import FollowUp, FollowUpStatus
from app.models.billing import Billing, PaymentStatus
from app.models.status_audit_log import StatusAuditLog

logger = logging.getLogger(__name__)


class StatusAutomationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update_appointment_status(self, appointment_id: str, new_status: AppointmentStatus) -> Appointment:
        appt = await self.db.get(Appointment, appointment_id)
        if not appt:
            return None
        old = appt.status
        appt.status = new_status
        await self.db.flush()

        if new_status == AppointmentStatus.COMPLETED:
            await self._on_appointment_completed(appt)
        elif new_status == AppointmentStatus.NO_SHOW:
            await self._on_appointment_no_show(appt)
        elif new_status == AppointmentStatus.CONFIRMED:
            await self._on_appointment_confirmed(appt)
        elif new_status == AppointmentStatus.IN_PROGRESS:
            await self._on_appointment_started(appt)

        return appt

    async def update_treatment_status(self, plan_id: str, new_status: TreatmentPlanStatus) -> TreatmentPlan:
        tp = await self.db.get(TreatmentPlan, plan_id)
        if not tp:
            return None
        tp.status = new_status
        await self.db.flush()

        if new_status == TreatmentPlanStatus.IN_PROGRESS:
            case = await self.db.get(Case, tp.case_id)
            if case and case.status in (CaseStatus.NEW, CaseStatus.DIAGNOSIS_PENDING, CaseStatus.TREATMENT_PLANNED):
                case.status = CaseStatus.IN_PROGRESS
                await self.db.flush()
                await self.update_patient_status(case.patient_id)

        elif new_status == TreatmentPlanStatus.COMPLETED:
            await self._check_case_completion(tp.case_id)

        return tp

    async def _check_case_completion(self, case_id: str):
        case = await self.db.get(Case, case_id)
        if not case:
            return
        result = await self.db.execute(
            select(TreatmentPlan).where(TreatmentPlan.case_id == case_id, TreatmentPlan.is_active == True)
        )
        plans = result.scalars().all()
        all_done = all(p.status == TreatmentPlanStatus.COMPLETED for p in plans)
        if all_done and plans:
            has_follow_up = await self._case_has_follow_up(case_id)
            if has_follow_up:
                case.status = CaseStatus.FOLLOW_UP
            else:
                case.status = CaseStatus.COMPLETED
            await self.db.flush()
            await self.update_patient_status(case.patient_id)

    async def update_case_status(self, case_id: str, new_status: CaseStatus, reason: Optional[str] = None) -> Case:
        case = await self.db.get(Case, case_id)
        if not case:
            return None
        case.status = new_status
        await self.db.flush()

        if new_status == CaseStatus.COMPLETED:
            await self._check_all_cases_and_bills(case.patient_id)
        elif new_status == CaseStatus.FOLLOW_UP:
            await self.update_patient_status(case.patient_id)

        return case

    async def update_followup_status(self, follow_up_id: str, new_status: FollowUpStatus):
        fu = await self.db.get(FollowUp, follow_up_id)
        if not fu:
            return None
        fu.status = new_status
        await self.db.flush()

        if new_status == FollowUpStatus.COMPLETED:
            if fu.case_id:
                await self._check_case_completion(fu.case_id)
            await self.update_patient_status(fu.patient_id)
        elif new_status == FollowUpStatus.SCHEDULED:
            await self.update_patient_status(fu.patient_id)
        elif new_status == FollowUpStatus.RESCHEDULED:
            if fu.case_id:
                case = await self.db.get(Case, fu.case_id)
                if case:
                    case.status = CaseStatus.FOLLOW_UP
                    await self.db.flush()

        return fu

    async def update_billing_status(self, billing_id: str):
        billing = await self.db.get(Billing, billing_id)
        if not billing:
            return None
        if billing.pending_amount <= 0:
            new_status = PaymentStatus.PAID
        elif billing.paid_amount > 0:
            new_status = PaymentStatus.PARTIAL
        else:
            new_status = PaymentStatus.PENDING
        billing.payment_status = new_status
        await self.db.flush()

        if new_status == PaymentStatus.PAID:
            case = await self.db.get(Case, billing.case_id)
            if case:
                await self._check_all_cases_and_bills(case.patient_id)

        return billing

    async def update_patient_status(self, patient_id: str):
        patient = await self.db.get(Patient, patient_id)
        if not patient:
            return None

        cases_r = await self.db.execute(
            select(Case).where(Case.patient_id == patient_id, Case.is_active == True)
        )
        cases = cases_r.scalars().all()

        if not cases:
            patient.status = PatientStatus.ACTIVE
            await self.db.flush()
            return patient

        has_active_cases = any(c.status not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED) for c in cases)
        if not has_active_cases:
            all_cases_completed = all(c.status == CaseStatus.COMPLETED for c in cases)
            if all_cases_completed:
                case_ids = [c.id for c in cases]
                billings_r = await self.db.execute(
                    select(Billing).where(Billing.case_id.in_(case_ids))
                )
                billings = billings_r.scalars().all()
                all_paid = all(b.payment_status in (PaymentStatus.PAID, PaymentStatus.REFUNDED) for b in billings) if billings else True
                if all_paid:
                    patient.status = PatientStatus.COMPLETED
                    await self.db.flush()
                    return patient
                else:
                    patient.status = PatientStatus.ACTIVE
                    await self.db.flush()
                    return patient
            else:
                patient.status = PatientStatus.ACTIVE
                await self.db.flush()
                return patient

        has_active_treatments_r = await self.db.execute(
            select(TreatmentPlan).where(
                TreatmentPlan.case_id.in_([c.id for c in cases if c.status not in (CaseStatus.COMPLETED, CaseStatus.CANCELLED)]),
                TreatmentPlan.status.in_([TreatmentPlanStatus.IN_PROGRESS, TreatmentPlanStatus.SCHEDULED]),
            ).limit(1)
        )
        has_active_treatments = has_active_treatments_r.first() is not None

        has_follow_up_r = await self.db.execute(
            select(FollowUp).where(
                FollowUp.patient_id == patient_id,
                FollowUp.status.in_([FollowUpStatus.SCHEDULED.value, FollowUpStatus.PENDING.value]),
            ).limit(1)
        )
        has_pending_follow_up = has_follow_up_r.first() is not None

        if has_pending_follow_up:
            patient.status = PatientStatus.FOLLOW_UP
        elif has_active_treatments:
            patient.status = PatientStatus.UNDER_TREATMENT
        else:
            patient.status = PatientStatus.ACTIVE

        await self.db.flush()
        return patient

    async def _on_appointment_completed(self, appt: Appointment):
        if appt.appointment_type and appt.appointment_type.value == "FOLLOW_UP":
            fu_r = await self.db.execute(
                select(FollowUp).where(FollowUp.appointment_id == appt.id)
            )
            fu = fu_r.scalar_one_or_none()
            if fu:
                fu.status = FollowUpStatus.COMPLETED
                await self.db.flush()
                await self.update_patient_status(fu.patient_id)

    async def _on_appointment_no_show(self, appt: Appointment):
        if appt.appointment_type and appt.appointment_type.value == "FOLLOW_UP":
            fu_r = await self.db.execute(
                select(FollowUp).where(FollowUp.appointment_id == appt.id)
            )
            fu = fu_r.scalar_one_or_none()
            if fu:
                fu.status = FollowUpStatus.MISSED

    async def _on_appointment_confirmed(self, appt: Appointment):
        if appt.appointment_type and appt.appointment_type.value == "FOLLOW_UP":
            fu_r = await self.db.execute(
                select(FollowUp).where(FollowUp.appointment_id == appt.id)
            )
            fu = fu_r.scalar_one_or_none()
            if fu:
                fu.status = FollowUpStatus.PENDING
                fu.reminder_sent = True
                await self.db.flush()

    async def _on_appointment_started(self, appt: Appointment):
        pass

    async def _case_has_follow_up(self, case_id: str) -> bool:
        r = await self.db.execute(
            select(FollowUp).where(
                FollowUp.case_id == case_id,
                FollowUp.status.in_([FollowUpStatus.SCHEDULED.value, FollowUpStatus.PENDING.value]),
            ).limit(1)
        )
        return r.first() is not None

    async def _check_all_cases_and_bills(self, patient_id: str):
        await self.update_patient_status(patient_id)

    async def manual_override(
        self,
        entity_type: str,
        entity_id: str,
        new_status: str,
        user_id: str,
        user_name: str,
        user_role: str,
        reason: str,
    ) -> dict:
        old_status = None
        if entity_type == "patient":
            obj = await self.db.get(Patient, entity_id)
            if obj:
                old_status = obj.status.value if hasattr(obj.status, 'value') else str(obj.status)
                obj.status = PatientStatus(new_status)
        elif entity_type == "case":
            obj = await self.db.get(Case, entity_id)
            if obj:
                old_status = obj.status.value if hasattr(obj.status, 'value') else str(obj.status)
                obj.status = CaseStatus(new_status)
        elif entity_type == "appointment":
            obj = await self.db.get(Appointment, entity_id)
            if obj:
                old_status = obj.status.value if hasattr(obj.status, 'value') else str(obj.status)
                obj.status = AppointmentStatus(new_status)
        elif entity_type == "treatment":
            obj = await self.db.get(TreatmentPlan, entity_id)
            if obj:
                old_status = obj.status.value if hasattr(obj.status, 'value') else str(obj.status)
                obj.status = TreatmentPlanStatus(new_status)
        elif entity_type == "follow_up":
            obj = await self.db.get(FollowUp, entity_id)
            if obj:
                old_status = obj.status.value if hasattr(obj.status, 'value') else str(obj.status)
                obj.status = FollowUpStatus(new_status)
        elif entity_type == "billing":
            obj = await self.db.get(Billing, entity_id)
            if obj:
                old_status = obj.payment_status.value if hasattr(obj.payment_status, 'value') else str(obj.payment_status)
                obj.payment_status = PaymentStatus(new_status)
        else:
            raise ValueError(f"Unknown entity_type: {entity_type}")

        if not obj or old_status is None:
            raise ValueError(f"{entity_type} with id {entity_id} not found")

        audit = StatusAuditLog(
            entity_type=entity_type, entity_id=entity_id,
            previous_status=old_status, new_status=new_status,
            user_id=user_id, user_name=user_name, user_role=user_role,
            reason=reason,
        )
        self.db.add(audit)
        await self.db.flush()

        if entity_type in ("case", "treatment", "follow_up", "billing"):
            cascade_targets = {
                "case": lambda o: o.patient_id,
                "treatment": lambda o: o.case_id,
                "follow_up": lambda o: o.patient_id,
                "billing": lambda o: None,
            }
            patient_id = cascade_targets.get(entity_type, lambda o: None)(obj)
            if entity_type == "treatment" and patient_id:
                await self._check_case_completion(patient_id)
            if entity_type == "follow_up" and obj.patient_id:
                await self.update_patient_status(obj.patient_id)

        return {
            "previous_status": old_status,
            "new_status": new_status,
            "reason": reason,
            "user_name": user_name,
            "user_role": user_role,
        }

    async def check_inactive_patients(self):
        twelve_months_ago = date.today() - timedelta(days=365)
        r = await self.db.execute(
            select(Patient).where(
                Patient.updated_at < twelve_months_ago,
                Patient.status != PatientStatus.INACTIVE,
                Patient.is_active == True,
            )
        )
        patients = r.scalars().all()
        for p in patients:
            p.status = PatientStatus.INACTIVE
        await self.db.flush()
        return len(patients)

    async def check_overdue_billings(self):
        today = date.today()
        r = await self.db.execute(
            select(Billing).where(
                Billing.payment_status.in_([PaymentStatus.PENDING, PaymentStatus.PARTIAL]),
            )
        )
        billings = r.scalars().all()
        updated = 0
        for b in billings:
            case = await self.db.get(Case, b.case_id)
            if case and case.updated_at:
                updated_time = case.updated_at
                if hasattr(updated_time, 'date'):
                    due = updated_time.date()
                elif hasattr(updated_time, 'isoformat'):
                    due = updated_time
                else:
                    continue
                days_diff = (today - due).days if isinstance(due, date) else 0
                if days_diff > 30:
                    b.payment_status = PaymentStatus.OVERDUE
                    updated += 1
        if updated:
            await self.db.flush()
        return updated
