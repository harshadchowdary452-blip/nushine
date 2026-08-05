import logging
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.hospital_inventory_repository import HospitalInventoryRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.hospital_inventory import HospitalInventory
from app.models.hospital import Hospital
from app.models.inventory_master import InventoryMaster
from app.models.inventory_category import InventoryCategory

logger = logging.getLogger(__name__)


class HospitalInventoryService:
    def __init__(self, db: AsyncSession):
        self.repo = HospitalInventoryRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> HospitalInventory:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        hospital_id = clean_data.get("hospital_id")
        item_id = clean_data.get("item_id")
        if not hospital_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
        if not item_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_id is required")
        hospital = await self.db.execute(select(Hospital).where(Hospital.id == hospital_id))
        if not hospital.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
        item_result = await self.db.execute(select(InventoryMaster).where(InventoryMaster.id == item_id))
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        existing = await self.repo.get_all(filters={"hospital_id": hospital_id, "item_id": item_id}, limit=1)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This item already has a stock record for this hospital. Update it instead.")
        clean_data.setdefault("unit", item.unit)
        try:
            record = await self.repo.create(**clean_data)
        except Exception as e:
            logging.getLogger(__name__).exception("CREATE_STOCK - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create stock record: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_STOCK", entity_type="HOSPITAL_INVENTORY", entity_id=str(record.id), details=f"Stock record created for item '{item.name}'")
        return record

    async def _attach_names(self, record: HospitalInventory):
        if record.hospital_id:
            hospital_result = await self.db.execute(select(Hospital.name).where(Hospital.id == record.hospital_id))
            row = hospital_result.one_or_none()
            record.hospital_name = row[0] if row else None
        if record.item_id:
            from sqlalchemy.orm import aliased

            SubCat = aliased(InventoryCategory)
            item_result = await self.db.execute(
                select(
                    InventoryMaster.name,
                    InventoryMaster.code,
                    InventoryCategory.name,
                    SubCat.name,
                )
                .outerjoin(InventoryCategory, InventoryCategory.id == InventoryMaster.category_id)
                .outerjoin(SubCat, SubCat.id == InventoryMaster.sub_category_id)
                .where(InventoryMaster.id == record.item_id)
            )
            row = item_result.one_or_none()
            if row:
                record.item_name = row[0]
                record.item_code = row[1]
                record.category_name = row[2]
                record.sub_category_name = row[3]
        return record

    async def get(self, record_id: str) -> Optional[HospitalInventory]:
        record = await self.repo.get(record_id)
        if record:
            await self._attach_names(record)
        return record

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None, order_by: str = None, descending: bool = False) -> List[HospitalInventory]:
        query = select(HospitalInventory)
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                sub = select(InventoryMaster.id).where(
                    InventoryMaster.name.ilike(like) | InventoryMaster.code.ilike(like) | InventoryMaster.brand.ilike(like)
                )
                query = query.where(HospitalInventory.item_id.in_(sub))
            for key, value in filters.items():
                if value is None or key == "search":
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(HospitalInventory, key[:-4]).in_(value))
                elif hasattr(HospitalInventory, key):
                    query = query.where(getattr(HospitalInventory, key) == value)
        if order_by and hasattr(HospitalInventory, order_by):
            col = getattr(HospitalInventory, order_by)
            query = query.order_by(col.desc() if descending else col)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        records = list(result.scalars().all())
        for record in records:
            await self._attach_names(record)
        return records

    async def count(self, filters: dict = None) -> int:
        query = select(func.count(HospitalInventory.id))
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                sub = select(InventoryMaster.id).where(
                    InventoryMaster.name.ilike(like) | InventoryMaster.code.ilike(like) | InventoryMaster.brand.ilike(like)
                )
                query = query.where(HospitalInventory.item_id.in_(sub))
            for key, value in filters.items():
                if value is None or key == "search":
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(HospitalInventory, key[:-4]).in_(value))
                elif hasattr(HospitalInventory, key):
                    query = query.where(getattr(HospitalInventory, key) == value)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def update(self, record_id: str, data: dict, user_id: str = None) -> Optional[HospitalInventory]:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        record = await self.repo.update(record_id, **clean_data)
        if record:
            await self._attach_names(record)
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_STOCK", entity_type="HOSPITAL_INVENTORY", entity_id=record_id, details="Stock record updated")
        return record

    async def delete(self, record_id: str, user_id: str = None) -> bool:
        record = await self.repo.get(record_id)
        if not record:
            return False
        result = await self.repo.delete(record_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_STOCK", entity_type="HOSPITAL_INVENTORY", entity_id=record_id, details="Stock record deleted")
        return result

    async def sync_master_items_for_hospital(self, hospital_id: str) -> int:
        """Idempotently ensure every ACTIVE master item has a stock row for the hospital."""
        hospital = (await self.db.execute(select(Hospital).where(Hospital.id == hospital_id))).scalar_one_or_none()
        if not hospital:
            return 0
        items = (await self.db.execute(
            select(InventoryMaster).where(InventoryMaster.status == "ACTIVE")
        )).scalars().all()
        existing_ids = set((await self.db.execute(
            select(HospitalInventory.item_id).where(HospitalInventory.hospital_id == hospital_id)
        )).scalars().all())
        created = 0
        for item in items:
            if item.id in existing_ids:
                continue
            self.db.add(HospitalInventory(
                hospital_id=hospital_id,
                item_id=item.id,
                unit=item.unit,
                quantity=0,
                is_active=True,
            ))
            created += 1
        if created:
            await self.db.flush()
        return created


async def backfill_master_items_for_all_hospitals():
    """Add the complete master catalogue to every existing hospital (idempotent)."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        service = HospitalInventoryService(db)
        hospital_ids = (await db.execute(select(Hospital.id))).scalars().all()
        total = 0
        for hospital_id in hospital_ids:
            total += await service.sync_master_items_for_hospital(hospital_id)
        await db.commit()
        logger.info("Backfilled master items for %s hospitals (%s new stock rows)", len(hospital_ids), total)
        return total
