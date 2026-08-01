import { memo, useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { Input } from "./input"
import { Label } from "./label"
import { Button } from "./button"
import { RotateCcw, Search } from "lucide-react"

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
]

const PATIENT_STATUSES = ["", "NEW", "ACTIVE", "INACTIVE", "UNDER_TREATMENT", "TREATMENT_ONGOING", "FOLLOW_UP", "COMPLETED", "OPD", "LOST", "ARCHIVED"]
const CASE_STATUSES = ["", "OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]
const PAYMENT_STATUSES = ["", "PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]
const TREATMENT_STATUSES = ["", "GENERATED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "WAITING_PATIENT", "WAITING_LAB", "ON_HOLD", "COMPLETED", "CANCELLED", "OVERDUE"]
const APPOINTMENT_STATUSES = ["", "SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]

export interface DashboardFilters {
  period: string
  startDate: string
  endDate: string
  doctorId: string
  patientStatus: string
  caseStatus: string
  paymentStatus: string
  treatmentStatus: string
  appointmentStatus: string
}

interface DashboardFilterBarProps {
  filters: DashboardFilters
  onChange: (filters: DashboardFilters) => void
  doctors?: { id: string; name: string }[]
}

const defaultFilters: DashboardFilters = {
  period: "this_month",
  startDate: "",
  endDate: "",
  doctorId: "",
  patientStatus: "",
  caseStatus: "",
  paymentStatus: "",
  treatmentStatus: "",
  appointmentStatus: "",
}

/** Dashboard filter card: period, doctor and entity status filters with apply/reset. */
function DashboardFilterBar({ filters, onChange, doctors = [] }: DashboardFilterBarProps) {
  const [local, setLocal] = useState<DashboardFilters>(filters)

  useEffect(() => {
    setLocal(filters)
  }, [filters])

  const handleReset = () => {
    onChange(defaultFilters)
  }

  const handleApply = () => {
    onChange({ ...local })
  }

  const set = (key: keyof DashboardFilters, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 shadow-[var(--ds-shadow-card)]">
      <div className="flex flex-wrap items-end gap-3">
        {/* Period */}
        <div className="space-y-1">
          <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">Date Range</Label>
          <Select value={local.period} onValueChange={(v) => set("period", v)}>
            <SelectTrigger className="h-9 w-[150px] bg-[var(--ds-surface)] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom date range */}
        {local.period === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">From</Label>
              <Input type="date" value={local.startDate} onChange={(e) => set("startDate", e.target.value)} className="h-9 w-[140px] bg-[var(--ds-surface)] text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">To</Label>
              <Input type="date" value={local.endDate} onChange={(e) => set("endDate", e.target.value)} className="h-9 w-[140px] bg-[var(--ds-surface)] text-sm" />
            </div>
          </>
        )}

        {/* Doctor */}
        {doctors.length > 0 && (
          <div className="space-y-1">
            <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">Doctor</Label>
            <Select value={local.doctorId} onValueChange={(v) => set("doctorId", v)}>
              <SelectTrigger className="h-9 w-[160px] bg-[var(--ds-surface)] text-sm">
                <SelectValue placeholder="All Doctors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Doctors</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Patient Status */}
        <div className="space-y-1">
          <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">Patient Status</Label>
          <Select value={local.patientStatus} onValueChange={(v) => set("patientStatus", v)}>
            <SelectTrigger className="h-9 w-[150px] bg-[var(--ds-surface)] text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {PATIENT_STATUSES.filter(Boolean).map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Case Status */}
        <div className="space-y-1">
          <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">Case Status</Label>
          <Select value={local.caseStatus} onValueChange={(v) => set("caseStatus", v)}>
            <SelectTrigger className="h-9 w-[140px] bg-[var(--ds-surface)] text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {CASE_STATUSES.filter(Boolean).map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Payment Status */}
        <div className="space-y-1">
          <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">Payment Status</Label>
          <Select value={local.paymentStatus} onValueChange={(v) => set("paymentStatus", v)}>
            <SelectTrigger className="h-9 w-[140px] bg-[var(--ds-surface)] text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {PAYMENT_STATUSES.filter(Boolean).map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Treatment Status */}
        <div className="space-y-1">
          <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">Treatment Status</Label>
          <Select value={local.treatmentStatus} onValueChange={(v) => set("treatmentStatus", v)}>
            <SelectTrigger className="h-9 w-[150px] bg-[var(--ds-surface)] text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {TREATMENT_STATUSES.filter(Boolean).map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Appointment Status */}
        <div className="space-y-1">
          <Label className="ds-form-label font-medium text-[var(--ds-text-tertiary)]">Appt. Status</Label>
          <Select value={local.appointmentStatus} onValueChange={(v) => set("appointmentStatus", v)}>
            <SelectTrigger className="h-9 w-[140px] bg-[var(--ds-surface)] text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {APPOINTMENT_STATUSES.filter(Boolean).map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action buttons */}
        <div className="flex items-end gap-2 pb-[1px]">
          <Button size="sm" className="h-9" onClick={handleApply}>
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Apply
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}

 
export { defaultFilters }
export default memo(DashboardFilterBar)
