import json
import logging
from typing import List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException, status
from app.models.treatment_plan_item import TreatmentPlanItem
from app.models.treatment_plan import TreatmentPlan, TreatmentPlanStatus
from app.models.case import Case
from app.models.patient import Patient

logger = logging.getLogger(__name__)


class TreatmentGenerator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_from_items(self, items: List[TreatmentPlanItem], user_id: str = None) -> List[TreatmentPlan]:
        if not items:
            return []

        case_id = items[0].case_id
        case_result = await self.db.execute(select(Case).where(Case.id == case_id))
        case = case_result.scalar_one_or_none()
        if not case:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Case {case_id} not found")

        # Check if treatments already exist for these items
        existing = await self.db.execute(
            select(TreatmentPlan).where(TreatmentPlan.treatment_plan_item_id.in_([i.id for i in items]))
        )
        existing_ids = {t.treatment_plan_item_id for t in existing.scalars().all()}
        new_items = [i for i in items if i.id not in existing_ids]

        # Build dependency map: item_id -> generated treatment_id
        dep_map = {}
        generated = []

        for item in sorted(new_items, key=lambda x: x.sequence_order):
            tooth_numbers = item.tooth_numbers
            if tooth_numbers and isinstance(tooth_numbers, str):
                try:
                    tooth_numbers = json.loads(tooth_numbers)
                except (json.JSONDecodeError, TypeError):
                    tooth_numbers = None

            plan = TreatmentPlan(
                case_id=case_id,
                treatment_name=item.procedure_name,
                description=item.remarks or "",
                cost=item.estimated_cost,
                total_sittings=item.estimated_visits,
                completed_sittings=0,
                remaining_sittings=item.estimated_visits,
                status=TreatmentPlanStatus.GENERATED,
                assigned_doctor_id=item.assigned_doctor_id,
                assistant_doctor_id=item.assistant_doctor_id,
                tooth_numbers=json.dumps(tooth_numbers) if tooth_numbers else None,
                sequence_order=item.sequence_order,
                treatment_plan_item_id=item.id,
                created_by_id=user_id,
                auto_created=True,
            )
            self.db.add(plan)
            await self.db.flush()

            # Generate treatment number
            try:
                cnt = await self.db.execute(select(func.count(TreatmentPlan.id)))
                plan.treatment_number = f"TRT-{cnt.scalar():04d}"
                await self.db.flush()
            except Exception:
                pass

            # Map dependency
            if item.dependency_item_id and item.dependency_item_id in dep_map:
                plan.dependency_treatment_id = dep_map[item.dependency_item_id]

            # Link back to item
            item.generated_treatment_id = plan.id
            dep_map[item.id] = plan.id
            generated.append(plan)

        await self.db.flush()

        try:
            from app.services.crm_rule_engine import CRMRuleEngine
            crm_engine = CRMRuleEngine(self.db)
            for plan in generated:
                await crm_engine.on_treatment_assigned(plan.id)
            await self.db.flush()
        except Exception as e:
            logger.warning("CRM assigned trigger failed during generation: %s", e)

        logger.info("Generated %d treatments from %d items for case %s", len(generated), len(items), case_id)
        return generated
