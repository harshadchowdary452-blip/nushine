"""Centralized subscription access service.

Resolves tenant subscriptions, computes current state, and determines
read/write access based on subscription status and dates.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.subscription import (
    Subscription, SubscriptionPlan, SubscriptionStatus, SubscriptionType, SubscriberType,
)

logger = logging.getLogger(__name__)


@dataclass
class TenantSubscriptionInfo:
    """Computed subscription state for a tenant."""
    has_subscription: bool = False
    subscription_id: Optional[str] = None
    status: Optional[str] = None
    plan_name: Optional[str] = None
    is_read_only: bool = False
    is_expired: bool = False
    current_period_end: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    grace_period_days: int = 90
    days_until_expiry: Optional[int] = None
    free_forever: bool = False
    subscriber_type: Optional[str] = None
    subscriber_id: Optional[str] = None


def compute_subscription_status(sub: Subscription, now: datetime) -> str:
    """Compute the effective status of a subscription based on current time.

    This is the single source of truth for subscription state derivation.
    """
    if sub.status == SubscriptionStatus.CANCELLED.value:
        return SubscriptionStatus.CANCELLED.value

    if sub.status == SubscriptionStatus.EXPIRED.value:
        return SubscriptionStatus.EXPIRED.value

    # Free forever → always active
    if sub.free_forever:
        return SubscriptionStatus.ACTIVE.value

    # Free with end date
    if sub.subscription_type == SubscriptionType.FREE.value and sub.free_until:
        if now > sub.free_until:
            # Free period ended — check grace
            return _check_grace_or_expired(sub, now)
        return SubscriptionStatus.ACTIVE.value

    # Trial
    if sub.status == SubscriptionStatus.TRIAL.value:
        if sub.trial_ends_at and now > sub.trial_ends_at:
            return _check_grace_or_expired(sub, now)
        return SubscriptionStatus.TRIAL.value

    # Active — check period end
    if sub.status in (SubscriptionStatus.ACTIVE.value, SubscriptionStatus.PAST_DUE.value):
        if sub.current_period_end and now > sub.current_period_end:
            return _check_grace_or_expired(sub, now)
        return SubscriptionStatus.ACTIVE.value

    return sub.status


def _check_grace_or_expired(sub: Subscription, now: datetime) -> str:
    """Check if a tenant is within grace period or fully expired."""
    if sub.current_period_end:
        grace_end = sub.current_period_end + timedelta(days=sub.grace_period_days)
        if now <= grace_end:
            return SubscriptionStatus.PAST_DUE.value
    return SubscriptionStatus.EXPIRED.value


def is_read_only(status: str) -> bool:
    """Whether the given status implies read-only access."""
    return status == SubscriptionStatus.PAST_DUE.value


def is_access_blocked(status: str) -> bool:
    """Whether the given status blocks all application access."""
    return status == SubscriptionStatus.EXPIRED.value


async def resolve_tenant_subscription(
    db: AsyncSession,
    subscriber_type: str,
    subscriber_id: str,
) -> TenantSubscriptionInfo:
    """Resolve and compute subscription state for a tenant.

    This is the main entry point for checking any tenant's subscription.
    """
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(Subscription).where(
            and_(
                Subscription.subscriber_type == subscriber_type,
                Subscription.subscriber_id == subscriber_id,
            )
        ).order_by(Subscription.created_at.desc())
    )
    sub = result.scalar_one_or_none()

    if not sub:
        # No subscription at all — read-only until super admin assigns one
        return TenantSubscriptionInfo(
            has_subscription=False,
            is_read_only=True,
            is_expired=False,
        )

    effective_status = compute_subscription_status(sub, now)
    read_only = is_read_only(effective_status)
    blocked = is_access_blocked(effective_status)

    days_until_expiry = None
    if sub.current_period_end:
        delta = sub.current_period_end - now
        days_until_expiry = delta.days

    plan_name = None
    if sub.plan_id:
        plan_result = await db.execute(
            select(SubscriptionPlan.name).where(SubscriptionPlan.id == sub.plan_id)
        )
        plan_name = plan_result.scalar_one_or_none()

    return TenantSubscriptionInfo(
        has_subscription=True,
        subscription_id=sub.id,
        status=effective_status,
        plan_name=plan_name,
        is_read_only=read_only,
        is_expired=blocked,
        current_period_end=sub.current_period_end,
        trial_ends_at=sub.trial_ends_at,
        grace_period_days=sub.grace_period_days,
        days_until_expiry=days_until_expiry,
        free_forever=sub.free_forever,
        subscriber_type=sub.subscriber_type,
        subscriber_id=sub.subscriber_id,
    )
