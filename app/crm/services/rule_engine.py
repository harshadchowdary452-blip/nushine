"""
CRM Rule Engine — SINGLE decision engine for all CRM automation.

ONE event → ONE rule engine → ONE decision → ONE enquiry

This engine evaluates business rules and returns structured decisions.
NO database inserts. NO side effects. Pure evaluation.

Pipeline:
  Event → Load CRM Settings → Load Rules → Evaluate → Return Decision

The executor handles all DB operations.
"""
import logging
from datetime import date, timedelta, datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

logger = logging.getLogger("crm.rule_engine")


# ============================================================
# Event → TriggerEvent mapping (SINGLE source of truth)
# ============================================================

EVENT_TO_TRIGGER = {
    "LEAD_CREATED": "LEAD_CREATED",
    "PATIENT_REGISTERED": "PATIENT_REGISTERED",
    "OPD_CONSULTATION_COMPLETED": "OPD_CONSULTATION_COMPLETED",
    "APPOINTMENT_CREATED": "APPOINTMENT_CREATED",
    "APPOINTMENT_CANCELLED": "APPOINTMENT_CANCELLED",
    "APPOINTMENT_COMPLETED": "APPOINTMENT_COMPLETED",
    "APPOINTMENT_MISSED": "APPOINTMENT_MISSED",
    "TREATMENT_COMPLETED": "TREATMENT_COMPLETED",
    "TREATMENT_VISIT_COMPLETED": "TREATMENT_VISIT_COMPLETED",
    "CASE_COMPLETED": "CASE_COMPLETED",
    "PATIENT_INACTIVE": "PATIENT_INACTIVE",
    "LEAD_CONVERTED": "LEAD_CONVERTED",
}

# Events that are logged but do NOT create enquiries
EVENT_TO_TRIGGER.update({
    "LEAD_UPDATED": None,
    "PATIENT_UPDATED": None,
    "PATIENT_DEACTIVATED": None,
    "APPOINTMENT_UPDATED": None,
    "APPOINTMENT_RESCHEDULED": None,
    "TREATMENT_CREATED": None,
    "TREATMENT_STARTED": None,
    "CASE_CREATED": "CASE_CREATED",
    "CASE_UPDATED": None,
    "CASE_REOPENED": None,
    "CASE_APPROVED": None,
    "PAYMENT_CREATED": None,
    "PAYMENT_RECEIVED": None,
    "COMMUNICATION_SENT": None,
    "COMMUNICATION_FAILED": None,
    "FOLLOWUP_COMPLETED": None,
    "CAMPAIGN_COMPLETED": None,
    "ENQUIRY_CREATED": None,
    "ENQUIRY_CONVERTED": None,
    "RECALL_COMPLETED": "RECALL_COMPLETED",
})


# ============================================================
# Rule Engine — SINGLE source of truth for all CRM decisions
# ============================================================

