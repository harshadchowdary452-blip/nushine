import { useMemo } from "react"
import { useAnalyticsStore } from "@/store/analyticsStore"
import { formatPeriodRange, periodLabel, previousPeriodLabel, resolvePeriodRange } from "./period"

export interface DashboardFilter {
  period: string
  startDate: string
  endDate: string
  isCustom: boolean
  setPeriod: (period: string) => void
  setStartDate: (date: string) => void
  setEndDate: (date: string) => void
  /** Params passed to dashboardApi.* calls. */
  apiParams: { period: string; start_date?: string; end_date?: string }
  /** Resolved inclusive date range for drill-down URLs. */
  range: { date_from?: string; date_to?: string }
  label: string
  previousLabel: string
  rangeSummary: string
  reset: () => void
}

/**
 * Single source of truth for the dashboard time filter. Every KPI, chart and
 * drill-down link reads from this hook so a change to the global filter is
 * reflected across the whole dashboard — and across every role dashboard —
 * instantly.
 */
export function useDashboardFilter(initialPeriod = "this_month"): DashboardFilter {
  const period = useAnalyticsStore((s) => s.period)
  const startDate = useAnalyticsStore((s) => s.startDate)
  const endDate = useAnalyticsStore((s) => s.endDate)
  const setPeriod = useAnalyticsStore((s) => s.setPeriod)
  const setStartDate = useAnalyticsStore((s) => s.setStartDate)
  const setEndDate = useAnalyticsStore((s) => s.setEndDate)
  const resetStore = useAnalyticsStore((s) => s.reset)

  const isCustom = period === "custom"

  const reset = useMemo(() => () => resetStore(initialPeriod), [resetStore, initialPeriod])

  const apiParams = useMemo(() => {
    const p: { period: string; start_date?: string; end_date?: string } = { period }
    if (isCustom && startDate) p.start_date = startDate
    if (isCustom && endDate) p.end_date = endDate
    return p
  }, [period, isCustom, startDate, endDate])

  const range = useMemo(
    () => resolvePeriodRange(period, startDate, endDate),
    [period, startDate, endDate],
  )

  return {
    period,
    startDate,
    endDate,
    isCustom,
    setPeriod,
    setStartDate,
    setEndDate,
    apiParams,
    range,
    label: periodLabel(period),
    previousLabel: previousPeriodLabel(period),
    rangeSummary: formatPeriodRange(period, startDate, endDate),
    reset,
  }
}
