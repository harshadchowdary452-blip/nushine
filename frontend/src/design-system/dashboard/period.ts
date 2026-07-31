import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  startOfYear,
  endOfYear,
  subWeeks,
  subYears,
} from "date-fns"

export type DashboardPeriod =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "this_year"
  | "last_year"
  | "custom"

export interface PeriodPreset {
  value: DashboardPeriod
  label: string
  description: string
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { value: "today", label: "Today", description: "12:00 AM to now" },
  { value: "yesterday", label: "Yesterday", description: "Previous calendar day" },
  { value: "last_7_days", label: "Last 7 Days", description: "Rolling 7-day window" },
  { value: "last_30_days", label: "Last 30 Days", description: "Rolling 30-day window" },
  { value: "this_week", label: "This Week", description: "Monday through today" },
  { value: "last_week", label: "Last Week", description: "Previous calendar week" },
  { value: "this_month", label: "This Month", description: "Month to date" },
  { value: "last_month", label: "Last Month", description: "Previous calendar month" },
  { value: "this_quarter", label: "This Quarter", description: "Quarter to date" },
  { value: "last_quarter", label: "Last Quarter", description: "Previous calendar quarter" },
  { value: "this_year", label: "This Year", description: "Year to date" },
  { value: "last_year", label: "Last Year", description: "Previous calendar year" },
  { value: "custom", label: "Custom Range", description: "Pick an exact range" },
]

export function periodLabel(period: string): string {
  return PERIOD_PRESETS.find((p) => p.value === period)?.label ?? "Selected period"
}

export function previousPeriodLabel(period: string): string {
  switch (period) {
    case "today": return "vs yesterday"
    case "yesterday": return "vs day before"
    case "last_7_days": return "vs prior 7 days"
    case "last_30_days": return "vs prior 30 days"
    case "this_week": return "vs last week"
    case "last_week": return "vs week before"
    case "this_month": return "vs last month"
    case "last_month": return "vs month before"
    case "this_quarter": return "vs last quarter"
    case "last_quarter": return "vs quarter before"
    case "this_year": return "vs last year"
    case "last_year": return "vs year before"
    default: return "vs previous period"
  }
}

export interface PeriodRange {
  date_from?: string
  date_to?: string
}

/** Resolves a dashboard period to the inclusive `YYYY-MM-DD` range used by list pages. */
export function resolvePeriodRange(period: string, startDate?: string, endDate?: string): PeriodRange {
  const today = new Date()
  const fmt = (d: Date) => format(d, "yyyy-MM-dd")

  if (period === "custom") {
    if (!startDate || !endDate) return {}
    return { date_from: startDate, date_to: endDate }
  }

  switch (period) {
    case "today":
      return { date_from: fmt(today), date_to: fmt(today) }
    case "yesterday":
      return { date_from: fmt(subDays(today, 1)), date_to: fmt(subDays(today, 1)) }
    case "last_7_days":
      return { date_from: fmt(subDays(today, 6)), date_to: fmt(today) }
    case "last_30_days":
      return { date_from: fmt(subDays(today, 29)), date_to: fmt(today) }
    case "this_week":
      return { date_from: fmt(startOfWeek(today, { weekStartsOn: 1 })), date_to: fmt(today) }
    case "last_week": {
      const last = subWeeks(today, 1)
      const ls = startOfWeek(last, { weekStartsOn: 1 })
      const le = endOfWeek(last, { weekStartsOn: 1 })
      return { date_from: fmt(ls), date_to: fmt(le) }
    }
    case "this_month":
      return { date_from: fmt(startOfMonth(today)), date_to: fmt(endOfMonth(today)) }
    case "last_month": {
      const last = subMonths(today, 1)
      return { date_from: fmt(startOfMonth(last)), date_to: fmt(endOfMonth(last)) }
    }
    case "this_quarter":
      return { date_from: fmt(startOfQuarter(today)), date_to: fmt(endOfQuarter(today)) }
    case "last_quarter": {
      const last = subQuarters(today, 1)
      return { date_from: fmt(startOfQuarter(last)), date_to: fmt(endOfQuarter(last)) }
    }
    case "this_year":
      return { date_from: fmt(startOfYear(today)), date_to: fmt(endOfYear(today)) }
    case "last_year": {
      const last = subYears(today, 1)
      return { date_from: fmt(startOfYear(last)), date_to: fmt(endOfYear(last)) }
    }
    default:
      return {}
  }
}

/** Human-friendly "12 Jan – 28 Jan 2026" summary of the resolved range. */
export function formatPeriodRange(period: string, startDate?: string, endDate?: string): string {
  const { date_from, date_to } = resolvePeriodRange(period, startDate, endDate)
  if (!date_from || !date_to) return periodLabel(period)
  const f = (d: string) => format(new Date(`${d}T00:00:00`), "d MMM yyyy")
  return `${f(date_from)} – ${f(date_to)}`
}
