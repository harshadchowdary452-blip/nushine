import logging
from typing import Optional
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.jwt import decode_token
from app.database import get_db
from app.models.user import User
from app.models.hospital import Hospital
from app.core.permissions import Role

logger = logging.getLogger(__name__)


async def get_current_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authorization header",
        )
    token = authorization.split(" ")[1]
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    uid = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        logger.warning("GET_CURRENT_USER FAIL: uid=%s not found or inactive", uid)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    logger.info("GET_CURRENT_USER OK: uid=%s role=%s", uid, role_val)
    return {
        "sub": str(user.id),
        "role": user.role.value if hasattr(user.role, 'value') else str(user.role),
        "hospital_id": str(user.hospital_id) if user.hospital_id else None,
        "admin_group_id": str(user.admin_group_id) if user.admin_group_id else None,
        "email": user.email,
        "full_name": user.full_name,
    }


async def verify_hospital_context(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    x_hospital_id: Optional[str] = Header(None, alias="X-Hospital-ID"),
) -> Optional[str]:
    """Validate an X-Hospital-ID context header against the user's RBAC scope.

    Returns the validated hospital id, or None when no context header was sent
    (the endpoint then falls back to the user's default scope). Raises 403 with
    detail "HOSPITAL_CONTEXT_DENIED" when the requested context is not within
    the user's permitted scope, so frontend/localStorage tampering can never
    widen access.
    """
    if not x_hospital_id:
        return None

    role = current_user.get("role")
    if role == Role.SUPER_ADMIN.value:
        result = await db.execute(select(Hospital.id).where(Hospital.id == x_hospital_id))
        if result.scalar_one_or_none():
            return x_hospital_id
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HOSPITAL_CONTEXT_DENIED",
        )

    if role == Role.HOSPITAL_ADMIN.value:
        own = current_user.get("hospital_id")
        if own and x_hospital_id == own:
            return x_hospital_id

    elif role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if agid:
            result = await db.execute(
                select(Hospital.id).where(
                    Hospital.id == x_hospital_id,
                    Hospital.admin_group_id == agid,
                )
            )
            if result.scalar_one_or_none():
                return x_hospital_id

    elif role == Role.DOCTOR.value:
        result = await db.execute(
            select(User.hospital_id).where(User.id == current_user.get("sub"))
        )
        row = result.one_or_none()
        if row and row[0] and x_hospital_id == str(row[0]):
            return x_hospital_id

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="HOSPITAL_CONTEXT_DENIED",
    )
