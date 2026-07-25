"""
Template Variable Resolver — resolves WhatsApp template variables from entity context.

The Rule Engine MUST NEVER perform string replacement directly.
This service handles all template variable resolution.
"""
import logging
from datetime import date, datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger("crm.template_resolver")


class TemplateVariableResolver:
    """Resolves template variables from entity context.

    Variables:
        {{patient_name}}    — Patient.full_name
        {{patient_phone}}   — Patient.phone
        {{doctor_name}}     — User.full_name (assigned doctor)
        {{hospital_name}}   — Hospital.name
        {{branch_name}}     — Hospital.name (same as hospital for single-branch)
        {{appointment_date}} — Next scheduled appointment date
        {{appointment_time}} — Next scheduled appointment time
        {{treatment_name}}  — TreatmentPlan.treatment_name or TreatmentType.name
        {{case_id}}         — Case case_number
        {{lead_name}}       — Lead.lead_name
        {{lead_phone}}      — Lead.mobile
        {{follow_up_date}}  — Next follow-up date
        {{current_date}}    — Today's date
        {{current_time}}    — Current time
    """

    async def resolve(
        self,
        db: AsyncSession,
        template_message: str,
        patient_id: Optional[str] = None,
        lead_id: Optional[str] = None,
        hospital_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        appointment_id: Optional[str] = None,
        treatment_type_id: Optional[str] = None,
        case_id: Optional[str] = None,
    ) -> str:
        """Replace all {{variable}} placeholders with actual values."""
        variables = await self._build_variable_map(
            db, patient_id, lead_id, hospital_id, doctor_id,
            appointment_id, treatment_type_id, case_id,
        )
        result = template_message
        for key, value in variables.items():
            result = result.replace("{{" + key + "}}", str(value))
        return result

    async def resolve_template_for_enquiry(
        self,
        db: AsyncSession,
        hospital_id: str,
        enquiry_type: str,
    ):
        """Find the active WhatsApp template for this enquiry type + hospital."""
        from app.models.whatsapp_template import WhatsAppTemplate

        # First try hospital-specific template
        q = select(WhatsAppTemplate).where(
            WhatsAppTemplate.hospital_id == hospital_id,
            WhatsAppTemplate.enquiry_type == enquiry_type,
            WhatsAppTemplate.is_active == True,
        )
        result = await db.execute(q)
        template = result.scalar_one_or_none()

        if not template:
            # Fall back to global template (hospital_id IS NULL)
            q = select(WhatsAppTemplate).where(
                WhatsAppTemplate.hospital_id.is_(None),
                WhatsAppTemplate.enquiry_type == enquiry_type,
                WhatsAppTemplate.is_active == True,
            )
            result = await db.execute(q)
            template = result.scalar_one_or_none()

        return template

    async def _build_variable_map(
        self,
        db: AsyncSession,
        patient_id: Optional[str],
        lead_id: Optional[str],
        hospital_id: Optional[str],
        doctor_id: Optional[str],
        appointment_id: Optional[str],
        treatment_type_id: Optional[str],
        case_id: Optional[str],
    ) -> dict[str, str]:
        """Build the complete variable map from all available entities."""
        variables: dict[str, str] = {}

        # Current date/time
        variables["current_date"] = date.today().isoformat()
        variables["current_time"] = datetime.now().strftime("%H:%M")

        # Patient
        if patient_id:
            from app.models.patient import Patient
            patient = await db.get(Patient, patient_id)
            if patient:
                variables["patient_name"] = patient.full_name or "Patient"
                variables["patient_phone"] = patient.phone or ""

        # Lead
        if lead_id:
            from app.models.lead import Lead
            lead = await db.get(Lead, lead_id)
            if lead:
                variables["lead_name"] = lead.lead_name or "Lead"
                variables["lead_phone"] = lead.mobile or ""
                if "patient_name" not in variables:
                    variables["patient_name"] = lead.lead_name or "Lead"

        # Doctor
        if doctor_id:
            from app.models.user import User
            doctor = await db.get(User, doctor_id)
            if doctor:
                variables["doctor_name"] = doctor.full_name or "Doctor"

        # Hospital
        if hospital_id:
            from app.models.hospital import Hospital
            hospital = await db.get(Hospital, hospital_id)
            if hospital:
                variables["hospital_name"] = hospital.name or "Hospital"
                variables["branch_name"] = hospital.name or "Hospital"

        # Appointment
        if appointment_id:
            from app.models.appointment import Appointment
            appt = await db.get(Appointment, appointment_id)
            if appt:
                if appt.appointment_date:
                    variables["appointment_date"] = appt.appointment_date.isoformat()
                if appt.appointment_time:
                    variables["appointment_time"] = str(appt.appointment_time)

        # Treatment type
        if treatment_type_id:
            from app.models.treatment_type import TreatmentType
            tt = await db.get(TreatmentType, treatment_type_id)
            if tt:
                variables["treatment_name"] = tt.name

        # Case
        if case_id:
            from app.models.case import Case
            case = await db.get(Case, case_id)
            if case:
                variables["case_id"] = case.case_number or case.id[:8]

        # Next follow-up date
        if patient_id:
            from app.models.follow_up import FollowUp, FollowUpStatus
            from sqlalchemy import and_
            result = await db.execute(
                select(FollowUp).where(
                    and_(
                        FollowUp.patient_id == patient_id,
                        FollowUp.status == FollowUpStatus.PENDING.value,
                    )
                ).order_by(FollowUp.follow_up_date).limit(1)
            )
            next_fu = result.scalar_one_or_none()
            if next_fu and next_fu.follow_up_date:
                variables["follow_up_date"] = next_fu.follow_up_date.isoformat()

        return variables


# Singleton
_resolver: Optional[TemplateVariableResolver] = None


def get_template_resolver() -> TemplateVariableResolver:
    global _resolver
    if _resolver is None:
        _resolver = TemplateVariableResolver()
    return _resolver
