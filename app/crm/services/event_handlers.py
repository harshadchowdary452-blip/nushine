"""
CRM Event Handlers — the ONLY subscribers to the EventDispatcher.

Every ERP event flows through here → CRM Rule Engine → GeneratedEnquiry.
No other service should create automatic enquiries.
"""
import json
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.crm.events import EventPayload

logger = logging.getLogger("crm.event_handlers")


async def _get_hospital_id(event: EventPayload) -> Optional[str]:
    return event.hospital_id


async def _get_event_data(event: EventPayload) -> dict:
    """Extract event_data dict from EventPayload for the rule engine."""
    data = dict(event.payload) if event.payload else {}
    if event.patient_id:
        data.setdefault("patient_id", event.patient_id)
    if event.doctor_id:
        data.setdefault("doctor_id", event.doctor_id)
    if event.entity_id:
        data.setdefault("entity_id", event.entity_id)
    # For LEAD events, entity_id is the lead_id
    if "lead_id" not in data and event.entity_type == "LEAD" and event.entity_id:
        data.setdefault("lead_id", event.entity_id)
    return data


# --- Lead Events ---

async def handle_lead_created(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import on_lead_created
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    await on_lead_created(db, hid, data)


async def handle_lead_converted(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import on_lead_converted
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    await on_lead_converted(db, hid, data)


async def handle_lead_lost(event: EventPayload, db: Optional[AsyncSession] = None):
    """When a lead is marked lost, cancel all pending follow-ups for that lead."""
    from app.crm.services.rule_engine import cancel_lead_followups
    lead_id = event.entity_id
    if lead_id and db:
        hid = await _get_hospital_id(event)
        if hid:
            await cancel_lead_followups(db, hid, lead_id, cancelled_by_event="LEAD_LOST")
            logger.info("LEAD_LOST_CANCELLED: lead=%s", lead_id)


# --- Patient Events ---

async def handle_patient_registered(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import execute_rules
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    await execute_rules(db, hid, "PATIENT_REGISTERED", data, "LEAD")
    # OPD follow-up: if hospital has OPD follow-up enabled and no case was created with registration
    if db:
        try:
            from app.models.crm_opd_setting import CrmOpdSetting
            from sqlalchemy import select
            q = select(CrmOpdSetting).where(
                CrmOpdSetting.hospital_id == hid,
                CrmOpdSetting.opd_follow_up_enabled == True,
                CrmOpdSetting.is_active == True,
            )
            setting = (await db.execute(q)).scalar_one_or_none()
            if setting:
                patient_id = event.patient_id
                if patient_id:
                    from datetime import date, timedelta
                    from app.models.generated_enquiry import GeneratedEnquiry
                    due = date.today() + timedelta(days=setting.default_due_days or 1)
                    # Enterprise idempotency: check business uniqueness key
                    from app.crm.services.rule_engine import _is_duplicate_business_key
                    if await _is_duplicate_business_key(
                        db, hid, patient_id, None, None, "OPD_FOLLOW_UP", due,
                    ):
                        logger.info("DUPLICATE_ENQUIRY_PREVENTED: OPD_FOLLOW_UP patient=%s hospital=%s", patient_id, hid)
                    else:
                        ge = GeneratedEnquiry(
                            hospital_id=hid,
                            patient_id=patient_id,
                            trigger_event="OPD_FOLLOW_UP",
                            enquiry_type="OPD_FOLLOW_UP",
                            notes=setting.message_template or "OPD follow-up: patient registered without a case",
                            due_date=due,
                            priority=setting.priority or "MEDIUM",
                            assigned_staff_id=str(setting.assigned_staff_id) if setting.assigned_staff_id else None,
                            status="PENDING",
                        )
                        db.add(ge)
                        await db.flush()
                        logger.info("OPD_FOLLOWUP_CREATED: patient=%s hospital=%s due=%s", patient_id, hid, due)
        except Exception as e:
            logger.warning("OPD_FOLLOWUP_FAILED: %s", str(e))


async def handle_patient_deactivated(event: EventPayload, db: Optional[AsyncSession] = None):
    """When a patient is deactivated, cancel all their pending enquiries."""
    patient_id = event.patient_id
    if patient_id and db:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import select, and_
        old = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.status == "PENDING",
                )
            )
        )
        cancelled = 0
        for ge in old.scalars().all():
            ge.status = "CANCELLED"
            cancelled += 1
        if cancelled:
            await db.flush()
            logger.info("PATIENT_DEACTIVATED_CANCELLED: patient=%s count=%d", patient_id, cancelled)


