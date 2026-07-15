import logging
from datetime import date, timedelta, time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_follow_up_rule import TreatmentFollowUpRule
from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus
from app.models.case import Case
from app.models.patient import Patient
from app.models.hospital import Hospital

logger = logging.getLogger(__name__)

WAITING_PATIENT_TASK_DAYS = 7
WAITING_LAB_TASK_DAYS = 5
OVERDUE_ESCALATION_DAYS = 7


class CRMRuleEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_rule(self, treatment_name: str = None, treatment_type_id: str = None, treatment_template_id: str = None, hospital_id: str = None) -> TreatmentFollowUpRule | None:
        for scope_hid in (None, hospital_id):
            clauses = []
            if treatment_type_id:
                clauses.append(TreatmentFollowUpRule.treatment_type_id == treatment_type_id)
            if treatment_template_id:
                clauses.append(TreatmentFollowUpRule.treatment_template_id == treatment_template_id)
            if treatment_name:
                clauses.append(TreatmentFollowUpRule.treatment_name == treatment_name)
            if not clauses:
                continue
            from sqlalchemy import or_
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

    async def on_treatment_assigned(self, plan_id: str) -> None:
        """When treatment is first assigned — create a 'schedule first visit' task."""
        plan = await self.db.get(TreatmentPlan, plan_id)
        if not plan:
            return
        case = await self.db.get(Case, plan.case_id)
        if not case or not case.patient_id:
            return
        patient = await self.db.get(Patient, case.patient_id)
        if not patient:
            return
        existing = await self.db.execute(
            select(FollowUp).where(
                FollowUp.treatment_id == plan_id,
                FollowUp.follow_up_type == FollowUpType.ONE_DAY_FOLLOW_UP.value,
                FollowUp.status != FollowUpStatus.LOST.value,
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            return
        fu = FollowUp(
            patient_id=patient.id, hospital_id=patient.hospital_id,
            doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
            treatment_id=plan_id, treatment_name=plan.treatment_name,
            follow_up_date=date.today() + timedelta(days=1),
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
            status=FollowUpStatus.PENDING.value,
            notes=f"Auto: Schedule first visit for treatment '{plan.treatment_name}'",
        )
        self.db.add(fu)
        await self.db.flush()
        logger.info("CRM: Assigned task created for plan %s", plan_id)

    async def on_treatment_completed(self, plan_id: str) -> None:
        """When treatment is completed — create follow-up + recall tasks per rule."""
        plan = await self.db.get(TreatmentPlan, plan_id)
        if not plan or plan.status != TreatmentPlanStatus.COMPLETED:
            return
        case = await self.db.get(Case, plan.case_id)
        if not case or not case.patient_id:
            return
        patient = await self.db.get(Patient, case.patient_id)
        hospital_id = patient.hospital_id if patient else None

        rule = await self.get_rule(
            treatment_name=plan.treatment_name,
            treatment_type_id=plan.treatment_type_id,
            treatment_template_id=plan.treatment_template_id,
            hospital_id=hospital_id,
        )
        if not rule:
            logger.info("CRM: No rule found for plan %s", plan_id)
            return

        today = date.today()
        created_count = 0

        if rule.follow_up_1_day:
            if not await self._has_follow_up(plan_id, FollowUpType.ONE_DAY_FOLLOW_UP.value):
                self.db.add(FollowUp(
                    patient_id=patient.id, hospital_id=hospital_id,
                    doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=plan.treatment_name,
                    follow_up_date=today + timedelta(days=1), follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto: 1-day follow-up for '{plan.treatment_name}'",
                ))
                created_count += 1

        if rule.follow_up_7_day:
            if not await self._has_follow_up(plan_id, FollowUpType.SEVEN_DAY_FOLLOW_UP.value):
                self.db.add(FollowUp(
                    patient_id=patient.id, hospital_id=hospital_id,
                    doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=plan.treatment_name,
                    follow_up_date=today + timedelta(days=7), follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.SEVEN_DAY_FOLLOW_UP.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto: 7-day follow-up for '{plan.treatment_name}'",
                ))
                created_count += 1

        if rule.recall_6_month:
            if not await self._has_follow_up(plan_id, FollowUpType.SIX_MONTH_RECALL.value):
                self.db.add(FollowUp(
                    patient_id=patient.id, hospital_id=hospital_id,
                    doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=plan.treatment_name,
                    follow_up_date=today + timedelta(days=180), follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto: 6-month recall for '{plan.treatment_name}'",
                ))
                created_count += 1

        if rule.recall_12_month:
            if not await self._has_follow_up(plan_id, FollowUpType.TWELVE_MONTH_RECALL.value):
                self.db.add(FollowUp(
                    patient_id=patient.id, hospital_id=hospital_id,
                    doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=plan.treatment_name,
                    follow_up_date=today + timedelta(days=365), follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.TWELVE_MONTH_RECALL.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto: 12-month recall for '{plan.treatment_name}'",
                ))
                created_count += 1

        if rule.custom_recall_days and rule.custom_recall_days > 0:
            if not await self._has_custom_recall(plan_id, rule.custom_recall_days):
                self.db.add(FollowUp(
                    patient_id=patient.id, hospital_id=hospital_id,
                    doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
                    treatment_id=plan_id, treatment_name=plan.treatment_name,
                    follow_up_date=today + timedelta(days=rule.custom_recall_days), follow_up_time=time(10, 0),
                    follow_up_type=FollowUpType.SIX_MONTH_RECALL.value,
                    status=FollowUpStatus.PENDING.value,
                    treatment_completed_date=today,
                    notes=f"Auto: {rule.custom_recall_days}-day recall for '{plan.treatment_name}'",
                ))
                created_count += 1

        await self.db.flush()
        logger.info("CRM: Completed — created %d tasks for plan %s", created_count, plan_id)

    async def on_waiting_patient(self, plan_id: str) -> None:
        """When treatment is set to WAITING_PATIENT — create a follow-up task for 7 days later."""
        plan = await self.db.get(TreatmentPlan, plan_id)
        if not plan:
            return
        case = await self.db.get(Case, plan.case_id)
        if not case or not case.patient_id:
            return
        patient = await self.db.get(Patient, case.patient_id)
        if not patient:
            return
        if await self._has_follow_up(plan_id, FollowUpType.ONE_DAY_FOLLOW_UP.value):
            return
        fu = FollowUp(
            patient_id=patient.id, hospital_id=patient.hospital_id,
            doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
            treatment_id=plan_id, treatment_name=plan.treatment_name,
            follow_up_date=date.today() + timedelta(days=WAITING_PATIENT_TASK_DAYS),
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
            status=FollowUpStatus.PENDING.value,
            notes=f"Auto: Patient follow-up after {WAITING_PATIENT_TASK_DAYS} days for '{plan.treatment_name}'",
        )
        self.db.add(fu)
        await self.db.flush()
        logger.info("CRM: Waiting patient task created for plan %s", plan_id)

    async def on_waiting_lab(self, plan_id: str) -> None:
        """When treatment is set to WAITING_LAB — create a follow-up task for 5 days later."""
        plan = await self.db.get(TreatmentPlan, plan_id)
        if not plan:
            return
        case = await self.db.get(Case, plan.case_id)
        if not case or not case.patient_id:
            return
        patient = await self.db.get(Patient, case.patient_id)
        if not patient:
            return
        if await self._has_follow_up(plan_id, FollowUpType.ONE_DAY_FOLLOW_UP.value):
            return
        fu = FollowUp(
            patient_id=patient.id, hospital_id=patient.hospital_id,
            doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
            treatment_id=plan_id, treatment_name=plan.treatment_name,
            follow_up_date=date.today() + timedelta(days=WAITING_LAB_TASK_DAYS),
            follow_up_time=time(10, 0),
            follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
            status=FollowUpStatus.PENDING.value,
            notes=f"Auto: Lab follow-up after {WAITING_LAB_TASK_DAYS} days for '{plan.treatment_name}'",
        )
        self.db.add(fu)
        await self.db.flush()
        logger.info("CRM: Waiting lab task created for plan %s", plan_id)

    async def on_treatment_overdue(self, plan_id: str, reason: str = "", delay_type: str = "") -> None:
        """When treatment is marked overdue — create a high-priority task."""
        plan = await self.db.get(TreatmentPlan, plan_id)
        if not plan:
            return
        case = await self.db.get(Case, plan.case_id)
        if not case or not case.patient_id:
            return
        patient = await self.db.get(Patient, case.patient_id)
        if not patient:
            return
        fu = FollowUp(
            patient_id=patient.id, hospital_id=patient.hospital_id,
            doctor_id=plan.assigned_doctor_id, case_id=plan.case_id,
            treatment_id=plan_id, treatment_name=plan.treatment_name,
            follow_up_date=date.today(), follow_up_time=time(9, 0),
            follow_up_type=FollowUpType.ONE_DAY_FOLLOW_UP.value,
            status=FollowUpStatus.PENDING.value,
            notes=f"URGENT: Treatment '{plan.treatment_name}' overdue. Reason: {reason} ({delay_type})",
        )
        self.db.add(fu)
        await self.db.flush()
        logger.info("CRM: Overdue task created for plan %s", plan_id)

    async def _has_follow_up(self, plan_id: str, follow_up_type: str) -> bool:
        result = await self.db.execute(
            select(FollowUp).where(
                FollowUp.treatment_id == plan_id,
                FollowUp.follow_up_type == follow_up_type,
                FollowUp.status != FollowUpStatus.LOST.value,
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _has_custom_recall(self, plan_id: str, days: int) -> bool:
        result = await self.db.execute(
            select(FollowUp).where(
                FollowUp.treatment_id == plan_id,
                FollowUp.notes.ilike(f"%{days}-day recall%"),
                FollowUp.status != FollowUpStatus.LOST.value,
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None
