import json
import uuid
import decimal
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_role, Role
from app.models.subscription import (
    SubscriptionPlan,
    Subscription,
    SubscriptionPayment,
    SubscriptionEvent,
    SubscriptionStatus,
    SubscriptionType,
    SubscriberType,
    PaymentMethod,
    SubscriptionEventType,
)
from app.services.subscription_access_service import compute_subscription_status

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])


# ---------------------------------------------------------------------------
# Request / response helpers
# ---------------------------------------------------------------------------

def _decimal(obj):
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    return obj


def _serialize_plan(plan: SubscriptionPlan) -> dict:
    return {
        "id": plan.id,
        "name": plan.name,
        "description": plan.description,
        "price": _decimal(plan.price),
        "currency": plan.currency,
        "duration_months": plan.duration_months,
        "max_hospitals": plan.max_hospitals,
        "max_doctors": plan.max_doctors,
        "is_active": plan.is_active,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }


def _serialize_subscription(sub: Subscription, plan: SubscriptionPlan = None, effective_status: str = None) -> dict:
    return {
        "id": sub.id,
        "subscriber_type": sub.subscriber_type,
        "subscriber_id": sub.subscriber_id,
        "plan_id": sub.plan_id,
        "plan": _serialize_plan(plan) if plan else None,
        "subscription_type": sub.subscription_type,
        "status": sub.status,
        "effective_status": effective_status or sub.status,
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "grace_period_days": sub.grace_period_days,
        "cancelled_at": sub.cancelled_at.isoformat() if sub.cancelled_at else None,
        "cancelled_by": sub.cancelled_by,
        "free_until": sub.free_until.isoformat() if sub.free_until else None,
        "free_forever": sub.free_forever,
        "free_reason": sub.free_reason,
        "free_notes": sub.free_notes,
        "notes": sub.notes,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
        "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
    }


