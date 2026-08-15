import logging
from datetime import date
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models.medication_prescription import MedicationPrescription
from app.models.case import Case
from app.models.patient import Patient
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_sitting import TreatmentSitting

logger = logging.getLogger(__name__)


class MedicationPrescriptionService:
    """Single source of truth for medications across Case Reports and Treatment Sittings.

    Case-level medications live on medication_prescriptions.case_id.
    Sitting-level medications live on medication_prescriptions.treatment_sitting_id.
    Both are full-replace operations (idempotent; no duplicates on re-edit).
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _insert_rows(self, items: List[dict], user_id: str, **owner_kwargs) -> None:
        for item in items:
            if not item.get("medication_name") or not str(item["medication_name"]).strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="medication_name is required for every medication")
            row = MedicationPrescription(
                medication_name=str(item["medication_name"]).strip(),
                dosage=(item.get("dosage") or None),
                frequency=(item.get("frequency") or None),
                duration=(item.get("duration") or None),
                instructions=(item.get("instructions") or None),
                created_by_id=user_id,
                updated_by_id=user_id,
                **owner_kwargs,
            )
            self.db.add(row)

    async def replace_for_case(self, case_id: str, items: List[dict], user_id: str = None) -> None:
        await self.db.execute(sa_delete(MedicationPrescription).where(MedicationPrescription.case_id == case_id))
        await self._insert_rows(items, user_id, case_id=case_id)
        await self.db.flush()

    async def replace_for_sitting(self, sitting_id: str, items: List[dict], user_id: str = None) -> None:
        await self.db.execute(sa_delete(MedicationPrescription).where(MedicationPrescription.treatment_sitting_id == sitting_id))
        await self._insert_rows(items, user_id, treatment_sitting_id=sitting_id)
        await self.db.flush()

    async def get_case_medications(self, case_id: str) -> List[MedicationPrescription]:
        result = await self.db.execute(
            select(MedicationPrescription)
            .where(MedicationPrescription.case_id == case_id)
            .order_by(MedicationPrescription.created_at, MedicationPrescription.id)
        )
        return list(result.scalars().all())

    async def get_sitting_medications(self, sitting_id: str) -> List[MedicationPrescription]:
        result = await self.db.execute(
            select(MedicationPrescription)
            .where(MedicationPrescription.treatment_sitting_id == sitting_id)
            .order_by(MedicationPrescription.created_at, MedicationPrescription.id)
        )
        return list(result.scalars().all())

    async def get_patient_medication_timeline(self, patient_id: str) -> List[dict]:
        """Chronological list of clinical events (case reports + every treatment sitting).

        Every case and every sitting is included even when it has no medications
        (the frontend renders 'No medication prescribed.' for those). Legacy
        free-text prescriptions are surfaced alongside structured rows.
        """
        cases_result = await self.db.execute(
            select(Case)
            .where(Case.patient_id == patient_id, Case.is_active == True)
            .options(
                selectinload(Case.medication_prescriptions),
                selectinload(Case.doctor),
                selectinload(Case.appointment),
                selectinload(Case.treatment_plans).selectinload(TreatmentPlan.sittings).selectinload(TreatmentSitting.medication_prescriptions),
                selectinload(Case.treatment_plans).selectinload(TreatmentPlan.sittings).selectinload(TreatmentSitting.doctor),
            )
            .order_by(Case.created_at)
        )
        cases = list(cases_result.scalars().all())

        items: List[dict] = []
        for case in cases:
            case_meds = list(getattr(case, "medication_prescriptions", None) or [])
            case_appt_date = getattr(case, "appointment", None) and getattr(case.appointment, "appointment_date", None)
            items.append({
                "id": f"case_{case.id}",
                "event_type": "case_report",
                "case_id": case.id,
                "case_number": case.case_number or case.id[:8].upper(),
                "sitting_id": None,
                "sitting_number": None,
                "treatment_plan_id": None,
                "treatment_name": None,
                "doctor_id": case.doctor_id,
                "doctor_name": case.doctor_name if getattr(case, "doctor_name", None) else (case.doctor.full_name if case.doctor else None),
                "date": case_appt_date.isoformat() if case_appt_date else (case.created_at.date().isoformat() if case.created_at else None),
                "sort_date": case_appt_date or (case.created_at.date() if case.created_at else None),
                "medications": [
                    {
                        "id": m.id,
                        "medication_name": m.medication_name,
                        "dosage": m.dosage,
                        "frequency": m.frequency,
                        "duration": m.duration,
                        "instructions": m.instructions,
                        "created_at": m.created_at.isoformat() if m.created_at else None,
                        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
                    }
                    for m in case_meds
                ],
                "legacy_prescription": getattr(case, "medicines_prescribed", None) or None,
            })

            for plan in (getattr(case, "treatment_plans", None) or []):
                sittings = list(getattr(plan, "sittings", None) or [])
                sittings.sort(key=lambda s: ((s.sitting_date or (s.created_at.date() if s.created_at else date.min), s.sitting_number)))
                for sitting in sittings:
                    sitting_meds = list(getattr(sitting, "medication_prescriptions", None) or [])
                    sit_date = sitting.sitting_date or (sitting.created_at.date() if sitting.created_at else None)
                    items.append({
                        "id": f"sitting_{sitting.id}",
                        "event_type": "treatment_sitting",
                        "case_id": case.id,
                        "case_number": case.case_number or case.id[:8].upper(),
                        "sitting_id": sitting.id,
                        "sitting_number": sitting.sitting_number,
                        "treatment_plan_id": plan.id,
                        "treatment_name": plan.treatment_name,
                        "doctor_id": sitting.doctor_id,
                        "doctor_name": sitting.doctor.full_name if sitting.doctor else None,
                        "date": sit_date.isoformat() if sit_date else None,
                        "sort_date": sit_date,
                        "medications": [
                            {
                                "id": m.id,
                                "medication_name": m.medication_name,
                                "dosage": m.dosage,
                                "frequency": m.frequency,
                                "duration": m.duration,
                                "instructions": m.instructions,
                                "created_at": m.created_at.isoformat() if m.created_at else None,
                                "updated_at": m.updated_at.isoformat() if m.updated_at else None,
                            }
                            for m in sitting_meds
                        ],
                        "legacy_prescription": getattr(sitting, "prescription", None) or None,
                    })

        items.sort(key=lambda it: (it["sort_date"].isoformat() if it["sort_date"] else ""), reverse=True)
        for it in items:
            it.pop("sort_date", None)
        return items
