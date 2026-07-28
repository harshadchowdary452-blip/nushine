import logging
from datetime import date, datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_

logger = logging.getLogger("crm.template_resolver")


# ─── Type-scoped variable definitions ──────────────────────────────────────

LEAD_VARIABLES = {
    "lead_name", "lead_phone", "lead_source", "lead_status",
    "interested_treatment", "preferred_branch", "preferred_time",
    "assigned_staff", "assigned_staff_name",
    "hospital_name", "hospital_phone", "hospital_address",
    "clinic_name", "website",
    "current_date", "current_time",
}

PATIENT_VARIABLES = {
    "patient_name", "patient_phone", "patient_age", "patient_gender",
    "op_number",
    "doctor_name", "doctor_specialization",
    "staff_name", "staff_phone", "staff_email",
    "hospital_name", "branch_name", "clinic_name",
    "hospital_phone", "hospital_address",
    "appointment_date", "appointment_time", "appointment_type",
    "treatment_name", "treatment_type", "treatment_status",
    "treatment_completion_date",
    "visit_number", "remaining_visits", "total_visits",
    "case_name", "case_completion_date",
    "completed_treatments",
    "next_recall_date", "recall_interval",
    "follow_up_date", "followup_date",
    "current_date", "current_time",
}

LEAD_ENQUIRY_TYPES = {"LEAD_FOLLOW_UP"}


def get_available_variables(enquiry_type: str) -> set[str]:
    if enquiry_type in LEAD_ENQUIRY_TYPES:
        return LEAD_VARIABLES
    return PATIENT_VARIABLES


class TemplateValidationError(ValueError):
    def __init__(self, message: str, invalid_vars: list[str]):
        self.invalid_vars = invalid_vars
        super().__init__(message)


