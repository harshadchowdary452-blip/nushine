import math
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.inventory_transaction import InventoryTransaction, InventoryTransactionType
from app.models.inventory_master import InventoryMaster
from app.models.hospital_inventory import HospitalInventory
from app.config import settings

OUTFLOW_TYPES = {
    InventoryTransactionType.CONSUMPTION,
    InventoryTransactionType.DAMAGE,
    InventoryTransactionType.EXPIRY,
    InventoryTransactionType.TRANSFER_OUT,
    InventoryTransactionType.RETURN,
}

CONSUMPTION_WINDOW_MONTHS = 3
MIN_DATA_MONTHS = 2
MIN_OUTFLOW_TRANSACTIONS = 2
DAYS_PER_MONTH = 30.0

TREND_INCREASING = "Increasing"
TREND_STABLE = "Stable"
TREND_DECREASING = "Decreasing"

STATUS_OUT_OF_STOCK = "Out of Stock"
STATUS_CRITICAL = "Critical"
STATUS_LOW = "Low"
STATUS_HEALTHY = "Healthy"


def warehouse_unit_price(item: InventoryMaster) -> float:
    base = float(item.average_cost or 0) or float(item.purchase_price or 0)
    if base > 0 and settings.WAREHOUSE_NOMINAL_PRICE_MULTIPLIER > 0:
        return base * settings.WAREHOUSE_NOMINAL_PRICE_MULTIPLIER
    return base


def warehouse_margin(unit_price: float) -> float:
    return unit_price * (settings.WAREHOUSE_MARGIN_PCT / 100.0)


def status_for(current_stock: float, minimum_stock: float) -> str:
    if current_stock <= 0:
        return STATUS_OUT_OF_STOCK
    if minimum_stock <= 0:
        return STATUS_HEALTHY
    if current_stock <= minimum_stock * 0.5:
        return STATUS_CRITICAL
    if current_stock <= minimum_stock:
        return STATUS_LOW
    return STATUS_HEALTHY


def remaining_days(current_stock: float, avg_monthly_usage: float) -> Optional[float]:
    if avg_monthly_usage <= 0:
        return None
    daily = avg_monthly_usage / DAYS_PER_MONTH
    if daily <= 0:
        return None
    return round(current_stock / daily, 1)


def trend_for(monthly_sums: List[float]) -> str:
    """Trend over a list of per-month outflows (oldest -> newest)."""
    if len(monthly_sums) < 2:
        return TREND_STABLE
    mid = len(monthly_sums) // 2
    earlier = [v for v in monthly_sums[:mid] if v is not None]
    recent = [v for v in monthly_sums[mid:] if v is not None]
    if not earlier or not recent:
        return TREND_STABLE
    avg_earlier = sum(earlier) / len(earlier)
    avg_recent = sum(recent) / len(recent)
    if avg_earlier <= 0:
        return TREND_STABLE
    change = (avg_recent - avg_earlier) / avg_earlier
    if change > 0.15:
        return TREND_INCREASING
    if change < -0.15:
        return TREND_DECREASING
    return TREND_STABLE


def suggest_quantity(
    current_stock: float,
    minimum_stock: float,
    avg_monthly_usage: float,
    days_of_coverage: float = DAYS_PER_MONTH,
    trend: str = TREND_STABLE,
) -> float:
    """Days-of-coverage based suggestion with a modest trend adjustment.

    Never drops below (minimum_stock - current_stock) and never below 0.
    """
    base_target = (days_of_coverage / DAYS_PER_MONTH) * max(avg_monthly_usage, 0)
    if trend == TREND_INCREASING:
        base_target *= 1.10
    elif trend == TREND_DECREASING:
        base_target *= 0.90
    target = max(base_target, minimum_stock)
    floor = max(minimum_stock - current_stock, 0)
    return round(max(target - current_stock, floor), 2)


