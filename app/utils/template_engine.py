import re
from typing import Optional, Dict, Any
from datetime import date, time


class TemplateEngine:
    VARIABLE_PATTERN = re.compile(r"\{\{(\w+)\}\}")

    @staticmethod
    def get_variables(template: str) -> list[str]:
        return TemplateEngine.VARIABLE_PATTERN.findall(template)

    @staticmethod
    def validate_variables(template: str) -> dict[str, list[str]]:
        known = {
            "patient_name", "doctor_name", "hospital_name",
            "appointment_date", "appointment_time",
            "invoice_number", "pending_amount", "due_date",
        }
        found = set(TemplateEngine.get_variables(template))
        return {
            "supported": list(found & known),
            "unsupported": list(found - known),
            "missing": list(known - found),
        }

    @staticmethod
    def render_template(template: str, variables: Dict[str, str]) -> str:
        def replacer(m: re.Match) -> str:
            key = m.group(1)
            return variables.get(key, m.group(0))
        return TemplateEngine.VARIABLE_PATTERN.sub(replacer, template)

    @staticmethod
    def build_variables(
        patient_name: Optional[str] = None,
        doctor_name: Optional[str] = None,
        hospital_name: Optional[str] = None,
        appointment_date: Optional[str] = None,
        appointment_time: Optional[str] = None,
        invoice_number: Optional[str] = None,
        pending_amount: Optional[str] = None,
        due_date: Optional[str] = None,
    ) -> Dict[str, str]:
        variables: Dict[str, str] = {}
        if patient_name: variables["patient_name"] = patient_name
        if doctor_name: variables["doctor_name"] = doctor_name
        if hospital_name: variables["hospital_name"] = hospital_name
        if appointment_date: variables["appointment_date"] = appointment_date
        if appointment_time: variables["appointment_time"] = appointment_time
        if invoice_number: variables["invoice_number"] = invoice_number
        if pending_amount: variables["pending_amount"] = pending_amount
        if due_date: variables["due_date"] = due_date
        return variables


template_engine = TemplateEngine()
