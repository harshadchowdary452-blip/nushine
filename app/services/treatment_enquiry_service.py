import logging
from datetime import date, timedelta, time, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models.treatment_type import TreatmentType
from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus, FollowUpOutcome
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
from app.models.appointment import Appointment, AppointmentType, AppointmentStatus
from app.models.case_timeline import CaseTimeline
from app.models.communication_log import CommunicationLog, CommunicationStatus, CommunicationChannel, MessageType
from app.utils.whatsapp import WhatsAppProvider
from app.utils.template_engine import TemplateEngine

logger = logging.getLogger(__name__)

TEMPLATES = {
    FollowUpType.ONE_DAY_FOLLOW_UP.value: (
        "1-Day Follow-Up Check",
        "Dear {{patient_name}}, we hope you are recovering well after your treatment '{{treatment_name}}' at {{hospital_name}}. Please let us know how you are feeling.",
    ),
    FollowUpType.SEVEN_DAY_FOLLOW_UP.value: (
        "7-Day Follow-Up Check",
        "Dear {{patient_name}}, it has been a week since your treatment '{{treatment_name}}' at {{hospital_name}}. We hope you are doing well. Please contact us if you need anything.",
    ),
    FollowUpType.SIX_MONTH_RECALL.value: (
        "6-Month Recall Reminder",
        "Dear {{patient_name}}, it is time for your 6-month check-up for treatment '{{treatment_name}}'. Please schedule an appointment with {{hospital_name}}.",
    ),
    FollowUpType.TWELVE_MONTH_RECALL.value: (
        "12-Month Recall Reminder",
        "Dear {{patient_name}}, it is time for your 12-month check-up for treatment '{{treatment_name}}'. Please schedule an appointment with {{hospital_name}}.",
    ),
}


