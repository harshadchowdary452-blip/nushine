"""
CRM Automation Defaults — THE single source of truth for every CRM default.

Contract:
  - NO other module may hardcode a default delay, interval, attempt count or
    reminder offset. All defaults live here and are consumed from:
      1. CRMSettingsService (always returns a fully-populated FollowUpSnapshot,
         never None, built from these defaults when a hospital has no row).
      2. crm_config_settings router (settings UI shows exactly these defaults).
  - This guarantees the automation engine and the settings screens can NEVER
    diverge: what the UI shows is exactly what the engine applies.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class FollowUpDefaults:
    enabled: bool
    start_delay_days: int
    max_attempts: int = 3
    days_between_attempts: int = 3
    auto_close_on_completion: bool = False
    skip_wellness_if_appointment: bool = False
    auto_close_after_final: bool = False
    auto_close_action: str = "KEEP_OPEN"
    stop_automation_on: str = "CONVERTED,NOT_INTERESTED,LOST"


# context_type -> canonical defaults (used when a hospital has no config row)
FOLLOW_UP_DEFAULTS: dict[str, FollowUpDefaults] = {
    "LEAD":          FollowUpDefaults(enabled=True,  start_delay_days=1),
    "OPD":           FollowUpDefaults(enabled=True,  start_delay_days=0),
    "TREATMENT":     FollowUpDefaults(enabled=False, start_delay_days=0),
    "CASE_RECOVERY": FollowUpDefaults(enabled=True,  start_delay_days=3),
    "CASE_RECALL":   FollowUpDefaults(enabled=True,  start_delay_days=180),
}

# Non-follow-up automations (no crm_follow_up_configs row / general settings key)
MISSED_APPOINTMENT_DELAY_DAYS = 1
APPOINTMENT_REMINDER_OFFSET_DAYS = 1
