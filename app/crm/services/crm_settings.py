"""
CRM Settings Service — SINGLE source of truth for ALL CRM configuration.

NO OTHER SERVICE may read crm_configs directly.
Every CRM component must use CRMSettingsService.
"""
import json
import logging
from datetime import time, date
from typing import Optional
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

logger = logging.getLogger("crm.settings")

# Default values
DEFAULT_WORKING_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"]
DEFAULT_REMINDER_TIME = time(9, 0)
DEFAULT_BUSINESS_START = time(9, 0)
DEFAULT_BUSINESS_END = time(18, 0)
DEFAULT_TIMEZONE = "Asia/Kolkata"


@dataclass
class FollowUpSnapshot:
    """Immutable snapshot of a single follow-up config."""
    enabled: bool = True
    start_delay_days: int = 0
    auto_close_on_completion: bool = False
    skip_wellness_if_appointment: bool = False


@dataclass
class CrmSettings:
    """Immutable snapshot of CRM settings for a hospital."""
    hospital_id: str
    enabled: bool = True
    working_days: list[str] = field(default_factory=lambda: list(DEFAULT_WORKING_DAYS))
    reminder_time: time = DEFAULT_REMINDER_TIME
    business_hours_start: time = DEFAULT_BUSINESS_START
    business_hours_end: time = DEFAULT_BUSINESS_END
    timezone: str = DEFAULT_TIMEZONE
    default_reminder_offset_days: int = 1
    weekend_policy: str = "SKIP"  # SKIP | INCLUDE
    holidays: list[str] = field(default_factory=list)  # ISO date strings
    # Follow-up configs (loaded from crm_follow_up_configs)
    lead_follow_up: Optional[FollowUpSnapshot] = None
    opd_follow_up: Optional[FollowUpSnapshot] = None
    treatment_follow_ups: dict[str, FollowUpSnapshot] = field(default_factory=dict)
    case_recovery: Optional[FollowUpSnapshot] = None
    case_recall: Optional[FollowUpSnapshot] = None


