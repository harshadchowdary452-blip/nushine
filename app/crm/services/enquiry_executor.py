"""
CRM Enquiry Executor — pure execution layer.

Takes a Decision from the Rule Engine and creates/cancels GeneratedEnquiry records.
NO business logic here. NO decision-making. Pure execution only.

Pipeline:
  Event → Dispatcher → Rule Engine → Decision → THIS MODULE → Enquiry Created

Enterprise Idempotency:
  hospital_id + patient_id + case_id + treatment_type_id + appointment_id + enquiry_type + due_date
"""
import logging
from datetime import date, datetime, timezone
from typing import Optional
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

logger = logging.getLogger("crm.enquiry_executor")


# ============================================================
# Enquiry Types
# ============================================================

class EnquiryType:
    LEAD_FOLLOW_UP = "LEAD_FOLLOW_UP"
    OPD_FOLLOW_UP = "OPD_FOLLOW_UP"
    APPOINTMENT_REMINDER = "APPOINTMENT_REMINDER"
    TREATMENT_WELLNESS = "TREATMENT_WELLNESS"
    CASE_WELLNESS = "CASE_WELLNESS"
    RECALL = "RECALL"
    MISSED_APPOINTMENT = "MISSED_APPOINTMENT"
    GENERAL_FOLLOW_UP = "GENERAL_FOLLOW_UP"
    PATIENT_SATISFACTION = "PATIENT_SATISFACTION"


# ============================================================
# Execution Result
# ============================================================

@dataclass
class ExecutionResult:
    enquiries_created: int = 0
    enquiries_skipped: int = 0
    duplicate_prevented: int = 0
    errors: list = None
    created_ids: list = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.created_ids is None:
            self.created_ids = []


# ============================================================
# Enquiry Executor — Pure Execution
# ============================================================

