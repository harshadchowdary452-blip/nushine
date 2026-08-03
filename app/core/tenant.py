from typing import Optional, Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.hospital import Hospital
from app.core.permissions import Role


async def get_user_admin_group_id(db: AsyncSession, current_user: dict) -> Optional[str]:
    """Resolve the caller's admin_group_id (token claim, else their hospital's group)."""
    agid = current_user.get("admin_group_id")
    if agid:
        return str(agid)
    hid = current_user.get("hospital_id")
    if not hid:
        return None
    result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == hid))
    row = result.one_or_none()
    return str(row[0]) if row and row[0] else None


async def get_group_hospital_ids(db: AsyncSession, agid: str) -> List[str]:
    """Return the ids of all hospitals belonging to an admin group."""
    result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
    return [row[0] for row in result.all()]


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
        hids = await get_group_hospital_ids(db, agid)
        if not hids:
            return {"id": None}
        return {"hospital_id__in": hids}

    if role == Role.DOCTOR.value:
        # Doctors in an admin group see patients of all group hospitals, so they
        # can pick a patient from any hospital the group admin manages.
        agid = await get_user_admin_group_id(db, current_user)
        if agid:
            hids = await get_group_hospital_ids(db, agid)
            if hids:
                return {"hospital_id__in": hids}
        from app.models.user import User
        result = await db.execute(
            select(User.hospital_id).where(User.id == current_user.get("sub"))
        )
        row = result.one_or_none()
        if not row or not row[0]:
            return {"id": None}
        return {"hospital_id": row[0]}

    return None
