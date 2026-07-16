/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Search, Filter, Stethoscope, Clock, FileText, ChevronDown, ChevronRight, Calendar, IndianRupee, Hash, ChevronLeft, RotateCcw } from "lucide-react"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { treatmentApi } from "@/services/endpoints"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"
import type { TreatmentPlan } from "@/types"

const PAGE_SIZE = 20

const STATUS_COLORS: Record<string, string> = {
  GENERATED: "bg-gray-100 text-gray-600",
  ASSIGNED: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-indigo-100 text-indigo-700",
  IN_PROGRESS: "bg-green-100 text-green-700",
  WAITING_PATIENT: "bg-yellow-100 text-yellow-700",
  WAITING_LAB: "bg-orange-100 text-orange-700",
  ON_HOLD: "bg-gray-100 text-gray-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  OVERDUE: "bg-red-200 text-red-800",
}

const STATUS_PRIORITY: Record<string, number> = {
  OVERDUE: 0,
  IN_PROGRESS: 1,
  WAITING_PATIENT: 2,
  WAITING_LAB: 3,
  SCHEDULED: 4,
  ASSIGNED: 5,
  GENERATED: 6,
  ON_HOLD: 7,
  COMPLETED: 8,
  CANCELLED: 9,
}

interface CaseGroup {
  case_id: string
  case_number: string
  patient_name: string
  patient_op_no: string | null
  treatments: TreatmentPlan[]
  total_cost: number
  total_sittings: number
  completed_sittings: number
  aggregate_status: string
}

function groupByCase(plans: TreatmentPlan[]): CaseGroup[] {
  const map = new Map<string, CaseGroup>()
  for (const plan of plans) {
    const cid = plan.case_id
    if (!map.has(cid)) {
      map.set(cid, {
        case_id: cid,
        case_number: plan.case_number || `CASE-${cid.slice(0, 8).toUpperCase()}`,
        patient_name: plan.patient_name || "—",
        patient_op_no: plan.patient_op_no || null,
        treatments: [],
        total_cost: 0,
        total_sittings: 0,
        completed_sittings: 0,
        aggregate_status: plan.status,
      })
    }
    const g = map.get(cid)!
    g.treatments.push(plan)
    g.total_cost += plan.cost || 0
    g.total_sittings += plan.total_sittings || 0
    g.completed_sittings += plan.completed_sittings || 0
    const curPriority = STATUS_PRIORITY[g.aggregate_status] ?? 99
    const newPriority = STATUS_PRIORITY[plan.status] ?? 99
    if (newPriority < curPriority) {
      g.aggregate_status = plan.status
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const pa = STATUS_PRIORITY[a.aggregate_status] ?? 99
    const pb = STATUS_PRIORITY[b.aggregate_status] ?? 99
    if (pa !== pb) return pa - pb
    return (b.treatments[0]?.created_at || "").localeCompare(a.treatments[0]?.created_at || "")
  })
}

export default function TreatmentList() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

  const skip = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ["treatment-plans", debouncedSearch, statusFilter, skip],
    queryFn: () => treatmentApi.list({
      skip,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }),
  })

  const allPlans: TreatmentPlan[] = useMemo(() => {
    if (!data) return []
    return Array.isArray(data) ? data : (data.items || [])
  }, [data])

  const total: number = useMemo(() => {
    if (!data) return 0
    if (typeof data === "object" && !Array.isArray(data)) return data.total || 0
    return allPlans.length
  }, [data, allPlans])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const caseGroups = useMemo(() => groupByCase(allPlans), [allPlans])

  const activeTreatments = allPlans.filter((p: any) => !["COMPLETED", "CANCELLED"].includes(p.status)).length

  const toggleExpand = useCallback((caseId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedCases(prev => {
      const next = new Set(prev)
      if (next.has(caseId)) next.delete(caseId)
      else next.add(caseId)
      return next
    })
  }, [])

  if (isLoading && allPlans.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Treatments" description={`${caseGroups.length} case(s) · ${total} treatment(s) · ${activeTreatments} active`}>
        <Button variant="outline" size="sm" onClick={() => navigate("/treatments/workflow")}>
          Workflow Board
        </Button>
      </PageHeader>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Patient, OP#, case#, treatment#, doctor, status..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.keys(STATUS_COLORS).map(s => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(debouncedSearch || statusFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchInput(""); setStatusFilter("all") }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {caseGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Stethoscope className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No treatments found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {caseGroups.map((group) => {
            const isExpanded = expandedCases.has(group.case_id)
            const progress = group.total_sittings > 0 ? Math.round((group.completed_sittings / group.total_sittings) * 100) : 0

            return (
              <Card key={group.case_id} className="overflow-hidden">
                <div
                  className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/cases/${group.case_id}`)}
                >
                  <button
                    type="button"
                    onClick={(e) => toggleExpand(group.case_id, e)}
                    className="shrink-0 p-1 rounded hover:bg-gray-100"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{group.patient_name}</span>
                      {group.patient_op_no && (
                        <span className="text-xs text-muted-foreground">OP: {group.patient_op_no}</span>
                      )}
                      <Badge className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[group.aggregate_status] || "bg-gray-100")}>
                        {group.aggregate_status?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {group.case_number}</span>
                      <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {group.treatments.length} treatment(s)</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {group.completed_sittings}/{group.total_sittings} visits</span>
                      <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" /> {formatIndianRupees(group.total_cost)}</span>
                    </div>
                  </div>

                  {group.total_sittings > 0 && (
                    <div className="w-24 shrink-0">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-right mt-0.5">{progress}%</p>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t bg-gray-50/30">
                    {group.treatments.map((treatment) => (
                      <div
                        key={treatment.id}
                        className="flex items-center gap-4 px-4 py-3 ml-11 hover:bg-white transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
                        onClick={() => navigate(`/treatments/${treatment.id}`)}
                      >
                        <div className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          treatment.status === "IN_PROGRESS" && "bg-green-500",
                          treatment.status === "COMPLETED" && "bg-emerald-500",
                          treatment.status === "OVERDUE" && "bg-red-500",
                          treatment.status === "SCHEDULED" && "bg-indigo-500",
                          treatment.status === "ASSIGNED" && "bg-blue-500",
                          treatment.status === "WAITING_PATIENT" && "bg-yellow-500",
                          treatment.status === "WAITING_LAB" && "bg-orange-500",
                          treatment.status === "ON_HOLD" && "bg-gray-400",
                          treatment.status === "CANCELLED" && "bg-red-400",
                          treatment.status === "GENERATED" && "bg-gray-300",
                        )} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{treatment.treatment_name}</span>
                            {treatment.tooth_numbers && treatment.tooth_numbers.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Tooth {Array.isArray(treatment.tooth_numbers) ? treatment.tooth_numbers.join(", ") : treatment.tooth_numbers}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground shrink-0 w-32 truncate">
                          {treatment.assigned_doctor_name ? `Dr. ${treatment.assigned_doctor_name}` : "Unassigned"}
                        </div>

                        <div className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                          {treatment.completed_sittings || 0}/{treatment.total_sittings || 0} visits
                        </div>

                        <div className="text-xs font-medium shrink-0 w-24 text-right">
                          {formatIndianRupees(treatment.cost || 0)}
                        </div>

                        <Badge className={cn("text-[10px] px-1.5 py-0 shrink-0", STATUS_COLORS[treatment.status] || "bg-gray-100")}>
                          {treatment.status?.replace(/_/g, " ")}
                        </Badge>

                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} treatments)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => { setPage(p => p - 1); setExpandedCases(new Set()) }}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => { setPage(p => p + 1); setExpandedCases(new Set()) }}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
