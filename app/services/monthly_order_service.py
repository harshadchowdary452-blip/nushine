import logging
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.monthly_order_repository import MonthlyOrderRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.monthly_order import MonthlyOrder, MonthlyOrderItem, MonthlyOrderStatus
from app.models.hospital import Hospital
from app.models.inventory_master import InventoryMaster
from app.models.hospital_inventory import HospitalInventory
from app.models.inventory_category import InventoryCategory
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.supplier import Supplier
from app.services.inventory_calculation_service import (
    monthly_usage_summary, suggest_quantity, trend_for, _monthly_sums,
    warehouse_unit_price, status_for,
)
from app.config import settings

ALLOWED_TRANSITIONS = {
    MonthlyOrderStatus.DRAFT: [MonthlyOrderStatus.SUBMITTED],
    MonthlyOrderStatus.SUBMITTED: [MonthlyOrderStatus.REVIEWED],
    MonthlyOrderStatus.REVIEWED: [MonthlyOrderStatus.APPROVED],
    MonthlyOrderStatus.APPROVED: [MonthlyOrderStatus.ORDERED],
    MonthlyOrderStatus.ORDERED: [MonthlyOrderStatus.COMPLETED],
}

DATE_FIELD_BY_STATUS = {
    MonthlyOrderStatus.SUBMITTED: "submitted_date",
    MonthlyOrderStatus.REVIEWED: "reviewed_date",
    MonthlyOrderStatus.APPROVED: "approved_date",
    MonthlyOrderStatus.ORDERED: "ordered_date",
    MonthlyOrderStatus.COMPLETED: "completed_date",
}


