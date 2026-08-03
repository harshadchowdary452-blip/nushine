"""Verification that the CRM settings stack (service + router defaults) works.

Covers the single-source contract:
  * Follow-up snapshots are NEVER None for LEAD/OPD/CASE_RECOVERY/CASE_RECALL
  * UI defaults and engine defaults come from the same defaults.py module
  * reminder offset default comes from APPOINTMENT_REMINDER_OFFSET_DAYS (not a literal)
  * a hospital's own config row overrides the canonical default
"""
import pytest

from app.models.hospital import Hospital
from app.models.admin_group import AdminGroup
from app.models.crm_follow_up_config import CrmFollowUpConfig
from app.crm.services.crm_settings import get_settings_service, CRMSettingsService
from app.crm.defaults import FOLLOW_UP_DEFAULTS, APPOINTMENT_REMINDER_OFFSET_DAYS
from app.routers.crm_config_settings import _defaults_dict

from tests.conftest import test_async_session_factory


async def _seed_hospital(db):
    ag = AdminGroup(name="ag-settings")
    db.add(ag)
    await db.flush()
    hospital = Hospital(admin_group_id=ag.id, name="Settings Hospital")
    db.add(hospital)
    await db.flush()
    return hospital


@pytest.mark.asyncio
async def test_all_context_snapshots_are_populated_with_defaults():
    svc = CRMSettingsService()
    async with test_async_session_factory() as db:
        hospital = await _seed_hospital(db)
        settings = await svc.get_settings(db, hospital.id)

    for key in ("LEAD", "OPD", "CASE_RECOVERY", "CASE_RECALL"):
        snap = {
            "LEAD": settings.lead_follow_up,
            "OPD": settings.opd_follow_up,
            "CASE_RECOVERY": settings.case_recovery,
            "CASE_RECALL": settings.case_recall,
        }[key]
        assert snap is not None, f"{key} snapshot should never be None"
        default = FOLLOW_UP_DEFAULTS[key]
        assert snap.enabled == default.enabled
        assert snap.start_delay_days == default.start_delay_days

    assert settings.default_reminder_offset_days == APPOINTMENT_REMINDER_OFFSET_DAYS == 1


@pytest.mark.asyncio
async def test_ui_defaults_match_engine_defaults():
    for context in ("LEAD", "OPD", "TREATMENT", "CASE_RECOVERY", "CASE_RECALL"):
        ui = _defaults_dict(context)
        d = FOLLOW_UP_DEFAULTS[context]
        assert ui["enabled"] == d.enabled
        assert ui["start_delay_days"] == d.start_delay_days
        assert ui["max_attempts"] == d.max_attempts


@pytest.mark.asyncio
async def test_hospital_config_overrides_default_and_cache_invalidates():
    svc = CRMSettingsService()
    async with test_async_session_factory() as db:
        hospital = await _seed_hospital(db)
        await db.commit()

        settings = await svc.get_settings(db, hospital.id)
        assert settings.case_recall.start_delay_days == 180

        db.add(CrmFollowUpConfig(
            hospital_id=hospital.id, context_type="CASE_RECALL",
            enabled=True, start_delay_days=90,
        ))
        await db.commit()

        # stale cache until invalidated
        settings = await svc.get_settings(db, hospital.id)
        assert settings.case_recall.start_delay_days == 180

        svc.invalidate_cache(hospital.id)
        settings = await svc.get_settings(db, hospital.id)
        assert settings.case_recall.start_delay_days == 90

    get_settings_service().invalidate_cache()