class TreatmentEnquiryService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.whatsapp = WhatsAppProvider()

    async def _get_plan_context(self, plan_id: str) -> dict | None:
        result = await self.db.execute(
            select(TreatmentPlan).where(TreatmentPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if not plan:
            return None
        case = await self.db.get(Case, plan.case_id)
        patient_id = case.patient_id if case else None
        hospital_id = None
        if patient_id:
            patient = await self.db.get(Patient, patient_id)
            hospital_id = patient.hospital_id if patient else None
        return {
            "plan": plan,
            "case": case,
            "patient_id": patient_id,
            "doctor_id": case.doctor_id if case else None,
            "hospital_id": hospital_id,
        }

    async def _ensure_treatment_type_id(self, plan: TreatmentPlan, hospital_id: str = None) -> None:
        if plan.treatment_type_id or not plan.treatment_name:
            return
        # Prefer global (canonical) TreatmentType, then fall back to hospital-specific
        q = select(TreatmentType.id).where(
            TreatmentType.name == plan.treatment_name,
            TreatmentType.hospital_id.is_(None),
        )
        result = await self.db.execute(q.limit(1))
        tt_id = result.scalar_one_or_none()
        if not tt_id and hospital_id:
            result = await self.db.execute(
                select(TreatmentType.id).where(
                    TreatmentType.name == plan.treatment_name,
                    TreatmentType.hospital_id == hospital_id,
                ).limit(1)
            )
            tt_id = result.scalar_one_or_none()
        if tt_id:
            plan.treatment_type_id = tt_id
            await self.db.flush()

    async def _find_matching_rule(self, plan: TreatmentPlan, hospital_id: str) -> TreatmentFollowUpRule | None:
        await self._ensure_treatment_type_id(plan, hospital_id)
        for scope_hid in (None, hospital_id):
            clauses = []
            if plan.treatment_type_id:
                clauses.append(TreatmentFollowUpRule.treatment_type_id == plan.treatment_type_id)
                clauses.append(
                    TreatmentFollowUpRule.treatment_type_id.in_(
                        select(TreatmentType.id).where(TreatmentType.name == plan.treatment_name)
                    )
                )
            if plan.treatment_template_id:
                clauses.append(TreatmentFollowUpRule.treatment_template_id == plan.treatment_template_id)
            if not clauses:
                continue
            q = select(TreatmentFollowUpRule).where(
                TreatmentFollowUpRule.hospital_id == scope_hid,
                TreatmentFollowUpRule.is_active == True,
                or_(*clauses),
            )
            result = await self.db.execute(q.limit(1))
            rule = result.scalar_one_or_none()
            if rule:
                return rule
        return None

    async def _send_whatsapp(
        self, follow_up: FollowUp, patient: Patient | None, hospital_name: str,
        template_type: str, extra_vars: dict | None = None,
    ) -> None:
        if not patient or not patient.phone:
            return
        template_info = TEMPLATES.get(template_type)
        if not template_info:
            return
        subject, body_template = template_info
        variables = TemplateEngine.build_variables(
            patient_name=patient.full_name,
            hospital_name=hospital_name,
            appointment_date=follow_up.follow_up_date.isoformat(),
        )
        if extra_vars:
            variables.update(extra_vars)
        body = TemplateEngine.render_template(body_template, variables)
        success = await self.whatsapp.send_message(patient.phone, body)
        log = CommunicationLog(
            patient_id=patient.id,
            hospital_id=follow_up.hospital_id,
            doctor_id=follow_up.doctor_id,
            channel=CommunicationChannel.WHATSAPP.value,
            message_type=MessageType.FOLLOW_UP.value,
            subject=subject,
            message=body,
            sent_at=datetime.now(timezone.utc),
            status=CommunicationStatus.SENT.value if success else CommunicationStatus.FAILED.value,
        )
        self.db.add(log)
        if success:
            follow_up.whatsapp_message = body
            follow_up.whatsapp_sent_at = datetime.now(timezone.utc)

    async def _send_whatsapp_for(
        self, follow_up: FollowUp, treatment_name: str,
    ) -> None:
        if not follow_up.patient_id:
            return
        patient = await self.db.get(Patient, follow_up.patient_id)
        hospital_name = ""
        if follow_up.hospital_id:
            hospital_obj = await self.db.get(Hospital, follow_up.hospital_id)
            hospital_name = hospital_obj.name if hospital_obj else ""
        await self._send_whatsapp(
            follow_up, patient, hospital_name,
            follow_up.follow_up_type,
            extra_vars={"treatment_name": treatment_name},
        )

    async def _add_timeline(self, case_id: str, action: str, new_value: str = None, user_id: str = None, field_name: str = None):
        self.db.add(CaseTimeline(
            case_id=case_id, action=action,
            field_name=field_name, new_value=new_value, performed_by=user_id,
        ))

    async def create_waiting_patient_task(self, plan_id: str, patient_id: str, follow_up_date_str: str) -> None:
        ctx = await self._get_plan_context(plan_id)
        if not ctx:
            return
        plan = ctx["plan"]
        follow_up_date = date.fromisoformat(follow_up_date_str) if isinstance(follow_up_date_str, str) else follow_up_date_str
        fu = FollowUp(
            patient_id=patient_id, hospital_id=ctx["hospital_id"],
            doctor_id=ctx["doctor_id"], case_id=plan.case_id,
            treatment_id=plan_id, treatment_name=plan.treatment_name,
            treatment_type_id=plan.treatment_type_id,
            follow_up_date=follow_up_date,
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
            status=FollowUpStatus.PENDING.value,
            notes=f"Auto-generated: Follow-up for waiting patient on treatment '{plan.treatment_name}'",
        )
        self.db.add(fu)
        await self.db.flush()
        logger.info("Created waiting patient task for plan %s, follow-up date %s", plan_id, follow_up_date)

    async def create_waiting_lab_task(self, plan_id: str, patient_id: str, follow_up_date_str: str) -> None:
        ctx = await self._get_plan_context(plan_id)
        if not ctx:
            return
        plan = ctx["plan"]
        follow_up_date = date.fromisoformat(follow_up_date_str) if isinstance(follow_up_date_str, str) else follow_up_date_str
        fu = FollowUp(
            patient_id=patient_id, hospital_id=ctx["hospital_id"],
            doctor_id=ctx["doctor_id"], case_id=plan.case_id,
            treatment_id=plan_id, treatment_name=plan.treatment_name,
            treatment_type_id=plan.treatment_type_id,
            follow_up_date=follow_up_date,
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
            status=FollowUpStatus.PENDING.value,
            notes=f"Auto-generated: Lab follow-up for treatment '{plan.treatment_name}'",
        )
        self.db.add(fu)
        await self.db.flush()
        logger.info("Created waiting lab task for plan %s, follow-up date %s", plan_id, follow_up_date)

    async def on_sitting_completed(self, plan_id: str, sitting_number: int = 0) -> None:
        ctx = await self._get_plan_context(plan_id)
        if not ctx:
            return
        case_id = ctx["case"].id if ctx["case"] else None
        if case_id:
            await self._add_timeline(case_id, f"Treatment Sitting #{sitting_number} Completed")
        await self.db.flush()
        logger.info("Recorded sitting #%s completion for plan %s", sitting_number, plan_id)

    async def on_treatment_plan_completed(self, plan_id: str) -> None:
        ctx = await self._get_plan_context(plan_id)
        if not ctx:
            return
        plan = ctx["plan"]
        # Only proceed if the plan is truly completed
        if plan.status != TreatmentPlanStatus.COMPLETED:
            logger.info("Plan %s status is %s, not COMPLETED — skipping CRM rule engine", plan_id, plan.status)
            return
        rule = await self._find_matching_rule(plan, ctx["hospital_id"])
        if not rule:
            logger.info("No active CRM rule found for plan %s — skipping", plan_id)
            return
        today = date.today()
        treatment_name = plan.treatment_name
        created = []
        if rule.recall_6_month:
            existing = await self.db.execute(
                select(FollowUp).where(
                    FollowUp.treatment_id == plan_id,
                    FollowUp.follow_up_type == FollowUpType.SIX_MONTH_RECALL.value,
                    FollowUp.status != FollowUpStatus.LOST.value,
                )
            )
            if existing.scalar_one_or_none():
                logger.info("6-month recall already exists for plan %s, skipping", plan_id)
            else:
                fu = FollowUp(
                    patient_id=ctx["patient_id"], hospital_id=ctx["hospital_id"],
                    doctor_id=ctx["doctor_id"], case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=treatment_name,
                    treatment_type_id=plan.treatment_type_id,
                    follow_up_date=today + timedelta(days=180),
                    follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto-generated: 6-month recall for treatment '{treatment_name}'",
                )
                self.db.add(fu); created.append(fu)
        if rule.recall_12_month:
            existing = await self.db.execute(
                select(FollowUp).where(
                    FollowUp.treatment_id == plan_id,
                    FollowUp.follow_up_type == FollowUpType.TWELVE_MONTH_RECALL.value,
                    FollowUp.status != FollowUpStatus.LOST.value,
                )
            )
            if existing.scalar_one_or_none():
                logger.info("12-month recall already exists for plan %s, skipping", plan_id)
            else:
                fu = FollowUp(
                    patient_id=ctx["patient_id"], hospital_id=ctx["hospital_id"],
                    doctor_id=ctx["doctor_id"], case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=treatment_name,
                    treatment_type_id=plan.treatment_type_id,
                    follow_up_date=today + timedelta(days=365),
                    follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.TWELVE_MONTH_RECALL.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto-generated: 12-month recall for treatment '{treatment_name}'",
                )
                self.db.add(fu); created.append(fu)
        if rule.custom_recall_days and rule.custom_recall_days > 0:
            existing = await self.db.execute(
                select(FollowUp).where(
                    FollowUp.treatment_id == plan_id,
                    FollowUp.follow_up_type == FollowUpType.CUSTOM_FOLLOW_UP.value,
                    FollowUp.status != FollowUpStatus.LOST.value,
                )
            )
            if existing.scalar_one_or_none():
                logger.info("Custom recall already exists for plan %s, skipping", plan_id)
            else:
                fu = FollowUp(
                    patient_id=ctx["patient_id"], hospital_id=ctx["hospital_id"],
                    doctor_id=ctx["doctor_id"], case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=treatment_name,
                    treatment_type_id=plan.treatment_type_id,
                    follow_up_date=today + timedelta(days=rule.custom_recall_days),
                    follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.CUSTOM_FOLLOW_UP.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto-generated: {rule.custom_recall_days}-day follow-up for treatment '{treatment_name}'",
                )
                self.db.add(fu); created.append(fu)
        await self.db.flush()
        case_id = ctx["case"].id if ctx["case"] else None
        if case_id:
            await self._add_timeline(case_id, "Treatment Plan Completed")
        for fu in created:
            if case_id:
                await self._add_timeline(case_id, f"{fu.follow_up_type.replace('_', ' ').title()} Created", new_value=f"Due: {fu.follow_up_date.isoformat()}")
            try:
                await self._send_whatsapp_for(fu, treatment_name)
            except Exception as e:
                logger.warning("WhatsApp send failed for %s recall: %s", fu.follow_up_type, e)
        if created:
            await self.db.flush()
        logger.info("Created %d recall(s) for plan %s", len(created), plan_id)

    async def auto_create_appointment(self, follow_up: FollowUp, rule: TreatmentFollowUpRule = None) -> dict:
        if not follow_up or follow_up.status != FollowUpStatus.COMPLETED.value:
            return {"created": False, "reason": "Follow-up not completed"}
        if follow_up.outcome != FollowUpOutcome.NEEDS_APPOINTMENT.value:
            return {"created": False, "reason": "Outcome does not require appointment"}
        if not rule:
            if follow_up.treatment_id:
                plan = await self.db.get(TreatmentPlan, follow_up.treatment_id)
                if plan:
                    rule = await self._find_matching_rule(plan, follow_up.hospital_id)
        if not rule or not rule.auto_appointment_enabled:
            return {"created": False, "reason": "Auto-appointment not enabled for this rule"}
        from app.services.appointment_service import AppointmentService
        from datetime import time
        appt_service = AppointmentService(self.db)
        doctor_id = rule.assigned_doctor_id or follow_up.doctor_id
        if not doctor_id:
            return {"created": False, "reason": "No doctor assigned"}
        appt_date = follow_up.follow_up_date
        appt_time = follow_up.follow_up_time or time(10, 0)
        try:
            await appt_service._validate_appointment_slot(doctor_id, appt_date, appt_time, 30)
        except Exception as e:
            return {"created": False, "reason": f"Doctor availability: {e}"}
        existing = await self.db.execute(
            select(Appointment).where(
                Appointment.patient_id == follow_up.patient_id,
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date == appt_date,
                Appointment.appointment_time == appt_time,
                Appointment.status != AppointmentStatus.CANCELLED.value,
            )
        )
        if existing.scalar_one_or_none():
            return {"created": False, "reason": "Appointment already exists for this slot"}
        from app.models.user import User
        doctor = await self.db.get(User, doctor_id)
        patient = await self.db.get(Patient, follow_up.patient_id)
        from app.services.appointment_service import compute_end_time
        end_time = compute_end_time(appt_time, 30)
        appointment = Appointment(
            patient_id=follow_up.patient_id,
            doctor_id=doctor_id,
            appointment_date=appt_date,
            appointment_time=appt_time,
            duration_minutes=30,
            end_time=end_time,
            appointment_type=AppointmentType.FOLLOW_UP,
            notes=f"Auto-created from {follow_up.follow_up_type.replace('_', ' ').title()}: {follow_up.notes or ''}",
        )
        self.db.add(appointment)
        await self.db.flush()
        follow_up.appointment_id = appointment.id
        if follow_up.case_id:
            await self._add_timeline(
                follow_up.case_id,
                "Appointment Created",
                new_value=f"Auto from {follow_up.follow_up_type.replace('_', ' ').title()} - {appt_date.isoformat()} {appt_time.strftime('%H:%M')}",
            )
        logger.info("Auto-created appointment %s for follow-up %s", appointment.id, follow_up.id)
        return {"created": True, "appointment_id": str(appointment.id)}
