import { format, subDays, startOfWeek, startOfMonth, endOfMonth, endOfMonth as eom, addDays, subMonths, startOfYear, endOfYear } from "date-fns"

export const APPOINTMENT_DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
]

export const REGISTRATION_DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
]

export function resolveDatePreset(preset: string): { date_from?: string; date_to?: string } {
  const today = new Date()
  const fmt = (d: Date) => format(d, "yyyy-MM-dd")

  switch (preset) {
    case "today":
      return { date_from: fmt(today), date_to: fmt(today) }
    case "tomorrow":
      return { date_from: fmt(addDays(today, 1)), date_to: fmt(addDays(today, 1)) }
    case "yesterday":
      return { date_from: fmt(subDays(today, 1)), date_to: fmt(subDays(today, 1)) }
    case "last_7_days":
      return { date_from: fmt(subDays(today, 6)), date_to: fmt(today) }
    case "last_30_days":
      return { date_from: fmt(subDays(today, 29)), date_to: fmt(today) }
    case "this_month":
      return { date_from: fmt(startOfMonth(today)), date_to: fmt(eom(today)) }
    case "last_month": {
      const lastMonth = subMonths(today, 1)
      return { date_from: fmt(startOfMonth(lastMonth)), date_to: fmt(eom(lastMonth)) }
    }
    case "this_year":
      return { date_from: fmt(startOfYear(today)), date_to: fmt(endOfYear(today)) }
    case "this_week":
      return { date_from: fmt(startOfWeek(today, { weekStartsOn: 1 })), date_to: fmt(today) }
    default:
      return {}
  }
}
