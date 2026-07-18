"""
CRM Event Engine — central orchestration for all CRM automation.

NO module should directly create Follow-ups, Recalls, Tasks, or Communications.
Instead, every business action publishes an event.
CRMEventEngine is the single entry point for CRM automation.

Processing flow:
1. Receive event
2. Validate
3. Load automation rules (AutomationRule + TreatmentFollowUpRule)
4. Determine matching rules
5. Execute matching actions (create follow-ups, recalls, notifications)
6. Log execution
"""
import logging
import json
from datetime import date, timedelta, time
from typing import Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.automation_rule import AutomationRule
from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus
from app.models.patient import Patient

logger = logging.getLogger(__name__)


class CRMEventEngine:
    """Central orchestration engine for CRM automation.

    Receives events from the EventDispatcher and executes CRM actions.
    No business module should call this directly — events go through the publisher.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_event(
        self,
        event_type: str,
        entity_type: str,
        entity_id: str,
        hospital_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        doctor_id: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> None:
        """Process a CRM event and execute matching automation rules."""
        logger.info(
            "CRM_ENGINE: processing event=%s entity=%s/%s hospital=%s",
            event_type, entity_type, entity_id, hospital_id,
        )

        # Map event types to procedure for rule matching
        procedure = None
        treatment_name = None
        if payload:
            procedure = payload.get("procedure") or payload.get("treatment_name")
            treatment_name = payload.get("treatment_name")

        # Find matching automation rules
        rules = await self._get_matching_rules(event_type, procedure, hospital_id)

        if not rules:
            logger.debug("CRM_ENGINE: no rules matched for event=%s procedure=%s", event_type, procedure)
            return

        # Resolve patient if not provided
        if not patient_id and entity_type == "PATIENT":
            patient_id = entity_id
        if not patient_id and payload:
            patient_id = payload.get("patient_id")

        patient = None
        if patient_id:
            patient = await self.db.get(Patient, patient_id)

        created = 0
        for rule in rules:
            # Check deduplication
            if await self._has_existing_follow_up(patient_id, procedure):
                logger.debug("CRM_ENGINE: skipping rule %s — duplicate follow-up exists", rule.id)
                continue

            # Check stop conditions
            if rule.stop_conditions:
                try:
                    stops = json.loads(rule.stop_conditions) if isinstance(rule.stop_conditions, str) else rule.stop_conditions
                    if event_type in stops:
                        continue
                except (json.JSONDecodeError, TypeError):
                    pass

            # Create follow-up
            follow_up_date = date.today() + timedelta(days=rule.delay_days or 0)
            fu = FollowUp(
                patient_id=patient_id,
                hospital_id=hospital_id or (patient.hospital_id if patient else None),
                doctor_id=doctor_id,
                case_id=payload.get("case_id") if payload else None,
                treatment_id=entity_id if entity_type == "TREATMENT" else None,
                treatment_name=treatment_name or procedure,
                follow_up_date=follow_up_date,
                follow_up_time=time(10, 0),
                follow_up_type=FollowUpType.CUSTOM_FOLLOW_UP.value,
                status=FollowUpStatus.PENDING.value,
                channel=rule.channel,
                priority=rule.priority,
                rule_id=rule.id,
                template_id=rule.template_id,
                max_retries=rule.max_attempts or 1,
                notes=rule.message_template or f"Auto: {rule.name} (triggered by {event_type})",
            )
            self.db.add(fu)
            created += 1

        if created:
            await self.db.flush()
            logger.info(
                "CRM_ENGINE: event=%s patient=%s — created %d follow-ups",
                event_type, patient_id, created,
            )

    async def _get_matching_rules(
        self,
        event_type: str,
        procedure: Optional[str],
        hospital_id: Optional[str],
    ) -> list:
        """Find active automation rules matching the event."""
        from sqlalchemy import or_
        query = select(AutomationRule).where(
            AutomationRule.is_active == True,
            AutomationRule.trigger_event == event_type,
        )
        query = query.where(or_(
            AutomationRule.procedure == None,
            AutomationRule.procedure == procedure,
        ))
        if hospital_id:
            query = query.where(or_(
                AutomationRule.hospital_id == None,
                AutomationRule.hospital_id == hospital_id,
            ))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _has_existing_follow_up(
        self,
        patient_id: Optional[str],
        treatment_name: Optional[str],
    ) -> bool:
        """Check for duplicate follow-ups (idempotency)."""
        if not patient_id:
            return False
        q = select(FollowUp).where(
            FollowUp.patient_id == patient_id,
            FollowUp.status.in_(["PENDING", "SCHEDULED", "CONTACTED"]),
        )
        if treatment_name:
            q = q.where(FollowUp.treatment_name.ilike(f"%{treatment_name}%"))
        q = q.limit(1)
        result = await self.db.execute(q)
        return result.scalar_one_or_none() is not None
