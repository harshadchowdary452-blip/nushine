import logging
import re
from difflib import SequenceMatcher
from typing import List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.pending_inventory_item_repository import PendingInventoryItemRepository
from app.repositories.inventory_master_repository import InventoryMasterRepository
from app.repositories.inventory_category_repository import InventoryCategoryRepository
from app.repositories.hospital_inventory_repository import HospitalInventoryRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.pending_inventory_item import PendingInventoryItem
from app.models.inventory_master import InventoryMaster
from app.models.inventory_category import InventoryCategory
from app.models.hospital_inventory import HospitalInventory
from app.models.hospital import Hospital
from app.models.user import User

logger = logging.getLogger(__name__)

OTHERS_CATEGORY_NAME = "Others"
ITEM_CODE_PREFIX = "ITM"
ROLLOUT_ALL = "ALL"
ROLLOUT_NEW_ONLY = "NEW_ONLY"
SIMILARITY_THRESHOLD = 0.6


def _normalize(name: str) -> str:
    """Canonical form for matching: lower case, collapsed whitespace, plural -> singular."""
    text = " ".join(name.strip().lower().split())
    for suffix in ("ies", "ves"):
        if text.endswith(suffix):
            text = text[:-3]
            break
    if text.endswith("s") and not text.endswith("ss"):
        text = text[:-1]
    return text


