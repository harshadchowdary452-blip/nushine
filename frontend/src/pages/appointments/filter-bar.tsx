import { useState, useEffect } from "react"
import { Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { FilterBar, FilterField } from "@/components/ui/filter-bar"
import { APPOINTMENT_DATE_PRESETS, resolveDatePreset } from "@/lib/date-presets"

interface AppointmentFilterBarProps {
  filters: Record<string, string>
  setFilter: (key: string, value: string) => void
  resetFilters: () => void
  activeCount: number
  doctors: { id: string; full_name: string }[]
}

const STATUS_OPTIONS = [
  "SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED",
]

export default function AppointmentFilterBar({
  filters, setFilter, resetFilters, activeCount, doctors,
}: AppointmentFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search || "")
  const [datePreset, setDatePreset] = useState(filters.date_preset || "")
  const [customFrom, setCustomFrom] = useState(filters.date_from || "")
  const [customTo, setCustomTo] = useState(filters.date_to || "")

  useEffect(() => {
    if (datePreset && datePreset !== "custom") {
      const range = resolveDatePreset(datePreset)
      setFilter("date_from", range.date_from || "")
      setFilter("date_to", range.date_to || "")
    }
  }, [datePreset])

  useEffect(() => {
    if (datePreset === "custom") {
      setFilter("date_from", customFrom)
      setFilter("date_to", customTo)
    }
  }, [customFrom, customTo, datePreset])

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
    resetFilters()
  }

  return (
    <FilterBar activeCount={activeCount} onReset={handleReset}>
      <div className="flex items-end gap-2 flex-wrap w-full">
        <FilterField label="Search">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Name, OP No, Phone..."
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

        <FilterField label="Date">
          <div className="flex gap-1.5">
            <Select value={datePreset} onValueChange={(v) => {
              setDatePreset(v)
              if (v !== "custom") { setCustomFrom(""); setCustomTo("") }
            }}>
              <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="All dates" /></SelectTrigger>
              <SelectContent>
                {APPOINTMENT_DATE_PRESETS.map((p) => (
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

        <div className="flex items-end gap-1.5">
          <Button size="sm" className="h-9 px-4 text-sm" onClick={handleSearch}>
            Search
          </Button>
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" className="h-9 px-3 text-sm" onClick={handleReset}>
              Reset
            </Button>
          )}
        </div>
      </div>
    </FilterBar>
  )
}
