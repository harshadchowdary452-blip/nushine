from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.consultant_repository import ConsultantRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.consultant import Consultant


class ConsultantService:
    def __init__(self, db: AsyncSession):
        self.repo = ConsultantRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> Consultant:
        consultant = await self.repo.create(**data)
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_CONSULTANT", entity_type="CONSULTANT", entity_id=str(consultant.id), details=f"Consultant '{consultant.full_name}' created")
        return consultant

    async def get(self, consultant_id: str) -> Optional[Consultant]:
        return await self.repo.get(consultant_id)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None, order_by: str = None, descending: bool = False) -> List[Consultant]:
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters, order_by=order_by, descending=descending)

    async def update(self, consultant_id: str, data: dict, user_id: str = None) -> Optional[Consultant]:
        consultant = await self.repo.update(consultant_id, **data)
        if consultant:
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_CONSULTANT", entity_type="CONSULTANT", entity_id=consultant_id, details="Consultant updated")
        return consultant