def _serialize_payment(p: SubscriptionPayment) -> dict:
    return {
        "id": p.id,
        "subscription_id": p.subscription_id,
        "amount": _decimal(p.amount),
        "currency": p.currency,
        "payment_method": p.payment_method,
        "payment_date": p.payment_date.isoformat() if p.payment_date else None,
        "reference_number": p.reference_number,
        "notes": p.notes,
        "recorded_by": p.recorded_by,
        "provider": p.provider,
        "provider_payment_id": p.provider_payment_id,
        "provider_order_id": p.provider_order_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _serialize_event(e: SubscriptionEvent) -> dict:
    details = e.details
    if details:
        try:
            details = json.loads(details)
        except (json.JSONDecodeError, TypeError):
            pass
    return {
        "id": e.id,
        "subscription_id": e.subscription_id,
        "event_type": e.event_type,
        "previous_plan_id": e.previous_plan_id,
        "new_plan_id": e.new_plan_id,
        "previous_status": e.previous_status,
        "new_status": e.new_status,
        "performed_by": e.performed_by,
        "reason": e.reason,
        "details": details,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


async def _get_subscription_or_404(db: AsyncSession, subscription_id: str) -> Subscription:
    result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    return sub


async def _get_plan_or_404(db: AsyncSession, plan_id: str) -> SubscriptionPlan:
    result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription plan not found")
    return plan


def _create_event(
    db: AsyncSession,
    subscription_id: str,
    event_type: SubscriptionEventType,
    performed_by: str,
    previous_plan_id: str = None,
    new_plan_id: str = None,
    previous_status: str = None,
    new_status: str = None,
    reason: str = None,
    details: dict = None,
) -> SubscriptionEvent:
    event = SubscriptionEvent(
        id=str(uuid.uuid4()),
        subscription_id=subscription_id,
        event_type=event_type.value,
        previous_plan_id=previous_plan_id,
        new_plan_id=new_plan_id,
        previous_status=previous_status,
        new_status=new_status,
        performed_by=performed_by,
        reason=reason,
        details=json.dumps(details) if details else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)
    return event


# ---------------------------------------------------------------------------
# Request body schemas
# ---------------------------------------------------------------------------

class CreateSubscriptionBody(BaseModel):
    subscriber_type: SubscriberType
    subscriber_id: str
    plan_id: str
    subscription_type: SubscriptionType
    status: SubscriptionStatus = SubscriptionStatus.TRIAL
    trial_days: int = 30
    grace_period_days: int = 90
    notes: Optional[str] = None


class RecordPaymentBody(BaseModel):
    amount: decimal.Decimal
    payment_method: PaymentMethod
    payment_date: datetime
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class RenewBody(BaseModel):
    start_date: Optional[datetime] = None
    plan_id: Optional[str] = None


class ExtendBody(BaseModel):
    months: int = Field(..., ge=1)


class GrantFreeBody(BaseModel):
    plan_id: str
    free_until: Optional[datetime] = None
    free_forever: bool = False
    reason: str
    notes: Optional[str] = None


class ChangePlanBody(BaseModel):
    plan_id: str
    effective: str = Field("next_renewal", pattern="^(immediate|next_renewal)$")


class CancelBody(BaseModel):
    reason: Optional[str] = None


class ReactivateBody(BaseModel):
    plan_id: Optional[str] = None


# ---------------------------------------------------------------------------
# 0. My subscription status (any authenticated user)
# ---------------------------------------------------------------------------

@router.get("/me/status")
async def my_subscription_status(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from app.models.hospital import Hospital

    if current_user.get("role") == "SUPER_ADMIN":
        return {"subscription_status": "ACTIVE", "detail": "Super admins always have full access"}

    now = datetime.now(timezone.utc)
    sub: Optional[Subscription] = None

    # Try hospital-level subscription first
    hospital_id = current_user.get("hospital_id")
    if hospital_id:
        result = await db.execute(
            select(Subscription).where(
                and_(
                    Subscription.subscriber_type == SubscriberType.HOSPITAL.value,
                    Subscription.subscriber_id == hospital_id,
                )
            )
        )
        sub = result.scalar_one_or_none()

    # Fall back to group-level subscription
    if not sub:
        group_id = current_user.get("admin_group_id")
        if group_id:
            result = await db.execute(
                select(Subscription).where(
                    and_(
                        Subscription.subscriber_type == SubscriberType.ADMIN_GROUP.value,
                        Subscription.subscriber_id == group_id,
                    )
                )
            )
            sub = result.scalar_one_or_none()

    if not sub:
        return {"subscription_status": "ACTIVE", "detail": "No subscription record — treating as active"}

    effective = compute_subscription_status(sub, now)
    return {"subscription_status": effective.value if hasattr(effective, "value") else effective}


# ---------------------------------------------------------------------------
# 1. List all tenants with subscription status
#    Shows: Group Admins (with hospital count) + Standalone Hospitals
#    Individual hospitals under a group are NOT listed separately.
# ---------------------------------------------------------------------------

@router.get("/")
async def list_subscriptions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[SubscriptionStatus] = Query(None, alias="status"),
    subscriber_type: Optional[SubscriberType] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    from app.models.hospital import Hospital
    from app.models.admin_group import AdminGroup

    now = datetime.now(timezone.utc)

    # ── Build tenant rows ──
    # Each row: { subscriber_type, subscriber_id, name, hospital_count, has_group_subscription }
    tenant_rows: list[dict] = []

    # Groups + their hospital count
    groups_result = await db.execute(
        select(AdminGroup.id, AdminGroup.name).where(AdminGroup.is_active == True)
    )
    group_hospital_counts: dict[str, int] = {}
    group_hospital_ids: dict[str, list[str]] = {}

    # Count hospitals per group
    hosp_result = await db.execute(
        select(Hospital.admin_group_id, Hospital.id).where(Hospital.is_active == True)
    )
    for row in hosp_result.all():
        gid = row[0]
        hid = row[1]
        if gid:
            group_hospital_counts[gid] = group_hospital_counts.get(gid, 0) + 1
            group_hospital_ids.setdefault(gid, []).append(hid)

    for g in groups_result.all():
        h_count = group_hospital_counts.get(g.id, 0)
        tenant_rows.append({
            "subscriber_type": "ADMIN_GROUP",
            "subscriber_id": g.id,
            "name": g.name,
            "hospital_count": h_count,
        })

    # Standalone hospitals (no group)
    standalone_result = await db.execute(
        select(Hospital.id, Hospital.name).where(
            Hospital.is_active == True,
            Hospital.admin_group_id.is_(None),
        )
    )
    for h in standalone_result.all():
        tenant_rows.append({
            "subscriber_type": "HOSPITAL",
            "subscriber_id": h.id,
            "name": h.name,
            "hospital_count": 1,
        })

    # ── Fetch all subscriptions in one query ──
    sub_result = await db.execute(select(Subscription))
    all_subs = sub_result.scalars().all()
    sub_map: dict[tuple[str, str], Subscription] = {
        (s.subscriber_type, s.subscriber_id): s for s in all_subs
    }

    # Plans cache
    plan_ids = list({s.plan_id for s in all_subs})
    plans_map: dict[str, SubscriptionPlan] = {}
    if plan_ids:
        plans_result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id.in_(plan_ids)))
        plans_map = {p.id: p for p in plans_result.scalars().all()}

    # ── Build items ──
    items = []
    for tenant in tenant_rows:
        sub_type = tenant["subscriber_type"]
        sub_id = tenant["subscriber_id"]
        name = tenant["name"]
        hospital_count = tenant["hospital_count"]

        # Search filter
        if search and search.lower() not in (name or "").lower():
            continue

        sub = sub_map.get((sub_type, sub_id))

        if sub:
            effective = compute_subscription_status(sub, now)
            if status_filter and effective != status_filter.value:
                continue
            serialized = _serialize_subscription(sub, plans_map.get(sub.plan_id), effective)
        else:
            if status_filter:
                continue
            serialized = {
                "id": None,
                "subscriber_type": sub_type,
                "subscriber_id": sub_id,
                "plan_id": None,
                "plan": None,
                "subscription_type": None,
                "status": None,
                "effective_status": "NO_SUBSCRIPTION",
                "current_period_start": None,
                "current_period_end": None,
                "trial_ends_at": None,
                "grace_period_days": 90,
                "cancelled_at": None,
                "cancelled_by": None,
                "free_until": None,
                "free_forever": False,
                "free_reason": None,
                "free_notes": None,
                "notes": None,
                "created_at": None,
                "updated_at": None,
            }

        # Type filter
        if subscriber_type and sub_type != subscriber_type.value:
            continue

        serialized["subscriber_name"] = name
        serialized["subscriber_type"] = sub_type
        serialized["hospital_count"] = hospital_count
        items.append(serialized)

    # Sort: unassigned first, then alphabetical
    items.sort(key=lambda x: (0 if x.get("effective_status") == "NO_SUBSCRIPTION" else 1, x.get("subscriber_name") or ""))

    total = len(items)
    items = items[skip : skip + limit]

    return {"total": total, "items": items}


# ---------------------------------------------------------------------------
# 2. Dashboard stats  (must be before /{subscription_id})
# ---------------------------------------------------------------------------

@router.get("/dashboard/stats")
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    now = datetime.now(timezone.utc)

    total_active = (await db.execute(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE.value)
    )).scalar() or 0
    total_trial = (await db.execute(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.TRIAL.value)
    )).scalar() or 0
    total_past_due = (await db.execute(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.PAST_DUE.value)
    )).scalar() or 0
    total_expired = (await db.execute(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.EXPIRED.value)
    )).scalar() or 0
    total_cancelled = (await db.execute(
        select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.CANCELLED.value)
    )).scalar() or 0
    total_free = (await db.execute(
        select(func.count(Subscription.id)).where(
            Subscription.subscription_type == SubscriptionType.FREE.value
        )
    )).scalar() or 0

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Expected monthly revenue from active/trial subscriptions (plan price × count)
    expected_result = await db.execute(
        select(
            func.coalesce(func.sum(SubscriptionPlan.price), 0)
        ).join(
            Subscription, Subscription.plan_id == SubscriptionPlan.id
        ).where(
            Subscription.status.in_([SubscriptionStatus.ACTIVE.value, SubscriptionStatus.TRIAL.value])
        )
    )
    expected_revenue = _decimal(expected_result.scalar())

    # Also sum actual payments recorded this month
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(SubscriptionPayment.amount), 0)).where(
            SubscriptionPayment.payment_date >= month_start
        )
    )
    revenue_payments = _decimal(revenue_result.scalar())

    # Show expected revenue (from active subscriptions); fall back to recorded payments
    revenue_this_month = expected_revenue if expected_revenue > 0 else revenue_payments

    return {
        "total_active": total_active,
        "total_trial": total_trial,
        "total_past_due": total_past_due,
        "total_expired": total_expired,
        "total_free": total_free,
        "total_cancelled": total_cancelled,
        "revenue_this_month": revenue_this_month,
    }