async def monthly_usage_summary(
    db: AsyncSession,
    hospital_id: str,
    item_id: str,
    as_of: Optional[datetime] = None,
) -> Dict:
    """3-month outflow summary with fallback to the item's initial estimate.

    Returns consumption, avg usage (with source), outflow count, and months.
    """
    as_of = as_of or datetime.now(timezone.utc)
    window_start = as_of - timedelta(days=CONSUMPTION_WINDOW_MONTHS * 30)
    outflow_values = [t.value for t in OUTFLOW_TYPES]
    q = select(
        InventoryTransaction.transaction_date,
        func.abs(InventoryTransaction.quantity).label("qty"),
    ).where(
        InventoryTransaction.hospital_id == hospital_id,
        InventoryTransaction.item_id == item_id,
        InventoryTransaction.transaction_type.in_(outflow_values),
        InventoryTransaction.transaction_date >= window_start,
    )
    rows = (await db.execute(q)).all()

    consumption = 0.0
    count = 0
    first_date = None
    last_date = None
    for r in rows:
        qty = float(r.qty or 0)
        consumption += qty
        count += 1
        d = r.transaction_date
        if first_date is None or (d and d < first_date):
            first_date = d
        if last_date is None or (d and d > last_date):
            last_date = d

    item = await db.get(InventoryMaster, item_id)
    fallback = float(item.initial_estimated_monthly_usage or 0) if item else 0.0

    span_months = 0.0
    if first_date and last_date:
        span_months = max(1.0, (last_date - first_date).total_seconds() / (60 * 60 * 24) / DAYS_PER_MONTH)
    elif count:
        span_months = 1.0

    use_fallback = count < MIN_OUTFLOW_TRANSACTIONS or span_months < MIN_DATA_MONTHS
    if use_fallback:
        avg_usage = fallback
        source = "estimated"
    else:
        avg_usage = round(consumption / min(span_months, CONSUMPTION_WINDOW_MONTHS), 2)
        source = "calculated"

    return {
        "consumption": round(consumption, 2),
        "avg_monthly_usage": avg_usage,
        "usage_source": source,
        "outflow_transactions": count,
        "span_months": round(span_months, 1),
        "fallback_estimate": fallback,
        "first_outflow_date": first_date,
        "last_outflow_date": last_date,
    }


async def item_insights(
    db: AsyncSession,
    hospital_id: str,
    item_id: str,
) -> Dict:
    """Deterministic insights payload for the item detail drawer."""
    usage = await monthly_usage_summary(db, hospital_id, item_id)
    row = (
        await db.execute(
            select(HospitalInventory)
            .where(HospitalInventory.hospital_id == hospital_id, HospitalInventory.item_id == item_id)
        )
    ).scalar_one_or_none()
    item = await db.get(InventoryMaster, item_id)

    current_stock = float(row.quantity or 0) if row else 0.0
    minimum_stock = float(row.minimum_stock or 0) if row and row.minimum_stock is not None else (float(item.minimum_stock or 0) if item else 0.0)
    avg_usage = usage["avg_monthly_usage"]
    status = status_for(current_stock, minimum_stock)
    days = remaining_days(current_stock, avg_usage)

    monthly_sums = await _monthly_sums(db, hospital_id, item_id)
    trend = trend_for(monthly_sums)

    suggested = suggest_quantity(current_stock, minimum_stock, avg_usage, trend=trend)
    unit_price = warehouse_unit_price(item) if item else 0.0

    messages = []
    if status == STATUS_OUT_OF_STOCK:
        messages.append("Item is out of stock at this hospital.")
    elif status == STATUS_CRITICAL:
        messages.append(f"Stock is critical — {minimum_stock - current_stock:.2f} {item.unit if item else ''} below minimum.")
    elif status == STATUS_LOW:
        messages.append("Stock is below the minimum level.")
    else:
        messages.append("Stock is above the minimum level.")
    if days is not None:
        if days <= 7:
            messages.append(f"Runs out in ~{days} days at current usage.")
        elif days <= 30:
            messages.append(f"Covers ~{days} days at current usage.")
        else:
            messages.append(f"Healthy coverage of ~{days} days at current usage.")
    if usage["usage_source"] == "estimated":
        messages.append("Usage estimate is based on the initial estimate (insufficient consumption history).")
    else:
        messages.append(f"Avg monthly usage {avg_usage:.2f} from {usage['outflow_transactions']} outflow records over ~{usage['span_months']} months.")
    if trend == TREND_INCREASING:
        messages.append("Consumption is trending upward — consider a higher order quantity.")
    elif trend == TREND_DECREASING:
        messages.append("Consumption is trending downward — a lower order quantity may suffice.")

    return {
        "item_id": item_id,
        "hospital_id": hospital_id,
        "current_stock": current_stock,
        "minimum_stock": minimum_stock,
        "avg_monthly_usage": avg_usage,
        "usage_source": usage["usage_source"],
        "remaining_days": days,
        "status": status,
        "trend": trend,
        "suggested_quantity": suggested,
        "estimated_cost": round(suggested * unit_price, 2),
        "monthly_consumption": usage["consumption"],
        "monthly_outflows": [
            {"month": m, "quantity": q}
            for m, q in zip(_month_labels(), monthly_sums)
        ],
        "messages": messages,
    }


