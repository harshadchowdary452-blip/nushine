import logging
from datetime import date, timedelta, time, datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital
from app.models.communication_log import CommunicationLog, CommunicationStatus, CommunicationChannel, MessageType
from app.utils.whatsapp import WhatsAppProvider
from app.utils.template_engine import TemplateEngine

logger = logging.getLogger(__name__)

TEMPLATES = {
    FollowUpType.ONE_DAY_POST_TREATMENT.value: (
        "1-Day Post Treatment Check",
        "Dear {{patient_name}}, we hope you are recovering well after your treatment '{{treatment_name}}' at {{hospital_name}}. Please let us know how you are feeling.",
    ),
    FollowUpType.SIX_MONTH_RECALL.value: (
        "6-Month Recall Reminder",
        "Dear {{patient_name}}, it is time for your 6-month check-up for treatment '{{treatment_name}}'. Please schedule an appointment with {{hospital_name}}.",
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

    async def on_sitting_completed(self, plan_id: str) -> None:
        ctx = await self._get_plan_context(plan_id)
        if not ctx:
            return
        existing = await self.db.execute(
            select(FollowUp).where(
                FollowUp.treatment_id == plan_id,
                FollowUp.follow_up_type == FollowUpType.ONE_DAY_POST_TREATMENT.value,
            )
        )
        if existing.scalar_one_or_none():
            logger.info("1-day follow-up already exists for plan %s, skipping", plan_id)
            return
        today = date.today()
        tomorrow = today + timedelta(days=1)
        fu = FollowUp(
            patient_id=ctx["patient_id"],
            hospital_id=ctx["hospital_id"],
            doctor_id=ctx["doctor_id"],
            case_id=ctx["plan"].case_id,
            treatment_id=plan_id,
            treatment_name=ctx["plan"].treatment_name,
            follow_up_date=tomorrow,
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.ONE_DAY_POST_TREATMENT.value,
            status=FollowUpStatus.SCHEDULED.value,
            treatment_completed_date=today,
            notes=f"Auto-generated: 1-day post treatment check for '{ctx['plan'].treatment_name}'",
        )
        self.db.add(fu)
        await self.db.flush()
        try:
            await self._send_whatsapp_for(fu, ctx["plan"].treatment_name)
        except Exception as e:
            logger.warning("WhatsApp send failed for 1-day follow-up: %s", e)
        logger.info("1-day post-treatment follow-up created for plan %s", plan_id)

    async def on_treatment_plan_completed(self, plan_id: str) -> None:
        ctx = await self._get_plan_context(plan_id)
        if not ctx:
            return
        existing = await self.db.execute(
            select(FollowUp).where(
                FollowUp.treatment_id == plan_id,
                FollowUp.follow_up_type == FollowUpType.SIX_MONTH_RECALL.value,
            )
        )
        if existing.scalar_one_or_none():
            logger.info("6-month follow-up already exists for plan %s, skipping", plan_id)
            return
        today = date.today()
        six_months = today + timedelta(days=180)
        fu = FollowUp(
            patient_id=ctx["patient_id"],
            hospital_id=ctx["hospital_id"],
            doctor_id=ctx["doctor_id"],
            case_id=ctx["plan"].case_id,
            treatment_id=plan_id,
            treatment_name=ctx["plan"].treatment_name,
            follow_up_date=six_months,
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
            status=FollowUpStatus.SCHEDULED.value,
            treatment_completed_date=today,
            notes=f"Auto-generated: 6-month recall for treatment '{ctx['plan'].treatment_name}'",
        )
        self.db.add(fu)
        await self.db.flush()
        try:
            await self._send_whatsapp_for(fu, ctx["plan"].treatment_name)
        except Exception as e:
            logger.warning("WhatsApp send failed for 6-month follow-up: %s", e)
        logger.info("6-month recall follow-up created for plan %s", plan_id)
