import logging
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.jwt import decode_token
from app.database import get_db
from app.models.user import User
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
