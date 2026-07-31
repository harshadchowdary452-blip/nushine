import { useState, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, UserPlus } from "lucide-react"
import { PageHeader } from "@/design-system"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { casesApi, usersApi, treatmentPlanItemsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import type { Case, TreatmentPlanItem, DoctorListItem, DoctorOption } from "@/types"
import { extractDetail } from "@/types"

export default function AssignDoctor() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  const { data: caseData, isLoading: caseLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => casesApi.get(caseId!),
    enabled: !!caseId,
  })

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["treatment-plan-items", caseId],
    queryFn: () => treatmentPlanItemsApi.listByCase(caseId!),
    enabled: !!caseId,
  })

  const { data: doctors } = useQuery({
    queryKey: ["users-doctors"],
    queryFn: () => usersApi.list({ role: "DOCTOR" }),
  })

  const itemList = useMemo(() => {
    const raw = Array.isArray(items) ? items : items?.items || []
    return raw
  }, [items])

  const doctorList: DoctorOption[] = useMemo(() => {
    const raw = Array.isArray(doctors) ? doctors : doctors?.items || []
    return raw.map((d: DoctorListItem): DoctorOption => ({
      id: d.id,
      name: d.full_name || d.name || d.email || "",
      specialization: d.specialization || null,
    }))
  }, [doctors])

  const assignMutation = useMutation({
    mutationFn: (data: { doctor_ids: Record<string, string> }) => {
      const assignmentList = Object.entries(data.doctor_ids).map(
        ([item_id, assigned_doctor_id]) => ({
          item_id,
          assigned_doctor_id,
        }),
      )
      return treatmentPlanItemsApi.assignDoctors(assignmentList)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", caseId] })
      setConfirmDialogOpen(false)
      addToast({ title: "Doctors Assigned", variant: "success" })
      navigate(`/treatments/approve/${caseId}`)
    },
    onError: (err: Error) =>
      addToast({
        title: "Error",
        description: extractDetail(err) || "Failed",
        variant: "destructive",
      }),
  })

  const isLoading = caseLoading || itemsLoading
  if (isLoading)
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    )
  if (!caseData)
    return <div className="py-20 text-center text-muted-foreground">Case not found</div>

  const allAssigned = itemList.every(
    (item: TreatmentPlanItem) => assignments[item.id] || item.assigned_doctor_id,
  )
  const totalCost = itemList.reduce(
    (sum: number, item: TreatmentPlanItem) => sum + (item.estimated_cost || 0),
    0,
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assign Doctors"
        description={(caseData as Case).case_number || caseId!.slice(0, 8)}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      {!allAssigned && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          All procedures must have a doctor assigned before proceeding to approval
        </div>
      )}

      {/* Procedure Grid */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Assign Doctor to Each Procedure
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 space-y-3">
          {itemList.map((item: TreatmentPlanItem) => (
            <div key={item.id} className="flex items-center gap-4 rounded-lg border p-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.procedure_name || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  Tooth:{" "}
                  {Array.isArray(item.tooth_numbers)
                    ? item.tooth_numbers.join(", ")
                    : item.tooth_numbers || "—"}
                  {item.remarks && <> · {item.remarks}</>}
                </p>
              </div>
              <div className="w-64">
                <Select
                  value={assignments[item.id] || item.assigned_doctor_id || ""}
                  onValueChange={(val) => setAssignments((prev) => ({ ...prev, [item.id]: val }))}
                >
                  <SelectTrigger
                    className={cn(
                      !assignments[item.id] && !item.assigned_doctor_id && "border-yellow-300",
                    )}
                  >
                    <SelectValue placeholder="Select Doctor *" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctorList.map((doc: DoctorOption) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        Dr. {doc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!assignments[item.id] && !item.assigned_doctor_id && (
                <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">Unassigned</Badge>
              )}
            </div>
          ))}
          {itemList.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No procedure items to assign
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary & Confirm */}
      <div className="flex items-center justify-between rounded-lg border bg-white p-4">
        <div className="text-sm text-muted-foreground">
          {Object.values(assignments).filter(Boolean).length +
            itemList.filter((i: TreatmentPlanItem) => i.assigned_doctor_id).length}{" "}
          / {itemList.length} procedures assigned · Total Cost: ₹{totalCost.toLocaleString()}
        </div>
        <Button
          onClick={() => setConfirmDialogOpen(true)}
          disabled={!allAssigned || assignMutation.isPending}
        >
          {assignMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-1" />
          )}
          Confirm & Proceed to Approval
        </Button>
      </div>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" /> Confirm Assignment
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Assigning doctors to all {itemList.length} procedures. This will save the assignments
            and you can proceed to approval.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => assignMutation.mutate({ doctor_ids: assignments })}
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}{" "}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