class EnquiryExecutor:
    """
    Pure execution layer. Takes a Decision and executes it.

    Responsibilities:
    - Execute CREATE decision: create GeneratedEnquiry record
    - Execute CANCEL decision: cancel existing PENDING enquiries
    - Enterprise idempotency check before creation
    - Generate enquiry number
    - Log audit trail

    NOT responsible for:
    - Deciding WHAT to create (that's the Rule Engine)
    - Business rules (that's the Rule Engine)
    - Appointment awareness (that's the Rule Engine)
    """

    def __init__(self):
        pass

    async def execute(
        self,
        db: AsyncSession,
        hospital_id: str,
        decision,  # Decision from RuleEngine
        event_data: dict,
    ) -> ExecutionResult:
        """
        Execute a Decision from the rule engine.

        Args:
            db: Database session
            hospital_id: Hospital ID
            decision: Decision object from RuleEngine
            event_data: Original event data

        Returns:
            ExecutionResult
        """
        result = ExecutionResult()

        if not decision:
            return result

        if decision.action == "CANCEL":
            cancelled = await self._execute_cancel(db, hospital_id, decision)
            result.enquiries_skipped = cancelled
            return result

        if decision.action != "CREATE":
            logger.warning("EXECUTOR_UNKNOWN_ACTION: %s", decision.action)
            return result

        # Enterprise idempotency check
        is_dup = await self._is_duplicate(
            db, hospital_id,
            decision.patient_id, decision.case_id,
            decision.treatment_type_id, decision.appointment_id,
            decision.enquiry_type, decision.due_date,
            lead_id=getattr(decision, 'lead_id', None),
            chain_id=getattr(decision, 'chain_id', None),
        )
        if is_dup:
            logger.info(
                "DUPLICATE_PREVENTED: type=%s patient=%s case=%s treatment=%s appointment=%s date=%s",
                decision.enquiry_type, decision.patient_id, decision.case_id,
                decision.treatment_type_id, decision.appointment_id, decision.due_date,
            )
            result.duplicate_prevented += 1
            return result

        # Validate enquiry type
        VALID_TYPES = {
            "LEAD_FOLLOW_UP", "OPD_FOLLOW_UP", "APPOINTMENT_REMINDER",
            "TREATMENT_WELLNESS", "CASE_WELLNESS", "RECALL", "MISSED_APPOINTMENT",
        }
        if decision.enquiry_type not in VALID_TYPES:
            logger.warning(
                "INVALID_ENQUIRY_TYPE: %s — rejecting creation. Valid types: %s",
                decision.enquiry_type, VALID_TYPES,
            )
            result.errors.append(f"Invalid enquiry_type: {decision.enquiry_type}")
            return result

        # Create the enquiry
        try:
            ge = await self._create_enquiry(db, hospital_id, decision)
            result.enquiries_created += 1
            result.created_ids.append(ge.id)
            logger.info(
                "ENQUIRY_CREATED: type=%s id=%s patient=%s due=%s",
                decision.enquiry_type, ge.id, decision.patient_id, decision.due_date,
            )
        except Exception as exc:
            logger.error("ENQUIRY_CREATE_FAILED: type=%s error=%s", decision.enquiry_type, str(exc))
            result.errors.append(str(exc))

        return result

    # ============================================================
    # Execute CANCEL
    # ============================================================

    async def _execute_cancel(self, db: AsyncSession, hospital_id: str, decision) -> int:
        """Cancel existing PENDING enquiries as per decision."""
        from app.models.generated_enquiry import GeneratedEnquiry

        cancel_types = decision.cancel_enquiry_types or [decision.enquiry_type]
        patient_id = decision.patient_id
        lead_id = getattr(decision, 'lead_id', None)

        conditions = [
            GeneratedEnquiry.hospital_id == hospital_id,
            GeneratedEnquiry.enquiry_type.in_(cancel_types),
            GeneratedEnquiry.status == "PENDING",
        ]
        if patient_id:
            conditions.append(GeneratedEnquiry.patient_id == patient_id)
        elif lead_id:
            conditions.append(GeneratedEnquiry.lead_id == lead_id)
        else:
            return 0

        result = await db.execute(
            select(GeneratedEnquiry).where(and_(*conditions))
        )

        cancelled = 0
        now = datetime.now(timezone.utc)
        for ge in result.scalars().all():
            ge.status = "CANCELLED"
            ge.cancelled_by_event = decision.trigger_event
            ge.cancelled_at = now
            cancelled += 1

        if cancelled:
            await db.flush()
            logger.info(
                "ENQUIRIES_CANCELLED: patient=%s types=%s count=%d reason=%s",
                patient_id, cancel_types, cancelled, decision.cancel_reason,
            )

        return cancelled

    # ============================================================
    # Enterprise Idempotency Check
    # ============================================================

    async def _is_duplicate(
        self,
        db: AsyncSession,
        hospital_id: str,
        patient_id: Optional[str],
        case_id: Optional[str],
        treatment_type_id: Optional[str],
        appointment_id: Optional[str],
        enquiry_type: str,
        due_date: date,
        lead_id: Optional[str] = None,
        chain_id: Optional[str] = None,
    ) -> bool:
        """Check enterprise idempotency key before creating enquiry.

        Checks ALL active statuses (PENDING, CONTACTED, INTERESTED, etc.)
        NOT just PENDING — this prevents duplicate creation after CANCEL.
        Only COMPLETED and CANCELLED are excluded (terminal states).

        For recurring recalls (chain_id provided), checks for any PENDING
        recall in the same chain instead of the standard key.
        """
        from app.models.generated_enquiry import GeneratedEnquiry

        terminal_statuses = ["COMPLETED", "CANCELLED", "LOST", "CONVERTED"]

        # For recurring recalls: check by chain_id + patient
        if chain_id and enquiry_type == "RECALL":
            result = await db.execute(
                select(func.count(GeneratedEnquiry.id)).where(
                    and_(
                        GeneratedEnquiry.hospital_id == hospital_id,
                        GeneratedEnquiry.patient_id == patient_id,
                        GeneratedEnquiry.enquiry_type == "RECALL",
                        GeneratedEnquiry.chain_id == chain_id,
                        GeneratedEnquiry.status.notin_(terminal_statuses),
                    )
                )
            )
            return result.scalar() > 0

        conditions = [
            GeneratedEnquiry.hospital_id == hospital_id,
            GeneratedEnquiry.enquiry_type == enquiry_type,
            GeneratedEnquiry.due_date == due_date,
            GeneratedEnquiry.status.notin_(terminal_statuses),
        ]

        if patient_id:
            conditions.append(GeneratedEnquiry.patient_id == patient_id)
        else:
            conditions.append(GeneratedEnquiry.patient_id.is_(None))

        # APPOINTMENT_REMINDER is unique per appointment — the same appointment can be
        # reached via different events (APPOINTMENT_CREATED, TREATMENT_COMPLETED, ...)
        # that may or may not carry case_id/treatment_type_id. Ignore those context keys
        # so all paths resolve to the same idempotency key and we never get duplicates.
        is_appointment_reminder = enquiry_type == "APPOINTMENT_REMINDER" and bool(appointment_id)

        if not is_appointment_reminder:
            if case_id:
                conditions.append(GeneratedEnquiry.case_id == case_id)
            else:
                conditions.append(GeneratedEnquiry.case_id.is_(None))

            if treatment_type_id:
                conditions.append(GeneratedEnquiry.treatment_type_id == treatment_type_id)
            else:
                conditions.append(GeneratedEnquiry.treatment_type_id.is_(None))

        if appointment_id:
            conditions.append(GeneratedEnquiry.appointment_id == appointment_id)
        else:
            conditions.append(GeneratedEnquiry.appointment_id.is_(None))

        if lead_id:
            conditions.append(GeneratedEnquiry.lead_id == lead_id)
        else:
            conditions.append(GeneratedEnquiry.lead_id.is_(None))

        result = await db.execute(
            select(func.count(GeneratedEnquiry.id)).where(and_(*conditions))
        )
        return result.scalar() > 0

    # ============================================================
    # Create Enquiry
    # ============================================================

    async def _create_enquiry(self, db: AsyncSession, hospital_id: str, decision):
        """Create a GeneratedEnquiry record from a Decision."""
        from app.models.generated_enquiry import GeneratedEnquiry

        ge = GeneratedEnquiry(
            hospital_id=hospital_id,
            patient_id=decision.patient_id,
            lead_id=decision.lead_id,
            treatment_plan_id=decision.treatment_plan_id,
            treatment_type_id=decision.treatment_type_id,
            appointment_id=decision.appointment_id,
            case_id=decision.case_id,
            doctor_id=decision.doctor_id,
            assigned_staff_id=decision.assigned_staff_id,
            crm_rule_id=decision.crm_rule_id if hasattr(decision, 'crm_rule_id') else None,
            rule_id=decision.crm_rule_id if hasattr(decision, 'crm_rule_id') else None,
            trigger_event=decision.trigger_event,
            enquiry_type=decision.enquiry_type,
            notes=decision.description or "",
            due_date=decision.due_date,
            priority=decision.priority or "MEDIUM",
            status="PENDING",
            treatment_name=decision.treatment_name,
            created_by_event=decision.trigger_event,
            generation_reason=f"Rule Engine Decision | Event: {decision.trigger_event}",
            is_recurring=getattr(decision, 'is_recurring', False),
            occurrence_number=getattr(decision, 'occurrence_number', 1),
            total_attempts=getattr(decision, 'total_attempts', None),
            recurrence_interval_days=getattr(decision, 'recurrence_interval_days', None),
            chain_id=None,
        )
        if getattr(decision, 'is_recurring', False):
            if getattr(decision, 'chain_id', None):
                ge.chain_id = decision.chain_id
            else:
                ge.chain_id = ge.id

        ge.enquiry_number = await self._generate_enquiry_number(db)

        db.add(ge)
        await db.flush()
        return ge

    # ============================================================
    # Generate Enquiry Number
    # ============================================================

    async def _generate_enquiry_number(self, db: AsyncSession) -> str:
        """Generate: ENQ-YYYY-NNNNNN."""
        from app.models.generated_enquiry import GeneratedEnquiry
        year = date.today().year
        prefix = f"ENQ-{year}-"
        result = await db.execute(
            select(GeneratedEnquiry.enquiry_number)
            .where(GeneratedEnquiry.enquiry_number.like(f"{prefix}%"))
            .order_by(GeneratedEnquiry.enquiry_number.desc())
            .limit(1)
        )
        last = result.scalar_one_or_none()
        if last:
            try:
                seq = int(last.split("-")[-1]) + 1
            except ValueError:
                seq = 1
        else:
            seq = 1
        return f"{prefix}{seq:06d}"


# ============================================================
# Singleton
# ============================================================

_executor_instance: Optional[EnquiryExecutor] = None


def get_enquiry_executor() -> EnquiryExecutor:
    global _executor_instance
    if _executor_instance is None:
        _executor_instance = EnquiryExecutor()
    return _executor_instance
