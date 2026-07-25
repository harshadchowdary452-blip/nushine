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
    APPOINTMENT_REMINDER = "APPOINTMENT_REMINDER"
    TREATMENT_WELLNESS = "TREATMENT_WELLNESS"
    CASE_WELLNESS = "CASE_WELLNESS"
    RECALL = "RECALL"
    MISSED_APPOINTMENT = "MISSED_APPOINTMENT"
    GENERAL_FOLLOW_UP = "GENERAL_FOLLOW_UP"
    PATIENT_SATISFACTION = "PATIENT_SATISFACTION"
    OPD_FOLLOW_UP = "OPD_FOLLOW_UP"


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
        )
        if is_dup:
            logger.info(
                "DUPLICATE_PREVENTED: type=%s patient=%s case=%s treatment=%s appointment=%s date=%s",
                decision.enquiry_type, decision.patient_id, decision.case_id,
                decision.treatment_type_id, decision.appointment_id, decision.due_date,
            )
            result.duplicate_prevented += 1
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

        if not patient_id:
            return 0

        result = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.hospital_id == hospital_id,
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.enquiry_type.in_(cancel_types),
                    GeneratedEnquiry.status == "PENDING",
                )
            )
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
    ) -> bool:
        """Check enterprise idempotency key before creating enquiry."""
        from app.models.generated_enquiry import GeneratedEnquiry

        conditions = [
            GeneratedEnquiry.hospital_id == hospital_id,
            GeneratedEnquiry.enquiry_type == enquiry_type,
            GeneratedEnquiry.due_date == due_date,
            GeneratedEnquiry.status == "PENDING",
        ]

        if patient_id:
            conditions.append(GeneratedEnquiry.patient_id == patient_id)
        else:
            conditions.append(GeneratedEnquiry.patient_id.is_(None))

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
        )

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
