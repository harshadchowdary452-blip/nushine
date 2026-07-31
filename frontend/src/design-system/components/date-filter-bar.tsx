import { memo } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { Input } from "./input"
import { Label } from "./label"

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
]

interface DateFilterBarProps {
  period: string
  onPeriodChange: (period: string) => void
  startDate?: string
  endDate?: string
  onStartDateChange?: (date: string) => void
  onEndDateChange?: (date: string) => void
  doctorId?: string
  onDoctorIdChange?: (id: string) => void
  doctors?: { id: string; full_name: string }[]
  compact?: boolean
}

/** Period selector with optional custom date range and doctor filter. */
function DateFilterBar({
  period, onPeriodChange, startDate, endDate, onStartDateChange, onEndDateChange,
  doctorId, onDoctorIdChange, doctors,
}: DateFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="period-select" className="ds-form-label text-[var(--ds-text-tertiary)]">Period</Label>
        <Select value={period} onValueChange={onPeriodChange}>
          <SelectTrigger id="period-select" aria-label="Period" title={period} className="h-9 w-[150px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {period === "custom" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="filter-start-date" className="ds-form-label text-[var(--ds-text-tertiary)]">From</Label>
            <Input
              id="filter-start-date"
              type="date"
              value={startDate || ""}
              onChange={(e) => onStartDateChange?.(e.target.value)}
              className="h-9 w-[150px] text-sm"
              aria-label="Start date"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-end-date" className="ds-form-label text-[var(--ds-text-tertiary)]">To</Label>
            <Input
              id="filter-end-date"
              type="date"
              value={endDate || ""}
              onChange={(e) => onEndDateChange?.(e.target.value)}
              className="h-9 w-[150px] text-sm"
              aria-label="End date"
            />
          </div>
        </>
      )}
      {doctors && doctors.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="doctor-filter" className="ds-form-label text-[var(--ds-text-tertiary)]">Doctor</Label>
          <Select value={doctorId || "__all__"} onValueChange={(v) => onDoctorIdChange?.(v === "__all__" ? "" : v)}>
            <SelectTrigger id="doctor-filter" aria-label="Filter by doctor" className="h-9 w-[170px] text-sm">
              <SelectValue placeholder="All Doctors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Doctors</SelectItem>
              {doctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

export default memo(DateFilterBar)