# ---------------------------------------------------------------------------
# 3. List plans  (must be before /{subscription_id})
# ---------------------------------------------------------------------------

@router.get("/plans")
async def list_plans(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    query = select(SubscriptionPlan).order_by(SubscriptionPlan.created_at.desc())
    if active_only:
        query = query.where(SubscriptionPlan.is_active == True)
    result = await db.execute(query)
    plans = result.scalars().all()
    return [_serialize_plan(p) for p in plans]


# ---------------------------------------------------------------------------
# 4. Get single subscription
# ---------------------------------------------------------------------------

@router.get("/{subscription_id}")
async def get_subscription(
    subscription_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)
    now = datetime.now(timezone.utc)
    plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))).scalar_one_or_none()
    effective = compute_subscription_status(sub, now)
    return _serialize_subscription(sub, plan, effective)


# ---------------------------------------------------------------------------
# 5. Get subscription history (events)
# ---------------------------------------------------------------------------

@router.get("/{subscription_id}/history")
async def get_subscription_history(
    subscription_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    await _get_subscription_or_404(db, subscription_id)
    result = await db.execute(
        select(SubscriptionEvent)
        .where(SubscriptionEvent.subscription_id == subscription_id)
        .order_by(SubscriptionEvent.created_at.desc())
    )
    events = result.scalars().all()
    return [_serialize_event(e) for e in events]


# ---------------------------------------------------------------------------
# 6. Get payment history
# ---------------------------------------------------------------------------

@router.get("/{subscription_id}/payments")
async def get_subscription_payments(
    subscription_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    await _get_subscription_or_404(db, subscription_id)
    result = await db.execute(
        select(SubscriptionPayment)
        .where(SubscriptionPayment.subscription_id == subscription_id)
        .order_by(SubscriptionPayment.created_at.desc())
    )
    payments = result.scalars().all()
    return [_serialize_payment(p) for p in payments]


# ---------------------------------------------------------------------------
# 7. Create subscription
# ---------------------------------------------------------------------------

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: CreateSubscriptionBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    plan = await _get_plan_or_404(db, body.plan_id)

    existing = await db.execute(
        select(Subscription).where(
            and_(
                Subscription.subscriber_type == body.subscriber_type.value,
                Subscription.subscriber_id == body.subscriber_id,
            )
        )
    )
    existing_sub = existing.scalar_one_or_none()
    if existing_sub:
        eff = compute_subscription_status(existing_sub, datetime.now(timezone.utc))
        if eff in (SubscriptionStatus.ACTIVE.value, SubscriptionStatus.TRIAL.value, SubscriptionStatus.PAST_DUE.value):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An active subscription already exists for this tenant",
            )

    now = datetime.now(timezone.utc)
    sub_id = str(uuid.uuid4())

    sub = Subscription(
        id=sub_id,
        subscriber_type=body.subscriber_type.value,
        subscriber_id=body.subscriber_id,
        plan_id=body.plan_id,
        subscription_type=body.subscription_type.value,
        status=body.status.value,
        current_period_start=now,
        grace_period_days=body.grace_period_days,
        notes=body.notes,
        created_at=now,
        updated_at=now,
    )

    if body.subscription_type == SubscriptionType.TRIAL:
        sub.trial_ends_at = now + timedelta(days=body.trial_days)
        sub.current_period_end = now + timedelta(days=body.trial_days)
    else:
        sub.current_period_end = now + relativedelta(months=plan.duration_months)

    db.add(sub)
    _create_event(
        db, sub_id, SubscriptionEventType.CREATED,
        current_user["sub"],
        new_plan_id=body.plan_id,
        new_status=body.status.value,
        details={"subscriber_type": body.subscriber_type.value, "subscriber_id": body.subscriber_id},
    )
    await db.flush()

    plan_result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))
    plan_obj = plan_result.scalar_one_or_none()
    return _serialize_subscription(sub, plan_obj)


