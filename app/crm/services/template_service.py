"""Template service — business logic for follow-up templates and automation rules."""
from __future__ import annotations
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.crm.repositories.automation_repo import AutomationRuleRepository, FollowUpTemplateRepository

logger = logging.getLogger(__name__)


class TemplateService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.template_repo = FollowUpTemplateRepository(db)
        self.rule_repo = AutomationRuleRepository(db)

    async def list_templates(self, hospital_id=None, procedure=None, trigger_event=None, skip=0, limit=100) -> dict:
        items, total = await self.template_repo.list(hospital_id=hospital_id, procedure=procedure, trigger_event=trigger_event, skip=skip, limit=limit)
        return {"items": [self._to_dict(t) for t in items], "total": total}

    async def get_template(self, template_id: str) -> Optional[dict]:
        t = await self.template_repo.get(template_id)
        return self._to_dict(t) if t else None

    async def create_template(self, data: dict) -> dict:
        from app.models.follow_up_template import FollowUpTemplate
        t = FollowUpTemplate(**data)
        await self.template_repo.create(t)
        return self._to_dict(t)

    async def update_template(self, template_id: str, data: dict) -> Optional[dict]:
        t = await self.template_repo.get(template_id)
        if not t:
            return None
        for k, v in data.items():
            if v is not None and hasattr(t, k):
                setattr(t, k, v)
        await self.template_repo.update(t)
        return self._to_dict(t)

    async def delete_template(self, template_id: str) -> bool:
        t = await self.template_repo.get(template_id)
        if not t:
            return False
        await self.template_repo.delete(t)
        return True

    async def list_rules(self, hospital_id=None, trigger_event=None, procedure=None, skip=0, limit=100) -> dict:
        items, total = await self.rule_repo.list(hospital_id=hospital_id, trigger_event=trigger_event, procedure=procedure, skip=skip, limit=limit)
        return {"items": [self._rule_to_dict(r) for r in items], "total": total}

    async def get_rule(self, rule_id: str) -> Optional[dict]:
        r = await self.rule_repo.get(rule_id)
        return self._rule_to_dict(r) if r else None

    async def create_rule(self, data: dict) -> dict:
        from app.models.automation_rule import AutomationRule
        r = AutomationRule(**data)
        await self.rule_repo.create(r)
        return self._rule_to_dict(r)

    async def update_rule(self, rule_id: str, data: dict) -> Optional[dict]:
        r = await self.rule_repo.get(rule_id)
        if not r:
            return None
        for k, v in data.items():
            if v is not None and hasattr(r, k):
                setattr(r, k, v)
        await self.rule_repo.update(r)
        return self._rule_to_dict(r)

    async def delete_rule(self, rule_id: str) -> bool:
        r = await self.rule_repo.get(rule_id)
        if not r:
            return False
        await self.rule_repo.delete(r)
        return True

    async def toggle_rule(self, rule_id: str) -> Optional[dict]:
        r = await self.rule_repo.get(rule_id)
        if not r:
            return None
        r.is_active = not r.is_active
        await self.rule_repo.update(r)
        return self._rule_to_dict(r)

    def _to_dict(self, t) -> dict:
        return {c.name: getattr(t, c.name, None) for c in t.__table__.columns}

    def _rule_to_dict(self, r) -> dict:
        return {c.name: getattr(r, c.name, None) for c in r.__table__.columns}
