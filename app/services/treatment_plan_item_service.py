import json
import logging
from typing import Optional, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException, status
from app.repositories.treatment_plan_item_repository import TreatmentPlanItemRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.treatment_plan_item import TreatmentPlanItem
from app.models.case import Case
from app.models.user import User

logger = logging.getLogger(__name__)


def _enrich_item(item: TreatmentPlanItem):
    if item.tooth_numbers and isinstance(item.tooth_numbers, str):
        try:
            item.tooth_numbers = json.loads(item.tooth_numbers)
        except (json.JSONDecodeError, TypeError):
            pass
    setattr(item, "assigned_doctor_name", item.assigned_doctor.full_name if item.assigned_doctor else None)
    setattr(item, "assistant_doctor_name", item.assistant_doctor.full_name if item.assistant_doctor else None)
    setattr(item, "created_by_name", item.created_by.full_name if item.created_by else None)
    return item


class TreatmentPlanItemService:
    def __init__(self, db: AsyncSession):
        self.repo = TreatmentPlanItemRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def get_current_items(self, case_id: str) -> List[TreatmentPlanItem]:
        items = await self.repo.get_current_by_case(case_id)
        return [_enrich_item(i) for i in items]

    async def get_item(self, item_id: str) -> Optional[TreatmentPlanItem]:
        item = await self.repo.get(item_id)
        return _enrich_item(item) if item else None

    async def get_all_versions(self, case_id: str) -> List[List[TreatmentPlanItem]]:
        versions = await self.repo.get_all_versions(case_id)
        return [[_enrich_item(i) for i in v] for v in versions]

    async def create_items(self, case_id: str, items_data: List[dict], user_id: str = None) -> List[TreatmentPlanItem]:
        case_result = await self.db.execute(select(Case).where(Case.id == case_id))
        case = case_result.scalar_one_or_none()
        if not case:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Case {case_id} not found")

        current_version = case.treatment_plan_version or 0
        new_version = current_version + 1

        old_items = await self.repo.get_current_by_case(case_id)
        for old_item in old_items:
            old_item.is_current = False

        created_items = []
        for idx, item_data in enumerate(items_data):
            tooth_numbers = item_data.pop("tooth_numbers", None)
            if tooth_numbers and isinstance(tooth_numbers, list):
                tooth_numbers = json.dumps(tooth_numbers)
            item_data["case_id"] = case_id
            item_data["version"] = new_version
            item_data["is_current"] = True
            item_data["sequence_order"] = item_data.get("sequence_order", idx)
            item_data["tooth_numbers"] = tooth_numbers
            item_data["created_by_id"] = user_id
            item = await self.repo.create(**item_data)
            created_items.append(item)

        case.treatment_plan_version = new_version
        await self.db.flush()

        await self.audit_log_repo.create(
            user_id=user_id,
            action="CREATE_TREATMENT_PLAN_ITEMS",
            entity_type="TREATMENT_PLAN_ITEM",
            entity_id=case_id,
            details=f"Created {len(created_items)} treatment plan items (v{new_version})",
        )
        return [_enrich_item(i) for i in created_items]

    async def update_item(self, item_id: str, data: dict, user_id: str = None) -> Optional[TreatmentPlanItem]:
        item = await self.repo.get(item_id)
        if not item:
            return None

        case_result = await self.db.execute(select(Case).where(Case.id == item.case_id))
        case = case_result.scalar_one_or_none()
        if case and case.treatment_plan_status.value == "APPROVED":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit items after case is approved")

        tooth_numbers = data.pop("tooth_numbers", None)
        if tooth_numbers is not None:
            data["tooth_numbers"] = json.dumps(tooth_numbers) if isinstance(tooth_numbers, list) else tooth_numbers

        item = await self.repo.update(item_id, **data)
        if item:
            await self.audit_log_repo.create(
                user_id=user_id,
                action="UPDATE_TREATMENT_PLAN_ITEM",
                entity_type="TREATMENT_PLAN_ITEM",
                entity_id=item_id,
                details="Treatment plan item updated",
            )
        return _enrich_item(item) if item else None

    async def delete_item(self, item_id: str, user_id: str = None) -> bool:
        item = await self.repo.get(item_id)
        if not item:
            return False

        case_result = await self.db.execute(select(Case).where(Case.id == item.case_id))
        case = case_result.scalar_one_or_none()
        if case and case.treatment_plan_status.value == "APPROVED":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete items after case is approved")

        result = await self.repo.delete(item_id)
        if result:
            await self.audit_log_repo.create(
                user_id=user_id,
                action="DELETE_TREATMENT_PLAN_ITEM",
                entity_type="TREATMENT_PLAN_ITEM",
                entity_id=item_id,
                details="Treatment plan item deleted",
            )
        return result