# ---------------------------------------------------------------------------
# 8. Record payment
# ---------------------------------------------------------------------------

@router.post("/{subscription_id}/record-payment", status_code=status.HTTP_201_CREATED)
async def record_payment(
    subscription_id: str,
    body: RecordPaymentBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)

    payment = SubscriptionPayment(
        id=str(uuid.uuid4()),
        subscription_id=subscription_id,
        amount=body.amount,
        currency=sub.plan_id and (await db.execute(
            select(SubscriptionPlan.currency).where(SubscriptionPlan.id == sub.plan_id)
        )).scalar() or "INR",
        payment_method=body.payment_method.value,
        payment_date=body.payment_date,
        reference_number=body.reference_number,
        notes=body.notes,
        recorded_by=current_user["sub"],
        created_at=datetime.now(timezone.utc),
    )
    db.add(payment)

    _create_event(
        db, subscription_id, SubscriptionEventType.PAYMENT_RECORDED,
        current_user["sub"],
        details={
            "amount": str(body.amount),
            "payment_method": body.payment_method.value,
            "payment_date": body.payment_date.isoformat(),
        },
    )
    await db.flush()

    return _serialize_payment(payment)


# ---------------------------------------------------------------------------
# 9. Renew subscription
# ---------------------------------------------------------------------------

