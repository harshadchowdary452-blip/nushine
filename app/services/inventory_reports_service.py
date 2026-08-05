import math
from datetime import datetime, timezone
from typing import Dict, List, Optional
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.models.hospital import Hospital
from app.models.inventory_master import InventoryMaster
from app.models.inventory_category import InventoryCategory
from app.models.inventory_transaction import InventoryTransaction
from app.models.hospital_inventory import HospitalInventory
from app.models.supplier import Supplier
from app.models.monthly_order import MonthlyOrder, MonthlyOrderItem
from app.core.permissions import Role
from app.services.inventory_calculation_service import (
    monthly_usage_summary, status_for, remaining_days, trend_for, _monthly_sums,
)

REPORT_TYPES = {
    "current_stock": "Current Stock",
    "stock_status": "Stock Status",
    "items": "Items List",
    "transactions": "Transaction History",
    "usage": "Monthly Usage",
    "orders": "Monthly Orders",
    "procurement": "Monthly Procurement Summary",
    "consolidated": "Group Consolidated Order",
}

INVENTORY_HEADERS = {
    "current_stock": ["Hospital", "Item", "Code", "Category", "Unit", "Quantity", "Minimum", "Reorder Level", "Critical Level", "Location"],
    "stock_status": ["Hospital", "Item", "Category", "Current Stock", "Minimum", "Avg Monthly Usage", "Remaining Days", "Status", "Trend"],
    "items": ["Item", "Code", "Category", "Brand", "Manufacturer", "Preferred Supplier", "Unit", "Purchase Price", "Average Cost", "Minimum", "Reorder", "Critical", "Maximum", "Status"],
    "transactions": ["Date", "Hospital", "Item", "Code", "Type", "Previous Balance", "Quantity", "Current Balance", "Batch", "Reference", "Remarks"],
    "usage": ["Hospital", "Item", "Code", "Consumption (3 mo)", "Avg Monthly Usage", "Usage Source", "Outflow Records", "Span (months)", "Trend"],
    "orders": ["Period", "Hospital", "Status", "Items", "Est. Cost", "Submitted", "Reviewed", "Approved", "Ordered", "Completed"],
    "procurement": ["Period", "Hospital", "Order Status", "Item", "Unit", "Current Stock", "Required Qty", "Unit Cost", "Est. Cost", "Preferred Supplier"],
    "consolidated": ["Period", "Item", "Unit", "Total Required", "Est. Cost"],
}


async def _scope_hospital_ids(db: AsyncSession, current_user: dict) -> Optional[List[str]]:
    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        return None
    if role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if not agid:
            return []
        return [row[0] for row in (await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))).all()]
    hid = current_user.get("hospital_id")
    return [hid] if hid else []


