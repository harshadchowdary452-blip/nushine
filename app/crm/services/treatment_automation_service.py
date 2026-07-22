"""
TreatmentAutomationService — Thin Event Publisher

Accepts business events from event wiring, builds event_data, and
delegates to rule_engine.execute_rules() as the single automation engine.

NO direct GeneratedEnquiry/FollowUp creation here. All automation
logic lives in rule_engine.py.
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import Patient
from app.models.treatment_plan import TreatmentPlan
from app.crm.services.rule_engine import execute_rules

logger = logging.getLogger(__name__)


def determine_visit_stage(current_visit: int, total_visits: int) -> str:
    if total_visits <= 1:
        return "SINGLE"
    if current_visit == 1:
        return "FIRST"
    if current_visit >= total_visits:
        return "FINAL"
    return "MIDDLE"


class TreatmentAutomationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def on_visit_completed(
        self,
        treatment_plan_id: str,
        sitting_number: int,
        patient_id: str,
        hospital_id: str,
        doctor_id: Optional[str] = None,
    ) -> dict:
        tp = await self.db.get(TreatmentPlan, treatment_plan_id)
        if not tp:
            return {"error": "Treatment plan not found"}

        total = tp.total_sittings or 1
        current = sitting_number
        stage = determine_visit_stage(current, total)

        patient = await self.db.get(Patient, patient_id)

        event_data = {
            "patient_id": patient_id,
            "patient_name": getattr(patient, "full_name", None) if patient else None,
            "doctor_id": doctor_id,
            "treatment_plan_id": treatment_plan_id,
            "treatment_name": tp.treatment_name,
            "treatment_type_id": tp.treatment_type_id,
            "visit_number": current,
            "total_visits": total,
            "visit_stage": stage,
            "assigned_staff_id": tp.assigned_doctor_id,
        }

        created = await execute_rules(self.db, hospital_id, "VISIT_COMPLETED", event_data, "TREATMENT")
        return {"visit_stage": stage, "enquiries_created": len(created), "details": created}

    async def on_appointment_completed(
        self,
        appointment_id: str,
        patient_id: str,
        hospital_id: str,
        doctor_id: Optional[str] = None,
    ) -> dict:
        patient = await self.db.get(Patient, patient_id)

        event_data = {
            "patient_id": patient_id,
            "patient_name": getattr(patient, "full_name", None) if patient else None,
            "doctor_id": doctor_id,
            "assigned_staff_id": doctor_id,
        }

        created = await execute_rules(self.db, hospital_id, "APPOINTMENT_COMPLETED", event_data, "LEAD")
        return {"enquiries_created": len(created), "details": created}

    async def on_appointment_missed(
        self,
        appointment_id: str,
        patient_id: str,
        hospital_id: str,
        doctor_id: Optional[str] = None,
    ) -> dict:
        patient = await self.db.get(Patient, patient_id)

        event_data = {
            "patient_id": patient_id,
            "patient_name": getattr(patient, "full_name", None) if patient else None,
            "doctor_id": doctor_id,
            "assigned_staff_id": doctor_id,
        }

        lead_result = await execute_rules(self.db, hospital_id, "APPOINTMENT_MISSED", event_data, "LEAD")
        tx_result = await execute_rules(self.db, hospital_id, "APPOINTMENT_MISSED", event_data, "TREATMENT")
        return {"enquiries_created": len(lead_result) + len(tx_result)}

    async def on_treatment_completed(
        self,
        treatment_plan_id: str,
        patient_id: str,
        hospital_id: str,
        doctor_id: Optional[str] = None,
    ) -> dict:
        tp = await self.db.get(TreatmentPlan, treatment_plan_id)
        if not tp:
            return {"error": "Treatment plan not found"}

        patient = await self.db.get(Patient, patient_id)

        event_data = {
            "patient_id": patient_id,
            "patient_name": getattr(patient, "full_name", None) if patient else None,
            "doctor_id": doctor_id,
            "treatment_plan_id": treatment_plan_id,
            "treatment_name": tp.treatment_name,
            "treatment_type_id": tp.treatment_type_id,
            "total_visits": tp.total_sittings,
            "visit_number": tp.total_sittings,
            "visit_stage": "FINAL",
            "assigned_staff_id": tp.assigned_doctor_id,
        }

        created = await execute_rules(self.db, hospital_id, "TREATMENT_COMPLETED", event_data, "TREATMENT")
        return {"enquiries_created": len(created), "details": created}
