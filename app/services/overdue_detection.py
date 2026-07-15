import logging
from datetime import date, timedelta
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.case import Case
from app.models.patient import Patient

logger = logging.getLogger(__name__)

WAITING_PATIENT_OVERDUE_DAYS = 7
WAITING_LAB_OVERDUE_DAYS = 5


async def check_overdue_treatments():
    from app.database import async_session_factory
    from app.services.crm_rule_engine import CRMRuleEngine
    from app.services.treatment_notification import (
        notify_treatment_overdue, notify_waiting_patient_expired, notify_waiting_lab_expired,
    )

    async with async_session_factory() as db:
        today = date.today()

        # 1. Mark treatments past expected_completion_date as OVERDUE
        q_overdue = select(TreatmentPlan).where(
            TreatmentPlan.expected_completion_date < today,
            TreatmentPlan.status.in_([
                TreatmentPlanStatus.IN_PROGRESS,
                TreatmentPlanStatus.SCHEDULED,
                TreatmentPlanStatus.ASSIGNED,
                TreatmentPlanStatus.GENERATED,
            ]),
            TreatmentPlan.is_active == True,
        )
        result = await db.execute(q_overdue)
        overdue_plans = result.scalars().all()
        crm_engine = CRMRuleEngine(db)
        for plan in overdue_plans:
            plan.status = TreatmentPlanStatus.OVERDUE
            plan.overdue_reason = plan.overdue_reason or "Auto-detected: past expected completion date"
            plan.overdue_delay_type = plan.overdue_delay_type or "Other"
            await crm_engine.on_treatment_overdue(plan.id, plan.overdue_reason, plan.overdue_delay_type)
            try:
                days_overdue = (today - plan.expected_completion_date).days if plan.expected_completion_date else 1
                await notify_treatment_overdue(db, plan, days_overdue)
            except Exception as e:
                logger.warning("Overdue notification failed for %s: %s", plan.id, e)
            logger.info("Overdue detection: marked plan %s as OVERDUE (was due %s)", plan.id, plan.expected_completion_date)

        # 2. Check WAITING_PATIENT > 7 days → CRM task + notification
        wp_cutoff = today - timedelta(days=WAITING_PATIENT_OVERDUE_DAYS)
        q_wp = select(TreatmentPlan).where(
            TreatmentPlan.status == TreatmentPlanStatus.WAITING_PATIENT,
            TreatmentPlan.updated_at < wp_cutoff,
            TreatmentPlan.is_active == True,
        )
        result = await db.execute(q_wp)
        wp_plans = result.scalars().all()
        for plan in wp_plans:
            await crm_engine.on_waiting_patient(plan.id)
            try:
                days_waiting = (today - plan.updated_at.date()).days if plan.updated_at else WAITING_PATIENT_OVERDUE_DAYS
                await notify_waiting_patient_expired(db, plan, days_waiting)
            except Exception as e:
                logger.warning("Waiting patient notification failed for %s: %s", plan.id, e)
            logger.info("Overdue detection: waiting patient task for plan %s (since %s)", plan.id, plan.updated_at)

        # 3. Check WAITING_LAB > 5 days → CRM task + notification
        wl_cutoff = today - timedelta(days=WAITING_LAB_OVERDUE_DAYS)
        q_wl = select(TreatmentPlan).where(
            TreatmentPlan.status == TreatmentPlanStatus.WAITING_LAB,
            TreatmentPlan.updated_at < wl_cutoff,
            TreatmentPlan.is_active == True,
        )
        result = await db.execute(q_wl)
        wl_plans = result.scalars().all()
        for plan in wl_plans:
            await crm_engine.on_waiting_lab(plan.id)
            try:
                days_waiting = (today - plan.updated_at.date()).days if plan.updated_at else WAITING_LAB_OVERDUE_DAYS
                await notify_waiting_lab_expired(db, plan, days_waiting)
            except Exception as e:
                logger.warning("Waiting lab notification failed for %s: %s", plan.id, e)
            logger.info("Overdue detection: waiting lab task for plan %s (since %s)", plan.id, plan.updated_at)

        await db.commit()
        total = len(overdue_plans) + len(wp_plans) + len(wl_plans)
        if total > 0:
            logger.info("Overdue detection complete: %d plans processed", total)
