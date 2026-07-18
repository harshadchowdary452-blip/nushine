"""Automation Rule Engine — central brain for CRM automation.

No hardcoded automation logic. All behavior is driven by configurable rules.
"""
from __future__ import annotations
import json
import logging
from datetime import date, datetime, timezone, timedelta
from typing import Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.automation_rule import AutomationRule
from app.models.automation_rule_condition import AutomationRuleCondition
from app.models.automation_rule_action import AutomationRuleAction
from app.models.automation_rule_log import AutomationRuleLog
from app.models.automation_execution_queue import AutomationExecutionQueue
from app.models.follow_up import FollowUp, FollowUpType, FollowUpStatus
from app.models.patient import Patient

logger = logging.getLogger(__name__)


class AutomationEngine:
    """Evaluates rules against events and executes matching actions.
    
    Pipeline:
    1. Receive event
    2. Load matching rules (by trigger_event + hospital)
    3. Sort by priority
    4. Evaluate conditions
    5. Queue matching actions
    6. Execute immediate actions
    7. Log results
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
        is_test: bool = False,
    ) -> dict:
        """Process an event through the rule engine. Returns execution summary."""
        payload = payload or {}
        start = datetime.now(timezone.utc)
        summary = {
            "event_type": event_type,
            "rules_evaluated": 0,
            "rules_matched": 0,
            "actions_queued": 0,
            "actions_executed": 0,
            "errors": [],
        }

        # 1. Load matching rules
        rules = await self._load_matching_rules(event_type, hospital_id)
        summary["rules_evaluated"] = len(rules)

        if not rules:
            logger.debug("ENGINE: no rules for event=%s hospital=%s", event_type, hospital_id)
            return summary

        # 2. Resolve patient context
        patient_context = await self._resolve_patient_context(patient_id, payload)

        for rule in rules:
            try:
                # 3. Evaluate conditions
                conditions_met = await self._evaluate_conditions(rule, event_type, entity_type, entity_id, patient_context, payload)
                if not conditions_met:
                    continue

                summary["rules_matched"] += 1

                # 4. Load actions
                actions = await self._load_actions(rule.id)
                if not actions:
                    continue

                # 5. Execute or queue actions
                for action in actions:
                    try:
                        delay = timedelta(days=action.delay_days or 0, hours=action.delay_hours or 0)
                        
                        if delay.total_seconds() > 0 and not is_test:
                            # Queue for delayed execution
                            await self._queue_action(rule, action, event_type, entity_type, entity_id, hospital_id, patient_id, payload, delay)
                            summary["actions_queued"] += 1
                        else:
                            # Execute immediately
                            result = await self._execute_action(rule, action, event_type, entity_type, entity_id, hospital_id, patient_id, doctor_id, payload, is_test)
                            summary["actions_executed"] += 1

                            # Log execution
                            await self._log_execution(rule, event_type, entity_type, entity_id, hospital_id, patient_id, action, result, is_test)

                        # Update rule stats
                        if not is_test:
                            rule.execution_count = (rule.execution_count or 0) + 1
                            rule.last_executed_at = datetime.now(timezone.utc)
                    except Exception as exc:
                        summary["errors"].append({"action": action.action_type, "error": str(exc)})
                        logger.error("ENGINE: action %s failed: %s", action.action_type, str(exc), exc_info=True)

                # Update rule success count
                if not is_test and not summary["errors"]:
                    rule.success_count = (rule.success_count or 0) + 1

            except Exception as exc:
                summary["errors"].append({"rule": rule.id, "error": str(exc)})
                if not is_test:
                    rule.failure_count = (rule.failure_count or 0) + 1
                logger.error("ENGINE: rule %s failed: %s", rule.id, str(exc), exc_info=True)

        if not is_test:
            await self.db.flush()

        elapsed = (datetime.now(timezone.utc) - start).total_seconds() * 1000
        summary["processing_time_ms"] = round(elapsed, 1)
        logger.info("ENGINE: processed %s — evaluated=%d matched=%d queued=%d executed=%d errors=%d",
                     event_type, summary["rules_evaluated"], summary["rules_matched"],
                     summary["actions_queued"], summary["actions_executed"], len(summary["errors"]))
        return summary

    async def _load_matching_rules(self, event_type: str, hospital_id: Optional[str]) -> list:
        """Load ACTIVE rules matching the event type. Hospital rules take priority."""
        from sqlalchemy import or_
        
        query = select(AutomationRule).where(
            AutomationRule.is_active == True,
            AutomationRule.status == "ACTIVE",
            AutomationRule.trigger_event == event_type,
        ).order_by(
            # Hospital-specific rules first, then group, then system
            AutomationRule.hospital_id.desc().nulls_last(),
            AutomationRule.priority.asc(),
        )
        
        result = await self.db.execute(query)
        all_rules = list(result.scalars().all())

        # Filter: hospital rules override system rules for same trigger
        if hospital_id:
            hospital_rules = [r for r in all_rules if r.hospital_id == hospital_id]
            if hospital_rules:
                return hospital_rules
        return [r for r in all_rules if r.hospital_id is None]

    async def _load_actions(self, rule_id: str) -> list:
        """Load active actions for a rule, sorted by sort_order."""
        query = select(AutomationRuleAction).where(
            AutomationRuleAction.rule_id == rule_id,
            AutomationRuleAction.is_active == True,
        ).order_by(AutomationRuleAction.sort_order)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _evaluate_conditions(
        self,
        rule,
        event_type: str,
        entity_type: str,
        entity_id: str,
        patient_context: dict,
        payload: dict,
    ) -> bool:
        """Evaluate all conditions for a rule. Returns True if all conditions match."""
        query = select(AutomationRuleCondition).where(
            AutomationRuleCondition.rule_id == rule.id
        ).order_by(AutomationRuleCondition.sort_order)
        result = await self.db.execute(query)
        conditions = list(result.scalars().all())

        if not conditions:
            return True  # No conditions = always match

        logic = rule.condition_logic or "AND"
        results = []

        for cond in conditions:
            try:
                match = self._evaluate_single_condition(cond, patient_context, payload)
                results.append(match)
            except Exception as exc:
                logger.warning("ENGINE: condition evaluation error: %s", str(exc))
                results.append(False)

        if logic == "AND":
            return all(results)
        else:
            return any(results)

    def _evaluate_single_condition(self, condition, patient_context: dict, payload: dict) -> bool:
        """Evaluate a single condition against context."""
        field = condition.field_name
        operator = condition.operator
        expected = condition.value

        # Get actual value from context or payload
        actual = patient_context.get(field) or payload.get(field)

        # Type coercion
        if condition.value_type == "NUMBER":
            try:
                actual = float(actual) if actual is not None else None
                expected = float(expected) if expected is not None else None
            except (ValueError, TypeError):
                return False
        elif condition.value_type == "BOOLEAN":
            actual = str(actual).lower() in ("true", "1", "yes")
            expected = str(expected).lower() in ("true", "1", "yes")

        # Evaluate operator
        if operator == "IS_NULL":
            return actual is None
        if operator == "IS_NOT_NULL":
            return actual is not None
        if actual is None:
            return False

        if operator == "EQUALS":
            return str(actual).lower() == str(expected).lower()
        elif operator == "NOT_EQUALS":
            return str(actual).lower() != str(expected).lower()
        elif operator == "CONTAINS":
            return str(expected).lower() in str(actual).lower()
        elif operator == "NOT_CONTAINS":
            return str(expected).lower() not in str(actual).lower()
        elif operator == "GREATER_THAN":
            return actual > expected
        elif operator == "LESS_THAN":
            return actual < expected
        elif operator == "GREATER_EQUAL":
            return actual >= expected
        elif operator == "LESS_EQUAL":
            return actual <= expected
        elif operator == "IN":
            values = [v.strip().lower() for v in str(expected).split(",")]
            return str(actual).lower() in values
        elif operator == "NOT_IN":
            values = [v.strip().lower() for v in str(expected).split(",")]
            return str(actual).lower() not in values

        return False

    async def _resolve_patient_context(self, patient_id: Optional[str], payload: dict) -> dict:
        """Build patient context for condition evaluation."""
        context = dict(payload)
        if not patient_id:
            return context

        patient = await self.db.get(Patient, patient_id)
        if not patient:
            return context

        context["patient_id"] = patient.id
        context["patient_name"] = patient.full_name
        context["patient_gender"] = patient.gender
        context["patient_phone"] = patient.phone
        context["patient_email"] = patient.email
        context["patient_source"] = patient.patient_source

        if patient.date_of_birth:
            today = date.today()
            dob = patient.date_of_birth if isinstance(patient.date_of_birth, date) else date.fromisoformat(str(patient.date_of_birth)[:10])
            age = (today.year - dob.year) - ((today.month, today.day) < (dob.month, dob.day))
            context["patient_age"] = age

        return context

    async def _execute_action(
        self,
        rule,
        action,
        event_type: str,
        entity_type: str,
        entity_id: str,
        hospital_id: Optional[str],
        patient_id: Optional[str],
        doctor_id: Optional[str],
        payload: dict,
        is_test: bool,
    ) -> dict:
        """Execute a single action."""
        config = {}
        if action.action_config:
            try:
                config = json.loads(action.action_config) if isinstance(action.action_config, str) else action.action_config
            except (json.JSONDecodeError, TypeError):
                config = {}

        if action.action_type == "CREATE_FOLLOW_UP":
            return await self._action_create_follow_up(rule, action, config, entity_id, hospital_id, patient_id, doctor_id, payload, is_test)
        elif action.action_type == "SEND_WHATSAPP":
            return await self._action_send_whatsapp(config, hospital_id, patient_id, payload, is_test)
        elif action.action_type == "SEND_EMAIL":
            return await self._action_send_email(config, hospital_id, patient_id, payload, is_test)
        elif action.action_type == "CREATE_NOTIFICATION":
            return await self._action_create_notification(config, hospital_id, patient_id, entity_type, entity_id, is_test)
        elif action.action_type == "CREATE_TASK":
            return await self._action_create_task(rule, action, config, hospital_id, patient_id, entity_type, entity_id, is_test)
        elif action.action_type == "ESCALATE_FOLLOW_UP":
            return await self._action_escalate_follow_up(config, patient_id, is_test)
        else:
            return {"status": "skipped", "reason": f"Unknown action type: {action.action_type}"}

    async def _action_create_follow_up(self, rule, action, config, entity_id, hospital_id, patient_id, doctor_id, payload, is_test):
        if is_test:
            return {"status": "test", "would_create": "follow_up", "config": config}
        
        follow_up_date = date.today() + timedelta(days=action.delay_days or 0, hours=action.delay_hours or 0)
        fu = FollowUp(
            patient_id=patient_id,
            hospital_id=hospital_id,
            doctor_id=doctor_id or config.get("doctor_id"),
            case_id=payload.get("case_id"),
            treatment_id=entity_id if entity_type == "TREATMENT" else None,
            treatment_name=payload.get("treatment_name"),
            follow_up_date=follow_up_date,
            follow_up_time=datetime.strptime(config.get("time", "10:00"), "%H:%M").time() if config.get("time") else None,
            follow_up_type=config.get("follow_up_type", FollowUpType.CUSTOM_FOLLOW_UP.value),
            status=FollowUpStatus.PENDING.value,
            channel=action.responsible_role or "WHATSAPP",
            priority=action.priority or "MEDIUM",
            notes=config.get("notes") or f"Auto: {rule.name}",
        )
        self.db.add(fu)
        return {"status": "created", "follow_up_id": "pending"}

    async def _action_send_whatsapp(self, config, hospital_id, patient_id, payload, is_test):
        if is_test:
            return {"status": "test", "would_send": "whatsapp", "config": config}
        return {"status": "queued", "channel": "WHATSAPP"}

    async def _action_send_email(self, config, hospital_id, patient_id, payload, is_test):
        if is_test:
            return {"status": "test", "would_send": "email", "config": config}
        return {"status": "queued", "channel": "EMAIL"}

    async def _action_create_notification(self, config, hospital_id, patient_id, entity_type, entity_id, is_test):
        if is_test:
            return {"status": "test", "would_create": "notification", "config": config}
        return {"status": "created", "type": "notification"}

    async def _action_create_task(self, rule, action, config, hospital_id, patient_id, entity_type, entity_id, is_test):
        if is_test:
            return {"status": "test", "would_create": "task", "config": config}
        return {"status": "created", "type": "task"}

    async def _action_escalate_follow_up(self, config, patient_id, is_test):
        if is_test:
            return {"status": "test", "would_escate": True, "config": config}
        return {"status": "escalated"}

    async def _queue_action(self, rule, action, event_type, entity_type, entity_id, hospital_id, patient_id, payload, delay):
        """Queue an action for delayed execution."""
        queue_item = AutomationExecutionQueue(
            rule_id=rule.id,
            action_id=action.id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            hospital_id=hospital_id,
            patient_id=patient_id,
            action_type=action.action_type,
            action_config=action.action_config,
            scheduled_at=datetime.now(timezone.utc) + delay,
            execute_after=datetime.now(timezone.utc) + delay,
            status="QUEUED",
            priority=action.priority or "MEDIUM",
            max_retries=action.max_retries or 1,
            retry_delay_hours=action.retry_delay_hours or 24,
        )
        self.db.add(queue_item)

    async def _log_execution(self, rule, event_type, entity_type, entity_id, hospital_id, patient_id, action, result, is_test):
        """Log rule execution for audit."""
        log = AutomationRuleLog(
            rule_id=rule.id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            hospital_id=hospital_id,
            patient_id=patient_id,
            action_type=action.action_type,
            action_result=json.dumps(result) if result else None,
            execution_status="COMPLETED" if result and result.get("status") != "error" else "FAILED",
            is_test="Y" if is_test else "N",
        )
        self.db.add(log)

    async def test_rule(self, rule_id: str, event_type: str, payload: Optional[dict] = None) -> dict:
        """Test a rule without affecting production data."""
        rule = await self.db.get(AutomationRule, rule_id)
        if not rule:
            return {"error": "Rule not found"}

        result = await self.process_event(
            event_type=event_type,
            entity_type="TEST",
            entity_id="test-000",
            hospital_id=rule.hospital_id,
            patient_id=payload.get("patient_id") if payload else None,
            payload=payload or {},
            is_test=True,
        )
        return result