class RuleEngine:
    """
    SINGLE rule engine for all CRM automation.

    Evaluates business rules and returns structured decisions.
    NO database inserts. NO side effects. Pure evaluation.

    Business Rules:
        1. Lead Follow-Up: ONLY for LEAD_CREATED, status=NEW, no existing enquiry
        2. Appointment Reminder: ONLY for APPOINTMENT_CREATED, SCHEDULED, future, no duplicate
        3. Treatment Wellness: ONLY for TREATMENT_COMPLETED, no future appointment
        4. Case Wellness: ONLY for CASE_COMPLETED, no duplicate
        5. Recall: ONLY for CASE_COMPLETED, recall enabled, no duplicate
        6. Missed Appointment: ONLY for APPOINTMENT_MISSED, no duplicate
    """

    def __init__(self):
        pass

    async def evaluate(
        self,
        db: AsyncSession,
        hospital_id: str,
        event_type: str,
        entity_type: str,
        entity_id: str,
        payload: Optional[dict] = None,
    ) -> list["Decision"]:
        """
        Evaluate CRM rules for a given event.

        Returns a list of Decisions (each = one enquiry to create/cancel).
        Empty list = no action needed.
        """
        from app.crm.services.event_dispatcher import Decision

        payload = payload or {}

        # 1. Load CRM Settings
        settings = await self._load_crm_settings(db, hospital_id)
        if not settings or not settings.enabled:
            logger.debug("CRM_DISABLED: hospital=%s", hospital_id)
            return []

        # 2. Map event to trigger
        trigger_event = EVENT_TO_TRIGGER.get(event_type)
        if trigger_event is None:
            logger.debug("NO_TRIGGER: event=%s", event_type)
            return []

        # 3. Apply business rules based on event type
        result = await self._apply_business_rules(
            db, hospital_id, event_type, trigger_event,
            entity_type, entity_id, payload, settings,
        )

        # Normalize: single Decision → list
        if result is None:
            decisions = []
        elif isinstance(result, list):
            decisions = result
        else:
            decisions = [result]

        if decisions:
            for d in decisions:
                logger.info(
                    "DECISION_MADE: hospital=%s event=%s action=%s type=%s entity=%s",
                    hospital_id, event_type, d.action, d.enquiry_type, entity_id,
                )
        else:
            logger.debug("NO_DECISION: hospital=%s event=%s entity=%s", hospital_id, event_type, entity_id)

        return decisions

    # ============================================================
    # Business Rules — the SINGLE source of truth
    # ============================================================

    async def _apply_business_rules(
        self,
        db: AsyncSession,
        hospital_id: str,
        event_type: str,
        trigger_event: str,
        entity_type: str,
        entity_id: str,
        payload: dict,
        settings,
    ) -> Optional[list["Decision"] | "Decision"]:
        """Apply business rules based on event type. Returns Decision, list of Decisions, or None."""

        if event_type == "LEAD_CREATED":
            return await self._rule_lead_created(db, hospital_id, payload, settings)

        elif event_type == "PATIENT_REGISTERED":
            # Patient registration does NOT create Lead Follow-up
            # Only used for tracking — no enquiry needed
            return None

        elif event_type == "OPD_CONSULTATION_COMPLETED":
            return await self._rule_opd_consultation_completed(db, hospital_id, payload, settings)

        elif event_type == "APPOINTMENT_CREATED":
            return await self._rule_appointment_created(db, hospital_id, payload, settings)

        elif event_type == "APPOINTMENT_CANCELLED":
            return await self._rule_appointment_cancelled(db, hospital_id, payload)

        elif event_type == "APPOINTMENT_COMPLETED":
            # Appointment completed — no new enquiry needed
            return None

        elif event_type == "APPOINTMENT_MISSED":
            return await self._rule_appointment_missed(db, hospital_id, payload, settings)

        elif event_type == "TREATMENT_VISIT_COMPLETED":
            return await self._rule_treatment_visit_completed(db, hospital_id, payload, settings)

        elif event_type == "TREATMENT_COMPLETED":
            return await self._rule_treatment_completed(db, hospital_id, payload, settings)

        elif event_type == "CASE_COMPLETED":
            return await self._rule_case_completed(db, hospital_id, payload, settings)

        elif event_type == "PATIENT_INACTIVE":
            return await self._rule_patient_inactive(db, hospital_id, payload)

        elif event_type == "LEAD_CONVERTED":
            return await self._rule_lead_converted(db, hospital_id, payload)

        elif event_type == "CASE_CREATED":
            return await self._rule_case_created(db, hospital_id, payload, settings)

        elif event_type == "RECALL_COMPLETED":
            return await self._rule_recall_completed(db, hospital_id, payload, settings)

        return None

    # ============================================================
    # Individual Business Rules
    # ============================================================

    async def _rule_lead_created(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional["Decision"]:
        """Rule: Lead Follow-Up — ONLY when lead is created with status=NEW."""
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry

        lead_id = payload.get("lead_id") or payload.get("entity_id")
        patient_id = payload.get("patient_id")
        lead_status = payload.get("status", "NEW")

        # Business Rule: Only create for NEW leads
        if lead_status != "NEW":
            logger.debug("LEAD_SKIP: status=%s (not NEW)", lead_status)
            return None

        # Business Rule: Lead must exist
        if not lead_id:
            return None

        # Business Rule: No existing enquiry for this lead
        existing = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.lead_id == lead_id,
                    GeneratedEnquiry.enquiry_type == "LEAD_FOLLOW_UP",
                    GeneratedEnquiry.status == "PENDING",
                )
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.debug("LEAD_DUPLICATE: lead=%s already has LEAD_FOLLOW_UP", lead_id)
            return None

        # Load lead follow-up config
        follow_up_config = settings.lead_follow_up
        delay_days = follow_up_config.start_delay_days if follow_up_config else 1
        enabled = follow_up_config.enabled if follow_up_config is not None else True

        if not enabled:
            return None

        visit_date = payload.get("visit_date")
        if visit_date:
            from datetime import datetime as _dt
            if isinstance(visit_date, str):
                visit_date = _dt.fromisoformat(visit_date).date() if "T" in visit_date else date.fromisoformat(visit_date)
            today = visit_date
        else:
            today = date.today()

        due_date = today + timedelta(days=delay_days)

        return Decision(
            action="CREATE",
            enquiry_type="LEAD_FOLLOW_UP",
            due_date=due_date,
            priority="MEDIUM",
            patient_id=patient_id,
            lead_id=lead_id,
            doctor_id=payload.get("doctor_id"),
            assigned_staff_id=payload.get("assigned_staff_id"),
            trigger_event="LEAD_CREATED",
            description=f"Lead follow-up for new lead",
        )

    async def _rule_opd_consultation_completed(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional["Decision"]:
        """Rule: OPD Follow-Up — create when consultation completed and treatment has NOT started."""
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry

        patient_id = payload.get("patient_id")

        if not patient_id:
            return None

        # Load OPD follow-up config (default: enabled with 3-day delay)
        follow_up_config = settings.opd_follow_up
        delay_days = follow_up_config.start_delay_days if follow_up_config else 3
        enabled = follow_up_config.enabled if follow_up_config is not None else True

        if not enabled:
            logger.debug("OPD_SKIP: disabled for hospital=%s", hospital_id)
            return None

        # Business Rule: Check if treatment has already started for this patient
        # If treatment_started event exists, no OPD follow-up needed
        treatment_started = payload.get("treatment_started", False)
        if treatment_started:
            logger.debug("OPD_SKIP: treatment_started for patient=%s", patient_id)
            return None

        # Business Rule: Check actual DB for treatment plans (payload may be stale)
        # TreatmentPlan links to Patient via Case (TreatmentPlan.case_id → Case.id → Case.patient_id)
        from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
        from app.models.case import Case
        existing_tp = await db.execute(
            select(TreatmentPlan).join(Case, TreatmentPlan.case_id == Case.id).where(
                Case.patient_id == patient_id,
                TreatmentPlan.status.in_([
                    TreatmentPlanStatus.IN_PROGRESS.value,
                    TreatmentPlanStatus.ASSIGNED.value,
                    TreatmentPlanStatus.GENERATED.value,
                    TreatmentPlanStatus.COMPLETED.value,
                ]),
            ).limit(1)
        )
        if existing_tp.scalar_one_or_none():
            logger.debug("OPD_SKIP: patient=%s has treatment plans in DB", patient_id)
            return None

        # Also check for existing appointments (past or future — patient in treatment flow)
        from app.models.appointment import Appointment
        has_appt = await db.execute(
            select(Appointment).where(
                Appointment.patient_id == patient_id,
                Appointment.is_active == True,
            ).limit(1)
        )
        if has_appt.scalar_one_or_none():
            logger.debug("OPD_SKIP: patient=%s has appointments", patient_id)
            return None



        # Business Rule: No duplicate OPD follow-up for this patient
        existing = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.enquiry_type == "OPD_FOLLOW_UP",
                    GeneratedEnquiry.status == "PENDING",
                )
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.debug("OPD_DUPLICATE: patient=%s already has OPD follow-up", patient_id)
            return None

        visit_date = payload.get("visit_date")
        if visit_date:
            from datetime import datetime as _dt
            if isinstance(visit_date, str):
                visit_date = _dt.fromisoformat(visit_date).date() if "T" in visit_date else date.fromisoformat(visit_date)
            due_date = visit_date + timedelta(days=delay_days)
        else:
            due_date = date.today() + timedelta(days=delay_days)

        return Decision(
            action="CREATE",
            enquiry_type="OPD_FOLLOW_UP",
            due_date=due_date,
            priority="MEDIUM",
            patient_id=patient_id,
            case_id=payload.get("case_id"),
            treatment_type_id=payload.get("treatment_type_id"),
            doctor_id=payload.get("doctor_id"),
            assigned_staff_id=payload.get("assigned_staff_id"),
            trigger_event="OPD_CONSULTATION_COMPLETED",
            description="OPD follow-up: ask patient if they wish to proceed with treatment",
        )

    async def _rule_appointment_created(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional[list["Decision"] | "Decision"]:
        """Rule: Appointment Reminder — ONLY for SCHEDULED future appointments, no duplicate."""
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry

        appointment_id = payload.get("appointment_id") or payload.get("entity_id")
        patient_id = payload.get("patient_id")
        appointment_date = payload.get("appointment_date")
        status = payload.get("status", "SCHEDULED")

        if not appointment_id or not patient_id:
            return None

        # Business Rule: Only for SCHEDULED appointments
        if status != "SCHEDULED":
            return None

        # Business Rule: Appointment must be in the future
        if appointment_date:
            from datetime import datetime as dt
            if isinstance(appointment_date, str):
                try:
                    appt_dt = dt.fromisoformat(appointment_date.replace("Z", "+00:00"))
                    appt_date = appt_dt.date()
                except (ValueError, AttributeError):
                    appt_date = date.today()
            elif isinstance(appointment_date, date):
                appt_date = appointment_date
            elif isinstance(appointment_date, dt):
                appt_date = appointment_date.date()
            else:
                appt_date = date.today()

            if appt_date < date.today():
                logger.debug("APPT_SKIP: date=%s is in the past", appt_date)
                return None
        else:
            appt_date = date.today()

        # Business Rule: No duplicate reminder for this appointment
        existing = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.appointment_id == appointment_id,
                    GeneratedEnquiry.enquiry_type == "APPOINTMENT_REMINDER",
                    GeneratedEnquiry.status == "PENDING",
                )
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.debug("APPT_DUPLICATE: appointment=%s already has reminder", appointment_id)
            return None

        # Calculate due date: appointment_date - reminder_days
        reminder_days = settings.default_reminder_offset_days if settings else 1
        due_date = appt_date - timedelta(days=reminder_days)
        if due_date < date.today():
            due_date = date.today()

        decisions = [
            Decision(action="CANCEL", cancel_enquiry_types=["OPD_FOLLOW_UP"], cancel_reason="APPOINTMENT_CREATED", patient_id=patient_id, trigger_event="APPOINTMENT_CREATED"),
            Decision(action="CREATE", enquiry_type="APPOINTMENT_REMINDER", due_date=due_date, priority="MEDIUM", patient_id=patient_id, appointment_id=appointment_id, treatment_plan_id=payload.get("treatment_plan_id"), doctor_id=payload.get("doctor_id"), assigned_staff_id=payload.get("assigned_staff_id"), treatment_type_id=payload.get("treatment_type_id"), trigger_event="APPOINTMENT_CREATED", description="Appointment reminder"),
        ]
        return decisions

    async def _rule_appointment_cancelled(
        self, db: AsyncSession, hospital_id: str, payload: dict
    ) -> Optional["Decision"]:
        """Rule: Cancel existing appointment reminders when appointment is cancelled."""
        from app.crm.services.event_dispatcher import Decision

        appointment_id = payload.get("appointment_id") or payload.get("entity_id")
        if not appointment_id:
            return None

        return Decision(
            action="CANCEL",
            patient_id=payload.get("patient_id"),
            cancel_enquiry_types=["APPOINTMENT_REMINDER"],
            cancel_reason="APPOINTMENT_CANCELLED",
            appointment_id=appointment_id,
            trigger_event="APPOINTMENT_CANCELLED",
        )

    async def _rule_appointment_missed(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional["Decision"]:
        """Rule: Missed Appointment Follow-Up — create one follow-up for missed appointments."""
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry
        from app.models.appointment import Appointment

        appointment_id = payload.get("appointment_id") or payload.get("entity_id")
        patient_id = payload.get("patient_id")

        if not appointment_id or not patient_id:
            return None

        # Business Rule: Appointment must be in the past (not a future appointment)
        appt = await db.get(Appointment, appointment_id)
        if appt and appt.appointment_date:
            appt_date = appt.appointment_date
            if isinstance(appt_date, datetime):
                appt_date = appt_date.date()
            if appt_date >= date.today():
                logger.debug("MISSED_SKIP: appointment %s date %s is not in the past", appointment_id, appt_date)
                return None

        # Business Rule: Appointment must not already be COMPLETED (patient showed up)
        if appt and getattr(appt, 'status', None) and str(appt.status) in ("COMPLETED", "CANCELLED"):
            logger.debug("MISSED_SKIP: appointment %s already %s", appointment_id, appt.status)
            return None

        # Business Rule: No duplicate missed appointment follow-up
        existing = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.appointment_id == appointment_id,
                    GeneratedEnquiry.enquiry_type == "MISSED_APPOINTMENT",
                    GeneratedEnquiry.status == "PENDING",
                )
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            return None

        visit_date = payload.get("visit_date")
        if visit_date:
            from datetime import datetime as _dt
            if isinstance(visit_date, str):
                visit_date = _dt.fromisoformat(visit_date).date() if "T" in visit_date else date.fromisoformat(visit_date)
            due_date = visit_date + timedelta(days=1)
        else:
            due_date = date.today() + timedelta(days=1)

        return Decision(
            action="CREATE",
            enquiry_type="MISSED_APPOINTMENT",
            due_date=due_date,
            priority="HIGH",
            patient_id=patient_id,
            appointment_id=appointment_id,
            doctor_id=payload.get("doctor_id"),
            assigned_staff_id=payload.get("assigned_staff_id"),
            trigger_event="APPOINTMENT_MISSED",
            description="Follow-up for missed appointment",
        )

    async def _rule_treatment_visit_completed(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional[list["Decision"] | "Decision"]:
        """Rule: Multi-visit treatment — only Appointment Reminder if future appointment exists.

        Per spec:
        - Visit 1: Future Appointment → Appointment Reminder ONLY, NO Wellness
        - Visit 2: Future Appointment → Appointment Reminder ONLY, NO Wellness
        - Visit N (final): No Future Appointment → Treatment Wellness ONLY
        """
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry

        patient_id = payload.get("patient_id")
        treatment_plan_id = payload.get("treatment_plan_id")
        case_id = payload.get("case_id")

        if not patient_id:
            return None

        # Check if patient has a future SCHEDULED appointment
        has_future = await self._has_future_appointment(db, patient_id)

        if has_future:
            # Future appointment exists → create Appointment Reminder ONLY
            next_appt = await self._get_next_appointment(db, patient_id)
            if not next_appt:
                return None

            appointment_id = next_appt.id
            appt_date = next_appt.appointment_date

            reminder_days = settings.default_reminder_offset_days if settings else 1
            due_date = appt_date - timedelta(days=reminder_days) if appt_date else date.today()
            if due_date < date.today():
                due_date = date.today()

            return [
                Decision(action="CANCEL", cancel_enquiry_types=["OPD_FOLLOW_UP"], cancel_reason="TREATMENT_VISIT_COMPLETED", patient_id=patient_id, trigger_event="TREATMENT_VISIT_COMPLETED"),
                Decision(action="CREATE", enquiry_type="APPOINTMENT_REMINDER", due_date=due_date, priority="MEDIUM", patient_id=patient_id, appointment_id=appointment_id, case_id=case_id, treatment_plan_id=treatment_plan_id, treatment_type_id=payload.get("treatment_type_id"), doctor_id=payload.get("doctor_id"), assigned_staff_id=payload.get("assigned_staff_id"), trigger_event="TREATMENT_VISIT_COMPLETED", description="Appointment reminder after treatment visit"),
            ]

        return None

    async def _rule_treatment_completed(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional[list["Decision"] | "Decision"]:
        """Rule: Treatment Wellness — ONLY when treatment completed AND no future appointment."""
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry

        patient_id = payload.get("patient_id")
        treatment_plan_id = payload.get("treatment_plan_id")
        case_id = payload.get("case_id")
        treatment_type_id = payload.get("treatment_type_id")

        if not patient_id:
            return None

        # Check if patient has a future SCHEDULED appointment
        has_future = await self._has_future_appointment(db, patient_id)

        if has_future:
            # Future appointment exists → create Appointment Reminder ONLY
            next_appt = await self._get_next_appointment(db, patient_id)
            if not next_appt:
                return None

            appointment_id = next_appt.id
            appt_date = next_appt.appointment_date
            reminder_days = settings.default_reminder_offset_days if settings else 1
            due_date = appt_date - timedelta(days=reminder_days) if appt_date else date.today()
            if due_date < date.today():
                due_date = date.today()

            return [
                Decision(action="CANCEL", cancel_enquiry_types=["OPD_FOLLOW_UP"], cancel_reason="TREATMENT_COMPLETED", patient_id=patient_id, trigger_event="TREATMENT_COMPLETED"),
                Decision(action="CREATE", enquiry_type="APPOINTMENT_REMINDER", due_date=due_date, priority="MEDIUM", patient_id=patient_id, appointment_id=appointment_id, case_id=case_id, treatment_plan_id=treatment_plan_id, treatment_type_id=treatment_type_id, doctor_id=payload.get("doctor_id"), assigned_staff_id=payload.get("assigned_staff_id"), trigger_event="TREATMENT_COMPLETED", description="Appointment reminder after treatment completion"),
            ]

        # No future appointment → create Treatment Wellness
        # Load treatment-specific config
        follow_up_config = None
        if treatment_type_id:
            follow_up_config = settings.treatment_follow_ups.get(f"TREATMENT:{treatment_type_id}")
        if not follow_up_config:
            follow_up_config = settings.opd_follow_up

        enabled = follow_up_config.enabled if follow_up_config is not None else True
        if not enabled:
            logger.debug("TREATMENT_WELLNESS_DISABLED: hospital=%s treatment_type=%s", hospital_id, treatment_type_id)
            return None

        # Business Rule: No duplicate wellness for this treatment plan
        existing = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.treatment_plan_id == treatment_plan_id,
                    GeneratedEnquiry.enquiry_type == "TREATMENT_WELLNESS",
                    GeneratedEnquiry.status == "PENDING",
                )
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            logger.debug("WELLNESS_DUPLICATE: plan=%s", treatment_plan_id)
            return None

        # Auto-close completed enquiries
        await self._auto_close_enquiries(db, hospital_id, patient_id, ["OPD_FOLLOW_UP", "TREATMENT_WELLNESS", "APPOINTMENT_REMINDER"])

        delay_days = follow_up_config.start_delay_days if follow_up_config else 3

        visit_date = payload.get("visit_date")
        if visit_date:
            from datetime import datetime as _dt
            if isinstance(visit_date, str):
                visit_date = _dt.fromisoformat(visit_date).date() if "T" in visit_date else date.fromisoformat(visit_date)
            due_date = visit_date + timedelta(days=delay_days)
        else:
            due_date = date.today() + timedelta(days=delay_days)

        # Get treatment name
        treatment_name = payload.get("treatment_name", "")
        if not treatment_name and treatment_type_id:
            treatment_name = await self._load_treatment_type_name(db, treatment_type_id)

        return Decision(
            action="CREATE",
            enquiry_type="TREATMENT_WELLNESS",
            due_date=due_date,
            priority="MEDIUM",
            patient_id=patient_id,
            case_id=case_id,
            treatment_plan_id=treatment_plan_id,
            treatment_type_id=treatment_type_id,
            doctor_id=payload.get("doctor_id"),
            assigned_staff_id=payload.get("assigned_staff_id"),
            trigger_event="TREATMENT_COMPLETED",
            description=f"Wellness follow-up for {treatment_name or 'treatment'}",
            treatment_name=treatment_name,
        )

    async def _rule_case_completed(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> list["Decision"]:
        """Rule: Case Wellness + Recall — create both after case completion."""
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry
        from app.models.case import Case

        patient_id = payload.get("patient_id")
        case_id = payload.get("case_id") or payload.get("entity_id")
        treatment_type_id = payload.get("treatment_type_id")

        if not patient_id or not case_id:
            return []

        # Business Rule: Verify case is actually COMPLETED in DB (don't trust event blindly)
        case = await db.get(Case, case_id)
        if case and case.status != "COMPLETED":
            logger.debug("CASE_WELLNESS_SKIP: case=%s status=%s (not COMPLETED)", case_id, case.status)
            return []

        decisions = []

        visit_date = payload.get("visit_date")
        if visit_date:
            from datetime import datetime as _dt
            if isinstance(visit_date, str):
                visit_date = _dt.fromisoformat(visit_date).date() if "T" in visit_date else date.fromisoformat(visit_date)
            base_date = visit_date
        else:
            base_date = date.today()

        # Duplicate check FIRST — before auto-close destroys existing PENDING records
        # Case Wellness
        existing_wellness = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.case_id == case_id,
                    GeneratedEnquiry.enquiry_type == "CASE_WELLNESS",
                    GeneratedEnquiry.status == "PENDING",
                )
            ).limit(1)
        )
        if not existing_wellness.scalar_one_or_none():
            follow_up_config = settings.case_recovery
            wellness_enabled = follow_up_config.enabled if follow_up_config is not None else True
            if wellness_enabled:
                delay_days = follow_up_config.start_delay_days if follow_up_config else 15
                due_date = base_date + timedelta(days=delay_days)
                decisions.append(Decision(
                    action="CREATE",
                    enquiry_type="CASE_WELLNESS",
                    due_date=due_date,
                    priority="MEDIUM",
                    patient_id=patient_id,
                    case_id=case_id,
                    treatment_type_id=treatment_type_id,
                    doctor_id=payload.get("doctor_id"),
                    assigned_staff_id=payload.get("assigned_staff_id"),
                    trigger_event="CASE_COMPLETED",
                    description="Case wellness follow-up",
                ))

        # Recall
        existing_recall = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.case_id == case_id,
                    GeneratedEnquiry.enquiry_type == "RECALL",
                    GeneratedEnquiry.status == "PENDING",
                )
            ).limit(1)
        )
        if not existing_recall.scalar_one_or_none():
            # Cancel any existing pending recalls for this patient from OTHER cases
            await self._cancel_patient_pending_recalls(db, hospital_id, patient_id, exclude_case_id=case_id, reason="CASE_COMPLETED_NEW_CHAIN")

            recall_enabled = settings.case_recall.enabled if settings.case_recall is not None else True
            if recall_enabled:
                recall_delay = 180
                if settings.case_recall:
                    recall_delay = settings.case_recall.start_delay_days if settings.case_recall.start_delay_days else 180
                recall_due = base_date + timedelta(days=recall_delay)
                decisions.append(Decision(
                    action="CREATE",
                    enquiry_type="RECALL",
                    due_date=recall_due,
                    priority="LOW",
                    patient_id=patient_id,
                    case_id=case_id,
                    treatment_type_id=treatment_type_id,
                    doctor_id=payload.get("doctor_id"),
                    assigned_staff_id=payload.get("assigned_staff_id"),
                    trigger_event="CASE_COMPLETED",
                    description="Patient is due for routine dental recall",
                    is_recurring=True,
                    occurrence_number=1,
                    recurrence_interval_days=recall_delay,
                    chain_id=None,
                ))

        # Auto-close stale enquiries from OTHER cases (after duplicate check)
        if decisions:
            await self._auto_close_stale_case_enquiries(db, hospital_id, patient_id, case_id, ["CASE_WELLNESS", "RECALL"])

        return decisions

    async def _rule_lead_converted(
        self, db: AsyncSession, hospital_id: str, payload: dict
    ) -> Optional["Decision"]:
        """Rule: Cancel lead follow-ups when lead is converted to patient."""
        from app.crm.services.event_dispatcher import Decision

        lead_id = payload.get("lead_id") or payload.get("entity_id")
        if not lead_id:
            return None

        return Decision(
            action="CANCEL",
            cancel_enquiry_types=["LEAD_FOLLOW_UP"],
            cancel_reason="LEAD_CONVERTED",
            lead_id=lead_id,
            trigger_event="LEAD_CONVERTED",
        )

    async def _rule_patient_inactive(
        self, db: AsyncSession, hospital_id: str, payload: dict
    ) -> Optional["Decision"]:
        """Rule: Cancel all pending enquiries when patient becomes inactive."""
        from app.crm.services.event_dispatcher import Decision

        patient_id = payload.get("patient_id") or payload.get("entity_id")
        if not patient_id:
            return None

        return Decision(
            action="CANCEL",
            cancel_enquiry_types=["LEAD_FOLLOW_UP", "OPD_FOLLOW_UP", "APPOINTMENT_REMINDER", "TREATMENT_WELLNESS", "CASE_WELLNESS", "RECALL", "MISSED_APPOINTMENT"],
            cancel_reason="PATIENT_INACTIVE",
            patient_id=patient_id,
            trigger_event="PATIENT_INACTIVE",
        )

    # ============================================================
    # Recurring Recall Handlers
    # ============================================================

    async def _rule_case_created(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional["Decision"]:
        """Rule: Cancel all pending recalls for patient when a new case is created."""
        patient_id = payload.get("patient_id") or payload.get("entity_id")
        case_id = payload.get("case_id") or payload.get("entity_id")
        if not patient_id:
            return None

        await self._cancel_patient_pending_recalls(
            db, hospital_id, patient_id,
            exclude_case_id=case_id,
            reason="CASE_CREATED",
        )
        return None

    async def _rule_recall_completed(
        self, db: AsyncSession, hospital_id: str, payload: dict, settings
    ) -> Optional["Decision"]:
        """Rule: When a recurring recall is completed, schedule the next one."""
        from app.crm.services.event_dispatcher import Decision
        from app.models.generated_enquiry import GeneratedEnquiry

        enquiry_id = payload.get("entity_id") or payload.get("enquiry_id")
        if not enquiry_id:
            return None

        completed_recall = await db.get(GeneratedEnquiry, enquiry_id)
        if not completed_recall or completed_recall.enquiry_type != "RECALL":
            return None
        if not completed_recall.is_recurring:
            return None

        patient_id = completed_recall.patient_id

        # Check: does patient already have a PENDING recall? (exclude the one we just completed)
        existing = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.enquiry_type == "RECALL",
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.id != enquiry_id,
                )
            ).limit(1)
        )
        if existing.scalar_one_or_none():
            return None

        # Read CURRENT interval from CRM Settings — always fresh from DB, not cached
        interval_days = 180
        try:
            from app.models.crm_follow_up_config import CrmFollowUpConfig
            result = await db.execute(
                select(CrmFollowUpConfig.start_delay_days).where(
                    and_(
                        CrmFollowUpConfig.hospital_id == hospital_id,
                        CrmFollowUpConfig.context_type == "CASE_RECALL",
                    )
                ).limit(1)
            )
            fresh_interval = result.scalar_one_or_none()
            if fresh_interval:
                interval_days = fresh_interval
        except Exception:
            pass

        completion_date = date.today()
        new_due = completion_date + timedelta(days=interval_days)
        new_occurrence = completed_recall.occurrence_number + 1

        return Decision(
            action="CREATE",
            enquiry_type="RECALL",
            due_date=new_due,
            priority="LOW",
            patient_id=patient_id,
            case_id=completed_recall.case_id,
            doctor_id=completed_recall.doctor_id,
            trigger_event="RECALL_COMPLETED",
            description=f"Recurring recall #{new_occurrence}",
            is_recurring=True,
            occurrence_number=new_occurrence,
            recurrence_interval_days=interval_days,
            chain_id=completed_recall.chain_id or completed_recall.id,
        )

    async def _cancel_patient_pending_recalls(
        self, db: AsyncSession, hospital_id: str, patient_id: str,
        exclude_case_id: Optional[str] = None, reason: str = "RECALL_CANCELLED",
    ):
        """Cancel all pending RECALL enquiries for a patient."""
        from app.models.generated_enquiry import GeneratedEnquiry
        from datetime import datetime, timezone

        conditions = [
            GeneratedEnquiry.hospital_id == hospital_id,
            GeneratedEnquiry.patient_id == patient_id,
            GeneratedEnquiry.enquiry_type == "RECALL",
            GeneratedEnquiry.status == "PENDING",
        ]
        if exclude_case_id:
            conditions.append(GeneratedEnquiry.case_id != exclude_case_id)

        result = await db.execute(
            select(GeneratedEnquiry).where(and_(*conditions))
        )
        now = datetime.now(timezone.utc)
        cancelled = 0
        for ge in result.scalars().all():
            ge.status = "CANCELLED"
            ge.cancelled_by_event = reason
            ge.cancelled_at = now
            cancelled += 1
        if cancelled:
            await db.flush()
            logger.info("RECALLS_CANCELLED: patient=%s count=%d reason=%s", patient_id, cancelled, reason)

    # ============================================================
    # Helper Methods
    # ============================================================

    async def _has_future_appointment(self, db: AsyncSession, patient_id: str) -> bool:
        """Check if patient has a future SCHEDULED appointment."""
        from app.models.appointment import Appointment, AppointmentStatus
        today = date.today()
        result = await db.execute(
            select(Appointment).where(
                and_(
                    Appointment.patient_id == patient_id,
                    Appointment.status.in_(["SCHEDULED", "CONFIRMED"]),
                    Appointment.is_active == True,
                    Appointment.appointment_date >= today,
                )
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _get_next_appointment(self, db: AsyncSession, patient_id: str):
        """Get the next upcoming appointment for a patient."""
        from app.models.appointment import Appointment, AppointmentStatus
        today = date.today()
        result = await db.execute(
            select(Appointment).where(
                and_(
                    Appointment.patient_id == patient_id,
                    Appointment.status.in_(["SCHEDULED", "CONFIRMED"]),
                    Appointment.is_active == True,
                    Appointment.appointment_date >= today,
                )
            ).order_by(Appointment.appointment_date.asc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def _auto_close_enquiries(
        self, db: AsyncSession, hospital_id: str, patient_id: str, enquiry_types: list
    ):
        """Close existing PENDING enquiries of specified types for a patient."""
        from app.models.generated_enquiry import GeneratedEnquiry
        from datetime import datetime, timezone

        result = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.enquiry_type.in_(enquiry_types),
                    GeneratedEnquiry.status == "PENDING",
                )
            )
        )
        now = datetime.now(timezone.utc)
        count = 0
        for ge in result.scalars().all():
            ge.status = "COMPLETED"
            ge.cancelled_at = now
            count += 1
        if count:
            await db.flush()
            logger.info("AUTO_CLOSED: patient=%s types=%s count=%d", patient_id, enquiry_types, count)

    async def _auto_close_stale_case_enquiries(
        self, db: AsyncSession, hospital_id: str, patient_id: str, current_case_id: str, enquiry_types: list
    ):
        """Close existing PENDING enquiries of specified types for a patient, EXCLUDING the current case."""
        from app.models.generated_enquiry import GeneratedEnquiry
        from datetime import datetime, timezone

        result = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.enquiry_type.in_(enquiry_types),
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.case_id != current_case_id,
                )
            )
        )
        now = datetime.now(timezone.utc)
        count = 0
        for ge in result.scalars().all():
            ge.status = "COMPLETED"
            ge.cancelled_at = now
            count += 1
        if count:
            await db.flush()
            logger.info("AUTO_CLOSED_STALE: patient=%s case=%s types=%s count=%d", patient_id, current_case_id, enquiry_types, count)

    async def _load_crm_settings(self, db: AsyncSession, hospital_id: str):
        """Load CRM settings from CRMSettingsService (cached)."""
        try:
            from app.crm.services.crm_settings import get_settings_service
            settings_svc = get_settings_service()
            return await settings_svc.get_settings(db, hospital_id)
        except Exception as exc:
            logger.error("CRM_SETTINGS_LOAD_FAILED: hospital=%s error=%s", hospital_id, str(exc))
            return None

    async def _load_treatment_type_name(self, db: AsyncSession, treatment_type_id: str) -> Optional[str]:
        """Load treatment type name."""
        try:
            from app.models.treatment_type import TreatmentType
            result = await db.execute(
                select(TreatmentType.name).where(TreatmentType.id == treatment_type_id)
            )
            return result.scalar_one_or_none()
        except Exception:
            return None

    async def calculate_due_date(
        self,
        db: AsyncSession,
        hospital_id: str,
        delay_value: int,
        delay_unit: str,
    ) -> date:
        """Calculate due date respecting hospital working days."""
        from app.crm.services.crm_settings import get_settings_service
        settings_svc = get_settings_service()
        settings = await settings_svc.get_settings(db, hospital_id)

        today = date.today()
        if delay_unit == "IMMEDIATELY" or delay_value == 0:
            raw = today
        elif delay_unit == "DAYS":
            raw = today + timedelta(days=delay_value)
        elif delay_unit == "WEEKS":
            raw = today + timedelta(weeks=delay_value)
        elif delay_unit == "MONTHS":
            raw = today + timedelta(days=delay_value * 30)
        else:
            raw = today

        if settings.weekend_policy == "SKIP":
            raw = await settings_svc.next_working_day(db, hospital_id, raw)

        return raw


# ============================================================
# Singleton
# ============================================================

_rule_engine_instance: Optional[RuleEngine] = None


def get_rule_engine() -> RuleEngine:
    """Get or create the rule engine singleton."""
    global _rule_engine_instance
    if _rule_engine_instance is None:
        _rule_engine_instance = RuleEngine()
    return _rule_engine_instance


# Backward compat alias
RuleEngineService = RuleEngine
