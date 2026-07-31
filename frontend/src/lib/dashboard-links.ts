import { resolvePeriodRange } from "@/design-system/dashboard/period"

export type DrilldownEntity = "patients" | "appointments" | "cases" | "billing" | "leads"

export interface DrilldownOptions {
  status?: string
  doctorId?: string
  caseStatus?: string
  billingStatus?: string
  source?: string
}

const PATHS: Record<DrilldownEntity, string> = {
  patients: "/patients",
  appointments: "/appointments",
  cases: "/cases",
  billing: "/billing",
  leads: "/leads",
}

/**
 * Builds a list-page URL pre-filtered to the current dashboard period so a KPI
 * drill-down lands on the exact business records it summarizes.
 *
 * The query keys match the conventions consumed by `useServerFilters` in the
 * patients/appointments lists (`created_at_from`/`created_at_to` for patient
 * registration, `date_from`/`date_to` for appointments).
 */
export function buildDrilldownPath(
  entity: DrilldownEntity,
  period: string,
  startDate?: string,
  endDate?: string,
  options: DrilldownOptions = {},
): string {
  const params = new URLSearchParams()
  const range = resolvePeriodRange(period, startDate, endDate)

  if (entity === "patients") {
    if (range.date_from) params.set("created_at_from", range.date_from)
    if (range.date_to) params.set("created_at_to", range.date_to)
    if (options.status) params.set("status", options.status)
    if (options.caseStatus) params.set("case_status", options.caseStatus)
    if (options.billingStatus) params.set("billing_status", options.billingStatus)
    if (options.doctorId) params.set("doctor_id", options.doctorId)
  } else if (entity === "appointments") {
    if (range.date_from) params.set("date_from", range.date_from)
    if (range.date_to) params.set("date_to", range.date_to)
    if (options.status) params.set("status", options.status)
    if (options.doctorId) params.set("doctor_id", options.doctorId)
  } else if (entity === "cases") {
    if (range.date_from) params.set("date_from", range.date_from)
    if (range.date_to) params.set("date_to", range.date_to)
    if (options.status) params.set("status", options.status)
  } else if (entity === "billing") {
    if (options.billingStatus) params.set("payment_status", options.billingStatus)
  } else if (entity === "leads") {
    if (range.date_from) params.set("date_from", range.date_from)
    if (range.date_to) params.set("date_to", range.date_to)
    if (options.status) params.set("status", options.status)
    if (options.source) params.set("source", options.source)
  }

  const qs = params.toString()
  return qs ? `${PATHS[entity]}?${qs}` : PATHS[entity]
}