@router.post("/{subscription_id}/renew")
async def renew_subscription(
    subscription_id: str,
    body: RenewBody = RenewBody(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)

    plan_id = body.plan_id or sub.plan_id
    plan = await _get_plan_or_404(db, plan_id)

    now = datetime.now(timezone.utc)
    previous_status = sub.status
    previous_plan_id = sub.plan_id

    start = body.start_date or now
    if sub.status in (SubscriptionStatus.EXPIRED.value, SubscriptionStatus.CANCELLED.value):
        start = now

    sub.plan_id = plan_id
    sub.subscription_type = SubscriptionType.PAID.value
    sub.status = SubscriptionStatus.ACTIVE.value
    sub.current_period_start = start
    sub.current_period_end = start + relativedelta(months=plan.duration_months)
    sub.trial_ends_at = None
    sub.cancelled_at = None
    sub.cancelled_by = None
    sub.updated_at = now

    _create_event(
        db, subscription_id, SubscriptionEventType.RENEWED,
        current_user["sub"],
        previous_plan_id=previous_plan_id,
        new_plan_id=plan_id,
        previous_status=previous_status,
        new_status=SubscriptionStatus.ACTIVE.value,
    )

    return _serialize_subscription(sub, plan, SubscriptionStatus.ACTIVE.value)


# ---------------------------------------------------------------------------
# 10. Extend subscription
# ---------------------------------------------------------------------------

@router.post("/{subscription_id}/extend")
async def extend_subscription(
    subscription_id: str,
    body: ExtendBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)

    now = datetime.now(timezone.utc)
    old_end = sub.current_period_end or now
    sub.current_period_end = old_end + relativedelta(months=body.months)
    sub.updated_at = now

    plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))).scalar_one_or_none()

    _create_event(
        db, subscription_id, SubscriptionEventType.EXTENDED,
        current_user["sub"],
        details={
            "previous_period_end": old_end.isoformat(),
            "new_period_end": sub.current_period_end.isoformat(),
            "months_added": body.months,
        },
    )

    return _serialize_subscription(sub, plan)


# ---------------------------------------------------------------------------
# 11. Grant free access
# ---------------------------------------------------------------------------

