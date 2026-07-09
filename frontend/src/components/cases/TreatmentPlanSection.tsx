import { useState, useRef, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Plus, X, Search, Check } from "lucide-react"
import { treatmentTypesApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface TreatmentItem {
  id: string
  name: string
  priority: string
  estimatedVisits: number | ""
  estimatedCost: number | ""
  status: string
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

const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH"]
const STATUS_OPTIONS = ["PLANNED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]

const priorityColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700 border-gray-300",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-300",
  HIGH: "bg-red-50 text-red-700 border-red-300",
}

export default function TreatmentPlanSection({
  treatments,
  onChange,
  estimatedVisits,
  onEstimatedVisitsChange,
  estimatedCost,
  onEstimatedCostChange,
}: TreatmentPlanSectionProps) {
  const [search, setSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customName, setCustomName] = useState("")
  const searchRef = useRef<HTMLDivElement>(null)

  const { data: treatmentTypes } = useQuery({
    queryKey: ["treatment-types"],
    queryFn: () => treatmentTypesApi.list(),
    staleTime: Infinity,
  })
  const treatmentNames: string[] = useMemo(() => {
    if (!treatmentTypes) return []
    const list = Array.isArray(treatmentTypes) ? treatmentTypes : treatmentTypes?.data || []
    return list.map((t: any) => t.name)
  }, [treatmentTypes])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filtered = treatmentNames.filter((n) =>
    n.toLowerCase().includes(search.toLowerCase())
  ).sort()

  function addTreatment(name: string) {
    if (treatments.some((t) => t.name === name)) return
    onChange([...treatments, {
      id: nextId(),
      name,
      priority: "MEDIUM",
      estimatedVisits: "",
      estimatedCost: "",
      status: "PLANNED",
      remarks: "",
    }])
    setSearch("")
    setShowDropdown(false)
  }

  function removeTreatment(id: string) {
    onChange(treatments.filter((t) => t.id !== id))
  }

  function updateTreatment(id: string, field: keyof TreatmentItem, value: any) {
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
      <div ref={searchRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search treatment procedure..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); setCustomMode(false) }}
              onFocus={() => setShowDropdown(true)}
              className="pl-9 h-10 text-sm bg-white border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="h-10 border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => { setCustomMode(!customMode); setShowDropdown(false) }}>
            <Plus className="h-4 w-4 mr-1.5" /> Custom
          </Button>
        </div>
        {showDropdown && search && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="max-h-56 overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="py-3 text-center text-sm text-gray-500">No matching procedures</p>
              ) : (
                filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => addTreatment(name)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4 text-gray-400 shrink-0" />
                    {name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        {customMode && (
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Enter custom procedure name..."
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="h-10 text-sm flex-1 bg-white border-gray-300"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCustomAdd() } }}
            />
            <Button type="button" size="sm" variant="default" className="h-10 px-4" onClick={handleCustomAdd} disabled={!customName.trim()}>
              <Check className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-10 px-4 border-gray-300" onClick={() => { setCustomMode(false); setCustomName("") }}>
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
              className="rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow transition-shadow"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 truncate">{t.name}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${priorityColors[t.priority] || "bg-gray-100 text-gray-700 border-gray-300"}`}>
                    {t.priority}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeTreatment(t.id)}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove treatment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Card Body */}
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1 block">Priority</Label>
                    <Select value={t.priority} onValueChange={(v) => updateTreatment(t.id, "priority", v)}>
                      <SelectTrigger className="h-9 text-sm bg-white border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p} className="text-sm text-gray-800">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1 block">Status</Label>
                    <Select value={t.status} onValueChange={(v) => updateTreatment(t.id, "status", v)}>
                      <SelectTrigger className="h-9 text-sm bg-white border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s} className="text-sm text-gray-800">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1 block">Est. Visits</Label>
                    <Input
                      type="number" min="1"
                      value={t.estimatedVisits}
                      onChange={(e) => updateTreatment(t.id, "estimatedVisits", e.target.value ? Number(e.target.value) : "")}
                      className="h-9 text-sm bg-white border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-500 mb-1 block">Est. Cost (₹)</Label>
                    <Input
                      type="number" min="0"
                      value={t.estimatedCost}
                      onChange={(e) => updateTreatment(t.id, "estimatedCost", e.target.value ? Number(e.target.value) : "")}
                      className="h-9 text-sm bg-white border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="text-xs font-medium text-gray-500 mb-1 block">Remarks</Label>
                  <textarea
                    value={t.remarks}
                    onChange={(e) => updateTreatment(t.id, "remarks", e.target.value)}
                    className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 min-h-[40px] focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none"
                    placeholder="Notes about this procedure..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {treatments.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center">
          <p className="text-sm text-gray-500">No treatments added yet. Search or add a custom procedure above.</p>
        </div>
      )}

      {/* Overall Estimates */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Summary Estimates</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">Total Estimated Visits</Label>
            <Input
              type="number" min="1"
              value={estimatedVisits}
              onChange={(e) => onEstimatedVisitsChange(e.target.value)}
              className="h-10 text-sm bg-white border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder="Total visits"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">Total Estimated Cost (₹)</Label>
            <Input
              type="number" min="0"
              value={estimatedCost}
              onChange={(e) => onEstimatedCostChange(e.target.value)}
              className="h-10 text-sm bg-white border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder="Total cost"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
