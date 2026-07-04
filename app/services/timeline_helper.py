from sqlalchemy.ext.asyncio import AsyncSession
from app.services.timeline_service import TimelineService


async def record_timeline_event(
    db: AsyncSession,
    patient_id: str,
    action: str,
    module: str,
    description: str = None,
    current_user: dict = None,
    user_id: str = None,
    user_name: str = None,
    user_role: str = None,
    hospital_id: str = None,
    hospital_name: str = None,
    changes: list = None,
):
    service = TimelineService(db)
    await service.add_event(
        patient_id=patient_id,
        action=action,
        module=module,
        description=description,
        user_id=user_id or (current_user.get("sub") if current_user else None),
        user_name=user_name or (current_user.get("full_name") if current_user else None),
        user_role=user_role or (current_user.get("role") if current_user else None),
        hospital_id=hospital_id or (current_user.get("hospital_id") if current_user else None),
        hospital_name=hospital_name or (current_user.get("hospital_name") if current_user else None),
        changes=changes,
    )


def _val(v):
    if v is None:
        return None
    if hasattr(v, 'value'):
        return str(v.value)
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    return str(v)


def build_changes(data: dict, old_data: dict = None, tracked_fields: list = None) -> list:
    """Build a changes list for tracking what fields changed."""
    changes = []
    if not data:
        return changes
    if old_data is None:
        old_data = {}
    for field in (tracked_fields or data.keys()):
        if field in data:
            old_val = _val(old_data.get(field))
            new_val = _val(data[field])
            if old_val != new_val:
                changes.append({
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                })
    return changes
