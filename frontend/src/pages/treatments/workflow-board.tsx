/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { treatmentApi } from "@/services/endpoints"
import { cn } from "@/lib/utils"

const COLUMNS = [
  { key: "ASSIGNED", label: "Assigned", color: "bg-blue-500" },
  { key: "SCHEDULED", label: "Scheduled", color: "bg-indigo-500" },
  { key: "IN_PROGRESS", label: "In Progress", color: "bg-green-500" },
  { key: "WAITING_PATIENT", label: "Waiting Patient", color: "bg-yellow-500" },
  { key: "WAITING_LAB", label: "Waiting Lab", color: "bg-orange-500" },
  { key: "OVERDUE", label: "Overdue", color: "bg-red-500" },
  { key: "COMPLETED", label: "Completed", color: "bg-emerald-500" },
]

export default function TreatmentWorkflowBoard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ["treatment-plans-board"],
    queryFn: () => treatmentApi.list({ limit: 200 }),
  })

  const plans = useMemo(() => (Array.isArray(data) ? data : (data?.items || [])), [data])

  const columns = useMemo(() => {
    return COLUMNS.map(col => ({
      ...col,
      items: plans.filter((p: any) => p.status === col.key),
    }))
  }, [plans])

  if (isLoading) return <div className="p-6 flex gap-3">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="flex-1 h-64" />)}</div>

  return (
    <div className="space-y-6">
      <PageHeader title="Workflow Board" description="Visual overview of all treatments by status">
        <Button variant="outline" size="sm" onClick={() => navigate("/treatments")}>List View</Button>
      </PageHeader>

      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[600px]">
        {columns.map(col => (
          <div key={col.key} className="flex-1 min-w-[220px] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn("w-2.5 h-2.5 rounded-full", col.color)} />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{col.label}</span>
              <span className="text-xs text-muted-foreground ml-auto bg-muted rounded-full px-1.5">{col.items.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {col.items.map((plan: any) => (
                <div
                  key={plan.id}
                  className="rounded-lg border bg-white p-3 hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => navigate(`/treatments/${plan.id}`)}
                >
                  <p className="text-sm font-semibold mb-1">{plan.treatment_name}</p>
                  <p className="text-xs text-muted-foreground mb-1">{plan.patient_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">Dr. {plan.assigned_doctor_name || "—"}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <span>Visit {plan.completed_sittings || 0}/{plan.total_sittings || 0}</span>
                    {plan.status === "OVERDUE" && <Badge className="bg-red-100 text-red-700 text-[10px] px-1">Overdue</Badge>}
                  </div>
                </div>
              ))}
              {col.items.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Empty</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
