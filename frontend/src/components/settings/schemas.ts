import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// CRM Settings Schema — Aligned with Dental ERP Lifecycle
//
// Only 5 pages: General, Lead, OPD, Treatment, Case
// Every field maps directly to a backend config key or CrmFollowUpConfig column.
// ═══════════════════════════════════════════════════════════════════════════════

export const GeneralSettingsSchema = z.object({
  enabled: z.boolean(),
  working_days: z.string().min(1, "At least one working day required"),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/, "Format: HH:MM"),
  business_start: z.string().regex(/^\d{2}:\d{2}$/, "Format: HH:MM"),
  business_end: z.string().regex(/^\d{2}:\d{2}$/, "Format: HH:MM"),
  timezone: z.string().min(1),
  reminder_offset_days: z.number().min(0).max(30),
  weekend_policy: z.enum(["SKIP", "INCLUDE"]),
});

export const FollowUpSettingsSchema = z.object({
  enabled: z.boolean(),
  start_delay_days: z.number().min(0, "Cannot be negative").max(365),
  auto_close_on_completion: z.boolean(),
});

export const TreatmentSettingsSchema = z.object({
  enabled: z.boolean(),
  start_delay_days: z.number().min(0).max(365),
  skip_wellness_if_appointment: z.boolean(),
  auto_close_on_completion: z.boolean(),
});

export const CaseSettingsSchema = z.object({
  recovery: z.object({
    enabled: z.boolean(),
    start_delay_days: z.number().min(0).max(365),
  }),
  recall: z.object({
    enabled: z.boolean(),
    start_delay_days: z.number().min(0).max(730),
  }),
});

export const SettingsSchema = z.object({
  general: GeneralSettingsSchema,
  lead: FollowUpSettingsSchema,
  opd: FollowUpSettingsSchema,
  treatment: TreatmentSettingsSchema,
  case: CaseSettingsSchema,
});

export type SettingsFormType = z.infer<typeof SettingsSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Defaults — populate from API response or sensible dental-ERP defaults
// ═══════════════════════════════════════════════════════════════════════════════

export function getDefaults(data: any): SettingsFormType {
  const general = data?.general || {};
  const lead = data?.lead || {};
  const opd = data?.opd || {};
  const treatment = data?.treatment || {};
  const caseData = data?.case || {};

  return {
    general: {
      enabled: parseBool(general.crm_enabled, true),
      working_days: general.crm_working_days ?? "MON,TUE,WED,THU,FRI,SAT",
      reminder_time: general.crm_reminder_time ?? "09:00",
      business_start: general.crm_business_start ?? "09:00",
      business_end: general.crm_business_end ?? "18:00",
      timezone: general.crm_timezone ?? "Asia/Kolkata",
      reminder_offset_days: parseIntSafe(general.crm_reminder_offset, 1),
      weekend_policy: (general.crm_weekend_policy as "SKIP" | "INCLUDE") ?? "SKIP",
    },
    lead: {
      enabled: lead.enabled ?? true,
      start_delay_days: lead.start_delay_days ?? 1,
      auto_close_on_completion: lead.auto_close_on_completion ?? false,
    },
    opd: {
      enabled: opd.enabled ?? true,
      start_delay_days: opd.start_delay_days ?? 3,
      auto_close_on_completion: opd.auto_close_on_completion ?? false,
    },
    treatment: {
      enabled: treatment.enabled ?? false,
      start_delay_days: treatment.start_delay_days ?? 3,
      skip_wellness_if_appointment: treatment.skip_wellness_if_appointment ?? true,
      auto_close_on_completion: treatment.auto_close_on_completion ?? false,
    },
    case: {
      recovery: {
        enabled: caseData.recovery?.enabled ?? true,
        start_delay_days: caseData.recovery?.start_delay_days ?? 3,
      },
      recall: {
        enabled: caseData.recall?.enabled ?? true,
        start_delay_days: caseData.recall?.start_delay_days ?? 180,
      },
    },
  };
}

function parseBool(val: any, fallback: boolean): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "true" || val === "1";
  return fallback;
}

function parseIntSafe(val: any, fallback: number): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}