# --- Appointment Events ---

async def handle_appointment_created(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import on_appointment_created
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    await on_appointment_created(db, hid, data)


async def handle_appointment_rescheduled(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import execute_rules
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    # Cancel old pending APPOINTMENT enquiries for this patient+appointment
    patient_id = data.get("patient_id")
    appointment_id = data.get("appointment_id") or event.entity_id
    if patient_id:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import select, and_
        old = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.trigger_event == "APPOINTMENT_CREATED",
                )
            )
        )
        for ge in old.scalars().all():
            ge.status = "CANCELLED"
        await db.flush()
    # Create new appointment reminder
    await execute_rules(db, hid, "APPOINTMENT_CREATED", data, "TREATMENT")


async def handle_appointment_completed(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import on_appointment_completed
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    await on_appointment_completed(db, hid, data)


async def handle_appointment_cancelled(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import execute_rules
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    # Cancel pending appointment-related enquiries
    patient_id = data.get("patient_id")
    if patient_id:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import select, and_
        old = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.trigger_event == "APPOINTMENT_CREATED",
                )
            )
        )
        for ge in old.scalars().all():
            ge.status = "CANCELLED"
        await db.flush()


async def handle_appointment_missed(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import on_appointment_missed
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    await on_appointment_missed(db, hid, data)


# --- Case Events ---

async def handle_case_created(event: EventPayload, db: Optional[AsyncSession] = None):
    """When a case is created, cancel pending OPD follow-ups for this patient."""
    patient_id = event.patient_id
    if patient_id and db:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import select, and_
        old = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.trigger_event == "OPD_FOLLOW_UP",
                )
            )
        )
        cancelled = 0
        for ge in old.scalars().all():
            ge.status = "CANCELLED"
            cancelled += 1
        if cancelled:
            await db.flush()
            logger.info("OPD_FOLLOWUP_CANCELLED: patient=%s count=%d", patient_id, cancelled)


async def handle_case_completed(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import execute_rules, cancel_case_pending_enquiries
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    case_id = data.get("case_id") or event.entity_id
    if case_id:
        await cancel_case_pending_enquiries(db, case_id, cancelled_by_event="CASE_COMPLETED")
    await execute_rules(db, hid, "CASE_COMPLETED", data, "TREATMENT", scope="CASE")


async def handle_case_approved(event: EventPayload, db: Optional[AsyncSession] = None):
    logger.info("CASE_APPROVED: case=%s patient=%s", event.entity_id, event.patient_id)


async def handle_case_reopened(event: EventPayload, db: Optional[AsyncSession] = None):
    """When a case is reopened, cancel pending Recovery + Recall enquiries."""
    case_id = event.entity_id
    if case_id and db:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import select, and_
        old = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.case_id == case_id,
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.trigger_event.in_(["CASE_COMPLETED"]),
                )
            )
        )
        cancelled = 0
        for ge in old.scalars().all():
            ge.status = "CANCELLED"
            cancelled += 1
        if cancelled:
            await db.flush()
            logger.info("CASE_REOPENED_CANCELLED: case=%s count=%d", case_id, cancelled)


# --- Treatment Events ---


async def handle_payment_received(event: EventPayload, db: Optional[AsyncSession] = None):
    """When a payment is received, cancel pending PAYMENT_OVERDUE enquiries."""
    patient_id = event.patient_id
    if patient_id and db:
        from app.models.generated_enquiry import GeneratedEnquiry
        from sqlalchemy import select, and_
        old = await db.execute(
            select(GeneratedEnquiry).where(
                and_(
                    GeneratedEnquiry.patient_id == patient_id,
                    GeneratedEnquiry.status == "PENDING",
                    GeneratedEnquiry.trigger_event == "PAYMENT_OVERDUE",
                )
            )
        )
        cancelled = 0
        for ge in old.scalars().all():
            ge.status = "CANCELLED"
            cancelled += 1
        if cancelled:
            await db.flush()
            logger.info("PAYMENT_RECEIVED_CANCELLED: patient=%s count=%d", patient_id, cancelled)


