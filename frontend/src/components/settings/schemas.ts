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
  skip_wellness_if_appointment: z.boolean(),
  max_attempts: z.number().min(1, "At least 1").max(20, "Max 20"),
  days_between_attempts: z.number().min(1, "At least 1").max(90, "Max 90"),
  auto_close_after_final: z.boolean(),
  auto_close_action: z.string(),
  stop_automation_on: z.string(),
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
    auto_close_on_completion: z.boolean(),
    skip_wellness_if_appointment: z.boolean(),
  }),
  recall: z.object({
    enabled: z.boolean(),
    start_delay_days: z.number().min(0).max(730),
    auto_close_on_completion: z.boolean(),
    skip_wellness_if_appointment: z.boolean(),
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

export function getDefaults(data: Record<string, unknown> | undefined): SettingsFormType {
  const general: Record<string, unknown> = (data?.general as Record<string, unknown>) || {};
  const lead: Record<string, unknown> = (data?.lead as Record<string, unknown>) || {};
  const opd: Record<string, unknown> = (data?.opd as Record<string, unknown>) || {};
  const treatmentData = (data?.treatment as unknown[]) || [];
  const caseData: Record<string, unknown> = (data?.case as Record<string, unknown>) || {};

  const treatmentDefaults = buildTreatmentDefaults(treatmentData);

  return {
    general: {
      enabled: parseBool(general.crm_enabled ?? general.enabled, true),
      working_days: (general.crm_working_days as string) ?? "MON,TUE,WED,THU,FRI,SAT",
      reminder_time: (general.crm_reminder_time as string) ?? "09:00",
      business_start: (general.crm_business_start as string) ?? "09:00",
      business_end: (general.crm_business_end as string) ?? "18:00",
      timezone: (general.crm_timezone as string) ?? "Asia/Kolkata",
      reminder_offset_days: parseIntSafe(general.crm_reminder_offset ?? general.reminder_offset_days, 1),
      weekend_policy: (general.crm_weekend_policy as "SKIP" | "INCLUDE") ?? "SKIP",
    },
    lead: deepMerge<FollowUpSettings>(followUpDefaults("LEAD"), lead as Record<string, unknown>),
    opd: deepMerge<FollowUpSettings>(followUpDefaults("OPD"), opd as Record<string, unknown>),
    treatment: treatmentDefaults,
    case: buildCaseDefaults(caseData),
  };
}

type FollowUpSettings = z.infer<typeof FollowUpSettingsSchema>;

function followUpDefaults(type: "LEAD" | "OPD"): FollowUpSettings {
  const base = { enabled: true, auto_close_on_completion: false, skip_wellness_if_appointment: false, max_attempts: 3, days_between_attempts: 3, auto_close_after_final: false, auto_close_action: "KEEP_OPEN", stop_automation_on: "CONVERTED,NOT_INTERESTED,LOST" };
  if (type === "LEAD") return { ...base, start_delay_days: 1 };
  return { ...base, start_delay_days: 3 };
}

function buildTreatmentDefaults(items: unknown[]): SettingsFormType["treatment"] {
  const item = items.find((i: unknown) => {
    const cfg = (i as Record<string, unknown>)?.config as Record<string, unknown> | undefined;
    return cfg?.enabled !== undefined;
  });
  const cfg = item ? (item as Record<string, unknown>).config as Record<string, unknown> : {};
  return {
    enabled: (cfg.enabled as boolean) ?? false,
    start_delay_days: (cfg.start_delay_days as number) ?? 3,
    skip_wellness_if_appointment: (cfg.skip_wellness_if_appointment as boolean) ?? true,
    auto_close_on_completion: (cfg.auto_close_on_completion as boolean) ?? false,
  };
}

function buildCaseDefaults(caseData: Record<string, unknown>): SettingsFormType["case"] {
  const rec = (caseData.recovery as Record<string, unknown>) || {};
  const rcl = (caseData.recall as Record<string, unknown>) || {};
  return {
    recovery: {
      enabled: (rec.enabled as boolean) ?? true,
      start_delay_days: (rec.start_delay_days as number) ?? 3,
      auto_close_on_completion: (rec.auto_close_on_completion as boolean) ?? false,
      skip_wellness_if_appointment: (rec.skip_wellness_if_appointment as boolean) ?? false,
    },
    recall: {
      enabled: (rcl.enabled as boolean) ?? true,
      start_delay_days: (rcl.start_delay_days as number) ?? 180,
      auto_close_on_completion: (rcl.auto_close_on_completion as boolean) ?? false,
      skip_wellness_if_appointment: (rcl.skip_wellness_if_appointment as boolean) ?? false,
    },
  };
}

function deepMerge<T extends Record<string, unknown>>(defaults: T, overrides: Record<string, unknown>): T {
  const result = { ...defaults };
  for (const key of Object.keys(result)) {
    if (key in overrides) {
      const val = overrides[key];
      if (typeof val === "boolean" || typeof val === "number" || typeof val === "string") {
        (result as Record<string, unknown>)[key] = val;
      }
    }
  }
  return result;
}

function parseBool(val: unknown, fallback: boolean): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
  return fallback;
}

function parseIntSafe(val: unknown, fallback: number): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}
