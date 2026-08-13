import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.billing import Billing, PaymentStatus
from app.models.billing_item import BillingItem
from app.models.case import Case
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.treatment_sitting import TreatmentSitting

logger = logging.getLogger(__name__)

_CANCELLED = PaymentStatus.CANCELLED


def _active(billings: list) -> list:
    return [b for b in billings if b.payment_status != _CANCELLED]


def _net_cost(p) -> float:
    """Treatment plan cost after any discount (edit-in-place, no compounding)."""
    return max(0.0, float(p.cost or 0) - float(getattr(p, "discount_amount", None) or 0))


class BillingSyncService:
    """Keeps every financial summary (case, treatment plan, treatment sitting,
    patient) consistent with the invoices/payments. Billing is the single source
    of truth: every billing operation recomputes the downstream figures here."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _load_case_billings(self, case_id: str) -> list:
        r = await self.db.execute(select(Billing).where(Billing.case_id == case_id))
        return list(r.scalars().all())

    async def _sync_item_payments(self, billing: Billing):
        total = float(billing.total_amount or 0)
        paid = float(billing.paid_amount or 0)
        for item in billing.items or []:
            if total > 0:
                share = float(item.net_amount or 0) / total
                item_paid = round(paid * share, 2)
            else:
                item_paid = 0.0
            item.paid_amount = item_paid
            item.pending_amount = round(float(item.net_amount or 0) - item_paid, 2)

    async def _billed_by_plan(self, case_id: str, active_billings: list) -> dict:
        """Total invoice (net) amount attributed to each treatment plan.

        Uses the same attribution as _sync_plans (line items by plan, plan-level
        billings, generic case billings split proportionally by cost).
        """
        billed: dict = {}
        if not active_billings:
            return billed
        rows = await self.db.execute(
            select(TreatmentPlan).where(TreatmentPlan.case_id == case_id)
        )
        plan_rows = rows.scalars().all()
        total_cost = sum(_net_cost(p) for p in plan_rows) or 0
        for b in active_billings:
            if b.items:
                for item in b.items:
                    if item.treatment_plan_id:
                        billed[item.treatment_plan_id] = billed.get(item.treatment_plan_id, 0.0) + float(item.net_amount or 0)
            elif b.treatment_plan_id:
                billed[b.treatment_plan_id] = billed.get(b.treatment_plan_id, 0.0) + float(b.total_amount or 0)
            else:
                generic = float(b.total_amount or 0)
                if generic and total_cost > 0:
                    for p in plan_rows:
                        billed[p.id] = billed.get(p.id, 0.0) + generic * _net_cost(p) / total_cost
        return billed

    async def _sync_plans(self, case_id: str, billings: list):
        r = await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.case_id == case_id))
        plans = list(r.scalars().all())
        if not plans:
            return
        active = _active(billings)
        total_gross = sum(float(p.cost or 0) for p in plans) or 0
        # Case-level discount (generic billings with no plan/item attribution) is
        # allocated to the plans proportionally by gross cost, so a plan's net
        # cost and pending amount reflect the discount given on the invoice
        # (e.g. a 5% discount on the total billing must not surface as a
        # phantom outstanding balance on the completed treatment).
        generic_discount = sum(
            float(b.discount_amount or 0)
            for b in active
            if not b.treatment_plan_id and not (b.items or [])
        )
        for plan in plans:
            attr = 0.0
            for b in active:
                if b.items:
                    for item in b.items:
                        if item.treatment_plan_id == plan.id:
                            attr += float(item.discount_amount or 0)
                elif b.treatment_plan_id == plan.id:
                    attr += float(b.discount_amount or 0)
            if generic_discount and total_gross > 0:
                attr += generic_discount * float(plan.cost or 0) / total_gross
            if attr > 0:
                plan.discount_amount = round(attr, 2)
                plan.discount_percent = round(attr / float(plan.cost or 0) * 100, 2) if plan.cost else 0.0
                plan.original_amount = float(plan.cost or 0)
                plan.discount_type = "PERCENTAGE"
        total_cost = sum(_net_cost(p) for p in plans) or 0
        for plan in plans:
            direct = 0.0
            for b in active:
                if b.items:
                    for item in b.items:
                        if item.treatment_plan_id == plan.id:
                            direct += float(item.paid_amount or 0)
                elif b.treatment_plan_id == plan.id:
                    direct += float(b.paid_amount or 0)
            plan_paid = direct
            if not direct and total_cost > 0:
                generic = sum(
                    float(b.paid_amount or 0)
                    for b in active
                    if not b.treatment_plan_id and not (b.items or [])
                )
                if generic:
                    plan_paid = round(generic * _net_cost(plan) / total_cost, 2)
            plan.paid_amount = round(plan_paid, 2)

    async def _sync_sittings(self, case_id: str, billings: list):
        plan_ids = [
            row[0]
            for row in (await self.db.execute(select(TreatmentPlan.id).where(TreatmentPlan.case_id == case_id))).all()
        ]
        if not plan_ids:
            return
        r = await self.db.execute(select(TreatmentSitting).where(TreatmentSitting.treatment_plan_id.in_(plan_ids)))
        sittings = list(r.scalars().all())
        if not sittings:
            return
        active = _active(billings)
        sitting_items: dict = {}
        for b in active:
            for item in b.items or []:
                if item.treatment_sitting_id:
                    sitting_items.setdefault(item.treatment_sitting_id, []).append(item)
        for sitting in sittings:
            items = sitting_items.get(sitting.id) or []
            paid = sum(float(it.paid_amount or 0) for it in items)
            sitting.paid_amount = round(paid, 2)
            sitting.invoice_status = "INVOICED" if items else "NOT_INVOICED"
            if items:
                sitting.charge = max(float(it.unit_price or 0) for it in items)

    async def _sync_case(self, case_id: str, billings: list):
        case = await self.db.get(Case, case_id)
        if not case:
            return
        active = _active(billings)
        total_billed = round(sum(float(b.total_amount or 0) for b in active), 2)
        total_paid = round(sum(float(b.paid_amount or 0) for b in active), 2)
        # Completed treatments with ₹0 paid / no invoice must still count as
        # outstanding: add the portion of completed plans that invoices have
        # not already billed for.
        billed_by_plan = await self._billed_by_plan(case_id, active)
        uncovered_completed = 0.0
        r = await self.db.execute(
            select(TreatmentPlan).where(
                TreatmentPlan.case_id == case_id,
                TreatmentPlan.is_active == True,
                TreatmentPlan.status == TreatmentPlanStatus.COMPLETED,
            )
        )
        for p in r.scalars().all():
            covered = billed_by_plan.get(p.id, 0.0)
            uncovered_completed += max(0.0, _net_cost(p) - covered)
        outstanding = round(total_billed - total_paid + uncovered_completed, 2)
        if not active and uncovered_completed <= 0:
            payment_status = "NO_BILLING"
        elif outstanding <= 0:
            payment_status = "PAID"
        elif total_paid > 0:
            payment_status = "PARTIAL"
        else:
            payment_status = "UNPAID"
        r = await self.db.execute(select(TreatmentPlan).where(TreatmentPlan.case_id == case_id, TreatmentPlan.is_active == True))
        plans = list(r.scalars().all())
        estimated = sum(float(p.cost or 0) for p in plans)
        case.estimated_cost = round(estimated, 2) if plans else round(float(case.treatment_plan_estimated_cost or 0), 2)
        case.total_billed = total_billed
        case.total_paid = total_paid
        case.outstanding_balance = outstanding
        case.payment_status = payment_status

    async def sync_billing(self, billing: Billing):
        """Recompute all downstream financial figures for a single billing."""
        try:
            await self._sync_item_payments(billing)
            if billing.case_id:
                billings = await self._load_case_billings(billing.case_id)
                await self._sync_plans(billing.case_id, billings)
                await self._sync_sittings(billing.case_id, billings)
                await self._sync_case(billing.case_id, billings)
            await self.db.flush()
        except Exception as e:
            logger.exception("BILLING_SYNC failed for %s: %s", billing.id, e)
            raise

    async def sync_case(self, case_id: str):
        billings = await self._load_case_billings(case_id)
        await self._sync_plans(case_id, billings)
        await self._sync_sittings(case_id, billings)
        await self._sync_case(case_id, billings)
        await self.db.flush()

    async def get_patient_summary(self, patient_id: str) -> dict:
        """Aggregate financial summary for a patient across all their cases."""
        case_rows = await self.db.execute(select(Case.id, Case.outstanding_balance, Case.total_billed, Case.total_paid, Case.payment_status).where(Case.patient_id == patient_id))
        total_billed = total_paid = outstanding = 0.0
        for cid, ob, tb, tp, ps in case_rows.all():
            total_billed += float(tb or 0)
            total_paid += float(tp or 0)
            outstanding += float(ob or 0)
        return {
            "total_billed": round(total_billed, 2),
            "total_paid": round(total_paid, 2),
            "outstanding_balance": round(outstanding, 2),
            "payment_status": "NO_BILLING" if (total_billed == 0 and outstanding <= 0) else ("PAID" if outstanding <= 0 else "PARTIAL" if total_paid > 0 else "UNPAID"),
        }
