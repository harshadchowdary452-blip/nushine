"""
CRM Settings API — Configuration-only (Phase 3.2).

Five sections:
  1. General Settings  — CrmConfig key-value store
  2. Lead Settings     — CrmFollowUpConfig (context_type=LEAD)
  3. OPD Settings      — CrmFollowUpConfig (context_type=OPD)
  4. Treatment Settings — CrmFollowUpConfig (context_type=TREATMENT) per treatment type
  5. Case Settings     — CrmFollowUpConfig (context_type=CASE_RECOVERY + CASE_RECALL)

NO rule engine, NO event dispatcher, NO scheduling — config storage only.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, not_
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.models.crm_config import CrmConfig
from app.models.crm_follow_up_config import CrmFollowUpConfig
from app.models.treatment_type import TreatmentType

router = APIRouter(prefix="/crm-config", tags=["CRM Config Settings"])


# ─── Helpers ──────────────────────────────────────────────────────────────

def _verify_hospital_admin(current_user: dict) -> str:
    role = current_user.get("role")
    if role not in ("SUPER_ADMIN", "GROUP_ADMIN", "HOSPITAL_ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied")
    hospital_id = current_user.get("hospital_id")
    if not hospital_id and role == "HOSPITAL_ADMIN":
        raise HTTPException(status_code=400, detail="Hospital admin must have a hospital")
    if not hospital_id and role in ("SUPER_ADMIN", "GROUP_ADMIN"):
        raise HTTPException(status_code=400, detail="No hospital assigned. Please select a hospital first.")
    return hospital_id


def _invalidate(hospital_id):
    from app.crm.services.crm_settings import get_settings_service
    get_settings_service().invalidate_cache(hospital_id)


def _config_to_dict(c: CrmConfig) -> dict:
    return {
        "id": c.id,
        "hospital_id": c.hospital_id,
        "config_key": c.config_key,
        "config_value": c.config_value,
        "config_group": c.config_group,
    }


def _follow_up_to_dict(c: CrmFollowUpConfig) -> dict:
    return {
        "id": c.id,
        "hospital_id": c.hospital_id,
        "context_type": c.context_type,
        "treatment_type_id": c.treatment_type_id,
        "enabled": c.enabled,
        "start_delay_days": c.start_delay_days,
        "auto_close_on_completion": c.auto_close_on_completion,
        "skip_wellness_if_appointment": getattr(c, 'skip_wellness_if_appointment', False),
        "max_attempts": getattr(c, 'max_attempts', 3),
        "days_between_attempts": getattr(c, 'days_between_attempts', 3),
        "auto_close_after_final": getattr(c, 'auto_close_after_final', False),
        "auto_close_action": getattr(c, 'auto_close_action', 'KEEP_OPEN'),
        "stop_automation_on": getattr(c, 'stop_automation_on', 'CONVERTED,NOT_INTERESTED,LOST'),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


# ─── Schemas ──────────────────────────────────────────────────────────────

class GeneralSettingsUpdate(BaseModel):
    crm_enabled: Optional[bool] = None
    crm_working_days: Optional[str] = None
    crm_reminder_time: Optional[str] = None
    crm_business_start: Optional[str] = None
    crm_business_end: Optional[str] = None
    crm_timezone: Optional[str] = None
    crm_reminder_offset: Optional[str] = None
    crm_weekend_policy: Optional[str] = None
    crm_holidays: Optional[str] = None


class FollowUpConfigData(BaseModel):
    enabled: bool = True
    start_delay_days: int = 0
    auto_close_on_completion: bool = False
    skip_wellness_if_appointment: bool = False
    max_attempts: int = 3
    days_between_attempts: int = 3
    auto_close_after_final: bool = False
    auto_close_action: str = "KEEP_OPEN"
    stop_automation_on: str = "CONVERTED,NOT_INTERESTED,LOST"


class TreatmentFollowUpSave(BaseModel):
    treatment_type_id: str
    enabled: bool = True
    start_delay_days: int = 0
    auto_close_on_completion: bool = False
    skip_wellness_if_appointment: bool = False


class CaseConfigSave(BaseModel):
    enabled: bool = True
    start_delay_days: int = 3
    auto_close_on_completion: bool = False
    skip_wellness_if_appointment: bool = False


def _validate_follow_up(data):
    errors = []
    if data.start_delay_days < 0:
        errors.append("start_delay_days must be >= 0")
    if hasattr(data, 'max_attempts') and data.max_attempts < 1:
        errors.append("max_attempts must be >= 1")
    if hasattr(data, 'days_between_attempts') and data.days_between_attempts < 1:
        errors.append("days_between_attempts must be >= 1")
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))


# ═══════════════════════════════════════════════════════════════════════════
# 1. GENERAL SETTINGS — CrmConfig key-value store
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/general")
async def get_general_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)
    hid = current_user.get("hospital_id")
    q = select(CrmConfig).where(CrmConfig.config_group == "GENERAL")
    if hid:
        q = q.where(CrmConfig.hospital_id == hid)
    result = await db.execute(q)
    configs = result.scalars().all()
    data = {}
    for c in configs:
        data[c.config_key] = c.config_value
    defaults = {
        "crm_enabled": "true",
        "crm_working_days": "MON,TUE,WED,THU,FRI,SAT",
        "crm_reminder_time": "09:00",
        "crm_business_start": "09:00",
        "crm_business_end": "18:00",
        "crm_timezone": "Asia/Kolkata",
        "crm_reminder_offset": "1",
        "crm_weekend_policy": "SKIP",
        "crm_holidays": "[]",
    }
    for key, val in defaults.items():
        data.setdefault(key, val)
    return {"config": data}


@router.put("/general")
async def update_general_settings(
    data: GeneralSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _verify_hospital_admin(current_user)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return {"updated": 0}
    updated = 0
    for key, value in updates.items():
        str_value = str(value).lower() if not isinstance(value, str) else value
        existing = (await db.execute(
            select(CrmConfig).where(
                and_(CrmConfig.config_key == key, CrmConfig.hospital_id == hid)
            ).limit(1)
        )).scalar_one_or_none()
        if existing:
            existing.config_value = str_value
        else:
            cfg = CrmConfig(hospital_id=hid, config_key=key, config_value=str_value, config_group="GENERAL")
            db.add(cfg)
        updated += 1
    await db.commit()
    _invalidate(hid)
    return {"updated": updated}


# ═══════════════════════════════════════════════════════════════════════════
# 2. LEAD SETTINGS — CrmFollowUpConfig (context_type=LEAD)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/lead")
async def get_lead_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    if not hid:
        return {"config": None}
    q = select(CrmFollowUpConfig).where(
        and_(CrmFollowUpConfig.hospital_id == hid, CrmFollowUpConfig.context_type == "LEAD")
    )
    result = await db.execute(q)
    configs = list(result.scalars().all())
    if configs:
        return {"config": _follow_up_to_dict(configs[0])}
    return {"config": {
        "enabled": True, "start_delay_days": 1,
        "auto_close_on_completion": False, "skip_wellness_if_appointment": False,
        "max_attempts": 3, "days_between_attempts": 3,
        "auto_close_after_final": False, "auto_close_action": "KEEP_OPEN",
        "stop_automation_on": "CONVERTED,NOT_INTERESTED,LOST",
    }}


@router.put("/lead")
async def update_lead_settings(
    data: FollowUpConfigData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _verify_hospital_admin(current_user)
    _validate_follow_up(data)
    q = select(CrmFollowUpConfig).where(
        and_(CrmFollowUpConfig.hospital_id == hid, CrmFollowUpConfig.context_type == "LEAD")
    )
    result = await db.execute(q)
    config = result.scalar_one_or_none()
    if config:
        config.enabled = data.enabled
        config.start_delay_days = data.start_delay_days
        config.auto_close_on_completion = data.auto_close_on_completion
        config.skip_wellness_if_appointment = data.skip_wellness_if_appointment
        config.max_attempts = data.max_attempts
        config.days_between_attempts = data.days_between_attempts
        config.auto_close_after_final = data.auto_close_after_final
        config.auto_close_action = data.auto_close_action
        config.stop_automation_on = data.stop_automation_on
    else:
        config = CrmFollowUpConfig(
            hospital_id=hid, context_type="LEAD", treatment_type_id=None,
            enabled=data.enabled, start_delay_days=data.start_delay_days,
            auto_close_on_completion=data.auto_close_on_completion,
            skip_wellness_if_appointment=data.skip_wellness_if_appointment,
            max_attempts=data.max_attempts,
            days_between_attempts=data.days_between_attempts,
            auto_close_after_final=data.auto_close_after_final,
            auto_close_action=data.auto_close_action,
            stop_automation_on=data.stop_automation_on,
        )
        db.add(config)
    await db.commit()
    _invalidate(hid)
    return {"config": _follow_up_to_dict(config)}


# ═══════════════════════════════════════════════════════════════════════════
# 3. OPD SETTINGS — CrmFollowUpConfig (context_type=OPD)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/opd")
async def get_opd_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    if not hid:
        return {"config": None}
    q = select(CrmFollowUpConfig).where(
        and_(CrmFollowUpConfig.hospital_id == hid, CrmFollowUpConfig.context_type == "OPD")
    )
    result = await db.execute(q)
    configs = list(result.scalars().all())
    if configs:
        return {"config": _follow_up_to_dict(configs[0])}
    return {"config": {
        "enabled": True, "start_delay_days": 0,
        "auto_close_on_completion": False, "skip_wellness_if_appointment": False,
        "max_attempts": 3, "days_between_attempts": 3,
        "auto_close_after_final": False, "auto_close_action": "KEEP_OPEN",
        "stop_automation_on": "CONVERTED,NOT_INTERESTED,LOST",
    }}


@router.put("/opd")
async def update_opd_settings(
    data: FollowUpConfigData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _verify_hospital_admin(current_user)
    _validate_follow_up(data)
    q = select(CrmFollowUpConfig).where(
        and_(CrmFollowUpConfig.hospital_id == hid, CrmFollowUpConfig.context_type == "OPD")
    )
    result = await db.execute(q)
    config = result.scalar_one_or_none()
    if config:
        config.enabled = data.enabled
        config.start_delay_days = data.start_delay_days
        config.auto_close_on_completion = data.auto_close_on_completion
        config.skip_wellness_if_appointment = data.skip_wellness_if_appointment
        config.max_attempts = data.max_attempts
        config.days_between_attempts = data.days_between_attempts
        config.auto_close_after_final = data.auto_close_after_final
        config.auto_close_action = data.auto_close_action
        config.stop_automation_on = data.stop_automation_on
    else:
        config = CrmFollowUpConfig(
            hospital_id=hid, context_type="OPD", treatment_type_id=None,
            enabled=data.enabled, start_delay_days=data.start_delay_days,
            auto_close_on_completion=data.auto_close_on_completion,
            skip_wellness_if_appointment=data.skip_wellness_if_appointment,
            max_attempts=data.max_attempts,
            days_between_attempts=data.days_between_attempts,
            auto_close_after_final=data.auto_close_after_final,
            auto_close_action=data.auto_close_action,
            stop_automation_on=data.stop_automation_on,
        )
        db.add(config)
    await db.commit()
    _invalidate(hid)
    return {"config": _follow_up_to_dict(config)}


# ═══════════════════════════════════════════════════════════════════════════
# 4. TREATMENT SETTINGS — CrmFollowUpConfig per treatment type
#    Auto-loads ALL treatment types from Clinical Settings.
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/treatment")
async def get_treatment_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")

    tt_q = select(TreatmentType).where(TreatmentType.is_active == True)
    if hid:
        hosp_names = select(TreatmentType.name).where(
            TreatmentType.hospital_id == hid, TreatmentType.is_active == True
        )
        tt_q = tt_q.where(
            or_(
                TreatmentType.hospital_id == hid,
                and_(
                    TreatmentType.hospital_id.is_(None),
                    not_(TreatmentType.name.in_(hosp_names)),
                ),
            )
        )
    else:
        tt_q = tt_q.where(TreatmentType.hospital_id.is_(None))
    tt_result = await db.execute(tt_q.order_by(TreatmentType.name))
    treatment_types = list(tt_result.scalars().all())

    configs_result = await db.execute(
        select(CrmFollowUpConfig).where(
            and_(
                CrmFollowUpConfig.hospital_id == hid,
                CrmFollowUpConfig.context_type == "TREATMENT",
            )
        )
    )
    configs = {c.treatment_type_id: c for c in configs_result.scalars().all()}

    items = []
    for tt in treatment_types:
        cfg = configs.get(tt.id)
        items.append({
            "treatment_type_id": tt.id,
            "treatment_name": tt.name,
            "config": _follow_up_to_dict(cfg) if cfg else {
                "enabled": False, "start_delay_days": 0,
                "auto_close_on_completion": False, "skip_wellness_if_appointment": False,
            },
        })
    return {"items": items}


@router.put("/treatment/defaults")
async def update_treatment_defaults(
    data: FollowUpConfigData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _verify_hospital_admin(current_user)
    _validate_follow_up(data)

    tt_q = select(TreatmentType).where(TreatmentType.is_active == True)
    hosp_names = select(TreatmentType.name).where(
        TreatmentType.hospital_id == hid, TreatmentType.is_active == True
    )
    tt_q = tt_q.where(
        or_(
            TreatmentType.hospital_id == hid,
            and_(
                TreatmentType.hospital_id.is_(None),
                not_(TreatmentType.name.in_(hosp_names)),
            ),
        )
    )
    tt_result = await db.execute(tt_q)
    treatment_types = list(tt_result.scalars().all())

    saved = 0
    for tt in treatment_types:
        q = select(CrmFollowUpConfig).where(
            and_(
                CrmFollowUpConfig.hospital_id == hid,
                CrmFollowUpConfig.context_type == "TREATMENT",
                CrmFollowUpConfig.treatment_type_id == tt.id,
            )
        )
        result = await db.execute(q)
        config = result.scalar_one_or_none()
        if config:
            config.enabled = data.enabled
            config.start_delay_days = data.start_delay_days
            config.auto_close_on_completion = data.auto_close_on_completion
            config.skip_wellness_if_appointment = data.skip_wellness_if_appointment
        else:
            config = CrmFollowUpConfig(
                hospital_id=hid, context_type="TREATMENT",
                treatment_type_id=tt.id,
                enabled=data.enabled, start_delay_days=data.start_delay_days,
                auto_close_on_completion=data.auto_close_on_completion,
                skip_wellness_if_appointment=data.skip_wellness_if_appointment,
            )
            db.add(config)
        saved += 1
    await db.commit()
    _invalidate(hid)
    return {"saved": saved}


@router.put("/treatment")
async def bulk_update_treatment_follow_ups(
    items: List[TreatmentFollowUpSave],
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _verify_hospital_admin(current_user)
    for item in items:
        _validate_follow_up(item)

    saved = 0
    for item in items:
        q = select(CrmFollowUpConfig).where(
            and_(
                CrmFollowUpConfig.hospital_id == hid,
                CrmFollowUpConfig.context_type == "TREATMENT",
                CrmFollowUpConfig.treatment_type_id == item.treatment_type_id,
            )
        )
        result = await db.execute(q)
        config = result.scalar_one_or_none()
        if config:
            config.enabled = item.enabled
            config.start_delay_days = item.start_delay_days
            config.auto_close_on_completion = item.auto_close_on_completion
            config.skip_wellness_if_appointment = item.skip_wellness_if_appointment
        else:
            config = CrmFollowUpConfig(
                hospital_id=hid, context_type="TREATMENT",
                treatment_type_id=item.treatment_type_id,
                enabled=item.enabled, start_delay_days=item.start_delay_days,
                auto_close_on_completion=item.auto_close_on_completion,
                skip_wellness_if_appointment=item.skip_wellness_if_appointment,
            )
            db.add(config)
        saved += 1
    await db.commit()
    _invalidate(hid)
    return {"saved": saved}


@router.put("/treatment/{treatment_type_id}")
async def update_treatment_follow_up(
    treatment_type_id: str,
    data: FollowUpConfigData,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = _verify_hospital_admin(current_user)
    _validate_follow_up(data)

    tt = await db.get(TreatmentType, treatment_type_id)
    if not tt:
        raise HTTPException(status_code=404, detail="Treatment type not found")

    q = select(CrmFollowUpConfig).where(
        and_(
            CrmFollowUpConfig.hospital_id == hid,
            CrmFollowUpConfig.context_type == "TREATMENT",
            CrmFollowUpConfig.treatment_type_id == treatment_type_id,
        )
    )
    result = await db.execute(q)
    config = result.scalar_one_or_none()
    if config:
        config.enabled = data.enabled
        config.start_delay_days = data.start_delay_days
        config.auto_close_on_completion = data.auto_close_on_completion
        config.skip_wellness_if_appointment = data.skip_wellness_if_appointment
    else:
        config = CrmFollowUpConfig(
            hospital_id=hid, context_type="TREATMENT", treatment_type_id=treatment_type_id,
            enabled=data.enabled, start_delay_days=data.start_delay_days,
            auto_close_on_completion=data.auto_close_on_completion,
            skip_wellness_if_appointment=data.skip_wellness_if_appointment,
        )
        db.add(config)
    await db.commit()
    _invalidate(hid)
    return {"config": _follow_up_to_dict(config)}


# ═══════════════════════════════════════════════════════════════════════════
# 5. CASE SETTINGS — Recovery + Recall
#    Two CrmFollowUpConfig rows per hospital:
#      context_type=CASE_RECOVERY and context_type=CASE_RECALL
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/case")
async def get_case_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    defaults = {
        "recovery": {"enabled": True, "start_delay_days": 3, "auto_close_on_completion": False, "skip_wellness_if_appointment": False},
        "recall": {"enabled": True, "start_delay_days": 180, "auto_close_on_completion": False, "skip_wellness_if_appointment": False},
    }
    if not hid:
        return defaults
    result = await db.execute(
        select(CrmFollowUpConfig).where(
            and_(
                CrmFollowUpConfig.hospital_id == hid,
                CrmFollowUpConfig.context_type.in_(["CASE_RECOVERY", "CASE_RECALL"]),
            )
        )
    )
    configs = {c.context_type: c for c in result.scalars().all()}
    recovery = _follow_up_to_dict(configs["CASE_RECOVERY"]) if "CASE_RECOVERY" in configs else defaults["recovery"]
    recall = _follow_up_to_dict(configs["CASE_RECALL"]) if "CASE_RECALL" in configs else defaults["recall"]
    return {"recovery": recovery, "recall": recall}


@router.put("/case/{section}")
async def update_case_setting(
    section: str,
    data: CaseConfigSave,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    if section not in ("recovery", "recall"):
        raise HTTPException(status_code=400, detail="Section must be 'recovery' or 'recall'")
    hid = _verify_hospital_admin(current_user)
    _validate_follow_up(data)
    context_type = f"CASE_{section.upper()}"
    q = select(CrmFollowUpConfig).where(
        and_(
            CrmFollowUpConfig.hospital_id == hid,
            CrmFollowUpConfig.context_type == context_type,
        )
    )
    result = await db.execute(q)
    config = result.scalar_one_or_none()
    if config:
        config.enabled = data.enabled
        config.start_delay_days = data.start_delay_days
        config.auto_close_on_completion = data.auto_close_on_completion
        config.skip_wellness_if_appointment = data.skip_wellness_if_appointment
    else:
        config = CrmFollowUpConfig(
            hospital_id=hid, context_type=context_type, treatment_type_id=None,
            enabled=data.enabled, start_delay_days=data.start_delay_days,
            auto_close_on_completion=data.auto_close_on_completion,
            skip_wellness_if_appointment=data.skip_wellness_if_appointment,
        )
        db.add(config)
    await db.commit()
    _invalidate(hid)
    return {"config": _follow_up_to_dict(config)}