async def build_report(
    db: AsyncSession,
    current_user: dict,
    report_type: str,
    hospital_id: Optional[str] = None,
    category_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    order_period: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict:
    if report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown report type: {report_type}")

    hospital_ids = await _scope_hospital_ids(db, current_user)
    if hospital_id:
        hospital_ids = [hospital_id]

    if report_type == "consolidated":
        headers, rows = await _report_consolidated(db, hospital_ids, order_period)
    else:
        headers = INVENTORY_HEADERS[report_type]
        if report_type == "current_stock":
            rows = await _report_current_stock(db, hospital_ids, category_id, supplier_id)
        elif report_type == "stock_status":
            rows = await _report_stock_status(db, hospital_ids, category_id, supplier_id)
        elif report_type == "items":
            rows = await _report_items(db, hospital_ids, category_id, supplier_id)
        elif report_type == "transactions":
            rows = await _report_transactions(db, hospital_ids, date_from, date_to)
        elif report_type == "usage":
            rows = await _report_usage(db, hospital_ids, category_id, supplier_id)
        elif report_type == "orders":
            rows = await _report_orders(db, hospital_ids, status, order_period)
        elif report_type == "procurement":
            rows = await _report_procurement(db, hospital_ids, status, order_period)
        else:
            rows = []

    if search:
        term = search.strip().lower()
        if term:
            rows = [r for r in rows if any(term in str(c).lower() for c in r)]

    return {
        "report_type": report_type,
        "report_label": REPORT_TYPES[report_type],
        "headers": headers,
        "rows": rows,
        "summary": _report_summary(report_type, rows, headers),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "row_count": len(rows),
    }


def _report_summary(report_type: str, rows: List[List], headers: Optional[List[str]] = None) -> List[Dict]:
    """Small label/value block rendered at the bottom of exports."""
    if report_type in ("orders", "procurement", "consolidated"):
        hs = headers or INVENTORY_HEADERS[report_type]
        cost_idx = hs.index("Est. Cost")
        total_cost = round(sum(float(r[cost_idx] or 0) for r in rows), 2)
        return [{"label": "Total Est. Cost", "value": f"₹ {total_cost:,.2f}"}]
    if report_type == "current_stock":
        qty_idx = INVENTORY_HEADERS[report_type].index("Quantity")
        total_qty = round(sum(float(r[qty_idx] or 0) for r in rows), 2)
        return [{"label": "Total Quantity", "value": f"{total_qty:,.2f}"}]
    if report_type == "usage":
        avg_idx = INVENTORY_HEADERS[report_type].index("Avg Monthly Usage")
        total_avg = round(sum(float(r[avg_idx] or 0) for r in rows), 2)
        return [{"label": "Total Avg Monthly Usage", "value": f"{total_avg:,.2f}"}]
    return []


async def _item_query(category_id: Optional[str] = None, supplier_id: Optional[str] = None):
    q = select(InventoryMaster)
    if category_id:
        q = q.where(InventoryMaster.category_id == category_id)
    if supplier_id:
        q = q.where(InventoryMaster.preferred_vendor_id == supplier_id)
    return q


async def _item_cache(db: AsyncSession) -> Dict[str, InventoryMaster]:
    rows = (await db.execute(select(InventoryMaster))).scalars().all()
    return {r.id: r for r in rows}


async def _hospital_cache(db: AsyncSession) -> Dict[str, str]:
    rows = (await db.execute(select(Hospital.id, Hospital.name))).all()
    return {r[0]: r[1] for r in rows}


async def _category_cache(db: AsyncSession) -> Dict[str, str]:
    rows = (await db.execute(select(InventoryCategory.id, InventoryCategory.name))).all()
    return {r[0]: r[1] for r in rows}


async def _supplier_cache(db: AsyncSession) -> Dict[str, str]:
    rows = (await db.execute(select(Supplier.id, Supplier.name))).all()
    return {r[0]: r[1] for r in rows}


async def _report_current_stock(db, hospital_ids, category_id, supplier_id) -> List[List]:
    q = select(HospitalInventory)
    if hospital_ids is not None:
        q = q.where(HospitalInventory.hospital_id.in_(hospital_ids))
    stock = (await db.execute(q)).scalars().all()

    items = await _item_cache(db)
    hospitals = await _hospital_cache(db)
    categories = await _category_cache(db)
    if category_id or supplier_id:
        ids = {i.id for i in items.values()}
        stock = [s for s in stock if s.item_id in ids]

    rows = []
    for s in stock:
        item = items.get(s.item_id)
        if category_id and item and item.category_id != category_id:
            continue
        if supplier_id and item and item.preferred_vendor_id != supplier_id:
            continue
        rows.append([
            hospitals.get(s.hospital_id, ""),
            item.name if item else "",
            item.code if item else "",
            categories.get(item.category_id, "") if item else "",
            item.unit if item else "",
            float(s.quantity or 0),
            float(s.minimum_stock or 0) if s.minimum_stock is not None else "",
            float(s.reorder_level or 0) if s.reorder_level is not None else "",
            float(s.critical_level or 0) if s.critical_level is not None else "",
            s.location or "",
        ])
    rows.sort(key=lambda r: (r[0].lower(), r[1].lower()))
    return rows


async def _report_stock_status(db, hospital_ids, category_id, supplier_id) -> List[List]:
    q = select(HospitalInventory)
    if hospital_ids is not None:
        q = q.where(HospitalInventory.hospital_id.in_(hospital_ids))
    stock = (await db.execute(q)).scalars().all()
    items = await _item_cache(db)
    hospitals = await _hospital_cache(db)
    categories = await _category_cache(db)

    rows = []
    for s in stock:
        item = items.get(s.item_id)
        if not item:
            continue
        if category_id and item.category_id != category_id:
            continue
        if supplier_id and item.preferred_vendor_id != supplier_id:
            continue
        current = float(s.quantity or 0)
        minimum = float(s.minimum_stock or 0) if s.minimum_stock is not None else float(item.minimum_stock or 0)
        usage = await monthly_usage_summary(db, s.hospital_id, s.item_id)
        avg = usage["avg_monthly_usage"]
        status_label = status_for(current, minimum)
        days = remaining_days(current, avg)
        trend = trend_for(await _monthly_sums(db, s.hospital_id, s.item_id))
        rows.append([
            hospitals.get(s.hospital_id, ""),
            item.name,
            categories.get(item.category_id, ""),
            current,
            minimum,
            avg,
            days if days is not None else "",
            status_label,
            trend,
        ])
    rows.sort(key=lambda r: (r[0].lower(), r[1].lower()))
    return rows


async def _report_items(db, hospital_ids, category_id, supplier_id) -> List[List]:
    q = await _item_query(category_id, supplier_id)
    items = (await db.execute(q)).scalars().all()
    categories = await _category_cache(db)
    suppliers = await _supplier_cache(db)
    rows = []
    for item in items:
        rows.append([
            item.name, item.code or "",
            categories.get(item.category_id, ""),
            item.brand or "", item.manufacturer or "",
            suppliers.get(item.preferred_vendor_id, ""),
            item.unit or "", float(item.purchase_price or 0), float(item.average_cost or 0),
            float(item.minimum_stock or 0), float(item.reorder_level or 0),
            float(item.critical_level or 0), float(item.maximum_stock or 0),
            item.status or "",
        ])
    rows.sort(key=lambda r: (r[0].lower(), r[1].lower()))
    return rows


async def _report_transactions(db, hospital_ids, date_from, date_to) -> List[List]:
    q = select(InventoryTransaction)
    if hospital_ids is not None:
        q = q.where(InventoryTransaction.hospital_id.in_(hospital_ids))
    if date_from:
        q = q.where(InventoryTransaction.transaction_date >= date_from)
    if date_to:
        q = q.where(InventoryTransaction.transaction_date < date_to)
    q = q.order_by(InventoryTransaction.transaction_date.desc())
    txns = (await db.execute(q)).scalars().all()
    items = await _item_cache(db)
    hospitals = await _hospital_cache(db)
    rows = []
    for t in txns:
        item = items.get(t.item_id)
        rows.append([
            t.transaction_date.strftime("%Y-%m-%d %H:%M") if t.transaction_date else "",
            hospitals.get(t.hospital_id, ""),
            item.name if item else "",
            item.code if item else "",
            t.transaction_type.value if hasattr(t.transaction_type, "value") else t.transaction_type,
            float(t.previous_balance or 0), float(t.quantity or 0), float(t.current_balance or 0),
            t.batch_number or "", t.reference_type or "", t.remarks or "",
        ])
    return rows


async def _report_usage(db, hospital_ids, category_id, supplier_id) -> List[List]:
    q = select(HospitalInventory)
    if hospital_ids is not None:
        q = q.where(HospitalInventory.hospital_id.in_(hospital_ids))
    stock = (await db.execute(q)).scalars().all()
    items = await _item_cache(db)
    hospitals = await _hospital_cache(db)
    rows = []
    for s in stock:
        item = items.get(s.item_id)
        if not item:
            continue
        if category_id and item.category_id != category_id:
            continue
        if supplier_id and item.preferred_vendor_id != supplier_id:
            continue
        usage = await monthly_usage_summary(db, s.hospital_id, s.item_id)
        trend = trend_for(await _monthly_sums(db, s.hospital_id, s.item_id))
        rows.append([
            hospitals.get(s.hospital_id, ""),
            item.name, item.code or "",
            usage["consumption"], usage["avg_monthly_usage"],
            usage["usage_source"], usage["outflow_transactions"], usage["span_months"],
            trend,
        ])
    rows.sort(key=lambda r: (r[0].lower(), r[1].lower()))
    return rows


async def _report_orders(db, hospital_ids, status_filter, order_period=None) -> List[List]:
    q = select(MonthlyOrder)
    if hospital_ids is not None:
        q = q.where(MonthlyOrder.hospital_id.in_(hospital_ids))
    if status_filter:
        q = q.where(MonthlyOrder.status == status_filter)
    if order_period:
        q = q.where(MonthlyOrder.order_period == order_period)
    q = q.order_by(MonthlyOrder.order_period.desc(), MonthlyOrder.hospital_id)
    orders = (await db.execute(q)).scalars().all()
    hospitals = await _hospital_cache(db)
    rows = []
    for o in orders:
        item_count = await db.execute(
            select(func.count(MonthlyOrderItem.id)).where(MonthlyOrderItem.order_id == o.id)
        )
        rows.append([
            o.order_period,
            hospitals.get(o.hospital_id, ""),
            o.status.value if hasattr(o.status, "value") else o.status,
            int(item_count.scalar() or 0),
            float(o.estimated_cost_total or 0),
            o.submitted_date.strftime("%Y-%m-%d") if o.submitted_date else "",
            o.reviewed_date.strftime("%Y-%m-%d") if o.reviewed_date else "",
            o.approved_date.strftime("%Y-%m-%d") if o.approved_date else "",
            o.ordered_date.strftime("%Y-%m-%d") if o.ordered_date else "",
            o.completed_date.strftime("%Y-%m-%d") if o.completed_date else "",
        ])
    return rows


async def _report_procurement(db, hospital_ids, status_filter, order_period=None) -> List[List]:
    q = select(MonthlyOrder)
    if hospital_ids is not None:
        q = q.where(MonthlyOrder.hospital_id.in_(hospital_ids))
    if status_filter:
        q = q.where(MonthlyOrder.status == status_filter)
    if order_period:
        q = q.where(MonthlyOrder.order_period == order_period)
    q = q.order_by(MonthlyOrder.order_period.desc(), MonthlyOrder.hospital_id)
    orders = (await db.execute(q)).scalars().all()
    hospitals = await _hospital_cache(db)
    rows = []
    for o in orders:
        items = (await db.execute(
            select(MonthlyOrderItem).where(MonthlyOrderItem.order_id == o.id)
        )).scalars().all()
        for it in items:
            rows.append([
                o.order_period,
                hospitals.get(o.hospital_id, ""),
                o.status.value if hasattr(o.status, "value") else o.status,
                it.item_name or "", it.unit or "",
                float(it.current_stock or 0),
                float(it.required_quantity or 0), float(it.unit_cost or 0),
                float(it.estimated_cost or 0), it.preferred_supplier_name or "",
            ])
    return rows


async def _report_consolidated(db, hospital_ids, order_period=None):
    """Group Consolidated Order — item × hospital matrix.

    Each item is shown once with a required-quantity column per hospital plus
    a combined Total Required column. Returns (headers, rows) because the
    hospital columns are dynamic.
    """
    q = select(MonthlyOrder).options(selectinload(MonthlyOrder.items))
    if hospital_ids is not None:
        q = q.where(MonthlyOrder.hospital_id.in_(hospital_ids))
    if order_period:
        q = q.where(MonthlyOrder.order_period == order_period)
    q = q.order_by(MonthlyOrder.hospital_id)
    orders = (await db.execute(q)).scalars().all()
    hospitals = await _hospital_cache(db)

    seen_ids: List[str] = []
    seen = set()
    for o in orders:
        if o.hospital_id not in seen:
            seen.add(o.hospital_id)
            seen_ids.append(o.hospital_id)

    item_rows = {}
    for o in orders:
        for it in o.items:
            rec = item_rows.setdefault(it.item_id, {
                "period": o.order_period,
                "item_name": it.item_name or "",
                "unit": it.unit or "",
                "qty": {},
                "est": {},
            })
            rec["qty"][o.hospital_id] = float(it.required_quantity or 0)
            rec["est"][o.hospital_id] = float(it.estimated_cost or 0)

    headers = ["Period", "Item", "Unit"]
    headers += [hospitals.get(hid, hid) for hid in seen_ids]
    headers += ["Total Required", "Est. Cost"]

    rows = []
    for item_id in sorted(item_rows.keys(), key=lambda k: item_rows[k]["item_name"].lower()):
        r = item_rows[item_id]
        cells = [r["qty"].get(hid, 0.0) for hid in seen_ids]
        total = round(sum(cells), 2)
        est_total = round(sum(r["est"].get(hid, 0.0) for hid in seen_ids), 2)
        rows.append([r["period"], r["item_name"], r["unit"], *cells, total, est_total])
    return headers, rows
