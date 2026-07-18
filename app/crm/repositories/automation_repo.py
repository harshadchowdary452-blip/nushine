"""Automation rule + template repository."""
from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.automation_rule import AutomationRule
from app.models.follow_up_template import FollowUpTemplate


class AutomationRuleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, rule_id: str) -> Optional[AutomationRule]:
        return await self.db.get(AutomationRule, rule_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        trigger_event: Optional[str] = None,
        procedure: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[AutomationRule], int]:
        query = select(AutomationRule)
        count_query = select(func.count()).select_from(AutomationRule)

        if hospital_id:
            query = query.where(or_(AutomationRule.hospital_id == None, AutomationRule.hospital_id == hospital_id))
            count_query = count_query.where(or_(AutomationRule.hospital_id == None, AutomationRule.hospital_id == hospital_id))
        if trigger_event:
            query = query.where(AutomationRule.trigger_event == trigger_event)
            count_query = count_query.where(AutomationRule.trigger_event == trigger_event)
        if procedure:
            query = query.where(or_(AutomationRule.procedure == None, AutomationRule.procedure == procedure))
            count_query = count_query.where(or_(AutomationRule.procedure == None, AutomationRule.procedure == procedure))

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(AutomationRule.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_active_for_event(self, event: str, procedure: Optional[str] = None, hospital_id: Optional[str] = None) -> list[AutomationRule]:
        query = select(AutomationRule).where(AutomationRule.is_active == True, AutomationRule.trigger_event == event)
        query = query.where(or_(AutomationRule.procedure == None, AutomationRule.procedure == procedure))
        if hospital_id:
            query = query.where(or_(AutomationRule.hospital_id == None, AutomationRule.hospital_id == hospital_id))
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, rule: AutomationRule) -> AutomationRule:
        self.db.add(rule)
        await self.db.flush()
        return rule

    async def update(self, rule: AutomationRule) -> AutomationRule:
        await self.db.flush()
        return rule

    async def delete(self, rule: AutomationRule) -> None:
        await self.db.delete(rule)
        await self.db.flush()


class FollowUpTemplateRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, template_id: str) -> Optional[FollowUpTemplate]:
        return await self.db.get(FollowUpTemplate, template_id)

    async def list(
        self,
        hospital_id: Optional[str] = None,
        procedure: Optional[str] = None,
        trigger_event: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[FollowUpTemplate], int]:
        query = select(FollowUpTemplate).where(FollowUpTemplate.is_active == True)
        count_query = select(func.count()).select_from(FollowUpTemplate).where(FollowUpTemplate.is_active == True)

        if hospital_id:
            query = query.where(or_(FollowUpTemplate.hospital_id == None, FollowUpTemplate.hospital_id == hospital_id))
            count_query = count_query.where(or_(FollowUpTemplate.hospital_id == None, FollowUpTemplate.hospital_id == hospital_id))
        if procedure:
            query = query.where(FollowUpTemplate.procedure == procedure)
            count_query = count_query.where(FollowUpTemplate.procedure == procedure)
        if trigger_event:
            query = query.where(FollowUpTemplate.trigger_event == trigger_event)
            count_query = count_query.where(FollowUpTemplate.trigger_event == trigger_event)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(FollowUpTemplate.created_at.desc()).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def create(self, template: FollowUpTemplate) -> FollowUpTemplate:
        self.db.add(template)
        await self.db.flush()
        return template

    async def update(self, template: FollowUpTemplate) -> FollowUpTemplate:
        await self.db.flush()
        return template

    async def delete(self, template: FollowUpTemplate) -> None:
        await self.db.delete(template)
        await self.db.flush()
