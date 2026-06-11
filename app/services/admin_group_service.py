from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.repositories.admin_group_repository import AdminGroupRepository
from app.repositories.hospital_repository import HospitalRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.admin_group import AdminGroup
from app.models.hospital import Hospital
from app.models.user import User
from app.models.patient import Patient
from app.core.permissions import Role


class AdminGroupService:
    def __init__(self, db: AsyncSession):
        self.repo = AdminGroupRepository(db)
        self.hospital_repo = HospitalRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def _compute_counts(self, group_id: str) -> dict:
        hospital_count = (await self.db.execute(select(func.count(Hospital.id)).where(Hospital.admin_group_id == group_id))).scalar() or 0
        doctor_count = (await self.db.execute(select(func.count(User.id)).where(User.admin_group_id == group_id, User.role == Role.DOCTOR.value))).scalar() or 0
        hosp_ids_result = await self.db.execute(select(Hospital.id).where(Hospital.admin_group_id == group_id))
        hosp_ids = [row[0] for row in hosp_ids_result.all()]
        patient_count = 0
        if hosp_ids:
            patient_count = (await self.db.execute(select(func.count(Patient.id)).where(Patient.hospital_id.in_(hosp_ids)))).scalar() or 0
        return {"hospital_count": hospital_count, "doctor_count": doctor_count, "patient_count": patient_count}

    async def create(self, data: dict, user_id: str = None) -> AdminGroup:
        group = await self.repo.create(**data)
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_ADMIN_GROUP", entity_type="ADMIN_GROUP", entity_id=str(group.id), details=f"Admin group '{group.name}' created")
        return group

    async def get(self, group_id: str) -> Optional[AdminGroup]:
        group = await self.repo.get(group_id)
        if group:
            counts = await self._compute_counts(group_id)
            for k, v in counts.items():
                setattr(group, k, v)
        return group

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[AdminGroup]:
        groups = await self.repo.get_all(skip=skip, limit=limit)
        for g in groups:
            counts = await self._compute_counts(g.id)
            for k, v in counts.items():
                setattr(g, k, v)
        return groups

    async def update(self, group_id: str, data: dict, user_id: str = None) -> Optional[AdminGroup]:
        group = await self.repo.update(group_id, **data)
        if group:
            counts = await self._compute_counts(group_id)
            for k, v in counts.items():
                setattr(group, k, v)
            await self.audit_log_repo.create(user_id=user_id, action="UPDATE_ADMIN_GROUP", entity_type="ADMIN_GROUP", entity_id=group_id, details="Admin group updated")
        return group

    async def delete(self, group_id: str, user_id: str = None) -> bool:
        result = await self.repo.delete(group_id)
        if result:
            await self.audit_log_repo.create(user_id=user_id, action="DELETE_ADMIN_GROUP", entity_type="ADMIN_GROUP", entity_id=group_id, details="Admin group deleted")
        return result

    async def get_analytics(self, group_id: str = None) -> Dict[str, Any]:
        return {"total_groups": 1 if group_id else await self.repo.count(), "total_hospitals": await self.hospital_repo.count({"admin_group_id": group_id} if group_id else None)}
