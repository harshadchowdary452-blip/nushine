import {
  FilterBar, FilterField, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/design-system"
import { useAuthStore } from "@/store/authStore"

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "last_year", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
]

interface PerformanceFilterBarProps {
  filters: Record<string, string>
  setFilter: (key: string, value: string) => void
  resetFilters: () => void
  activeCount: number
  departments: string[]
  adminGroups?: { id: string; name: string }[]
}

/** Filter bar for the Doctor Performance workspace: period + department + group. */
export default function PerformanceFilterBar({
  filters,
  setFilter,
  resetFilters,
  activeCount,
  departments,
  adminGroups,
}: PerformanceFilterBarProps) {
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === "SUPER_ADMIN"

  return (
    <FilterBar activeCount={activeCount} onReset={resetFilters}>
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Period">
          <Select value={filters.period || "this_month"} onValueChange={(v) => setFilter("period", v === "this_month" ? "" : v)}>
            <SelectTrigger id="perf-period" aria-label="Period" className="h-9 w-[150px] text-sm">
              <SelectValue placeholder="This Month" />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        {filters.period === "custom" && (
          <>
            <FilterField label="From">
              <Input
                type="date"
                value={filters.start_date || ""}
                onChange={(e) => setFilter("start_date", e.target.value)}
                className="h-9 w-[150px] text-sm"
                aria-label="Start date"
              />
            </FilterField>
            <FilterField label="To">
              <Input
                type="date"
                value={filters.end_date || ""}
                onChange={(e) => setFilter("end_date", e.target.value)}
                className="h-9 w-[150px] text-sm"
                aria-label="End date"
              />
            </FilterField>
          </>
        )}
        {departments.length > 0 && (
          <FilterField label="Department">
            <Select value={filters.department || "__all__"} onValueChange={(v) => setFilter("department", v === "__all__" ? "" : v)}>
              <SelectTrigger id="perf-dept" aria-label="Department" className="h-9 w-[180px] text-sm">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}
        {isSuperAdmin && adminGroups && adminGroups.length > 0 && (
          <FilterField label="Group">
            <Select value={filters.group_id || "__all__"} onValueChange={(v) => setFilter("group_id", v === "__all__" ? "" : v)}>
              <SelectTrigger id="perf-group" aria-label="Group" className="h-9 w-[180px] text-sm">
                <SelectValue placeholder="All Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Groups</SelectItem>
                {adminGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        )}
      </div>
    </FilterBar>
  )
}
