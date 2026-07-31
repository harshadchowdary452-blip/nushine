from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import get_db
from app.dependencies import get_current_user
from app.services.auth_service import AuthService
from app.schemas.auth import LoginRequest, LoginResponse, RefreshTokenRequest, TokenResponse, ChangePasswordRequest, UpdateProfileRequest, ContextSwitchRequest, ContextSwitchResponse
from app.schemas.common import MessageResponse
from app.repositories.user_repository import UserRepository
from app.core.permissions import Role

router = APIRouter(prefix="/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(request: Request, login_request: LoginRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    return await service.login(login_request.email, login_request.password)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh_token(request: Request, refresh_request: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    return await service.refresh_access_token(refresh_request.refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = AuthService(db)
    return await service.logout(current_user.get("sub"))


@router.get("/me")
async def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    from app.database import async_session_factory
    from app.models.user import User
    from sqlalchemy import select
    uid = current_user.get("sub")
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role.value, "hospital_id": str(user.hospital_id) if user.hospital_id else None, "phone": user.phone, "specialization": user.specialization, "license_number": user.license_number, "is_active": user.is_active, "is_verified": user.is_verified, "last_login": user.last_login.isoformat() if user.last_login else None, "created_at": user.created_at.isoformat() if user.created_at else None, "updated_at": user.updated_at.isoformat() if user.updated_at else None}


@router.put("/me", response_model=MessageResponse)
async def update_profile(request: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    from app.database import async_session_factory
    from app.models.user import User
    from sqlalchemy import select
    uid = current_user.get("sub")
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.full_name = request.full_name
        if request.phone is not None:
            user.phone = request.phone
        if request.specialization is not None:
            user.specialization = request.specialization
        if request.license_number is not None:
            user.license_number = request.license_number
        await db.commit()
    return {"message": "Profile updated successfully"}


@router.post("/change-password", response_model=MessageResponse)
@limiter.limit("3/minute")
async def change_password(request: Request, change_request: ChangePasswordRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    service = AuthService(db)
    return await service.change_password(current_user.get("sub"), change_request.current_password, change_request.new_password)


async def _resolve_hospital(db: AsyncSession, hospital_id: str):
    from app.models.hospital import Hospital
    result = await db.execute(
        select(Hospital).where(Hospital.id == hospital_id, Hospital.is_active.is_(True))
    )
    return result.scalar_one_or_none()


async def _resolve_group_name(db: AsyncSession, group_id: Optional[str]) -> Optional[str]:
    if not group_id:
        return None
    from app.models.admin_group import AdminGroup
    result = await db.execute(select(AdminGroup.name).where(AdminGroup.id == group_id))
    return result.scalar_one_or_none()


@router.post("/context/switch", response_model=ContextSwitchResponse)
async def switch_context(data: ContextSwitchRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Resolve and validate an application context (global / group / hospital).

    Every context change is validated server-side against the current user's
    RBAC scope before the frontend may apply it. Clients can never widen their
    access by tampering with headers, URLs or local storage.
    """
    role = current_user.get("role")
    user_id = current_user.get("sub")

    if data.hospital_id:
        hospital = await _resolve_hospital(db, data.hospital_id)
        if not hospital:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hospital not found")

        if role == Role.HOSPITAL_ADMIN.value:
            own = current_user.get("hospital_id")
            if not own or data.hospital_id != own:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")

        elif role == Role.DOCTOR.value:
            from app.models.user import User
            result = await db.execute(select(User.hospital_id).where(User.id == user_id))
            row = result.one_or_none()
            if not row or not row[0] or data.hospital_id != str(row[0]):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")

        elif role == Role.GROUP_ADMIN.value:
            agid = current_user.get("admin_group_id")
            if not agid or str(hospital.admin_group_id) != str(agid):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HOSPITAL_CONTEXT_DENIED")

        # SUPER_ADMIN is permitted to switch to any active hospital.

        group_name = await _resolve_group_name(db, str(hospital.admin_group_id) if hospital.admin_group_id else None)
        await _audit_context_switch(db, user_id, "hospital", data.hospital_id, hospital.name)
        return ContextSwitchResponse(
            scope="hospital",
            hospital_id=data.hospital_id,
            hospital_name=hospital.name,
            admin_group_id=str(hospital.admin_group_id) if hospital.admin_group_id else None,
            admin_group_name=group_name,
        )

    # No hospital_id -> resolve the user's default scope.
    if role == Role.SUPER_ADMIN.value:
        return ContextSwitchResponse(scope="global")

    if role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        group_name = await _resolve_group_name(db, agid)
        return ContextSwitchResponse(
            scope="group",
            admin_group_id=agid,
            admin_group_name=group_name,
        )

    hid = current_user.get("hospital_id")
    hospital = await _resolve_hospital(db, hid) if hid else None
    if role == Role.HOSPITAL_ADMIN.value:
        group_name = await _resolve_group_name(db, current_user.get("admin_group_id"))
        return ContextSwitchResponse(
            scope="hospital",
            hospital_id=hid,
            hospital_name=hospital.name if hospital else None,
            admin_group_id=current_user.get("admin_group_id"),
            admin_group_name=group_name,
        )

    if role == Role.DOCTOR.value:
        from app.models.user import User
        result = await db.execute(
            select(User.hospital_id, User.admin_group_id).where(User.id == user_id)
        )
        row = result.one_or_none()
        doctor_hid = str(row[0]) if row and row[0] else None
        doctor_agid = str(row[1]) if row and row[1] else None
        hospital = await _resolve_hospital(db, doctor_hid) if doctor_hid else None
        group_name = await _resolve_group_name(db, doctor_agid)
        return ContextSwitchResponse(
            scope="hospital",
            hospital_id=doctor_hid,
            hospital_name=hospital.name if hospital else None,
            admin_group_id=doctor_agid,
            admin_group_name=group_name,
        )

    return ContextSwitchResponse(scope="global")


async def _audit_context_switch(db: AsyncSession, user_id: Optional[str], entity_type: str, entity_id: Optional[str], details: Optional[str]):
    try:
        from app.repositories.audit_log_repository import AuditLogRepository
        repo = AuditLogRepository(db)
        await repo.create(
            user_id=user_id,
            action="CONTEXT_SWITCH",
            entity_type=entity_type.upper(),
            entity_id=entity_id,
            details=f"Context switched to {entity_type}: {details}" if details else f"Context switched to {entity_type}",
        )
    except Exception:
        pass