class PendingInventoryItemService:
    def __init__(self, db: AsyncSession):
        self.repo = PendingInventoryItemRepository(db)
        self.item_repo = InventoryMasterRepository(db)
        self.category_repo = InventoryCategoryRepository(db)
        self.stock_repo = HospitalInventoryRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    # ── Create ─────────────────────────────────────────────────────

    async def create(self, data: dict, hospital_id: str, user_id: str = None) -> PendingInventoryItem:
        if not hospital_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
        hospital = await self.db.get(Hospital, hospital_id)
        if not hospital:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

        name = (data.get("item_name") or "").strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_name is required")

        dup = await self.repo.get_all(
            filters={"hospital_id": hospital_id, "status": "PENDING"},
            limit=500,
        )
        if any(p.item_name.strip().lower() == name.lower() for p in dup):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pending request for this item already exists. Wait for review.",
            )

        pending = PendingInventoryItem(
            hospital_id=hospital_id,
            item_name=name,
            unit=(data.get("unit") or "PCS").strip() or "PCS",
            required_quantity=float(data.get("required_quantity")) if data.get("required_quantity") is not None else None,
            estimated_cost=float(data.get("estimated_cost") or 0),
            remarks=data.get("remarks"),
            order_period=data.get("order_period") or await _current_month(),
            created_by=user_id,
        )
        self.db.add(pending)
        await self.db.flush()
        await self.audit_log_repo.create(
            user_id=user_id, action="CREATE_PENDING_ITEM", entity_type="PENDING_INVENTORY_ITEM",
            entity_id=pending.id, hospital_id=hospital_id,
            details=f"Pending custom item '{name}' requested for {pending.order_period}",
        )
        await self._attach_names(pending)
        return pending

    # ── Edit (group admin — enforced in router) ────────────────────

    async def update(self, pending_id: str, data: dict, user_id: str = None) -> Optional[PendingInventoryItem]:
        pending = await self.repo.get(pending_id)
        if not pending:
            return None
        if pending.status != "PENDING":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be edited")

        if data.get("item_name") is not None:
            name = (data.get("item_name") or "").strip()
            if not name:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_name is required")
            dup = await self.repo.get_all(
                filters={"hospital_id": pending.hospital_id, "status": "PENDING"},
                limit=500,
            )
            if any(p.id != pending.id and p.item_name.strip().lower() == name.lower() for p in dup):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Another pending request for this item already exists.",
                )
            pending.item_name = name
        if data.get("required_quantity") is not None:
            pending.required_quantity = float(data["required_quantity"])
        if data.get("estimated_cost") is not None:
            pending.estimated_cost = float(data["estimated_cost"])
        if data.get("remarks") is not None:
            pending.remarks = data.get("remarks")
        await self.db.flush()
        await self.audit_log_repo.create(
            user_id=user_id, action="UPDATE_PENDING_ITEM", entity_type="PENDING_INVENTORY_ITEM",
            entity_id=pending.id, hospital_id=pending.hospital_id,
            details=f"Pending item '{pending.item_name}' edited",
        )
        await self._attach_names(pending)
        return pending

    # ── Duplicate detection ────────────────────────────────────────

    async def find_duplicates(self, item_name: str, include_item_id: str = None) -> List[dict]:
        """Smart match against the active Master Catalogue.

        Returns exact matches first (same name), then similar names (canonical form
        equality or fuzzy similarity). Group admins decide whether to merge.
        """
        name = (item_name or "").strip()
        if not name:
            return []
        needle = _normalize(name)
        items = (await self.db.execute(
            select(InventoryMaster).where(InventoryMaster.status == "ACTIVE")
        )).scalars().all()

        exact: List[dict] = []
        similar: List[dict] = []
        seen = set()
        for item in items:
            if include_item_id and item.id == include_item_id:
                continue
            hay = _normalize(item.name)
            if hay == needle or item.name.strip().lower() == name.lower():
                candidate = await self._duplicate_payload(item, "EXACT", 1.0)
                exact.append(candidate)
                seen.add(item.id)
                continue
            ratio = SequenceMatcher(None, needle, hay).ratio()
            if ratio >= SIMILARITY_THRESHOLD:
                candidate = await self._duplicate_payload(item, "SIMILAR", round(ratio, 2))
                similar.append(candidate)
                seen.add(item.id)

        similar.sort(key=lambda c: c["similarity"], reverse=True)
        return exact + similar

    async def _duplicate_payload(self, item: InventoryMaster, match_type: str, similarity: float) -> dict:
        cat_name = sub_name = None
        if item.category_id:
            cat = await self.category_repo.get(item.category_id)
            cat_name = cat.name if cat else None
        if item.sub_category_id:
            sub = await self.category_repo.get(item.sub_category_id)
            sub_name = sub.name if sub else None
        return {
            "id": str(item.id),
            "name": item.name,
            "code": item.code,
            "category_name": cat_name,
            "sub_category_name": sub_name,
            "unit": item.unit,
            "match_type": match_type,
            "similarity": similarity,
        }

    # ── Review (group admin only — enforced in router) ─────────────

    async def review(self, pending_id: str, action: str, data: dict, user_id: str = None) -> Optional[PendingInventoryItem]:
        pending = await self.repo.get(pending_id)
        if not pending:
            return None
        if pending.status != "PENDING":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be reviewed")

        rollout = data.get("rollout") or ROLLOUT_ALL
        now = await _utcnow()

        if action == "REJECT":
            pending.status = "REJECTED"
            pending.review_notes = data.get("review_notes")
            pending.reviewed_by = user_id
            pending.reviewed_at = now
            pending.rollout = ROLLOUT_NEW_ONLY
            await self.db.flush()
        else:
            if action == "MERGE":
                merge_item_id = data.get("merge_item_id")
                if not merge_item_id:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="merge_item_id is required to merge")
                master = await self.item_repo.get(merge_item_id)
                if not master or master.status != "ACTIVE":
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected master item not found")
            elif action == "APPROVE":
                master = await self._create_new_master(pending, data, user_id)
            else:  # CONVERT — reuse exact name match or create a new master item
                master = await self._find_or_create_master(pending, data, user_id)

            await self._distribute_to_hospitals(pending, master, rollout, user_id)
            pending.status = "CONVERTED" if action == "CONVERT" else ("MERGED" if action == "MERGE" else "APPROVED")
            pending.rollout = rollout
            pending.category_id = master.category_id
            pending.converted_item_id = master.id
            pending.unit = data.get("unit") or pending.unit
            pending.review_notes = data.get("review_notes")
            pending.reviewed_by = user_id
            pending.reviewed_at = now
            await self.db.flush()

        rollout_label = "all hospitals" if pending.rollout == ROLLOUT_ALL else "new hospitals only"
        await self.audit_log_repo.create(
            user_id=user_id, action="REVIEW_PENDING_ITEM", entity_type="PENDING_INVENTORY_ITEM",
            entity_id=pending.id, hospital_id=pending.hospital_id,
            details=f"Pending item '{pending.item_name}' -> {pending.status} (rollout: {rollout_label})",
        )
        await self._attach_names(pending)
        return pending

    async def _create_new_master(self, pending: PendingInventoryItem, data: dict, user_id: str = None) -> InventoryMaster:
        """Always create a brand-new master item (GA chose 'Create New Master Item')."""
        category_id = data.get("category_id") or await self._others_category_id()
        code = await self._next_item_code()
        unit = (data.get("unit") or pending.unit or "PCS").strip() or "PCS"
        price = float(pending.estimated_cost or 0)
        item = InventoryMaster(
            name=pending.item_name.strip(),
            code=code,
            category_id=category_id,
            unit=unit,
            purchase_price=price,
            average_cost=price,
            status="ACTIVE",
            created_by=user_id,
        )
        self.db.add(item)
        await self.db.flush()
        return item

    async def _find_or_create_master(self, pending: PendingInventoryItem, data: dict, user_id: str = None) -> InventoryMaster:
        """Reuse an existing active master item by name, else create one."""
        name = pending.item_name.strip()
        existing = await self.db.execute(
            select(InventoryMaster).where(
                func.lower(InventoryMaster.name) == name.lower(),
                InventoryMaster.status == "ACTIVE",
            )
        )
        master = existing.scalars().first()
        if master:
            return master
        return await self._create_new_master(pending, data, user_id)

    async def _distribute_to_hospitals(self, pending: PendingInventoryItem, master: InventoryMaster, rollout: str, user_id: str = None):
        """Link the approved/merged item into hospital inventory.

        The requesting hospital always gets the item. With rollout ALL the item is
        also linked into every other hospital in the requesting hospital's group.
        A standalone (group-less) hospital has no group to roll out to, so only the
        requesting hospital is linked — never other standalone hospitals.
        """
        await self._ensure_hospital_link(pending.hospital_id, master.id, user_id)
        if rollout == ROLLOUT_ALL:
            hospital = await self.db.get(Hospital, pending.hospital_id)
            group_id = hospital.admin_group_id if hospital else None
            if not group_id:
                return
            query = select(Hospital.id).where(Hospital.admin_group_id == group_id)
            rows = (await self.db.execute(query)).all()
            for (hid,) in rows:
                if hid == pending.hospital_id:
                    continue
                await self._ensure_hospital_link(hid, master.id, user_id)

    async def _ensure_hospital_link(self, hospital_id: str, item_id: str, user_id: str = None):
        existing = await self.stock_repo.get_all(filters={"hospital_id": hospital_id, "item_id": item_id}, limit=1)
        if existing:
            return existing[0]
        record = HospitalInventory(hospital_id=hospital_id, item_id=item_id)
        self.db.add(record)
        await self.db.flush()
        return record

    async def _others_category_id(self) -> Optional[str]:
        row = await self.db.execute(
            select(InventoryCategory.id).where(func.lower(InventoryCategory.name) == OTHERS_CATEGORY_NAME.lower()).limit(1)
        )
        cid = row.scalar_one_or_none()
        if cid is None:
            cat = InventoryCategory(name=OTHERS_CATEGORY_NAME, code="OTH", is_active=True)
            self.db.add(cat)
            await self.db.flush()
            cid = cat.id
        return cid

    async def _next_item_code(self) -> str:
        rows = await self.db.execute(select(InventoryMaster.code))
        max_num = 0
        prefix = f"{ITEM_CODE_PREFIX}-"
        for (code,) in rows.all():
            if code and code.startswith(prefix):
                m = re.search(r"(\d+)$", code)
                if m:
                    max_num = max(max_num, int(m.group(1)))
        return f"{prefix}{max_num + 1:04d}"

    # ── Read ───────────────────────────────────────────────────────

    async def get(self, pending_id: str) -> Optional[PendingInventoryItem]:
        pending = await self.repo.get(pending_id)
        if pending:
            await self._attach_names(pending)
        return pending

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None,
                      order_by: str = None, descending: bool = False) -> List[PendingInventoryItem]:
        query = select(PendingInventoryItem)
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(PendingInventoryItem, key[:-4]).in_(value))
                elif hasattr(PendingInventoryItem, key):
                    query = query.where(getattr(PendingInventoryItem, key) == value)
        if order_by and hasattr(PendingInventoryItem, order_by):
            col = getattr(PendingInventoryItem, order_by)
            query = query.order_by(col.desc() if descending else col)
        else:
            query = query.order_by(PendingInventoryItem.created_at.desc())
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        pending_items = list(result.scalars().all())
        for p in pending_items:
            await self._attach_names(p)
        return pending_items

    async def count(self, filters: dict = None) -> int:
        query = select(func.count(PendingInventoryItem.id))
        if filters:
            for key, value in filters.items():
                if value is None:
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(PendingInventoryItem, key[:-4]).in_(value))
                elif hasattr(PendingInventoryItem, key):
                    query = query.where(getattr(PendingInventoryItem, key) == value)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def _attach_names(self, pending: PendingInventoryItem):
        if pending.hospital_id:
            row = await self.db.execute(select(Hospital.name).where(Hospital.id == pending.hospital_id))
            r = row.one_or_none()
            pending.hospital_name = r[0] if r else None
        if pending.category_id:
            cat = await self.category_repo.get(pending.category_id)
            pending.category_name = cat.name if cat else None
        if pending.created_by:
            row = await self.db.execute(select(User.full_name).where(User.id == pending.created_by))
            r = row.one_or_none()
            pending.requested_by_name = r[0] if r else None
        if pending.reviewed_by:
            row = await self.db.execute(select(User.full_name).where(User.id == pending.reviewed_by))
            r = row.one_or_none()
            pending.reviewed_by_name = r[0] if r else None
        return pending


async def _utcnow():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


async def _current_month():
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    return f"{now.year}-{now.month:02d}"
