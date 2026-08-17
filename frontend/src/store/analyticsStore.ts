import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Centralized dashboard time filter.
 *
 * Every role dashboard shares this single source of truth, so a change made on
 * one dashboard page (period, custom dates) is preserved when the user moves to
 * another analytics page. Widgets must never hold an independent filter.
 */
interface AnalyticsFilterState {
  period: string
  startDate: string
  endDate: string
  setPeriod: (period: string) => void
  setStartDate: (date: string) => void
  setEndDate: (date: string) => void
  reset: (defaultPeriod?: string) => void
}

export const useAnalyticsStore = create<AnalyticsFilterState>()(
  persist(
    (set) => ({
      period: "this_month",
      startDate: "",
      endDate: "",
      setPeriod: (period) =>
        set(() => (period === "custom" ? { period } : { period, startDate: "", endDate: "" })),
      setStartDate: (date) => set({ startDate: date }),
      setEndDate: (date) => set({ endDate: date }),
      reset: (defaultPeriod = "this_month") =>
        set({ period: defaultPeriod, startDate: "", endDate: "" }),
    }),
    { name: "appointin-analytics-filter" },
  ),
)
