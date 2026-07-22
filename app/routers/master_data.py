"""
Master Data Router - Enterprise ERP Shared Masters
CRUD for Lead Sources, Enquiry Types, Communication Templates, CRM Config
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission

router = APIRouter(prefix="/master-data", tags=["Master Data"])


# ─── Schemas ──────────────────────────────────────────────────────────────

class MasterItemCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    color: Optional[str] = None
    priority: Optional[int] = 0

class MasterItemUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    color: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None

class CommTemplateCreate(BaseModel):
    name: str
    channel: str = "WHATSAPP"
    subject: Optional[str] = None
    message: str

class CommTemplateUpdate(BaseModel):
    name: Optional[str] = None
    channel: Optional[str] = None
    subject: Optional[str] = None
    message: Optional[str] = None
    is_active: Optional[bool] = None

class CrmConfigUpdate(BaseModel):
    config_value: str

class CrmConfigBulkUpdate(BaseModel):
    configs: dict[str, str]


# ─── Helpers ──────────────────────────────────────────────────────────────

def _item_to_dict(item) -> dict:
    return {
        "id": item.id,
        "hospital_id": item.hospital_id,
        "name": item.name,
        "slug": item.slug,
        "color": item.color,
        "priority": item.priority,
        "is_active": item.is_active,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }

def _comm_to_dict(item) -> dict:
    return {
        "id": item.id,
        "hospital_id": item.hospital_id,
        "name": item.name,
        "channel": item.channel,
        "subject": item.subject,
        "message": item.message,
        "is_active": item.is_active,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


# ═══════════════════════════════════════════════════════════════════════════
# LEAD SOURCES
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/lead-sources")
async def list_lead_sources(
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from app.models.lead_source_master import LeadSourceMaster
    q = select(LeadSourceMaster)
    hid = hospital_id or current_user.get("hospital_id")
    if hid:
        q = q.where(LeadSourceMaster.hospital_id == hid)
    q = q.order_by(LeadSourceMaster.priority, LeadSourceMaster.name)
    result = await db.execute(q)
    return [_item_to_dict(i) for i in result.scalars().all()]


@router.post("/lead-sources", status_code=status.HTTP_201_CREATED)
async def create_lead_source(
    data: MasterItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.lead_source_master import LeadSourceMaster
    hid = current_user.get("hospital_id")
    slug = data.slug or data.name.upper().replace(" ", "_").replace("-", "_")
    rule = LeadSourceMaster(
        hospital_id=hid, name=data.name, slug=slug,
        color=data.color, priority=data.priority or 0,
    )
    db.add(rule)
    await db.flush()
    return _item_to_dict(rule)


@router.put("/lead-sources/{item_id}")
async def update_lead_source(
    item_id: str,
    data: MasterItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.lead_source_master import LeadSourceMaster
    item = await db.get(LeadSourceMaster, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Lead source not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    return _item_to_dict(item)


@router.delete("/lead-sources/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead_source(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.lead_source_master import LeadSourceMaster
    item = await db.get(LeadSourceMaster, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Lead source not found")
    await db.delete(item)
    await db.flush()


@router.post("/lead-sources/seed")
async def seed_lead_sources(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.lead_source_master import LeadSourceMaster
    hid = current_user.get("hospital_id")
    defaults = [
        ("Walk-in", "WALK_IN", "#22c55e", 1),
        ("Google Search", "GOOGLE_SEARCH", "#3b82f6", 2),
        ("Google Maps", "GOOGLE_MAPS", "#3b82f6", 3),
        ("Instagram", "INSTAGRAM", "#e1306c", 4),
        ("Facebook", "FACEBOOK", "#1877f2", 5),
        ("WhatsApp", "WHATSAPP", "#25d366", 6),
        ("Website", "WEBSITE", "#8b5cf6", 7),
        ("Referral", "REFERRAL", "#f59e0b", 8),
        ("Doctor Referral", "DOCTOR_REFERRAL", "#f59e0b", 9),
        ("Clinic Referral", "CLINIC_REFERRAL", "#f59e0b", 10),
        ("Campaign", "CAMPAIGN", "#ec4899", 11),
        ("JustDial", "JUST_DIAL", "#00b1ff", 12),
        ("YouTube", "YOUTUBE", "#ff0000", 13),
        ("Event", "EVENT", "#06b6d4", 14),
        ("Other", "OTHER", "#6b7280", 99),
    ]
    seeded = []
    for name, slug, color, priority in defaults:
        exists = (await db.execute(
            select(LeadSourceMaster).where(
                and_(LeadSourceMaster.slug == slug, LeadSourceMaster.hospital_id == hid)
            ).limit(1)
        )).scalar_one_or_none()
        if not exists:
            item = LeadSourceMaster(
                hospital_id=hid, name=name, slug=slug, color=color, priority=priority,
            )
            db.add(item)
            seeded.append(name)
    await db.flush()
    return {"seeded": seeded, "count": len(seeded)}


# ═══════════════════════════════════════════════════════════════════════════
# ENQUIRY TYPES
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/enquiry-types")
async def list_enquiry_types(
    hospital_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from app.models.enquiry_type_master import EnquiryTypeMaster
    q = select(EnquiryTypeMaster)
    hid = hospital_id or current_user.get("hospital_id")
    if hid:
        q = q.where(EnquiryTypeMaster.hospital_id == hid)
    q = q.order_by(EnquiryTypeMaster.priority, EnquiryTypeMaster.name)
    result = await db.execute(q)
    return [_item_to_dict(i) for i in result.scalars().all()]


@router.post("/enquiry-types", status_code=status.HTTP_201_CREATED)
async def create_enquiry_type(
    data: MasterItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.enquiry_type_master import EnquiryTypeMaster
    hid = current_user.get("hospital_id")
    slug = data.slug or data.name.upper().replace(" ", "_").replace("-", "_")
    item = EnquiryTypeMaster(
        hospital_id=hid, name=data.name, slug=slug,
        color=data.color, priority=data.priority or 0,
    )
    db.add(item)
    await db.flush()
    return _item_to_dict(item)


@router.put("/enquiry-types/{item_id}")
async def update_enquiry_type(
    item_id: str,
    data: MasterItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.enquiry_type_master import EnquiryTypeMaster
    item = await db.get(EnquiryTypeMaster, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Enquiry type not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    return _item_to_dict(item)


@router.delete("/enquiry-types/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_enquiry_type(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.enquiry_type_master import EnquiryTypeMaster
    item = await db.get(EnquiryTypeMaster, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Enquiry type not found")
    await db.delete(item)
    await db.flush()


@router.post("/enquiry-types/seed")
async def seed_enquiry_types(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.enquiry_type_master import EnquiryTypeMaster
    hid = current_user.get("hospital_id")
    defaults = [
        ("Patient Wellness", "WELLNESS", "#22c55e", 1),
        ("Pain Assessment", "PAIN_ASSESSMENT", "#ef4444", 2),
        ("Healing Progress", "HEALING_PROGRESS", "#3b82f6", 3),
        ("Medication Reminder", "MEDICATION_REMINDER", "#f59e0b", 4),
        ("Treatment Progress", "TREATMENT_PROGRESS", "#8b5cf6", 5),
        ("Treatment Completion", "TREATMENT_COMPLETION", "#10b981", 6),
        ("Recall Reminder", "RECALL_REMINDER", "#06b6d4", 7),
        ("General Check", "GENERAL_CHECK", "#6b7280", 8),
        ("Missed Appointment", "MISSED_APPOINTMENT", "#ef4444", 9),
        ("Payment Follow-up", "PAYMENT_FOLLOW_UP", "#f97316", 10),
        ("Post-Treatment Check", "POST_TREATMENT_CHECK", "#14b8a6", 11),
        ("Custom", "CUSTOM", "#a855f7", 99),
    ]
    seeded = []
    for name, slug, color, priority in defaults:
        exists = (await db.execute(
            select(EnquiryTypeMaster).where(
                and_(EnquiryTypeMaster.slug == slug, EnquiryTypeMaster.hospital_id == hid)
            ).limit(1)
        )).scalar_one_or_none()
        if not exists:
            item = EnquiryTypeMaster(
                hospital_id=hid, name=name, slug=slug, color=color, priority=priority,
            )
            db.add(item)
            seeded.append(name)
    await db.flush()
    return {"seeded": seeded, "count": len(seeded)}


# ═══════════════════════════════════════════════════════════════════════════
# COMMUNICATION TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/communication-templates")
async def list_communication_templates(
    hospital_id: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from app.models.communication_template_master import CommunicationTemplateMaster
    q = select(CommunicationTemplateMaster)
    hid = hospital_id or current_user.get("hospital_id")
    if hid:
        q = q.where(CommunicationTemplateMaster.hospital_id == hid)
    if channel:
        q = q.where(CommunicationTemplateMaster.channel == channel)
    q = q.order_by(CommunicationTemplateMaster.name)
    result = await db.execute(q)
    return [_comm_to_dict(i) for i in result.scalars().all()]


@router.post("/communication-templates", status_code=status.HTTP_201_CREATED)
async def create_communication_template(
    data: CommTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.communication_template_master import CommunicationTemplateMaster
    hid = current_user.get("hospital_id")
    item = CommunicationTemplateMaster(
        hospital_id=hid, name=data.name, channel=data.channel,
        subject=data.subject, message=data.message,
    )
    db.add(item)
    await db.flush()
    return _comm_to_dict(item)


@router.put("/communication-templates/{item_id}")
async def update_communication_template(
    item_id: str,
    data: CommTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.communication_template_master import CommunicationTemplateMaster
    item = await db.get(CommunicationTemplateMaster, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    return _comm_to_dict(item)


@router.delete("/communication-templates/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_communication_template(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.communication_template_master import CommunicationTemplateMaster
    item = await db.get(CommunicationTemplateMaster, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(item)
    await db.flush()


# ═══════════════════════════════════════════════════════════════════════════
# CRM CONFIG
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/crm-config")
async def get_crm_config(
    config_group: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    from app.models.crm_config import CrmConfig
    q = select(CrmConfig)
    hid = current_user.get("hospital_id")
    if hid:
        q = q.where(CrmConfig.hospital_id == hid)
    if config_group:
        q = q.where(CrmConfig.config_group == config_group)
    result = await db.execute(q)
    configs = result.scalars().all()
    return {c.config_key: c.config_value for c in configs}


@router.put("/crm-config")
async def update_crm_config(
    data: CrmConfigBulkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.crm_config import CrmConfig
    hid = current_user.get("hospital_id")
    updated = 0
    for key, value in data.configs.items():
        existing = (await db.execute(
            select(CrmConfig).where(
                and_(CrmConfig.config_key == key, CrmConfig.hospital_id == hid)
            ).limit(1)
        )).scalar_one_or_none()
        if existing:
            existing.config_value = value
        else:
            cfg = CrmConfig(hospital_id=hid, config_key=key, config_value=value)
            db.add(cfg)
        updated += 1
    await db.flush()
    return {"updated": updated}


@router.put("/crm-config/{config_key}")
async def update_single_crm_config(
    config_key: str,
    data: CrmConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    from app.models.crm_config import CrmConfig
    hid = current_user.get("hospital_id")
    existing = (await db.execute(
        select(CrmConfig).where(
            and_(CrmConfig.config_key == config_key, CrmConfig.hospital_id == hid)
        ).limit(1)
    )).scalar_one_or_none()
    if existing:
        existing.config_value = data.config_value
    else:
        cfg = CrmConfig(hospital_id=hid, config_key=config_key, config_value=data.config_value)
        db.add(cfg)
    await db.flush()
    return {"config_key": config_key, "config_value": data.config_value}


# ═══════════════════════════════════════════════════════════════════════════
# INLINE LIST MANAGEMENT (Lead Sources & Enquiry Types as JSON in crm_config)
# ═══════════════════════════════════════════════════════════════════════════

class InlineListItem(BaseModel):
    name: str

class InlineListUpdate(BaseModel):
    name: str

async def _get_json_list(db: AsyncSession, hospital_id: str, key: str) -> list:
    from app.models.crm_config import CrmConfig
    result = await db.execute(
        select(CrmConfig).where(
            and_(CrmConfig.config_key == key, CrmConfig.hospital_id == hospital_id)
        ).limit(1)
    )
    cfg = result.scalar_one_or_none()
    if cfg and cfg.config_value:
        import json
        try:
            return json.loads(cfg.config_value)
        except Exception:
            return []
    return []

async def _save_json_list(db: AsyncSession, hospital_id: str, key: str, items: list):
    import json
    from app.models.crm_config import CrmConfig
    result = await db.execute(
        select(CrmConfig).where(
            and_(CrmConfig.config_key == key, CrmConfig.hospital_id == hospital_id)
        ).limit(1)
    )
    cfg = result.scalar_one_or_none()
    value = json.dumps(items)
    if cfg:
        cfg.config_value = value
    else:
        cfg = CrmConfig(hospital_id=hospital_id, config_key=key, config_value=value)
        db.add(cfg)
    await db.flush()


@router.get("/inline/{list_key}")
async def get_inline_list(
    list_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_LEADS, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    items = await _get_json_list(db, hid, list_key)
    return {"items": items}


@router.post("/inline/{list_key}")
async def add_inline_list_item(
    list_key: str,
    data: InlineListItem,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    items = await _get_json_list(db, hid, list_key)
    items.append({"id": str(uuid.uuid4()), "name": data.name, "is_active": True})
    await _save_json_list(db, hid, list_key, items)
    return {"items": items}


@router.put("/inline/{list_key}/{item_id}")
async def update_inline_list_item(
    list_key: str,
    item_id: str,
    data: InlineListUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    items = await _get_json_list(db, hid, list_key)
    for item in items:
        if item.get("id") == item_id:
            item["name"] = data.name
            break
    await _save_json_list(db, hid, list_key, items)
    return {"items": items}


@router.delete("/inline/{list_key}/{item_id}")
async def delete_inline_list_item(
    list_key: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    items = await _get_json_list(db, hid, list_key)
    items = [i for i in items if i.get("id") != item_id]
    await _save_json_list(db, hid, list_key, items)
    return {"items": items}


@router.post("/inline/{list_key}/seed")
async def seed_inline_list(
    list_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_LEADS)
    hid = current_user.get("hospital_id")
    existing = await _get_json_list(db, hid, list_key)
    if existing:
        return {"items": existing, "seeded": False}

    defaults = {
        "lead_sources": [
            "Walk-in", "Google", "Instagram", "Facebook", "WhatsApp",
            "Website", "Referral", "Doctor Referral", "Campaign", "Other",
        ],
        "enquiry_types": [
            "Wellness Check", "Pain Assessment", "Healing Progress",
            "Medication Reminder", "Treatment Progress", "Treatment Completion",
            "Recall Reminder", "General Check", "Missed Appointment",
            "Payment Follow-up", "Post-Treatment Check",
        ],
    }
    items = [{"id": str(uuid.uuid4()), "name": n, "is_active": True} for n in defaults.get(list_key, [])]
    await _save_json_list(db, hid, list_key, items)
    return {"items": items, "seeded": True}
