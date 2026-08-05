import logging
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.repositories.inventory_transaction_repository import InventoryTransactionRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.inventory_transaction import InventoryTransaction, InventoryTransactionType
from app.models.hospital import Hospital
from app.models.inventory_master import InventoryMaster


class InventoryTransactionService:
    def __init__(self, db: AsyncSession):
        self.repo = InventoryTransactionRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> InventoryTransaction:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        hospital_id = clean_data.get("hospital_id")
        item_id = clean_data.get("item_id")
        if not hospital_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required")
        if not item_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="item_id is required")
        txn_type = clean_data.get("transaction_type")
        if not txn_type or txn_type not in [t.value for t in InventoryTransactionType]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"transaction_type must be one of: {', '.join(t.value for t in InventoryTransactionType)}")
        hospital = await self.db.execute(select(Hospital).where(Hospital.id == hospital_id))
        if not hospital.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")
        item_result = await self.db.execute(select(InventoryMaster).where(InventoryMaster.id == item_id))
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        if "quantity" not in clean_data or clean_data.get("quantity") is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity is required")
        clean_data["previous_balance"] = clean_data.get("previous_balance", 0)
        if clean_data.get("current_balance") is None:
            clean_data["current_balance"] = float(clean_data["previous_balance"]) + float(clean_data["quantity"])
        if not clean_data.get("transaction_date"):
            clean_data["transaction_date"] = datetime.now(timezone.utc)
        try:
            transaction = await self.repo.create(**clean_data)
        except Exception as e:
            logging.getLogger(__name__).exception("CREATE_TRANSACTION - Error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create transaction: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_TRANSACTION", entity_type="INVENTORY_TRANSACTION", entity_id=str(transaction.id), details=f"{txn_type} for item '{item.name}'")
        await self._attach_names(transaction)
        return transaction

    async def _attach_names(self, transaction: InventoryTransaction):
        if transaction.hospital_id:
            hospital_result = await self.db.execute(select(Hospital.name).where(Hospital.id == transaction.hospital_id))
            row = hospital_result.one_or_none()
            transaction.hospital_name = row[0] if row else None
        if transaction.item_id:
            item_result = await self.db.execute(
                select(InventoryMaster.name, InventoryMaster.code).where(InventoryMaster.id == transaction.item_id)
            )
            row = item_result.one_or_none()
            if row:
                transaction.item_name = row[0]
                transaction.item_code = row[1]
        return transaction

    async def get(self, transaction_id: str) -> Optional[InventoryTransaction]:
        transaction = await self.repo.get(transaction_id)
        if transaction:
            await self._attach_names(transaction)
        return transaction

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None, order_by: str = None, descending: bool = False) -> List[InventoryTransaction]:
        query = select(InventoryTransaction)
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                sub = select(InventoryMaster.id).where(
                    InventoryMaster.name.ilike(like) | InventoryMaster.code.ilike(like)
                )
                query = query.where(InventoryTransaction.item_id.in_(sub))
            for key, value in filters.items():
                if value is None or key == "search":
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(InventoryTransaction, key[:-4]).in_(value))
                elif key.endswith("__ge"):
                    query = query.where(getattr(InventoryTransaction, key[:-4]) >= value)
                elif key.endswith("__lt"):
                    query = query.where(getattr(InventoryTransaction, key[:-4]) < value)
                elif hasattr(InventoryTransaction, key):
                    query = query.where(getattr(InventoryTransaction, key) == value)
        if order_by and hasattr(InventoryTransaction, order_by):
            col = getattr(InventoryTransaction, order_by)
            query = query.order_by(col.desc() if descending else col)
        else:
            query = query.order_by(InventoryTransaction.transaction_date.desc())
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        transactions = list(result.scalars().all())
        for transaction in transactions:
            await self._attach_names(transaction)
        return transactions

    async def count(self, filters: dict = None) -> int:
        query = select(func.count(InventoryTransaction.id))
        if filters:
            if filters.get("search"):
                like = f"%{filters['search']}%"
                sub = select(InventoryMaster.id).where(
                    InventoryMaster.name.ilike(like) | InventoryMaster.code.ilike(like)
                )
                query = query.where(InventoryTransaction.item_id.in_(sub))
            for key, value in filters.items():
                if value is None or key == "search":
                    continue
                if key.endswith("__in") and isinstance(value, (list, tuple, set)):
                    query = query.where(getattr(InventoryTransaction, key[:-4]).in_(value))
                elif key.endswith("__ge"):
                    query = query.where(getattr(InventoryTransaction, key[:-4]) >= value)
                elif key.endswith("__lt"):
                    query = query.where(getattr(InventoryTransaction, key[:-4]) < value)
                elif hasattr(InventoryTransaction, key):
                    query = query.where(getattr(InventoryTransaction, key) == value)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def update(self, transaction_id: str, data: dict, user_id: str = None) -> Optional[InventoryTransaction]:
        clean_data = {k: v for k, v in data.items() if v is not None and v != ""}
        if clean_data.get("transaction_type"):
            txn_type = clean_data["transaction_type"]
            if txn_type not in [t.value for t in InventoryTransactionType]:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"transaction_type must be one of: {', '.join(t.value for t in InventoryTransactionType)}")
        transaction = await self.repo.update(transaction_id, **clean_data)
        if transaction:
            await self._attach_names(transaction)
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_TRANSACTION", entity_type="INVENTORY_TRANSACTION", entity_id=transaction_id, details="Transaction updated")
        return transaction

    async def delete(self, transaction_id: str, user_id: str = None) -> bool:
        transaction = await self.repo.get(transaction_id)
        if not transaction:
            return False
        result = await self.repo.delete(transaction_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_TRANSACTION", entity_type="INVENTORY_TRANSACTION", entity_id=transaction_id, details="Transaction deleted")
        return result