class MonthlyOrderService:
    def __init__(self, db: AsyncSession):
        self.repo = MonthlyOrderRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    # ── Suggestions ────────────────────────────────────────────────

    async def get_suggestions(self, hospital_id: str, order_period: str, item_ids: Optional[List[str]] = None) -> dict:
        """Suggested order quantities for a hospital for a given YYYY-MM period."""
        hospital = await self.db.get(Hospital, hospital_id)
        if not hospital:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

        stock_q = select(HospitalInventory).where(HospitalInventory.hospital_id == hospital_id)
        if item_ids:
            stock_q = stock_q.where(HospitalInventory.item_id.in_(item_ids))
        stock_rows = (await self.db.execute(stock_q)).scalars().all()

        category_rows = (await self.db.execute(select(InventoryCategory.id, InventoryCategory.name))).all()
        category_names = {r[0]: r[1] for r in category_rows}

        items = []
        for sr in stock_rows:
            item = await self.db.get(InventoryMaster, sr.item_id)
            if not item or item.status != "ACTIVE":
                continue
            usage = await monthly_usage_summary(self.db, hospital_id, sr.item_id)
            current_stock = float(sr.quantity or 0)
            minimum_stock = float(sr.minimum_stock or 0) if sr.minimum_stock is not None else float(item.minimum_stock or 0)
            trend = trend_for(await _monthly_sums(self.db, hospital_id, sr.item_id))
            suggested = suggest_quantity(current_stock, minimum_stock, usage["avg_monthly_usage"], trend=trend)
            unit_price = warehouse_unit_price(item)
            supplier_name = None
            if item.preferred_vendor_id:
                sup = await self.db.get(Supplier, item.preferred_vendor_id)
                supplier_name = sup.name if sup else None
            items.append({
                "item_id": item.id,
                "item_name": item.name,
                "item_code": item.code,
                "category_name": category_names.get(item.category_id),
                "unit": item.unit,
                "current_stock": current_stock,
                "minimum_stock": minimum_stock,
                "avg_monthly_usage": usage["avg_monthly_usage"],
                "usage_source": usage["usage_source"],
                "remaining_days": (current_stock / (usage["avg_monthly_usage"] / 30.0)) if usage["avg_monthly_usage"] > 0 else None,
                "status": status_for(current_stock, minimum_stock),
                "suggested_quantity": suggested,
                "preferred_supplier_name": supplier_name,
                "preferred_supplier_id": item.preferred_vendor_id,
                "unit_cost": round(unit_price, 2),
                "estimated_cost": round(suggested * unit_price, 2),
            })

        items.sort(key=lambda i: i["item_name"].lower())
        total = round(sum(i["estimated_cost"] for i in items), 2)
        return {
            "hospital_id": hospital_id,
            "hospital_name": hospital.name,
            "order_period": order_period,
            "items": items,
            "estimated_cost_total": total,
        }

    # ── Create / update ────────────────────────────────────────────

    async def create(self, data: dict, user_id: str = None) -> MonthlyOrder:
        hospital_id = data.get("hospital_id")
        order_period = data.get("order_period")
        if not hospital_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
        if not order_period:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_period is required")

        hospital = await self.db.get(Hospital, hospital_id)
        if not hospital:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

        existing = await self.repo.get_all(filters={"hospital_id": hospital_id, "order_period": order_period}, limit=1)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An order already exists for this hospital and period")

        suggestions = await self.get_suggestions(hospital_id, order_period)
        provided = {i.get("item_id"): float(i.get("required_quantity", 0)) for i in data.get("items", []) if i.get("item_id")}

        order = MonthlyOrder(
            hospital_id=hospital_id,
            admin_group_id=hospital.admin_group_id,
            order_period=order_period,
            status=MonthlyOrderStatus.DRAFT,
            notes=data.get("notes"),
            created_by=user_id,
            estimated_cost_total=suggestions["estimated_cost_total"],
        )
        self.db.add(order)
        await self.db.flush()

        for suggestion in suggestions["items"]:
            item_id = suggestion["item_id"]
            required = provided.get(item_id, suggestion["suggested_quantity"])
            order_item = MonthlyOrderItem(
                order_id=order.id,
                item_id=item_id,
                item_name=suggestion["item_name"],
                item_code=suggestion["item_code"],
                unit=suggestion["unit"],
                current_stock=suggestion["current_stock"],
                minimum_stock=suggestion["minimum_stock"],
                avg_monthly_usage=suggestion["avg_monthly_usage"],
                remaining_days=suggestion["remaining_days"],
                suggested_quantity=suggestion["suggested_quantity"],
                required_quantity=max(required, 0),
                unit_cost=suggestion["unit_cost"],
                estimated_cost=round(required * suggestion["unit_cost"], 2),
                preferred_supplier_name=suggestion["preferred_supplier_name"],
            )
            self.db.add(order_item)

        await self.db.flush()
        await self._load_items(order)
        await self._recompute_total(order)
        await self.db.flush()
        await self.audit_log_repo.create(
            user_id=user_id, action="CREATE_MONTHLY_ORDER", entity_type="MONTHLY_ORDER",
            entity_id=order.id, hospital_id=hospital_id,
            details=f"Created monthly order for {order_period}",
        )
        return await self._load(order.id)

    async def update(self, order_id: str, data: dict, user_id: str = None) -> Optional[MonthlyOrder]:
        order = await self._load(order_id)
        if not order:
            return None
        if order.status not in (MonthlyOrderStatus.DRAFT, MonthlyOrderStatus.SUBMITTED):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Only DRAFT or SUBMITTED orders can be edited")

        if "notes" in data and data.get("notes") is not None:
            order.notes = data.get("notes")

        if "items" in data and data.get("items") is not None:
            provided = {i.get("item_id"): i for i in data["items"] if i.get("item_id")}
            for item in order.items:
                if item.item_id in provided:
                    entry = provided[item.item_id]
                    req = float(entry.get("required_quantity", item.required_quantity))
                    remarks = entry.get("remarks")
                    item.required_quantity = max(req, 0)
                    if entry.get("estimated_cost") is not None:
                        item.estimated_cost = round(float(entry["estimated_cost"]), 2)
                    else:
                        item.estimated_cost = round(item.required_quantity * item.unit_cost, 2)
                    if remarks is not None:
                        item.remarks = remarks
            await self._recompute_total(order)

        await self.db.flush()
        await self.audit_log_repo.create(
            user_id=user_id, action="UPDATE_MONTHLY_ORDER", entity_type="MONTHLY_ORDER",
            entity_id=order_id, hospital_id=order.hospital_id, details="Updated monthly order",
        )
        return await self._load(order_id)

    # ── Submit (Phase 2C-1A monthly indent) ─────────────────────────

    async def submit(self, data: dict, user_id: str = None) -> MonthlyOrder:
        """Create-or-update the DRAFT order for (hospital, period) from the
        hospital admin's manually entered indent lines, then submit it."""
        hospital_id = data.get("hospital_id")
        order_period = data.get("order_period")
        if not hospital_id or not order_period:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id and order_period are required")

        hospital = await self.db.get(Hospital, hospital_id)
        if not hospital:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

        existing = await self.repo.get_all(filters={"hospital_id": hospital_id, "order_period": order_period}, limit=1)
        if existing:
            order = existing[0]
            if order.status != MonthlyOrderStatus.DRAFT:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An order already exists for this hospital and period")
            await self._apply_submit_lines(order, data)
        else:
            order = MonthlyOrder(
                hospital_id=hospital_id,
                admin_group_id=hospital.admin_group_id,
                order_period=order_period,
                status=MonthlyOrderStatus.DRAFT,
                notes=data.get("notes"),
                created_by=user_id,
                estimated_cost_total=0,
            )
            self.db.add(order)
            await self.db.flush()
            await self._apply_submit_lines(order, data)

        await self.db.flush()
        return await self.transition(order.id, MonthlyOrderStatus.SUBMITTED.value, user_id=user_id)

    async def _apply_submit_lines(self, order: MonthlyOrder, data: dict):
        """Replace the order's lines with the submitted indent lines.

        Remaining stock is read from hospital inventory at submit time so a
        freshly updated Remaining Stock value is captured on the order. The
        estimated cost entered by the hospital admin is used verbatim; when a
        line has a quantity but no cost, it falls back to required × master price.
        """
        provided = {}
        for i in data.get("items", []):
            if i.get("item_id"):
                provided[i["item_id"]] = i

        stock_map = {}
        if order.hospital_id:
            rows = (await self.db.execute(
                select(HospitalInventory).where(HospitalInventory.hospital_id == order.hospital_id)
            )).scalars().all()
            stock_map = {r.item_id: r for r in rows}

        by_id = {}
        for item_id in provided:
            master = await self.db.get(InventoryMaster, item_id)
            if master:
                by_id[item_id] = master

        existing_items = (await self.db.execute(
            select(MonthlyOrderItem).where(MonthlyOrderItem.order_id == order.id)
        )).scalars().all()
        existing_by_id = {e.item_id: e for e in existing_items}

        keep_ids = set(provided)
        for old in existing_items:
            if old.item_id not in keep_ids:
                await self.db.delete(old)
        await self.db.flush()

        lines = []
        for item_id, entry in provided.items():
            master = by_id.get(item_id)
            if not master:
                continue
            stock = stock_map.get(item_id)
            required = max(float(entry.get("required_quantity") or 0), 0)
            price = float(master.purchase_price or 0)
            if entry.get("estimated_cost") is not None:
                estimated = round(float(entry["estimated_cost"]), 2)
            else:
                estimated = round(required * price, 2)
            unit_cost = round(estimated / required, 2) if required > 0 else price

            existing_item = existing_by_id.get(item_id)
            if existing_item:
                existing_item.required_quantity = required
                existing_item.estimated_cost = estimated
                existing_item.unit_cost = unit_cost
                existing_item.remarks = entry.get("remarks")
                existing_item.current_stock = float(stock.quantity) if stock else 0
                existing_item.minimum_stock = float(stock.minimum_stock) if stock and stock.minimum_stock is not None else 0
                lines.append(existing_item)
            else:
                new_item = MonthlyOrderItem(
                    order_id=order.id,
                    item_id=item_id,
                    item_name=master.name,
                    item_code=master.code,
                    unit=master.unit,
                    current_stock=float(stock.quantity) if stock else 0,
                    minimum_stock=float(stock.minimum_stock) if stock and stock.minimum_stock is not None else 0,
                    required_quantity=required,
                    unit_cost=unit_cost,
                    estimated_cost=estimated,
                    remarks=entry.get("remarks"),
                )
                self.db.add(new_item)
                lines.append(new_item)
        await self._recompute_total(order, lines)

    # ── Lifecycle ──────────────────────────────────────────────────

    async def transition(self, order_id: str, to_status: str, user_id: str = None) -> Optional[MonthlyOrder]:
        order = await self._load(order_id)
        if not order:
            return None
        current = order.status
        target = MonthlyOrderStatus(to_status)
        if target == current:
            return order
        allowed = ALLOWED_TRANSITIONS.get(current, [])
        if target not in allowed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Cannot move from {current.value} to {target.value}")
        date_field = DATE_FIELD_BY_STATUS.get(target)
        if date_field:
            setattr(order, date_field, datetime.now(timezone.utc))
        if target == MonthlyOrderStatus.SUBMITTED:
            order.submitted_by = user_id
        order.status = target
        await self.db.flush()
        await self.audit_log_repo.create(
            user_id=user_id, action=f"TRANSITION_MONTHLY_ORDER", entity_type="MONTHLY_ORDER",
            entity_id=order_id, hospital_id=order.hospital_id,
            details=f"Status {current.value} -> {target.value} for {order.order_period}",
        )
        return await self._load(order_id)

    # ── Read ───────────────────────────────────────────────────────

    async def get(self, order_id: str) -> Optional[MonthlyOrder]:
        return await self._load(order_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None,
                      order_by: str = None, descending: bool = False) -> List[MonthlyOrder]:
        query = select(MonthlyOrder).options(selectinload(MonthlyOrder.items))
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(MonthlyOrder, key[:-4]).in_(value))
                elif key.endswith("__ge"):
                    query = query.where(getattr(MonthlyOrder, key[:-4]) >= value)
                elif hasattr(MonthlyOrder, key):
                    query = query.where(getattr(MonthlyOrder, key) == value)
        if order_by and hasattr(MonthlyOrder, order_by):
            col = getattr(MonthlyOrder, order_by)
            query = query.order_by(col.desc() if descending else col)
        else:
            query = query.order_by(MonthlyOrder.order_period.desc(), MonthlyOrder.created_at.desc())
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        orders = list(result.scalars().all())
        for order in orders:
            await self._attach_names(order)
        return orders

    async def count(self, filters: dict = None) -> int:
        query = select(func.count(MonthlyOrder.id))
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(MonthlyOrder, key[:-4]).in_(value))
                elif hasattr(MonthlyOrder, key):
                    query = query.where(getattr(MonthlyOrder, key) == value)
        result = await self.db.execute(query)
        return result.scalar() or 0

    # ── Consolidation ──────────────────────────────────────────────

    async def overview(self, hospital_ids: List[str], order_period: str) -> dict:
        """GA consolidation view — one row per hospital for a month."""
        orders = await self.get_all(
            skip=0, limit=1000,
            filters={"hospital_id__in": hospital_ids, "order_period": order_period},
        )
        orders_by_hospital = {o.hospital_id: o for o in orders}

        user_ids = {o.submitted_by or o.created_by for o in orders if (o.submitted_by or o.created_by)}
        user_names = await self._user_names(user_ids)

        hospitals = []
        total_items = 0
        total_cost = 0.0
        status_counts = {s.value: 0 for s in MonthlyOrderStatus}
        for hid in hospital_ids:
            order = orders_by_hospital.get(hid)
            row = (await self.db.execute(select(Hospital.id, Hospital.name).where(Hospital.id == hid))).one_or_none()
            if not order:
                hospitals.append({
                    "hospital_id": hid,
                    "hospital_name": row[1] if row else hid,
                    "has_order": False,
                    "items_requested": 0,
                    "estimated_cost": 0.0,
                    "status": None,
                    "submitted_date": None,
                    "submitted_by": None,
                    "submitted_by_name": None,
                    "reviewed_date": None,
                    "approved_date": None,
                    "ordered_date": None,
                    "completed_date": None,
                    "last_updated": None,
                    "remarks": None,
                    "current_remaining_stock": 0.0,
                })
                continue
            remaining_stock = round(sum(float(i.current_stock or 0) for i in order.items), 2)
            status_value = order.status.value if order.status else None
            if status_value:
                status_counts[status_value] += 1
            hospitals.append({
                "hospital_id": hid,
                "hospital_name": row[1] if row else hid,
                "has_order": True,
                "order_id": order.id,
                "items_requested": len(order.items),
                "estimated_cost": round(float(order.estimated_cost_total or 0), 2),
                "status": status_value,
                "submitted_date": order.submitted_date,
                "submitted_by": order.submitted_by or order.created_by,
                "submitted_by_name": user_names.get(order.submitted_by or order.created_by),
                "reviewed_date": order.reviewed_date,
                "approved_date": order.approved_date,
                "ordered_date": order.ordered_date,
                "completed_date": order.completed_date,
                "last_updated": order.updated_at,
                "remarks": order.notes,
                "current_remaining_stock": remaining_stock,
            })
            total_items += len(order.items)
            total_cost += float(order.estimated_cost_total or 0)

        hospitals.sort(key=lambda h: h["hospital_name"].lower())
        submitted_count = sum(1 for h in hospitals if h["status"] and h["status"] != MonthlyOrderStatus.DRAFT.value)
        return {
            "order_period": order_period,
            "hospitals": hospitals,
            "total_items": total_items,
            "estimated_cost_total": round(total_cost, 2),
            "orders_submitted": submitted_count,
            "orders_total": len(hospital_ids),
            "status_counts": status_counts,
        }

    async def consolidate(self, hospital_ids: List[str], order_period: str) -> dict:
        """Item × hospital quantity matrix for a month across hospitals.

        Results are always calculated live from hospital submissions — never
        persisted. Each item carries its master-catalogue Category / Sub Category
        so the Group Admin view can preserve the exact catalogue hierarchy.
        """
        orders = await self.get_all(
            skip=0, limit=1000,
            filters={"hospital_id__in": hospital_ids, "order_period": order_period},
        )
        orders_by_hospital = {o.hospital_id: o for o in orders}
        hospitals = []
        for hid in hospital_ids:
            order = orders_by_hospital.get(hid)
            row = (await self.db.execute(select(Hospital.id, Hospital.name).where(Hospital.id == hid))).one_or_none()
            hospitals.append({
                "hospital_id": hid,
                "hospital_name": row[1] if row else hid,
                "has_order": bool(order),
                "status": order.status.value if order else None,
            })

        item_map = {}
        master_ids = {item.item_id for order in orders for item in order.items}
        masters = {}
        if master_ids:
            masters = {m.id: m for m in (await self.db.execute(
                select(InventoryMaster).where(InventoryMaster.id.in_(master_ids))
            )).scalars().all()}
        category_ids = {m.category_id for m in masters.values() if m.category_id}
        category_names = {}
        if category_ids:
            category_names = {r[0]: r[1] for r in (await self.db.execute(
                select(InventoryCategory.id, InventoryCategory.name)
                .where(InventoryCategory.id.in_(category_ids))
            )).all()}
        sub_category_ids = {m.sub_category_id for m in masters.values() if m.sub_category_id}
        if sub_category_ids:
            for r in (await self.db.execute(
                select(InventoryCategory.id, InventoryCategory.name)
                .where(InventoryCategory.id.in_(sub_category_ids))
            )).all():
                category_names.setdefault(r[0], r[1])

        for order in orders:
            for item in order.items:
                master = masters.get(item.item_id)
                entry = item_map.setdefault(item.item_id, {
                    "item_id": item.item_id,
                    "item_name": item.item_name or (master.name if master else item.item_id),
                    "item_code": item.item_code or (master.code if master else None),
                    "unit": item.unit or (master.unit if master else None),
                    "category_name": category_names.get(master.category_id) if master and master.category_id else None,
                    "sub_category_name": category_names.get(master.sub_category_id) if master and master.sub_category_id else None,
                    "preferred_supplier_name": item.preferred_supplier_name,
                    "unit_cost": item.unit_cost,
                    "hospitals": {},
                    "total_quantity": 0.0,
                    "estimated_cost": 0.0,
                })
                entry["hospitals"][order.hospital_id] = {
                    "current_stock": item.current_stock,
                    "minimum_stock": item.minimum_stock,
                    "required_quantity": item.required_quantity,
                    "estimated_cost": item.estimated_cost,
                    "status": order.status.value if order.status else None,
                }
                entry["total_quantity"] += item.required_quantity
                entry["estimated_cost"] += item.estimated_cost

        items = []
        for item_id, entry in item_map.items():
            entry["total_quantity"] = round(entry["total_quantity"], 2)
            entry["estimated_cost"] = round(entry["estimated_cost"], 2)
            items.append(entry)
        items.sort(key=lambda i: (
            (i["category_name"] or "Others").lower(),
            (i["sub_category_name"] or "General").lower(),
            i["item_name"].lower(),
        ))

        return {
            "order_period": order_period,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "hospitals": hospitals,
            "items": items,
            "grand_total_quantity": round(sum(i["total_quantity"] for i in items), 2),
            "grand_total_cost": round(sum(i["estimated_cost"] for i in items), 2),
        }

    # ── Validation engine ──────────────────────────────────────────

    async def validate(self, hospital_ids: List[str], order_period: str) -> dict:
        """Validate every hospital submission before generating a consolidated indent.

        Returns a list of blocking errors and soft warnings. The consolidated
        report must never be produced while errors exist.
        """
        errors: List[dict] = []
        warnings: List[dict] = []

        hospital_rows = (await self.db.execute(
            select(Hospital.id, Hospital.name).where(Hospital.id.in_(hospital_ids))
        )).all()
        hospital_names = {r[0]: r[1] for r in hospital_rows}

        orders = await self.get_all(
            skip=0, limit=1000,
            filters={"hospital_id__in": hospital_ids, "order_period": order_period},
        )
        orders_by_hospital: dict = {}
        for order in orders:
            orders_by_hospital.setdefault(order.hospital_id, []).append(order)

        for hid in hospital_ids:
            name = hospital_names.get(hid, hid)
            matches = orders_by_hospital.get(hid, [])
            if not matches:
                errors.append({
                    "code": "MISSING_SUBMISSION", "hospital_id": hid, "hospital_name": name,
                    "message": f"{name} has not submitted a monthly indent for {order_period}",
                })
                continue
            if len(matches) > 1:
                errors.append({
                    "code": "DUPLICATE_SUBMISSION", "hospital_id": hid, "hospital_name": name,
                    "message": f"{name} has more than one submission for {order_period}",
                })
            order = matches[0]
            if order.status == MonthlyOrderStatus.DRAFT:
                errors.append({
                    "code": "NOT_SUBMITTED", "hospital_id": hid, "hospital_name": name,
                    "message": f"{name} still has a draft indent for {order_period} and has not submitted it",
                })
            elif order.status == MonthlyOrderStatus.SUBMITTED:
                warnings.append({
                    "code": "NOT_REVIEWED", "hospital_id": hid, "hospital_name": name,
                    "message": f"{name}'s submission has not been reviewed yet",
                })

            seen_item_ids = set()
            for item in order.items:
                if item.item_id in seen_item_ids:
                    errors.append({
                        "code": "DUPLICATE_ITEM", "hospital_id": hid, "hospital_name": name,
                        "item_id": item.item_id, "item_name": item.item_name,
                        "message": f"{name} lists '{item.item_name}' more than once in its indent",
                    })
                seen_item_ids.add(item.item_id)
                required = float(item.required_quantity or 0)
                cost = float(item.estimated_cost or 0)
                if required < 0:
                    errors.append({
                        "code": "NEGATIVE_QUANTITY", "hospital_id": hid, "hospital_name": name,
                        "item_id": item.item_id, "item_name": item.item_name,
                        "message": f"{name} has a negative required quantity for '{item.item_name}'",
                    })
                if cost < 0:
                    errors.append({
                        "code": "INVALID_COST", "hospital_id": hid, "hospital_name": name,
                        "item_id": item.item_id, "item_name": item.item_name,
                        "message": f"{name} has a negative estimated cost for '{item.item_name}'",
                    })
                if required > 0 and cost == 0:
                    warnings.append({
                        "code": "MISSING_COST", "hospital_id": hid, "hospital_name": name,
                        "item_id": item.item_id, "item_name": item.item_name,
                        "message": f"'{item.item_name}' at {name} has a quantity but no estimated cost",
                    })
                if required == 0 and cost > 0:
                    warnings.append({
                        "code": "ZERO_QUANTITY_WITH_COST", "hospital_id": hid, "hospital_name": name,
                        "item_id": item.item_id, "item_name": item.item_name,
                        "message": f"'{item.item_name}' at {name} has a cost but zero quantity",
                    })

        master_ids = {item.item_id for order in orders for item in order.items}
        if master_ids:
            masters = {m.id: m for m in (await self.db.execute(
                select(InventoryMaster).where(InventoryMaster.id.in_(master_ids))
            )).scalars().all()}
            category_ids = {m.category_id for m in masters.values() if m.category_id}
            existing_categories = set()
            if category_ids:
                existing_categories = {r[0] for r in (await self.db.execute(
                    select(InventoryCategory.id).where(InventoryCategory.id.in_(category_ids))
                )).all()}
            for order in orders:
                name = hospital_names.get(order.hospital_id, order.hospital_id)
                for item in order.items:
                    master = masters.get(item.item_id)
                    if not master or master.status != "ACTIVE":
                        errors.append({
                            "code": "MISSING_ITEM", "hospital_id": order.hospital_id, "hospital_name": name,
                            "item_id": item.item_id, "item_name": item.item_name,
                            "message": f"'{item.item_name}' is no longer present in the master catalogue",
                        })
                        continue
                    if master.category_id and master.category_id not in existing_categories:
                        errors.append({
                            "code": "MISSING_CATEGORY", "hospital_id": order.hospital_id, "hospital_name": name,
                            "item_id": item.item_id, "item_name": item.item_name,
                            "message": f"'{item.item_name}' references a missing catalogue category",
                        })
                    if not master.sub_category_id:
                        warnings.append({
                            "code": "MISSING_SUB_CATEGORY", "hospital_id": order.hospital_id, "hospital_name": name,
                            "item_id": item.item_id, "item_name": item.item_name,
                            "message": f"'{item.item_name}' has no sub category in the catalogue",
                        })

        return {
            "order_period": order_period,
            "is_valid": len(errors) == 0,
            "hospitals_checked": len(hospital_ids),
            "hospitals_submitted": sum(1 for m in orders_by_hospital.values() if m and m[0].status != MonthlyOrderStatus.DRAFT),
            "errors": errors,
            "warnings": warnings,
        }

    async def generate(self, hospital_ids: List[str], order_period: str, user_id: str = None) -> dict:
        """One-click Generate Consolidated Monthly Indent.

        Runs the validation engine first; the consolidated matrix is only
        produced when every submission is valid. Nothing is persisted.
        """
        validation = await self.validate(hospital_ids, order_period)
        consolidated = None
        if validation["is_valid"]:
            consolidated = await self.consolidate(hospital_ids, order_period)
            await self.audit_log_repo.create(
                user_id=user_id, action="GENERATE_CONSOLIDATED_ORDER",
                entity_type="MONTHLY_ORDER", entity_id=None,
                hospital_id=hospital_ids[0] if len(hospital_ids) == 1 else None,
                details=f"Generated consolidated monthly indent for {order_period}",
            )
        return {
            "order_period": order_period,
            "validated": validation["is_valid"],
            "validation": validation,
            "consolidated": consolidated,
        }

    # ── Audit history ──────────────────────────────────────────────

    async def audit_history(self, hospital_ids: List[str], skip: int = 0, limit: int = 100,
                            order_period: Optional[str] = None) -> dict:
        """Group-scoped audit trail for the inventory / monthly indent workflow."""
        q = select(AuditLog).where(
            AuditLog.entity_type.in_([
                "MONTHLY_ORDER", "PENDING_INVENTORY_ITEM", "HOSPITAL_INVENTORY",
                "INVENTORY_TRANSACTION", "INVENTORY_MASTER", "INVENTORY_CATEGORY",
            ])
        )
        if hospital_ids:
            q = q.where(AuditLog.hospital_id.in_(hospital_ids))
        else:
            q = q.where(AuditLog.hospital_id.is_not(None))
        if order_period:
            q = q.where(AuditLog.details.like(f"%{order_period}%"))
        total_q = select(func.count()).select_from(q.subquery())
        total = (await self.db.execute(total_q)).scalar() or 0
        q = q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
        logs = (await self.db.execute(q)).scalars().all()

        user_ids = {l.user_id for l in logs if l.user_id}
        user_names = await self._user_names(user_ids)
        hospital_ids_set = {l.hospital_id for l in logs if l.hospital_id}
        hospital_names = {}
        if hospital_ids_set:
            hospital_names = {r[0]: r[1] for r in (await self.db.execute(
                select(Hospital.id, Hospital.name).where(Hospital.id.in_(hospital_ids_set))
            )).all()}

        items = [{
            "id": log.id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "user_id": log.user_id,
            "user_name": user_names.get(log.user_id),
            "hospital_id": log.hospital_id,
            "hospital_name": hospital_names.get(log.hospital_id),
            "details": log.details,
            "created_at": log.created_at,
        } for log in logs]
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    async def _user_names(self, user_ids) -> dict:
        user_ids = {u for u in user_ids if u}
        if not user_ids:
            return {}
        rows = (await self.db.execute(
            select(User.id, User.full_name).where(User.id.in_(user_ids))
        )).all()
        return {r[0]: r[1] for r in rows}

    # ── Helpers ────────────────────────────────────────────────────

    async def _recompute_total(self, order: MonthlyOrder, items=None):
        total = 0.0
        for item in items if items is not None else order.items:
            total += float(item.estimated_cost or 0)
        order.estimated_cost_total = round(total, 2)

    async def _load(self, order_id: str) -> Optional[MonthlyOrder]:
        order = await self.repo.get(order_id)
        if order:
            await self._attach_names(order)
            await self._load_items(order)
        return order

    async def _attach_names(self, order: MonthlyOrder):
        if order.hospital_id:
            row = (await self.db.execute(select(Hospital.name).where(Hospital.id == order.hospital_id))).one_or_none()
            order.hospital_name = row[0] if row else None

    async def _load_items(self, order: MonthlyOrder):
        await self.db.refresh(order, attribute_names=["items"])
        return order
