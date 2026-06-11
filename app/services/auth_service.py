from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.repositories.user_repository import UserRepository
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.core.security import hash_password, verify_password
from app.core.jwt import create_access_token, create_refresh_token, decode_token
from app.config import settings


class AuthService:
    def __init__(self, db: AsyncSession):
        self.user_repo = UserRepository(db)
        self.refresh_token_repo = RefreshTokenRepository(db)
        self.audit_log_repo = AuditLogRepository(db)
        self.db = db

    async def login(self, email: str, password: str, ip_address: Optional[str] = None):
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
        access_token = create_access_token(data={"sub": str(user.id), "role": user.role.value, "hospital_id": str(user.hospital_id) if user.hospital_id else None, "admin_group_id": str(user.admin_group_id) if user.admin_group_id else None})
        refresh_token = create_refresh_token(data={"sub": str(user.id), "role": user.role.value, "admin_group_id": str(user.admin_group_id) if user.admin_group_id else None})
        token_hash = sha256(refresh_token.encode()).hexdigest()
        await self.refresh_token_repo.create(user_id=user.id, token_hash=token_hash, expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
        user.last_login = datetime.now(timezone.utc)
        await self.db.flush()
        await self.audit_log_repo.create(user_id=user.id, action="LOGIN", entity_type="USER", entity_id=str(user.id), details=f"User {user.email} logged in", ip_address=ip_address)
        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer", "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role.value, "hospital_id": str(user.hospital_id) if user.hospital_id else None, "admin_group_id": str(user.admin_group_id) if user.admin_group_id else None, "phone": user.phone, "is_active": user.is_active, "specialization": user.specialization, "license_number": user.license_number, "is_verified": user.is_verified, "last_login": user.last_login.isoformat() if user.last_login else None, "created_at": user.created_at.isoformat() if user.created_at else None, "updated_at": user.updated_at.isoformat() if user.updated_at else None}}

    async def refresh_access_token(self, refresh_token: str, ip_address: Optional[str] = None):
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        token_hash = sha256(refresh_token.encode()).hexdigest()
        stored_token = await self.refresh_token_repo.get_by_token_hash(token_hash)
        if not stored_token or stored_token.is_revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked")
        if stored_token.expires_at.replace(tzinfo=None) < datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has expired")
        stored_token.is_revoked = True
        await self.db.flush()
        user = await self.user_repo.get(payload["sub"])
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
        new_access_token = create_access_token(data={"sub": str(user.id), "role": user.role.value, "hospital_id": str(user.hospital_id) if user.hospital_id else None, "admin_group_id": str(user.admin_group_id) if user.admin_group_id else None})
        new_refresh_token = create_refresh_token(data={"sub": str(user.id), "role": user.role.value, "admin_group_id": str(user.admin_group_id) if user.admin_group_id else None})
        new_token_hash = sha256(new_refresh_token.encode()).hexdigest()
        await self.refresh_token_repo.create(user_id=user.id, token_hash=new_token_hash, expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
        return {"access_token": new_access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}

    async def logout(self, user_id: str, refresh_token: Optional[str] = None):
        if refresh_token:
            token_hash = sha256(refresh_token.encode()).hexdigest()
            stored_token = await self.refresh_token_repo.get_by_token_hash(token_hash)
            if stored_token:
                stored_token.is_revoked = True
                await self.db.flush()
        else:
            await self.refresh_token_repo.revoke_user_tokens(user_id)
        await self.audit_log_repo.create(user_id=user_id, action="LOGOUT", entity_type="USER", entity_id=user_id, details="User logged out")
        return {"message": "Logged out successfully"}

    async def change_password(self, user_id: str, current_password: str, new_password: str):
        user = await self.user_repo.get(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        user.password_hash = hash_password(new_password)
        await self.db.flush()
        await self.refresh_token_repo.revoke_user_tokens(user_id)
        await self.audit_log_repo.create(user_id=user_id, action="CHANGE_PASSWORD", entity_type="USER", entity_id=user_id, details="Password changed")
        return {"message": "Password changed successfully"}