@router.post("/{subscription_id}/grant-free")
async def grant_free(
    subscription_id: str,
    body: GrantFreeBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)
    plan = await _get_plan_or_404(db, body.plan_id)

    now = datetime.now(timezone.utc)
    previous_status = sub.status

    sub.plan_id = body.plan_id
    sub.subscription_type = SubscriptionType.FREE.value
    sub.status = SubscriptionStatus.ACTIVE.value
    sub.free_forever = body.free_forever
    sub.free_reason = body.reason
    sub.free_notes = body.notes
    sub.current_period_start = now
    sub.updated_at = now
    sub.trial_ends_at = None
    sub.cancelled_at = None
    sub.cancelled_by = None

    if body.free_forever:
        sub.free_until = None
        sub.current_period_end = now + relativedelta(years=10)
    elif body.free_until:
        sub.free_until = body.free_until
        sub.current_period_end = body.free_until
    else:
        sub.free_until = now + relativedelta(months=plan.duration_months)
        sub.current_period_end = sub.free_until

    _create_event(
        db, subscription_id, SubscriptionEventType.FREE_GRANTED,
        current_user["sub"],
        previous_plan_id=sub.plan_id if sub.plan_id != body.plan_id else None,
        new_plan_id=body.plan_id,
        previous_status=previous_status,
        new_status=SubscriptionStatus.ACTIVE.value,
        reason=body.reason,
        details={
            "free_forever": body.free_forever,
            "free_until": sub.free_until.isoformat() if sub.free_until else None,
        },
    )

    return _serialize_subscription(sub, plan, SubscriptionStatus.ACTIVE.value)


# ---------------------------------------------------------------------------
# 12. Change plan
# ---------------------------------------------------------------------------

@router.post("/{subscription_id}/change-plan")
async def change_plan(
    subscription_id: str,
    body: ChangePlanBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)
    new_plan = await _get_plan_or_404(db, body.plan_id)

    now = datetime.now(timezone.utc)
    previous_plan_id = sub.plan_id
    previous_status = sub.status

    if body.effective == "immediate":
        sub.plan_id = body.plan_id
        sub.current_period_start = now
        sub.current_period_end = now + relativedelta(months=new_plan.duration_months)
        sub.updated_at = now

    _create_event(
        db, subscription_id, SubscriptionEventType.PLAN_CHANGED,
        current_user["sub"],
        previous_plan_id=previous_plan_id,
        new_plan_id=body.plan_id,
        previous_status=previous_status,
        new_status=previous_status,
        details={"effective": body.effective},
    )

    result_plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))).scalar_one_or_none()
    return _serialize_subscription(sub, result_plan)


# ---------------------------------------------------------------------------
# 13. Cancel subscription
# ---------------------------------------------------------------------------

@router.post("/{subscription_id}/cancel")
async def cancel_subscription(
    subscription_id: str,
    body: CancelBody = CancelBody(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)

    now = datetime.now(timezone.utc)
    previous_status = sub.status

    sub.status = SubscriptionStatus.CANCELLED.value
    sub.cancelled_at = now
    sub.cancelled_by = current_user["sub"]
    sub.updated_at = now

    plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.id == sub.plan_id))).scalar_one_or_none()

    _create_event(
        db, subscription_id, SubscriptionEventType.CANCELLED,
        current_user["sub"],
        previous_status=previous_status,
        new_status=SubscriptionStatus.CANCELLED.value,
        reason=body.reason,
    )

    return _serialize_subscription(sub, plan, SubscriptionStatus.CANCELLED.value)


# ---------------------------------------------------------------------------
# 14. Reactivate subscription
# ---------------------------------------------------------------------------

@router.post("/{subscription_id}/reactivate")
async def reactivate_subscription(
    subscription_id: str,
    body: ReactivateBody = ReactivateBody(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_role(current_user, Role.SUPER_ADMIN)

    sub = await _get_subscription_or_404(db, subscription_id)

    now = datetime.now(timezone.utc)
    previous_status = sub.status

    plan_id = body.plan_id or sub.plan_id
    plan = await _get_plan_or_404(db, plan_id)

    sub.plan_id = plan_id
    sub.status = SubscriptionStatus.ACTIVE.value
    sub.subscription_type = SubscriptionType.PAID.value
    sub.current_period_start = now
    sub.current_period_end = now + relativedelta(months=plan.duration_months)
    sub.cancelled_at = None
    sub.cancelled_by = None
    sub.updated_at = now

    _create_event(
        db, subscription_id, SubscriptionEventType.REACTIVATED,
        current_user["sub"],
        previous_status=previous_status,
        new_status=SubscriptionStatus.ACTIVE.value,
        new_plan_id=plan_id,
    )

    return _serialize_subscription(sub, plan, SubscriptionStatus.ACTIVE.value)
