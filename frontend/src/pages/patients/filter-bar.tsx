import { useState, useEffect } from "react"
import { Search, X, SlidersHorizontal } from "lucide-react"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FilterBar, FilterField } from "@/components/ui/filter-bar"
import { REGISTRATION_DATE_PRESETS, resolveDatePreset } from "@/lib/date-presets"


interface PatientFilterBarProps {
  filters: Record<string, string>
  setFilter: (key: string, value: string) => void
  resetFilters: () => void
  activeCount: number
  doctors: { id: string; full_name: string }[]
}

const STATUS_OPTIONS = [
  "NEW", "ACTIVE", "INACTIVE", "UNDER_TREATMENT", "TREATMENT_ONGOING",
  "FOLLOW_UP", "COMPLETED", "OPD", "LOST", "ARCHIVED",
]

const GENDER_OPTIONS = ["MALE", "FEMALE", "OTHER"]

const CASE_STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]

const TREATMENT_STATUS_OPTIONS = [
  "GENERATED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "WAITING_PATIENT", "WAITING_LAB", "ON_HOLD", "COMPLETED", "CANCELLED", "OVERDUE",
]

const BILLING_STATUS_OPTIONS = ["DRAFT", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]

const SOURCE_OPTIONS = [
  "Walk-In", "Google Search", "Google Maps", "Instagram", "Facebook",
  "WhatsApp", "Website", "Referral - Existing Patient", "Referral - Doctor",
  "Referral - Clinic", "Advertisement", "Other",
]

const ADVANCED_KEYS = ["gender", "billing_status", "treatment_status", "case_status", "patient_source", "age_from", "age_to"]

export default function PatientFilterBar({
  filters, setFilter, resetFilters, activeCount, doctors,
}: PatientFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search || "")
  const [datePreset, setDatePreset] = useState(filters.date_preset || "")
  const [customFrom, setCustomFrom] = useState(filters.created_at_from || "")
  const [customTo, setCustomTo] = useState(filters.created_at_to || "")
  const [showAdvanced, setShowAdvanced] = useState(() => {
    return ADVANCED_KEYS.some((k) => filters[k] && filters[k] !== "")
  })

  useEffect(() => {
    if (datePreset && datePreset !== "custom") {
      const range = resolveDatePreset(datePreset)
      setFilter("created_at_from", range.date_from || "")
      setFilter("created_at_to", range.date_to || "")
    }
  }, [datePreset, setFilter])

  useEffect(() => {
    if (datePreset === "custom") {
      setFilter("created_at_from", customFrom)
      setFilter("created_at_to", customTo)
    }
  }, [customFrom, customTo, datePreset, setFilter])

  function handleSearch() {
    setFilter("search", searchInput)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch()
  }

  function handleReset() {
    setSearchInput("")
    setDatePreset("")
    setCustomFrom("")
    setCustomTo("")
    setShowAdvanced(false)
    resetFilters()
  }

  const hasAdvancedActive = ADVANCED_KEYS.some((k) => filters[k] && filters[k] !== "")

  return (
    <FilterBar activeCount={activeCount} onReset={handleReset}>
      <div className="flex items-end gap-2 flex-wrap w-full">
        <FilterField label="Search">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Name, OP No, Phone, ABHA..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-[220px] h-9 pl-8 pr-8 text-sm"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(""); setFilter("search", "") }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </FilterField>

        <FilterField label="Doctor">
          <Select value={filters.doctor_id || ""} onValueChange={(v) => setFilter("doctor_id", v)}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All doctors" /></SelectTrigger>
            <SelectContent>
              {doctors.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Status">
          <Select value={filters.status || ""} onValueChange={(v) => setFilter("status", v)}>
            <SelectTrigger className="w-[145px] h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Registered">
          <div className="flex gap-1.5">
            <Select value={datePreset} onValueChange={(v) => {
              setDatePreset(v)
              if (v !== "custom") { setCustomFrom(""); setCustomTo("") }
            }}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="All time" /></SelectTrigger>
              <SelectContent>
                {REGISTRATION_DATE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {datePreset === "custom" && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[135px] h-9 text-sm" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[135px] h-9 text-sm" />
              </>
            )}
          </div>
        </FilterField>

        <div className="flex items-end gap-1.5">
          <Button size="sm" className="h-9 px-4 text-sm" onClick={handleSearch}>
            Search
          </Button>
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" className="h-9 px-3 text-sm" onClick={handleReset}>
              Reset
            </Button>
          )}
          <Button
            size="sm"
            variant={showAdvanced ? "default" : "outline"}
            className="h-9 px-3 text-sm gap-1.5"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Advanced
            {hasAdvancedActive && (
              <span className="ml-1 h-4 w-4 rounded-full bg-primary-foreground text-primary text-[10px] font-bold flex items-center justify-center">
                {ADVANCED_KEYS.filter((k) => filters[k] && filters[k] !== "").length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {showAdvanced && (
        <div className="flex items-end gap-2 flex-wrap w-full pt-2 border-t border-border/50 mt-3">
          <FilterField label="Gender">
            <Select value={filters.gender || ""} onValueChange={(v) => setFilter("gender", v)}>
              <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Age From">
            <NumericInput placeholder="Min" mode="integer" min={0} max={150} value={filters.age_from || ""}
              onChange={(v) => setFilter("age_from", v)} className="w-[75px] h-9 text-sm" />
          </FilterField>

          <FilterField label="Age To">
            <NumericInput placeholder="Max" mode="integer" min={0} max={150} value={filters.age_to || ""}
              onChange={(v) => setFilter("age_to", v)} className="w-[75px] h-9 text-sm" />
          </FilterField>

          <FilterField label="Case Status">
            <Select value={filters.case_status || ""} onValueChange={(v) => setFilter("case_status", v)}>
              <SelectTrigger className="w-[145px] h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                {CASE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Treatment">
            <Select value={filters.treatment_status || ""} onValueChange={(v) => setFilter("treatment_status", v)}>
              <SelectTrigger className="w-[145px] h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                {TREATMENT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Billing">
            <Select value={filters.billing_status || ""} onValueChange={(v) => setFilter("billing_status", v)}>
              <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                {BILLING_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Source">
            <Select value={filters.patient_source || ""} onValueChange={(v) => setFilter("patient_source", v)}>
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      )}
    </FilterBar>
  )
}
