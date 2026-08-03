"""CRM Automation audit logging.

Writes one row per automation decision to crm_automation_logs so the enquiry
calendar / ops team can see exactly what the automation did and WHY.
"""
import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("crm.automation_log")


async def write_automation_log(
    db: AsyncSession,
    *,
    hospital_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    case_id: Optional[str] = None,
    event: Optional[str] = None,
    rule: Optional[str] = None,
    enquiry_type: Optional[str] = None,
    decision: str,
    reason: Optional[str] = None,
    occurrence_number: Optional[int] = None,
    chain_id: Optional[str] = None,
    due_date=None,
    config_snapshot: Optional[dict] = None,
):
    try:
        from app.models.crm_automation_log import CrmAutomationLog
        log = CrmAutomationLog(
            hospital_id=hospital_id,
            patient_id=patient_id,
            case_id=case_id,
            event=event,
            rule=rule,
            enquiry_type=enquiry_type,
            decision=decision,
            reason=reason,
            occurrence_number=occurrence_number,
            chain_id=chain_id,
            due_date=due_date,
            config_snapshot=json.dumps(config_snapshot) if config_snapshot else None,
        )
        db.add(log)
        await db.flush()
    except Exception as exc:  # never break automation because logging failed
        logger.warning("AUTOMATION_LOG_FAILED: %s", exc)