class CRMSettingsService:
    """Single source of truth for ALL CRM configuration.

    Responsibilities:
    - Load settings from crm_configs table (General Settings)
    - Load follow-up configs from crm_follow_up_configs table
    - Cache settings in memory (per-request)
    - Provide defaults for missing settings
    - Validate settings

    Hospital isolation: every query filters by hospital_id.
    """

    def __init__(self):
        self._cache: dict[str, CrmSettings] = {}

    async def get_settings(self, db: AsyncSession, hospital_id: str) -> CrmSettings:
        """Load and cache all CRM settings for a hospital."""
        cache_key = hospital_id or "__global__"
        if cache_key in self._cache:
            return self._cache[cache_key]

        from app.models.crm_config import CrmConfig

        result = await db.execute(
            select(CrmConfig).where(CrmConfig.hospital_id == hospital_id)
        )
        configs = {row.config_key: row.config_value for row in result.scalars().all()}

        # Load follow-up configs
        follow_ups = await self._load_follow_up_configs(db, hospital_id)

        settings = CrmSettings(
            hospital_id=hospital_id,
            enabled=self._parse_bool(configs.get("crm_enabled"), True),
            working_days=self._parse_working_days(configs.get("crm_working_days")),
            reminder_time=self._parse_time(configs.get("crm_reminder_time"), DEFAULT_REMINDER_TIME),
            business_hours_start=self._parse_time(configs.get("crm_business_start"), DEFAULT_BUSINESS_START),
            business_hours_end=self._parse_time(configs.get("crm_business_end"), DEFAULT_BUSINESS_END),
            timezone=configs.get("crm_timezone", DEFAULT_TIMEZONE),
            default_reminder_offset_days=self._parse_int(configs.get("crm_reminder_offset"), 1),
            weekend_policy=configs.get("crm_weekend_policy", "SKIP"),
            holidays=self._parse_holidays(configs.get("crm_holidays")),
            lead_follow_up=follow_ups.get("LEAD"),
            opd_follow_up=follow_ups.get("OPD"),
            treatment_follow_ups={k: v for k, v in follow_ups.items() if k.startswith("TREATMENT:")},
            case_recovery=follow_ups.get("CASE_RECOVERY"),
            case_recall=follow_ups.get("CASE_RECALL"),
        )

        self._cache[cache_key] = settings
        return settings

    async def _load_follow_up_configs(self, db: AsyncSession, hospital_id: str) -> dict[str, FollowUpSnapshot]:
        from app.models.crm_follow_up_config import CrmFollowUpConfig
        result = await db.execute(
            select(CrmFollowUpConfig).where(CrmFollowUpConfig.hospital_id == hospital_id)
        )
        out: dict[str, FollowUpSnapshot] = {}
        for row in result.scalars().all():
            snap = FollowUpSnapshot(
                enabled=row.enabled,
                start_delay_days=row.start_delay_days,
                auto_close_on_completion=row.auto_close_on_completion,
                skip_wellness_if_appointment=getattr(row, 'skip_wellness_if_appointment', False),
            )
            if row.context_type == "TREATMENT" and row.treatment_type_id:
                out[f"TREATMENT:{row.treatment_type_id}"] = snap
            else:
                out[row.context_type] = snap
        return out

    async def is_enabled(self, db: AsyncSession, hospital_id: str) -> bool:
        """Check if CRM is enabled for this hospital."""
        settings = await self.get_settings(db, hospital_id)
        return settings.enabled

    async def get_working_days(self, db: AsyncSession, hospital_id: str) -> list[str]:
        """Return list of working days: ['MON','TUE',...]"""
        settings = await self.get_settings(db, hospital_id)
        return settings.working_days

    async def get_reminder_time(self, db: AsyncSession, hospital_id: str) -> time:
        """Return configured reminder time."""
        settings = await self.get_settings(db, hospital_id)
        return settings.reminder_time

    async def get_lead_follow_up(self, db: AsyncSession, hospital_id: str) -> Optional[FollowUpSnapshot]:
        settings = await self.get_settings(db, hospital_id)
        return settings.lead_follow_up

    async def get_opd_follow_up(self, db: AsyncSession, hospital_id: str) -> Optional[FollowUpSnapshot]:
        settings = await self.get_settings(db, hospital_id)
        return settings.opd_follow_up

    async def get_treatment_follow_up(self, db: AsyncSession, hospital_id: str, treatment_type_id: str) -> Optional[FollowUpSnapshot]:
        settings = await self.get_settings(db, hospital_id)
        return settings.treatment_follow_ups.get(f"TREATMENT:{treatment_type_id}")

    async def get_case_recovery(self, db: AsyncSession, hospital_id: str) -> Optional[FollowUpSnapshot]:
        settings = await self.get_settings(db, hospital_id)
        return settings.case_recovery

    async def get_case_recall(self, db: AsyncSession, hospital_id: str) -> Optional[FollowUpSnapshot]:
        settings = await self.get_settings(db, hospital_id)
        return settings.case_recall

    async def is_working_day(self, db: AsyncSession, hospital_id: str, check_date: date) -> bool:
        """Check if a given date is a working day."""
        settings = await self.get_settings(db, hospital_id)
        day_name = check_date.strftime("%a").upper()[:3]
        if day_name not in settings.working_days:
            return False
        if check_date.isoformat() in settings.holidays:
            return False
        return True

    async def next_working_day(self, db: AsyncSession, hospital_id: str, from_date: date) -> date:
        """Find the next working day starting from (and including) from_date."""
        from datetime import timedelta
        settings = await self.get_settings(db, hospital_id)
        candidate = from_date
        for _ in range(30):  # max 30-day lookahead
            day_name = candidate.strftime("%a").upper()[:3]
            if day_name in settings.working_days and candidate.isoformat() not in settings.holidays:
                return candidate
            candidate += timedelta(days=1)
        return from_date  # fallback

    def invalidate_cache(self, hospital_id: Optional[str] = None):
        """Clear cached settings (call after settings update)."""
        if hospital_id:
            self._cache.pop(hospital_id, None)
            self._cache.pop("__global__", None)
        else:
            self._cache.clear()

    def validate_settings(self, settings: CrmSettings) -> list[str]:
        """Validate CRM settings and return list of error messages (empty = valid)."""
        errors = []
        valid_days = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}
        for d in settings.working_days:
            if d not in valid_days:
                errors.append(f"Invalid working day: {d}")
        if settings.default_reminder_offset_days < 0:
            errors.append("Reminder offset must be >= 0")
        if settings.weekend_policy not in ("SKIP", "INCLUDE"):
            errors.append("Weekend policy must be SKIP or INCLUDE")
        for snap in [settings.lead_follow_up, settings.opd_follow_up, settings.case_recovery, settings.case_recall]:
            if snap:
                if snap.start_delay_days < 0:
                    errors.append("Follow-up start delay must be >= 0")
        return errors

    # --- Parsing helpers ---

    @staticmethod
    def _parse_bool(value: Optional[str], default: bool) -> bool:
        if value is None:
            return default
        return value.lower() in ("true", "1", "yes")

    @staticmethod
    def _parse_working_days(value: Optional[str]) -> list[str]:
        if not value:
            return list(DEFAULT_WORKING_DAYS)
        return [d.strip().upper() for d in value.split(",") if d.strip()]

    @staticmethod
    def _parse_time(value: Optional[str], default: time) -> time:
        if not value:
            return default
        try:
            parts = value.strip().split(":")
            return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
        except (ValueError, IndexError):
            return default

    @staticmethod
    def _parse_int(value: Optional[str], default: int) -> int:
        if not value:
            return default
        try:
            return int(value)
        except ValueError:
            return default

    @staticmethod
    def _parse_holidays(value: Optional[str]) -> list[str]:
        if not value:
            return []
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return [d.strip() for d in value.split(",") if d.strip()]


# Singleton
_settings_service: Optional[CRMSettingsService] = None


def get_settings_service() -> CRMSettingsService:
    global _settings_service
    if _settings_service is None:
        _settings_service = CRMSettingsService()
    return _settings_service
