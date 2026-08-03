"""
Recurring Recall Engine — deterministic scheduling of recurring RECALL enquiries.

The scheduler is the PRIMARY driver (self-healing): it advances overdue chains and
heals chains that stopped (e.g. an enquiry was completed without the completion
event creating its successor). The event path (RECALL_COMPLETED) is a fast-forward
that uses the EXACT same idempotent primitive, so the two paths can never disagree.

Invariants (deterministic):
  * Next due date = previous occurrence's DUE DATE + current interval (cycle-based).
    NEVER anchored to completion/creation time, so the schedule cannot drift.
  * One active chain per patient. A new CASE_CREATED/CASE_COMPLETED cancels pending
    recalls from older chains, and scheduling refuses to create a successor when a
    newer case already exists for the patient.
  * Idempotent: refuses to schedule a successor when the chain already has a later
    active (non-terminal) occurrence.
"""
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

logger = logging.getLogger("crm.recurring_recalls")

TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "LOST", "CONVERTED"]


async def resolve_recall_interval_days(db: AsyncSession, hospital_id: str) -> Optional[int]:
    """Current CASE_RECALL interval — fresh DB config, else canonical default."""
    from app.models.crm_follow_up_config import CrmFollowUpConfig
    result = await db.execute(
        select(CrmFollowUpConfig.start_delay_days).where(
            and_(
                CrmFollowUpConfig.hospital_id == hospital_id,
                CrmFollowUpConfig.context_type == "CASE_RECALL",
            )
        ).limit(1)
    )
    fresh = result.scalar_one_or_none()
    if fresh is not None:
        return int(fresh)
    from app.crm.defaults import FOLLOW_UP_DEFAULTS
    return FOLLOW_UP_DEFAULTS["CASE_RECALL"].start_delay_days


async def _chain_has_active_occurrence(
    db: AsyncSession, hospital_id: str, patient_id: str, chain_id: str
) -> bool:
    from app.models.generated_enquiry import GeneratedEnquiry
    result = await db.execute(
        select(func.count(GeneratedEnquiry.id)).where(
            and_(
                GeneratedEnquiry.hospital_id == hospital_id,
                GeneratedEnquiry.patient_id == patient_id,
                GeneratedEnquiry.enquiry_type == "RECALL",
                GeneratedEnquiry.chain_id == chain_id,
                GeneratedEnquiry.status.notin_(TERMINAL_STATUSES),
            )
        )
    )
    return result.scalar() > 0


async def _patient_has_active_recall(
    db: AsyncSession, hospital_id: str, patient_id: str, exclude_chain_id: Optional[str] = None
) -> bool:
    from app.models.generated_enquiry import GeneratedEnquiry
    conditions = [
        GeneratedEnquiry.hospital_id == hospital_id,
        GeneratedEnquiry.patient_id == patient_id,
        GeneratedEnquiry.enquiry_type == "RECALL",
        GeneratedEnquiry.status.notin_(TERMINAL_STATUSES),
    ]
    if exclude_chain_id:
        conditions.append(GeneratedEnquiry.chain_id != exclude_chain_id)
    result = await db.execute(
        select(func.count(GeneratedEnquiry.id)).where(and_(*conditions))
    )
    return result.scalar() > 0


async def _patient_has_newer_case(db: AsyncSession, patient_id: str, than_case_id: str) -> bool:
    """True if the patient has a case created strictly after `than_case_id`'s case."""
    from app.models.case import Case
    target = await db.get(Case, than_case_id)
    if not target or not getattr(target, "created_at", None):
        return False
    result = await db.execute(
        select(func.count(Case.id)).where(
            and_(Case.patient_id == patient_id, Case.created_at > target.created_at)
        )
    )
    return result.scalar() > 0


async def schedule_next_recurring_recall(
    db: AsyncSession,
    hospital_id: str,
    previous,
    *,
    trigger_event: str,
    reason: str,
) -> Optional[object]:
    """Idempotently create the next occurrence for `previous`'s chain.

    Returns the created GeneratedEnquiry, or None when no successor is allowed
    (chain already has a later active occurrence, another chain is active, a newer
    case exists for the patient, or no interval can be resolved).
    """
    from app.models.generated_enquiry import GeneratedEnquiry
    from app.crm.services.enquiry_executor import get_enquiry_executor
    from app.crm.services.automation_log import write_automation_log

    if not previous or not previous.patient_id:
        return None

    chain = previous.chain_id or previous.id
    hospital_id = hospital_id or previous.hospital_id

    # 1. Idempotency — this chain already has a later active occurrence
    if await _chain_has_active_occurrence(db, hospital_id, previous.patient_id, chain):
        return None

    # 2. Patient scope — another chain is already active (newer case won)
    if await _patient_has_active_recall(db, hospital_id, previous.patient_id, exclude_chain_id=chain):
        return None

    # 3. Case recency — a newer case exists; do NOT resurrect the old chain
    if previous.case_id and await _patient_has_newer_case(db, previous.patient_id, previous.case_id):
        return None

    interval_days = await resolve_recall_interval_days(db, hospital_id)
    if interval_days is None:
        await write_automation_log(
            db, hospital_id=hospital_id, patient_id=previous.patient_id,
            case_id=previous.case_id, event=trigger_event, rule="schedule_next_recurring_recall",
            enquiry_type="RECALL", decision="SKIP",
            reason="CASE_RECALL interval could not be resolved; no successor scheduled",
            chain_id=chain, occurrence_number=(previous.occurrence_number or 1) + 1,
        )
        return None

    new_due = previous.due_date + timedelta(days=interval_days)
    new_occurrence = (previous.occurrence_number or 1) + 1
    now = datetime.now(timezone.utc)

    new_ge = GeneratedEnquiry(
        hospital_id=hospital_id,
        patient_id=previous.patient_id,
        case_id=previous.case_id,
        doctor_id=previous.doctor_id,
        treatment_type_id=previous.treatment_type_id,
        enquiry_type="RECALL",
        due_date=new_due,
        priority="LOW",
        status="PENDING",
        notes=f"Recurring recall #{new_occurrence}",
        is_recurring=True,
        occurrence_number=new_occurrence,
        recurrence_interval_days=interval_days,
        chain_id=chain,
        trigger_event=trigger_event,
        created_by_event=trigger_event,
        generation_reason=reason,
    )
    new_ge.enquiry_number = await get_enquiry_executor()._generate_enquiry_number(db)
    db.add(new_ge)
    await db.flush()

    await write_automation_log(
        db, hospital_id=hospital_id, patient_id=previous.patient_id,
        case_id=previous.case_id, event=trigger_event, rule="schedule_next_recurring_recall",
        enquiry_type="RECALL", decision="CREATE", reason=reason,
        chain_id=chain, occurrence_number=new_occurrence, due_date=new_due,
        config_snapshot={"interval_days": interval_days},
    )
    logger.info(
        "RECALL_NEXT_SCHEDULED: chain=%s occurrence=%d due=%s event=%s",
        chain, new_occurrence, new_due, trigger_event,
    )
    return new_ge
