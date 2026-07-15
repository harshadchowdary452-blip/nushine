/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Search, Filter, Stethoscope, User, Clock, FileText, ChevronRight } from "lucide-react"
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

const STATUS_COLORS: Record<string, string> = {
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

export default function TreatmentList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const { data, isLoading } = useQuery({
    queryKey: ["treatment-plans", search, statusFilter],
    queryFn: () => treatmentApi.list({ page_size: 200, search: search || undefined, status: statusFilter !== "all" ? statusFilter : undefined }),
  })

  const plans: TreatmentPlan[] = useMemo(() => {
    return Array.isArray(data) ? data : (data?.items || [])
  }, [data])

  const filteredPlans = useMemo(() => {
    if (!search) return plans
    const q = search.toLowerCase()
    return plans.filter((p: any) =>
      p.treatment_name?.toLowerCase().includes(q) ||
      p.patient_name?.toLowerCase().includes(q) ||
      p.case_number?.toLowerCase().includes(q) ||
      p.assigned_doctor_name?.toLowerCase().includes(q)
    )
  }, [plans, search])

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Treatments" description={`${filteredPlans.length} treatment(s)`}>
        <Button variant="outline" size="sm" onClick={() => navigate("/treatments/workflow")}>
          Workflow Board
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by treatment, patient, case, doctor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
      </div>

      {/* Treatment Cards */}
      {filteredPlans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Stethoscope className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">No treatments found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredPlans.map((plan: any) => (
            <div
              key={plan.id}
              className="flex items-center gap-4 rounded-lg border bg-white p-4 hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => navigate(`/treatments/${plan.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{plan.treatment_name}</span>
                  <Badge className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[plan.status as string] || "bg-gray-100")}>
                    {plan.status?.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> {plan.patient_name || "—"}</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {plan.case_number || "—"}</span>
                  <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Dr. {plan.assigned_doctor_name || "—"}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {plan.completed_sittings || 0}/{plan.total_sittings || 0} visits</span>
                  <span>{formatIndianRupees(plan.cost || 0)}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
