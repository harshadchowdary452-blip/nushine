from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import get_db
from app.dependencies import get_current_user
from app.services.auth_service import AuthService
from app.schemas.auth import LoginRequest, LoginResponse, RefreshTokenRequest, TokenResponse, ChangePasswordRequest, UpdateProfileRequest
from app.schemas.common import MessageResponse
from app.repositories.user_repository import UserRepository

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
