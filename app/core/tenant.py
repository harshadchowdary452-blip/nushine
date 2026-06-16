from typing import Optional, Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.hospital import Hospital
from app.core.permissions import Role


async def get_hospital_filter(
    current_user: dict,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """Return filter kwargs for hospital-scoped queries based on user role.

    Returns a dict that can be passed as repository filters, or None for
    SUPER_ADMIN (no restriction), or {"id": None} when the user has no
    accessible hospitals (results in empty query).
    """
    role = current_user.get("role")

    if role == Role.SUPER_ADMIN.value:
        return None

    if role == Role.HOSPITAL_ADMIN.value:
        hid = current_user.get("hospital_id")
        if not hid:
            return {"id": None}
        return {"hospital_id": hid}

    if role == Role.GROUP_ADMIN.value:
        agid = current_user.get("admin_group_id")
        if not agid:
            return {"id": None}
        result = await db.execute(
            select(Hospital.id).where(Hospital.admin_group_id == agid)
        )
        hids: List[str] = [row[0] for row in result.all()]
        if not hids:
            return {"id": None}
        return {"hospital_id__in": hids}

    if role == Role.DOCTOR.value:
        from app.models.user import User
        result = await db.execute(
            select(User.hospital_id).where(User.id == current_user.get("sub"))
        )
        row = result.one_or_none()
        if not row or not row[0]:
            return {"id": None}
        return {"hospital_id": row[0]}

    return None