async def _monthly_sums(db: AsyncSession, hospital_id: str, item_id: str, months: int = CONSUMPTION_WINDOW_MONTHS) -> List[float]:
    """Per-month outflow totals, oldest -> newest, over the last `months` months."""
    today = datetime.now(timezone.utc)
    buckets: List[float] = []
    for i in range(months - 1, -1, -1):
        month = (today.year, today.month - i)
        y, m = month
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end = datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=timezone.utc)
        outflow_values = [t.value for t in OUTFLOW_TYPES]
        q = select(
            func.coalesce(func.sum(func.abs(InventoryTransaction.quantity)), 0),
        ).where(
            InventoryTransaction.hospital_id == hospital_id,
            InventoryTransaction.item_id == item_id,
            InventoryTransaction.transaction_type.in_(outflow_values),
            InventoryTransaction.transaction_date >= start,
            InventoryTransaction.transaction_date < end,
        )
        total = (await db.execute(q)).scalar_one()
        buckets.append(float(total or 0))
    return buckets


def _month_labels(months: int = CONSUMPTION_WINDOW_MONTHS) -> List[str]:
    today = datetime.now(timezone.utc)
    labels = []
    for i in range(months - 1, -1, -1):
        y = today.year
        m = today.month - i
        while m <= 0:
            m += 12
            y -= 1
        labels.append(f"{y:04d}-{m:02d}")
    return labels


async def stock_insights(
    db: AsyncSession,
    hospital_id: str,
    item_ids: Optional[List[str]] = None,
) -> List[Dict]:
    """Insights for every stocked item at a hospital (optionally filtered)."""
    q = select(HospitalInventory).where(HospitalInventory.hospital_id == hospital_id)
    if item_ids:
        q = q.where(HospitalInventory.item_id.in_(item_ids))
    rows = (await db.execute(q)).scalars().all()
    results = []
    for row in rows:
        results.append(await item_insights(db, hospital_id, row.item_id))
    return results


async def transfer_suggestions(
    db: AsyncSession,
    hospital_ids: List[str],
    item_ids: Optional[List[str]] = None,
    days_of_coverage: float = DAYS_PER_MONTH,
) -> List[Dict]:
    """Non-destructive stock transfer suggestions across hospitals.

    A hospital with surplus (current > suggested target) is paired with a
    hospital running short (current < minimum). No stock is ever modified.
    """
    if not hospital_ids:
        return []
    q = select(HospitalInventory).where(HospitalInventory.hospital_id.in_(hospital_ids))
    if item_ids:
        q = q.where(HospitalInventory.item_id.in_(item_ids))
    rows = (await db.execute(q)).scalars().all()

    by_item: Dict[str, List[HospitalInventory]] = {}
    for row in rows:
        by_item.setdefault(row.item_id, []).append(row)

    suggestions = []
    for item_id, stock_rows in by_item.items():
        deficits = []
        surpluses = []
        for sr in stock_rows:
            current = float(sr.quantity or 0)
            minimum = float(sr.minimum_stock or 0) if sr.minimum_stock is not None else 0.0
            usage = (await monthly_usage_summary(db, sr.hospital_id, item_id))["avg_monthly_usage"]
            target = (days_of_coverage / DAYS_PER_MONTH) * max(usage, 0)
            target = max(target, minimum)
            if current < minimum:
                deficits.append((sr.hospital_id, minimum - current))
            elif current > target:
                surpluses.append((sr.hospital_id, current - target))

        item = await db.get(InventoryMaster, item_id)
        item_name = item.name if item else item_id
        unit = item.unit if item else ""

        for from_hid, surplus in surpluses:
            for to_hid, deficit in deficits:
                qty = min(surplus, deficit)
                if qty <= 0:
                    continue
                suggestions.append({
                    "item_id": item_id,
                    "item_name": item_name,
                    "unit": unit,
                    "from_hospital_id": from_hid,
                    "to_hospital_id": to_hid,
                    "suggested_quantity": round(qty, 2),
                })
                deficit -= qty
                if deficit <= 0:
                    break

    suggestions.sort(key=lambda s: (s["item_name"].lower(), s["from_hospital_id"], s["to_hospital_id"]))
    return suggestions