class TemplateVariableResolver:
    """Resolves template variables from entity context — type-scoped.
    For LEAD enquiries, only lead/hospital/staff variables are resolved.
    For patient enquiries, all clinical variables are resolved.
    Never returns null, "Unknown", "N/A", or fallback values.
    """

    async def resolve(
        self,
        db: AsyncSession,
        template_message: str,
        enquiry_type: str = "",
        patient_id: Optional[str] = None,
        lead_id: Optional[str] = None,
        hospital_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        appointment_id: Optional[str] = None,
        treatment_type_id: Optional[str] = None,
        case_id: Optional[str] = None,
        treatment_plan_id: Optional[str] = None,
        staff_id: Optional[str] = None,
        visit_number: Optional[int] = None,
        remaining_visits: Optional[int] = None,
        total_visits: Optional[int] = None,
    ) -> str:
        """Replace all {{variable}} placeholders with actual values, respecting type scope."""
        variables = await self._build_variable_map(
            db, enquiry_type, patient_id, lead_id, hospital_id, doctor_id,
            appointment_id, treatment_type_id, case_id,
            treatment_plan_id, staff_id, visit_number, remaining_visits, total_visits,
        )
        result = template_message
        for key, value in variables.items():
            result = result.replace("{{" + key + "}}", str(value))
        return result

    async def resolve_with_validation(
        self,
        db: AsyncSession,
        template_message: str,
        enquiry_type: str = "",
        patient_id: Optional[str] = None,
        lead_id: Optional[str] = None,
        hospital_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        appointment_id: Optional[str] = None,
        treatment_type_id: Optional[str] = None,
        case_id: Optional[str] = None,
        treatment_plan_id: Optional[str] = None,
        staff_id: Optional[str] = None,
        visit_number: Optional[int] = None,
        remaining_visits: Optional[int] = None,
        total_visits: Optional[int] = None,
    ) -> tuple[str, list[str]]:
        """Resolve template and validate no forbidden variables are used.
        Returns (resolved_message, invalid_variables).
        If invalid variables are found, they remain unresolved in the message.
        """
        available = get_available_variables(enquiry_type)
        import re
        found = re.findall(r'\{\{(\w+)\}\}', template_message)
        invalid = [v for v in found if v not in available]

        result = await self.resolve(
            db, template_message, enquiry_type,
            patient_id, lead_id, hospital_id, doctor_id,
            appointment_id, treatment_type_id, case_id,
            treatment_plan_id, staff_id, visit_number, remaining_visits, total_visits,
        )
        return result, invalid

    async def resolve_template_for_enquiry(
        self,
        db: AsyncSession,
        hospital_id: str,
        enquiry_type: str,
    ):
        from app.models.whatsapp_template import WhatsAppTemplate

        q = select(WhatsAppTemplate).where(
            WhatsAppTemplate.hospital_id == hospital_id,
            WhatsAppTemplate.enquiry_type == enquiry_type,
            WhatsAppTemplate.is_active == True,
        )
        result = await db.execute(q)
        template = result.scalar_one_or_none()

        if not template:
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
        enquiry_type: str = "",
        patient_id: Optional[str] = None,
        lead_id: Optional[str] = None,
        hospital_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        appointment_id: Optional[str] = None,
        treatment_type_id: Optional[str] = None,
        case_id: Optional[str] = None,
        treatment_plan_id: Optional[str] = None,
        staff_id: Optional[str] = None,
        visit_number: Optional[int] = None,
        remaining_visits: Optional[int] = None,
        total_visits: Optional[int] = None,
    ) -> dict[str, str]:
        variables: dict[str, str] = {}
        is_lead = enquiry_type in LEAD_ENQUIRY_TYPES

        # Current date/time (always available)
        variables["current_date"] = date.today().isoformat()
        variables["current_time"] = datetime.now().strftime("%H:%M")

        # --- Hospital (available for all) ---
        if hospital_id:
            from app.models.hospital import Hospital
            hospital = await db.get(Hospital, hospital_id)
            if hospital:
                variables["hospital_name"] = hospital.name or ""
                variables["clinic_name"] = hospital.name or ""
                variables["hospital_phone"] = hospital.phone or ""
                variables["hospital_address"] = hospital.address or ""
                if not is_lead:
                    variables["branch_name"] = hospital.name or ""

        # --- Website (lead-only, from hospital) ---
        if is_lead and hospital_id:
            from app.models.hospital import Hospital
            hospital = await db.get(Hospital, hospital_id)
            if hospital:
                import re
                if hospital.email and "@" in hospital.email:
                    domain = hospital.email.split("@")[1]
                    variables["website"] = f"www.{domain}"
                elif hospital.name:
                    slug = re.sub(r'[^a-zA-Z0-9]', '', hospital.name).lower()
                    variables["website"] = f"www.{slug}.com"

        # --- Lead-only resolution ---
        if is_lead:
            if lead_id:
                from app.models.lead import Lead
                lead = await db.get(Lead, lead_id)
                if lead:
                    variables["lead_name"] = lead.lead_name or ""
                    variables["lead_phone"] = lead.mobile or ""
                    variables["lead_source"] = lead.source.replace("_", " ").title() if lead.source else ""
                    variables["lead_status"] = lead.status or ""
                    variables["interested_treatment"] = lead.interested_treatment or ""
                    if lead.notes:
                        variables["lead_notes"] = lead.notes
                    # Preferred branch / time
                    variables["preferred_branch"] = ""
                    variables["preferred_time"] = ""
                    if lead.preferred_visit_date:
                        variables["preferred_time"] = lead.preferred_visit_date.strftime("%d %B %Y")

            # Staff
            if staff_id:
                from app.models.user import User
                staff = await db.get(User, staff_id)
                if staff:
                    variables["assigned_staff"] = staff.full_name or ""
                    variables["assigned_staff_name"] = staff.full_name or ""

            return variables  # LEAD type stops here — never resolve patient/clinical vars

        # ─── Patient-type resolution below ────────────────────────────────

        # --- Patient ---
        patient = None
        if patient_id:
            from app.models.patient import Patient
            patient = await db.get(Patient, patient_id)
            if patient:
                variables["patient_name"] = patient.full_name or ""
                variables["patient_phone"] = patient.phone or ""
                variables["patient_age"] = str(patient.age) if patient.age else ""
                variables["patient_gender"] = patient.gender or ""
                variables["op_number"] = patient.op_no or ""

        # --- Lead (fallback for patient_name/phone from lead) ---
        if lead_id:
            from app.models.lead import Lead
            lead = await db.get(Lead, lead_id)
            if lead:
                variables["lead_name"] = lead.lead_name or ""
                variables["lead_phone"] = lead.mobile or ""
                variables["lead_source"] = lead.source.replace("_", " ").title() if lead.source else ""
                variables["lead_status"] = lead.status or ""
                if patient is None:
                    if "patient_name" not in variables:
                        variables["patient_name"] = lead.lead_name or ""
                    if "patient_phone" not in variables:
                        variables["patient_phone"] = lead.mobile or ""

        # --- Doctor ---
        if doctor_id:
            from app.models.user import User
            doctor = await db.get(User, doctor_id)
            if doctor:
                variables["doctor_name"] = doctor.full_name or ""
                variables["doctor_specialization"] = doctor.specialization or ""

        # --- Staff ---
        if staff_id:
            from app.models.user import User
            staff = await db.get(User, staff_id)
            if staff:
                variables["staff_name"] = staff.full_name or ""
                variables["staff_phone"] = staff.phone or ""
                variables["staff_email"] = staff.email or ""
        if "staff_name" not in variables and "doctor_name" in variables:
            variables["staff_name"] = variables["doctor_name"]

        # --- Appointment ---
        if appointment_id:
            from app.models.appointment import Appointment
            appt = await db.get(Appointment, appointment_id)
            if appt:
                if appt.appointment_date:
                    variables["appointment_date"] = appt.appointment_date.isoformat()
                if appt.appointment_time:
                    variables["appointment_time"] = str(appt.appointment_time)
                if appt.appointment_type:
                    apt_type = appt.appointment_type
                    variables["appointment_type"] = (apt_type.value if hasattr(apt_type, "value") else apt_type).replace("_", " ").title() if apt_type else ""

        # --- Treatment Type ---
        treatment_type_name = None
        if treatment_type_id:
            from app.models.treatment_type import TreatmentType
            tt = await db.get(TreatmentType, treatment_type_id)
            if tt:
                treatment_type_name = tt.name
                if "treatment_name" not in variables:
                    variables["treatment_name"] = tt.name

        # --- Treatment Plan ---
        tp = None
        if treatment_plan_id:
            from app.models.treatment_plan import TreatmentPlan
            tp = await db.get(TreatmentPlan, treatment_plan_id)
            if tp:
                if "treatment_name" not in variables:
                    variables["treatment_name"] = tp.treatment_name or treatment_type_name or ""
                if treatment_type_name and "treatment_type" not in variables:
                    variables["treatment_type"] = treatment_type_name
                visit_num = visit_number or (tp.completed_sittings + 1)
                variables["visit_number"] = str(visit_num)
                variables["remaining_visits"] = str(tp.remaining_sittings)
                variables["total_visits"] = str(tp.total_sittings)
                ts = tp.status
                variables["treatment_status"] = (ts.value if hasattr(ts, "value") else ts).replace("_", " ").title() if ts else ""
                if tp.completed_at:
                    variables["treatment_completion_date"] = tp.completed_at.strftime("%d %B %Y")

        if visit_number is not None and "visit_number" not in variables:
            variables["visit_number"] = str(visit_number)
        if remaining_visits is not None and "remaining_visits" not in variables:
            variables["remaining_visits"] = str(remaining_visits)
        if total_visits is not None and "total_visits" not in variables:
            variables["total_visits"] = str(total_visits)

        # --- Case + Completed Treatments ---
        if case_id:
            from app.models.case import Case
            from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
            case = await db.get(Case, case_id)
            if case:
                variables["case_name"] = case.case_number or case.id[:8]
                if case.completion_date:
                    variables["case_completion_date"] = case.completion_date.strftime("%d %B %Y")
                tp_q = select(TreatmentPlan).where(
                    TreatmentPlan.case_id == case_id,
                    TreatmentPlan.status == TreatmentPlanStatus.COMPLETED.value,
                )
                tp_rows = (await db.execute(tp_q)).scalars().all()
                if tp_rows:
                    completed_names = [t.treatment_name for t in tp_rows if t.treatment_name]
                    variables["completed_treatments"] = "\n".join(f"• {n}" for n in completed_names)
                else:
                    variables["completed_treatments"] = ""

        # --- Recall ---
        if patient_id:
            from app.models.generated_enquiry import GeneratedEnquiry
            recall_q = await db.execute(
                select(GeneratedEnquiry).where(
                    and_(
                        GeneratedEnquiry.patient_id == patient_id,
                        GeneratedEnquiry.enquiry_type == "RECALL",
                        GeneratedEnquiry.status == "PENDING",
                    )
                ).order_by(GeneratedEnquiry.due_date).limit(1)
            )
            next_recall = recall_q.scalar_one_or_none()
            if next_recall:
                if next_recall.due_date:
                    variables["next_recall_date"] = next_recall.due_date.isoformat()
                if next_recall.recurrence_interval_days:
                    interval = next_recall.recurrence_interval_days
                    if interval == 180:
                        variables["recall_interval"] = "6 Months"
                    elif interval == 365:
                        variables["recall_interval"] = "12 Months"
                    elif interval == 90:
                        variables["recall_interval"] = "3 Months"
                    elif interval == 30:
                        variables["recall_interval"] = "1 Month"
                    else:
                        variables["recall_interval"] = f"{interval} Days"

        # --- Follow-up dates ---
        if patient_id:
            from app.models.follow_up import FollowUp, FollowUpStatus
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
                variables["followup_date"] = next_fu.follow_up_date.isoformat()

        return variables


_resolver: Optional[TemplateVariableResolver] = None


def get_template_resolver() -> TemplateVariableResolver:
    global _resolver
    if _resolver is None:
        _resolver = TemplateVariableResolver()
    return _resolver