async def handle_visit_completed(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import on_visit_completed
    hid = await _get_hospital_id(event)
    if not hid:
        return
    data = await _get_event_data(event)
    await on_visit_completed(db, hid, data)


async def handle_treatment_completed(event: EventPayload, db: Optional[AsyncSession] = None):
    from app.crm.services.rule_engine import on_treatment_completed, create_treatment_completed_followups
    hid = await _get_hospital_id(event)
    if hid:
        data = await _get_event_data(event)
        await on_treatment_completed(db, hid, data)
    plan_id = event.entity_id
    if plan_id and db:
        await create_treatment_completed_followups(db, plan_id)
    # Patient Satisfaction: create a satisfaction follow-up after treatment completion
    if db and event.patient_id:
        try:
            from datetime import date, timedelta
            from app.models.generated_enquiry import GeneratedEnquiry
            from sqlalchemy import select, and_
            existing = await db.execute(
                select(GeneratedEnquiry).where(
                    and_(
                        GeneratedEnquiry.patient_id == event.patient_id,
                        GeneratedEnquiry.treatment_plan_id == plan_id,
                        GeneratedEnquiry.trigger_event == "TREATMENT_COMPLETED",
                        GeneratedEnquiry.enquiry_type == "PATIENT_SATISFACTION",
                    )
                )
            )
            if not existing.scalars().first():
                # Enterprise idempotency: check business uniqueness key
                from app.crm.services.rule_engine import _is_duplicate_business_key
                satisfaction_date = date.today() + timedelta(days=3)
                if await _is_duplicate_business_key(
                    db, hid, event.patient_id, None, None, "PATIENT_SATISFACTION", satisfaction_date,
                ):
                    logger.info("DUPLICATE_ENQUIRY_PREVENTED: PATIENT_SATISFACTION patient=%s treatment=%s", event.patient_id, plan_id)
                else:
                    ge = GeneratedEnquiry(
                        hospital_id=hid,
                        patient_id=event.patient_id,
                        treatment_plan_id=plan_id,
                        trigger_event="TREATMENT_COMPLETED",
                        enquiry_type="PATIENT_SATISFACTION",
                        notes="Please rate your treatment experience and share feedback.",
                        due_date=satisfaction_date,
                        priority="LOW",
                        status="PENDING",
                    )
                db.add(ge)
                await db.flush()
                logger.info("PATIENT_SATISFACTION_CREATED: patient=%s treatment=%s", event.patient_id, plan_id)
        except Exception as e:
            logger.warning("PATIENT_SATISFACTION_FAILED: %s", str(e))


# --- Handler Registry ---

CRM_EVENT_HANDLERS = {
    "LEAD_CREATED": handle_lead_created,
    "LEAD_CONVERTED": handle_lead_converted,
    "LEAD_LOST": handle_lead_lost,
    "PATIENT_REGISTERED": handle_patient_registered,
    "PATIENT_DEACTIVATED": handle_patient_deactivated,
    "APPOINTMENT_CREATED": handle_appointment_created,
    "APPOINTMENT_RESCHEDULED": handle_appointment_rescheduled,
    "APPOINTMENT_COMPLETED": handle_appointment_completed,
    "APPOINTMENT_CANCELLED": handle_appointment_cancelled,
    "APPOINTMENT_MISSED": handle_appointment_missed,
    "CASE_CREATED": handle_case_created,
    "CASE_COMPLETED": handle_case_completed,
    "CASE_REOPENED": handle_case_reopened,
    "CASE_APPROVED": handle_case_approved,
    "TREATMENT_VISIT_COMPLETED": handle_visit_completed,
    "TREATMENT_COMPLETED": handle_treatment_completed,
    "PAYMENT_RECEIVED": handle_payment_received,
}
