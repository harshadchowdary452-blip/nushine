from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from app.repositories.user_repository import UserRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.models.user import User
from app.core.security import hash_password


class UserService:
    def __init__(self, db: AsyncSession):
        self.repo = UserRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def create(self, data: dict, user_id: str = None) -> User:
        from app.core.permissions import Role
        import logging
        logger = logging.getLogger(__name__)
        logger.info("CREATE_USER - Request data: %s", {k: v for k, v in data.items() if k != "password"})

        role_str = data.get("role")
        if role_str == Role.GROUP_ADMIN.value:
            if not data.get("admin_group_id"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin_group_id is required for GROUP_ADMIN users")
        elif role_str == Role.HOSPITAL_ADMIN.value:
            if not data.get("hospital_id"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required for HOSPITAL_ADMIN users")
            if not data.get("admin_group_id"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin_group_id is required for HOSPITAL_ADMIN users")
        elif role_str == Role.DOCTOR.value:
            if not data.get("hospital_id"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hospital_id is required for DOCTOR users")
            if not data.get("admin_group_id"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin_group_id is required for DOCTOR users")

        create_data = {k: v for k, v in data.items() if k != "password"}
        create_data["password_hash"] = hash_password(data.get("password", ""))
        try:
            user = await self.repo.create(**create_data)
        except IntegrityError as e:
            logger.error("CREATE_USER - Integrity error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Database integrity error: {str(e.orig)}")
        except Exception as e:
            logger.exception("CREATE_USER - Unexpected error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create user: {str(e)}")
        await self.audit_log_repo.create(user_id=user_id, action="CREATE_USER", entity_type="USER", entity_id=str(user.id), details=f"User '{user.email}' created with role {user.role.value}")
        return user

    async def get(self, user_id: str) -> Optional[User]:
        return await self.repo.get(user_id)

    async def get_by_email(self, email: str) -> Optional[User]:
        return await self.repo.get_by_email(email)

    async def get_all(self, skip: int = 0, limit: int = 100, filters: dict = None) -> List[User]:
        return await self.repo.get_all(skip=skip, limit=limit, filters=filters)

    async def update(self, user_id: str, data: dict, admin_id: str = None) -> Optional[User]:
        update_data = {k: v for k, v in data.items() if k != "password"}
        if "password" in data and data["password"]:
            update_data["password_hash"] = hash_password(data["password"])
        user = await self.repo.update(user_id, **update_data)
        if user:
            await self.audit_log_repo.create(user_id=admin_id, action="UPDATE_USER", entity_type="USER", entity_id=user_id, details="User updated")
        return user

    async def deactivate(self, user_id: str, admin_id: str = None) -> Optional[User]:
        user = await self.repo.update(user_id, is_active=False)
        if user:
            await self.audit_log_repo.create(user_id=admin_id, action="DEACTIVATE_USER", entity_type="USER", entity_id=user_id, details=f"User deactivated")
        return user

    async def activate(self, user_id: str, admin_id: str = None) -> Optional[User]:
        user = await self.repo.update(user_id, is_active=True)
        if user:
            await self.audit_log_repo.create(user_id=admin_id, action="ACTIVATE_USER", entity_type="USER", entity_id=user_id, details=f"User activated")
        return user
