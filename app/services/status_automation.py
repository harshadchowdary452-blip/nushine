import logging
import json
from datetime import datetime, timezone, date, timedelta, time
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.patient import Patient, PatientStatus
from app.models.case import Case, CaseStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.follow_up import FollowUp, FollowUpStatus, FollowUpType
from app.models.billing import Billing, PaymentStatus
from app.models.status_audit_log import StatusAuditLog
from app.models.notification import Notification
from app.models.hospital import Hospital

logger = logging.getLogger(__name__)


class StatusAutomationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ──────────────────────────────────────────────
    # Settings helper
    # ──────────────────────────────────────────────
    async def _get_hospital_setting(self, hospital_id: Optional[str], key: str, default):
        if not hospital_id:
            return default
        r = await self.db.execute(select(Hospital.settings).where(Hospital.id == hospital_id))
        row = r.one_or_none()
        if row and row[0]:
            try:
                return json.loads(row[0]).get(key, default)
            except (json.JSONDecodeError, TypeError):
                pass
        return default

    # ──────────────────────────────────────────────
    # Invoice number generation
    # ──────────────────────────────────────────────
    async def _generate_invoice_number(self, hospital_id: Optional[str]) -> str:
        stamp = datetime.now(timezone.utc).strftime("%Y%m")
        r = await self.db.execute(
            select(func.count(Billing.id)).where(Billing.invoice_number.like(f"INV-{stamp}-%"))
        )
        count = r.scalar() or 0
        return f"INV-{stamp}-{count + 1:04d}"

    # ──────────────────────────────────────────────
    # Workflow 1: Appointment completed → auto-create case
    # ──────────────────────────────────────────────
    async def _auto_create_case_from_appointment(self, appt: Appointment):
        hospital_id = None
        patient_r = await self.db.execute(select(Patient.hospital_id).where(Patient.id == appt.patient_id))
        p_row = patient_r.one_or_none()
        if p_row:
            hospital_id = p_row[0]
        enabled = await self._get_hospital_setting(hospital_id, "auto_create_case_after_appointment", True)
        if not enabled:
            return None
        existing = await self.db.execute(
            select(Case).where(Case.patient_id == appt.patient_id, Case.is_active == True).limit(1)
        )
        if existing.scalar_one_or_none():
            return None
        case = Case(
            patient_id=appt.patient_id,
            doctor_id=appt.doctor_id,
            chief_complaint=f"Auto-created from appointment on {appt.appointment_date}",
            status=CaseStatus.OPEN,
        )
        self.db.add(case)
        await self.db.flush()
        await self._log_audit("case", case.id, "OPEN", "OPEN", None, "System", "system", "Auto-created from completed appointment")
        await self._create_notification(doctor_id=appt.doctor_id, title="New Case Auto-Created", description=f"Case created from completed appointment for patient")
        await self.update_patient_status(appt.patient_id)
        return case

    # ──────────────────────────────────────────────
    # Workflow 2: Case status transitions
    # ──────────────────────────────────────────────
    async def on_diagnosis_added(self, case_id: str):
        case = await self.db.get(Case, case_id)
        if not case or case.status != CaseStatus.OPEN:
            return
        case.status = CaseStatus.IN_PROGRESS
        await self.db.flush()

    async def on_treatment_plan_created(self, plan_id: str):
        tp = await self.db.get(TreatmentPlan, plan_id)
        if not tp:
            return
        case = await self.db.get(Case, tp.case_id)
        if case and case.status in (CaseStatus.OPEN,):
            case.status = CaseStatus.IN_PROGRESS
            await self.db.flush()

    # ──────────────────────────────────────────────
    # Workflow 6: Auto-create billing estimate when treatment plan created
    # ──────────────────────────────────────────────
    async def _auto_create_billing(self, plan_id: str):
        tp = await self.db.get(TreatmentPlan, plan_id)
        if not tp:
            return
        existing = await self.db.execute(
            select(Billing).where(Billing.case_id == tp.case_id).limit(1)
        )
        if existing.scalar_one_or_none():
            return
        case = await self.db.get(Case, tp.case_id)
        if not case:
            return
        hospital_id = None
        patient_r = await self.db.execute(select(Patient.hospital_id).where(Patient.id == case.patient_id))
        p_row = patient_r.one_or_none()
        if p_row:
            hospital_id = p_row[0]
        invoice_no = await self._generate_invoice_number(hospital_id)
        billing = Billing(
            case_id=tp.case_id,
            total_amount=tp.cost,
            paid_amount=0,
            pending_amount=tp.cost,
            payment_status=PaymentStatus.DRAFT,
            invoice_number=invoice_no,
            projected_amount=tp.cost,
            due_date=date.today() + timedelta(days=30),
        )
        self.db.add(billing)
        await self.db.flush()
        await self._create_notification(
            doctor_id=case.doctor_id,
            title="Invoice Generated",
            description=f"Invoice {invoice_no} for {tp.treatment_name}",
        )

    async def _auto_create_invoice_on_completion(self, case_id: str):
        r = await self.db.execute(
            select(func.sum(TreatmentPlan.cost)).where(
                TreatmentPlan.case_id == case_id,
                TreatmentPlan.is_active == True,
                TreatmentPlan.status == TreatmentPlanStatus.COMPLETED,
            )
        )
        completed_total = r.scalar() or 0
        r2 = await self.db.execute(
            select(Billing).where(Billing.case_id == case_id).limit(1)
        )
        billing = r2.scalar_one_or_none()
        if billing:
            billing.total_amount = completed_total
            billing.pending_amount = completed_total - billing.paid_amount
            await self.db.flush()

    async def _auto_create_appointment_from_follow_up(self, follow_up_id: str):
        fu = await self.db.get(FollowUp, follow_up_id)
        if not fu:
            return None
        if fu.appointment_id:
            return None
        appt = Appointment(
            patient_id=fu.patient_id,
            doctor_id=fu.doctor_id or "",
            appointment_date=fu.follow_up_date,
            appointment_time=fu.follow_up_time or time(9, 0),
            status=AppointmentStatus.SCHEDULED,
            appointment_type=AppointmentType.FOLLOW_UP,
            notes=f"Auto-created from follow-up {fu.id}",
        )
        self.db.add(appt)
        await self.db.flush()
        fu.appointment_id = appt.id
        await self.db.flush()
        return appt

    async def _update_appointment_from_follow_up(self, follow_up_id: str):
        fu = await self.db.get(FollowUp, follow_up_id)
        if not fu or not fu.appointment_id:
            return None
        appt = await self.db.get(Appointment, fu.appointment_id)
        if not appt:
            return None
        appt.appointment_date = fu.follow_up_date
        if fu.follow_up_time:
            appt.appointment_time = fu.follow_up_time
        await self.db.flush()
        return appt

    # ──────────────────────────────────────────────
    # Appointment status handlers
    # ──────────────────────────────────────────────
    async def update_appointment_status(self, appointment_id: str, new_status: AppointmentStatus) -> Appointment:
        appt = await self.db.get(Appointment, appointment_id)
        if not appt:
            return None
        appt.status = new_status
        await self.db.flush()

        if new_status == AppointmentStatus.COMPLETED:
            await self._on_appointment_completed(appt)

        return appt

    def _infer_appointment_type(self, appt: Appointment) -> AppointmentType:
        if appt.appointment_type:
            return appt.appointment_type
        return AppointmentType.CONSULTATION

    async def _on_appointment_completed(self, appt: Appointment):
        appt_type = self._infer_appointment_type(appt)
        if appt_type == AppointmentType.FOLLOW_UP:
            fu_r = await self.db.execute(
                select(FollowUp).where(FollowUp.appointment_id == appt.id)
            )
            fu = fu_r.scalar_one_or_none()
            if fu:
                fu.status = FollowUpStatus.COMPLETED
                await self.db.flush()
                await self.update_patient_status(fu.patient_id)

    async def _on_appointment_no_show(self, appt: Appointment):
        appt_type = self._infer_appointment_type(appt)
        if appt_type == AppointmentType.FOLLOW_UP:
            fu_r = await self.db.execute(
                select(FollowUp).where(FollowUp.appointment_id == appt.id)
            )
            fu = fu_r.scalar_one_or_none()
            if fu:
                fu.status = FollowUpStatus.LOST
        re_engagement = FollowUp(
            patient_id=appt.patient_id,
            doctor_id=appt.doctor_id,
            follow_up_date=date.today() + timedelta(days=3),
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.MANUAL.value,
            status=FollowUpStatus.PENDING.value,
            notes=f"Re-engagement: patient missed appointment on {appt.appointment_date}",
        )
        self.db.add(re_engagement)

    async def _on_appointment_confirmed(self, appt: Appointment):
        appt_type = self._infer_appointment_type(appt)
        if appt_type == AppointmentType.FOLLOW_UP:
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

    # ──────────────────────────────────────────────
    # Treatment status → cascade to case
    # ──────────────────────────────────────────────
    async def update_treatment_status(self, plan_id: str, new_status: TreatmentPlanStatus) -> TreatmentPlan:
        tp = await self.db.get(TreatmentPlan, plan_id)
        if not tp:
            return None
        tp.status = new_status
        await self.db.flush()

        if new_status == TreatmentPlanStatus.IN_PROGRESS:
            case = await self.db.get(Case, tp.case_id)
            if case and case.status in (CaseStatus.OPEN, CaseStatus.ON_HOLD):
                case.status = CaseStatus.IN_PROGRESS
                await self.db.flush()
                await self.update_patient_status(case.patient_id)

        elif new_status == TreatmentPlanStatus.COMPLETED:
            await self._auto_create_invoice_on_completion(tp.case_id)
            await self._check_case_completion(tp.case_id)

        elif new_status == TreatmentPlanStatus.GENERATED:
            case = await self.db.get(Case, tp.case_id)
            if case:
                case.status = CaseStatus.IN_PROGRESS
                await self.db.flush()

        return tp

    # ──────────────────────────────────────────────
    # Case completion check → follow-up or completed
    # ──────────────────────────────────────────────
    async def _check_case_completion(self, case_id: str):
        case = await self.db.get(Case, case_id)
        if not case:
            return
        r = await self.db.execute(
            select(TreatmentPlan).where(TreatmentPlan.case_id == case_id, TreatmentPlan.is_active == True)
        )
        plans = r.scalars().all()
        all_done = all(p.status == TreatmentPlanStatus.COMPLETED for p in plans)
        if all_done and plans and case.status != CaseStatus.COMPLETED:
            case.status = CaseStatus.COMPLETED
            await self.db.flush()
            await self.update_patient_status(case.patient_id)
            try:
                from app.crm.services.event_dispatcher import publish_event
                from app.crm.enums import EventType, EventSource
                from datetime import date as _date
                await publish_event(
                    event_type=EventType.CASE_COMPLETED,
                    source_module=EventSource.CASE,
                    entity_type="CASE",
                    entity_id=case_id,
                    hospital_id=None,
                    patient_id=str(case.patient_id) if case.patient_id else None,
                    doctor_id=str(case.doctor_id) if case.doctor_id else None,
                    payload={
                        "case_id": str(case_id),
                        "patient_id": str(case.patient_id) if case.patient_id else None,
                        "doctor_id": str(case.doctor_id) if case.doctor_id else None,
                        "visit_date": _date.today().isoformat(),
                    },
                    db=self.db,
                )
            except Exception as e:
                logger.warning("Failed to publish CASE_COMPLETED event: %s", e)

    # ──────────────────────────────────────────────
    # Case status update
    # ──────────────────────────────────────────────
    async def update_case_status(self, case_id: str, new_status: CaseStatus, reason: Optional[str] = None) -> Case:
        case = await self.db.get(Case, case_id)
        if not case:
            return None
        case.status = new_status
        await self.db.flush()

        if new_status == CaseStatus.COMPLETED:
            await self._check_all_cases_and_bills(case.patient_id)

        return case

    # ──────────────────────────────────────────────
    # Follow-up status update
    # ──────────────────────────────────────────────
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
        elif new_status == FollowUpStatus.CONTACTED:
            await self.update_patient_status(fu.patient_id)
        elif new_status == FollowUpStatus.PENDING:
            if fu.case_id:
                case = await self.db.get(Case, fu.case_id)
                if case:
                    case.status = CaseStatus.IN_PROGRESS
                    await self.db.flush()
            await self._update_appointment_from_follow_up(follow_up_id)

        return fu

    # ──────────────────────────────────────────────
    # Billing status update
    # ──────────────────────────────────────────────
    async def update_billing_status(self, billing_id: str):
        billing = await self.db.get(Billing, billing_id)
        if not billing:
            return None
        if billing.pending_amount <= 0:
            new_status = PaymentStatus.PAID
        elif billing.paid_amount > 0:
            new_status = PaymentStatus.PARTIAL
        else:
            new_status = PaymentStatus.DRAFT
        billing.payment_status = new_status
        await self.db.flush()

        if new_status == PaymentStatus.PAID:
            case = await self.db.get(Case, billing.case_id)
            if case:
                await self._check_all_cases_and_bills(case.patient_id)

        if new_status == PaymentStatus.PAID:
            case = await self.db.get(Case, billing.case_id)
            if case:
                patient_r = await self.db.execute(select(Patient.hospital_id).where(Patient.id == case.patient_id))
                p_row = patient_r.one_or_none()
                hospital_id = p_row[0] if p_row else None
                enabled = await self._get_hospital_setting(hospital_id, "auto_create_case_after_appointment", True)
                if not enabled:
                    await self._create_notification(doctor_id=case.doctor_id, title="Payment Received", description=f"Full payment received for invoice {billing.invoice_number}")

        return billing

    # ──────────────────────────────────────────────
    # Patient status (Workflow 7)
    # ──────────────────────────────────────────────
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
                all_paid = all(b.payment_status in (PaymentStatus.PAID, PaymentStatus.CANCELLED) for b in billings) if billings else True
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
                FollowUp.status.in_([FollowUpStatus.PENDING.value]),
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

    # ──────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────
    async def _case_has_follow_up(self, case_id: str) -> bool:
        r = await self.db.execute(
            select(FollowUp).where(
                FollowUp.case_id == case_id,
                FollowUp.status.in_([FollowUpStatus.PENDING.value]),
            ).limit(1)
        )
        return r.first() is not None

    async def _check_all_cases_and_bills(self, patient_id: str):
        await self.update_patient_status(patient_id)

    async def _log_audit(self, entity_type: str, entity_id: str, old_status: str, new_status: str,
                         user_id: str, user_name: str, user_role: str, reason: str):
        audit = StatusAuditLog(
            entity_type=entity_type, entity_id=entity_id,
            previous_status=old_status, new_status=new_status,
            user_id=user_id, user_name=user_name, user_role=user_role,
            reason=reason,
        )
        self.db.add(audit)
        await self.db.flush()

    async def _create_notification(self, doctor_id: Optional[str] = None, user_id: Optional[str] = None,
                                    title: str = "", description: str = ""):
        target = user_id or doctor_id
        if not target:
            return
        n = Notification(
            user_id=target,
            type="workflow",
            title=title,
            description=description,
        )
        self.db.add(n)
        await self.db.flush()

    # ──────────────────────────────────────────────
    # Manual override with audit
    # ──────────────────────────────────────────────
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

        await self._log_audit(entity_type, entity_id, old_status, new_status,
                               user_id, user_name, user_role, reason)

        if entity_type in ("case", "treatment", "follow_up", "billing"):
            cascade_targets = {
                "case": lambda o: o.patient_id,
                "treatment": lambda o: o.case_id,
                "follow_up": lambda o: o.patient_id,
                "billing": lambda o: None,
            }
            target_id = cascade_targets.get(entity_type, lambda o: None)(obj)
            if entity_type == "treatment" and target_id:
                await self._check_case_completion(target_id)
            if entity_type == "follow_up" and obj.patient_id:
                await self.update_patient_status(obj.patient_id)

        if entity_type == "patient" and new_status == "OPD" and old_status != "OPD":
            try:
                from app.crm.services.event_dispatcher import publish_event
                from app.crm.enums import EventType, EventSource
                await publish_event(
                    event_type=EventType.OPD_CONSULTATION_COMPLETED,
                    source_module=EventSource.PATIENT,
                    entity_type="PATIENT",
                    entity_id=entity_id,
                    hospital_id=obj.hospital_id,
                    patient_id=entity_id,
                    db=self.db,
                )
            except Exception as e:
                logger.warning("Failed to publish OPD_CONSULTATION_COMPLETED event: %s", e)

        return {
            "previous_status": old_status,
            "new_status": new_status,
            "reason": reason,
            "user_name": user_name,
            "user_role": user_role,
        }

    # ──────────────────────────────────────────────
    # Batch jobs (Workflow 7: inactive, overdue)
    # ──────────────────────────────────────────────
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
                Billing.payment_status.in_([PaymentStatus.DRAFT, PaymentStatus.PARTIAL]),
            )
        )
        billings = r.scalars().all()
        updated = 0
        for b in billings:
            if b.due_date and b.due_date < today:
                b.payment_status = PaymentStatus.OVERDUE
                updated += 1
        if updated:
            await self.db.flush()
        return updated

    # ──────────────────────────────────────────────
    # Workflow 11: Monthly expense template auto-creation
    # ──────────────────────────────────────────────
    async def auto_create_monthly_expenses(self):
        from app.models.hospital_monthly_expense import HospitalMonthlyExpense
        today = date.today()
        categories = ["Rent", "Utilities", "Salary", "Marketing", "Equipment", "Supplies", "Transport", "Miscellaneous"]
        hospitals_r = await self.db.execute(select(Hospital.id))
        hospital_ids = [row[0] for row in hospitals_r.all()]
        created = 0
        for hid in hospital_ids:
            existing = await self.db.execute(
                select(HospitalMonthlyExpense).where(
                    HospitalMonthlyExpense.hospital_id == hid,
                    HospitalMonthlyExpense.expense_month == today.month,
                    HospitalMonthlyExpense.expense_year == today.year,
                ).limit(1)
            )
            if existing.scalar_one_or_none():
                continue
            for cat in categories:
                exp = HospitalMonthlyExpense(
                    hospital_id=hid,
                    category=cat,
                    amount=0,
                    expense_month=today.month,
                    expense_year=today.year,
                    description=f"Auto-created {cat} for {today.strftime('%B %Y')}",
                )
                self.db.add(exp)
                created += 1
        if created:
            await self.db.flush()
        return created

    # ──────────────────────────────────────────────
    # Full workflow recalculation for a patient
    # ──────────────────────────────────────────────
    async def recalculate_workflow(self, patient_id: str):
        patient = await self.db.get(Patient, patient_id)
        if not patient:
            return {"error": "Patient not found"}
        cases_r = await self.db.execute(
            select(Case).where(Case.patient_id == patient_id, Case.is_active == True)
        )
        cases = cases_r.scalars().all()
        for case in cases:
            plans_r = await self.db.execute(
                select(TreatmentPlan).where(TreatmentPlan.case_id == case.id, TreatmentPlan.is_active == True)
            )
            plans = plans_r.scalars().all()
            if not plans:
                continue
            all_completed = all(p.status == TreatmentPlanStatus.COMPLETED for p in plans)
            any_in_progress = any(p.status == TreatmentPlanStatus.IN_PROGRESS for p in plans)
            if all_completed:
                case.status = CaseStatus.COMPLETED
            elif any_in_progress:
                case.status = CaseStatus.IN_PROGRESS
            else:
                has_generated = any(p.status == TreatmentPlanStatus.GENERATED for p in plans)
                if has_generated:
                    case.status = CaseStatus.ON_HOLD
        await self.db.flush()
        await self.update_patient_status(patient_id)
        return {"status": "recalculated", "patient_id": patient_id}
