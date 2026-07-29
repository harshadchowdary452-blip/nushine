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

export function getDefaults(data: Record<string, unknown> | undefined): SettingsFormType {
  const general: Record<string, unknown> = (data?.general as Record<string, unknown>) || {};
  const lead: Record<string, unknown> = (data?.lead as Record<string, unknown>) || {};
  const opd: Record<string, unknown> = (data?.opd as Record<string, unknown>) || {};
  const treatment: Record<string, unknown> = (data?.treatment as Record<string, unknown>) || {};
  const caseData: Record<string, unknown> = (data?.case as Record<string, unknown>) || {};

  return {
    general: {
      enabled: parseBool(general.crm_enabled, true),
      working_days: (general.crm_working_days as string) ?? "MON,TUE,WED,THU,FRI,SAT",
      reminder_time: (general.crm_reminder_time as string) ?? "09:00",
      business_start: (general.crm_business_start as string) ?? "09:00",
      business_end: (general.crm_business_end as string) ?? "18:00",
      timezone: (general.crm_timezone as string) ?? "Asia/Kolkata",
      reminder_offset_days: parseIntSafe(general.crm_reminder_offset, 1),
      weekend_policy: (general.crm_weekend_policy as "SKIP" | "INCLUDE") ?? "SKIP",
    },
    lead: {
      enabled: (lead.enabled as boolean) ?? true,
      start_delay_days: (lead.start_delay_days as number) ?? 1,
      auto_close_on_completion: (lead.auto_close_on_completion as boolean) ?? false,
    },
    opd: {
      enabled: (opd.enabled as boolean) ?? true,
      start_delay_days: (opd.start_delay_days as number) ?? 3,
      auto_close_on_completion: (opd.auto_close_on_completion as boolean) ?? false,
    },
    treatment: {
      enabled: (treatment.enabled as boolean) ?? false,
      start_delay_days: (treatment.start_delay_days as number) ?? 3,
      skip_wellness_if_appointment: (treatment.skip_wellness_if_appointment as boolean) ?? true,
      auto_close_on_completion: (treatment.auto_close_on_completion as boolean) ?? false,
    },
    case: buildCase(caseData),
  };
}

function buildCase(caseData: Record<string, unknown>): SettingsFormType["case"] {
  const rec = (caseData.recovery as Record<string, unknown>) || {};
  const rcl = (caseData.recall as Record<string, unknown>) || {};
  return {
    recovery: {
      enabled: (rec.enabled as boolean) ?? true,
      start_delay_days: (rec.start_delay_days as number) ?? 3,
    },
    recall: {
      enabled: (rcl.enabled as boolean) ?? true,
      start_delay_days: (rcl.start_delay_days as number) ?? 180,
    },
  };
}

function parseBool(val: unknown, fallback: boolean): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "true" || val === "1";
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
