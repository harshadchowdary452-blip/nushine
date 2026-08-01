import { useState, useRef, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { useQuery } from "@tanstack/react-query"
import { Branch } from "@radix-ui/react-dismissable-layer"
import { Plus, X, Search, Check, Activity, IndianRupee, Stethoscope, Hash } from "lucide-react"
import { useFixedPosition, useOverlayDismiss, resolveOverlayLayer } from "@/lib/overlay"
import { cn } from "@/lib/utils"
import { treatmentTypesApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import ToothNumberPicker from "./ToothNumberPicker"

export interface TreatmentItem {
  id: string
  name: string
  toothNumbers: string[]
  estimatedVisits: number | ""
  estimatedCost: number | ""
  remarks: string
}

interface TreatmentPlanSectionProps {
  treatments: TreatmentItem[]
  onChange: (treatments: TreatmentItem[]) => void
  estimatedVisits: number | string
  onEstimatedVisitsChange: (value: string) => void
  estimatedCost: number | string
  onEstimatedCostChange: (value: string) => void
}

let treatmentCounter = 0
function nextId() {
  treatmentCounter += 1
  return `tx-${Date.now()}-${treatmentCounter}`
}

export default function TreatmentPlanSection({
  treatments,
  onChange,
  onEstimatedVisitsChange,
  onEstimatedCostChange,
}: TreatmentPlanSectionProps) {
  const [search, setSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState("")
  const triggerRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { position } = useFixedPosition(showDropdown, triggerRef)
  useOverlayDismiss(showDropdown, () => setShowDropdown(false), triggerRef, popupRef)
  const layer = resolveOverlayLayer(triggerRef.current)

  const { data: treatmentTypes } = useQuery({
    queryKey: ["treatment-types"],
    queryFn: () => treatmentTypesApi.list(),
    staleTime: Infinity,
  })
  const treatmentNames: string[] = useMemo(() => {
    if (!treatmentTypes) return []
    const list = Array.isArray(treatmentTypes) ? treatmentTypes : treatmentTypes?.data || []
    const seen = new Set<string>()
    const unique: string[] = []
    for (const t of list) {
      const name = (t.name || "").trim()
      if (name && !seen.has(name)) {
        seen.add(name)
        unique.push(name)
      }
    }
    return unique
  }, [treatmentTypes])

  const filtered = treatmentNames.filter((n) =>
    n.toLowerCase().includes(search.toLowerCase())
  ).sort()

  const totals = useMemo(() => {
    let totalVisits = 0
    let totalCost = 0
    const allTeeth = new Set<string>()
    for (const t of treatments) {
      totalVisits += typeof t.estimatedVisits === "number" ? t.estimatedVisits : 0
      totalCost += typeof t.estimatedCost === "number" ? t.estimatedCost : 0
      for (const tooth of t.toothNumbers) allTeeth.add(tooth)
    }
    return {
      procedures: treatments.length,
      teeth: allTeeth.size,
      visits: totalVisits,
      cost: totalCost,
    }
  }, [treatments])

  const visitsCbRef = useRef(onEstimatedVisitsChange)
  const costCbRef = useRef(onEstimatedCostChange)
  useEffect(() => { visitsCbRef.current = onEstimatedVisitsChange })
  useEffect(() => { costCbRef.current = onEstimatedCostChange })
  useEffect(() => {
    visitsCbRef.current(String(totals.visits))
    costCbRef.current(String(totals.cost))
  }, [totals.visits, totals.cost])

  function addTreatment(name: string) {
    if (treatments.some((t) => t.name === name)) return
    onChange([...treatments, {
      id: nextId(),
      name,
      toothNumbers: [],
      estimatedVisits: 1,
      estimatedCost: 0,
      remarks: "",
    }])
    setSearch("")
    setShowDropdown(false)
  }

  function removeTreatment(id: string) {
    onChange(treatments.filter((t) => t.id !== id))
  }

  function updateTreatment(id: string, field: keyof TreatmentItem, value: TreatmentItem[keyof TreatmentItem]) {
    onChange(treatments.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
  }

  function handleCustomAdd() {
    const name = customName.trim()
    if (!name) return
    addTreatment(name)
    setCustomName("")
    setCustomMode(false)
  }

  return (
    <div className="space-y-4">
      {/* Treatment Search + Add */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-tertiary)]" />
            <Input
              ref={triggerRef}
              placeholder="Search treatment procedure..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); setCustomMode(false) }}
              onFocus={() => setShowDropdown(true)}
              className="pl-9 h-10 text-sm bg-[var(--ds-surface)] border-[var(--ds-border-strong)] focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="h-10 border-[var(--ds-border-strong)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)]" onClick={() => { setCustomMode(!customMode); setShowDropdown(false) }}>
            <Plus className="h-4 w-4 mr-1.5" /> Custom
          </Button>
        </div>
        {showDropdown && search &&
          createPortal(
            <Branch
              id="treatment-plan-dropdown"
              ref={popupRef}
              style={position ? { top: position.top, left: position.left, width: position.width, pointerEvents: "auto" } : { pointerEvents: "auto" }}
              className={cn("fixed rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-lg", layer)}
            >
              <div className="max-h-56 overflow-y-auto p-1.5">
                {filtered.length === 0 ? (
                  <p className="py-3 text-center text-sm text-[var(--ds-text-secondary)]">No matching procedures</p>
                ) : (
                  filtered.map((name, idx) => (
                    <button
                      key={`${name}-${idx}`}
                      type="button"
                      onClick={() => addTreatment(name)}
                      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--ds-text)] hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      <Plus className="h-4 w-4 text-[var(--ds-text-tertiary)] shrink-0" />
                      {name}
                    </button>
                  ))
                )}
              </div>
            </Branch>,
            document.body
          )}
        {customMode && (
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Enter custom procedure name..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="h-10 text-sm flex-1 bg-[var(--ds-surface)] border-[var(--ds-border-strong)]"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCustomAdd() } }}
            />
            <Button type="button" size="sm" variant="default" className="h-10 px-4" onClick={handleCustomAdd} disabled={!customName.trim()}>
              <Check className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-10 px-4 border-[var(--ds-border-strong)]" onClick={() => { setCustomMode(false); setCustomName("") }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Treatment Cards */}
      {treatments.length > 0 && (
        <div className="space-y-3">
          {treatments.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-sm hover:shadow transition-shadow"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ds-border-light)] bg-[var(--ds-background-subtle)]/50">
                <div className="flex items-center gap-2 min-w-0">
                  <Stethoscope className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm font-semibold text-[var(--ds-text)] truncate">{t.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeTreatment(t.id)}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--ds-text-tertiary)] hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove treatment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3">
                {/* Tooth Selection */}
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)] mb-1.5 block">
                    Tooth Number <span className="text-red-500">*</span>
                  </Label>
                  <ToothNumberPicker
                    selected={t.toothNumbers}
                    onChange={(teeth) => updateTreatment(t.id, "toothNumbers", teeth)}
                  />
                </div>

                {/* Visits + Cost + Remarks */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-[var(--ds-text-secondary)] mb-1 block">Est. Visits <span className="text-red-500">*</span></Label>
                    <NumericInput
                      mode="integer" min={1}
                      value={t.estimatedVisits}
                      onChange={(v) => updateTreatment(t.id, "estimatedVisits", v ? Number(v) : "")}
                      className="h-9 text-sm bg-[var(--ds-surface)] border-[var(--ds-border-strong)] focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-[var(--ds-text-secondary)] mb-1 block">Est. Cost (₹) <span className="text-red-500">*</span></Label>
                    <NumericInput
                      mode="currency" prefix="₹" min={0}
                      value={t.estimatedCost}
                      onChange={(v) => updateTreatment(t.id, "estimatedCost", v ? Number(v) : "")}
                      className="h-9 text-sm bg-[var(--ds-surface)] border-[var(--ds-border-strong)] focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-[var(--ds-text-secondary)] mb-1 block">Remarks</Label>
                    <Input
                      value={t.remarks}
                      onChange={(e) => updateTreatment(t.id, "remarks", e.target.value)}
                      className="h-9 text-sm bg-[var(--ds-surface)] border-[var(--ds-border-strong)] focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      placeholder="Optional notes..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {treatments.length === 0 && (
        <div className="rounded-lg border border-dashed border-[var(--ds-border-strong)] bg-[var(--ds-background-subtle)] py-8 text-center">
          <p className="text-sm text-[var(--ds-text-secondary)]">No treatments added yet. Search or add a custom procedure above.</p>
        </div>
      )}

      {/* Summary Card */}
      {treatments.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-3">Treatment Summary</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryItem icon={<Stethoscope className="h-4 w-4" />} label="Total Procedures" value={totals.procedures} />
            <SummaryItem icon={<Hash className="h-4 w-4" />} label="Total Teeth Involved" value={totals.teeth} />
            <SummaryItem icon={<Activity className="h-4 w-4" />} label="Est. Total Visits" value={totals.visits} />
            <SummaryItem icon={<IndianRupee className="h-4 w-4" />} label="Est. Total Cost" value={`₹${totals.cost.toLocaleString("en-IN")}`} />
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-[var(--ds-surface)] border border-blue-100 px-3 py-2.5">
      <div className="text-blue-600 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] text-[var(--ds-text-secondary)] uppercase tracking-wide leading-tight">{label}</div>
        <div className="text-sm font-bold text-[var(--ds-text)] leading-tight">{value}</div>
      </div>
    </div>
  )
}
