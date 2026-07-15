/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, AlertTriangle, FileText, User,
  Stethoscope
} from "lucide-react"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { casesApi, treatmentPlanItemsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"

export default function TreatmentPlanApproval() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

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

  const c = caseData as any
  const itemList = useMemo(() => (Array.isArray(items) ? items : (items?.items || [])), [items])
  const totalCost = itemList.reduce((sum: number, item: any) => sum + (item.estimated_cost || item.cost || 0), 0)

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!caseId) throw new Error("Case ID is required")
      return casesApi.approveTreatmentPlan(caseId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", caseId] })
      setApproveDialogOpen(false)
      addToast({ title: "Treatment Plan Approved", description: "Treatment records have been generated", variant: "success" })
      navigate(`/cases/${caseId}`)
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to approve", variant: "destructive" }),
  })

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!caseId) throw new Error("Case ID is required")
      return casesApi.rejectTreatmentPlan(caseId, rejectReason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", caseId] })
      setRejectDialogOpen(false)
      setRejectReason("")
      addToast({ title: "Treatment Plan Rejected", variant: "success" })
      navigate(`/cases/${caseId}`)
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to reject", variant: "destructive" }),
  })

  const isLoading = caseLoading || itemsLoading
  if (isLoading) return <div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
  if (!c) return <div className="py-20 text-center text-muted-foreground">Case not found</div>

  const planStatus = c.treatment_plan_status
  const isApproved = planStatus === "APPROVED"
  const isRejected = planStatus === "REJECTED"
  const isPending = planStatus === "PENDING_APPROVAL"

  return (
    <div className="space-y-6">
      <PageHeader title="Treatment Approval" description={c.case_number || caseId!.slice(0, 8)}>
        <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${caseId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Case
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Case Info */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" /> Patient & Case
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Patient:</span> <span className="font-medium">{c.patient_name || "—"}</span></div>
                <div><span className="text-muted-foreground">Case:</span> <span className="font-medium">#{c.case_number || "—"}</span></div>
                <div><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">Dr. {c.doctor_name || "—"}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{c.status}</span></div>
                <div><span className="text-muted-foreground">Plan Status:</span>
                  <Badge className={cn(
                    "ml-2",
                    isApproved && "bg-green-100 text-green-700",
                    isRejected && "bg-red-100 text-red-700",
                    isPending && "bg-yellow-100 text-yellow-700",
                    !isApproved && !isRejected && !isPending && "bg-gray-100 text-gray-700"
                  )}>
                    {planStatus || "DRAFT"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Treatment Plan Items */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Treatment Plan Items ({itemList.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              {itemList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No treatment plan items found for this case. Add items via Edit on the case detail page.</p>
              ) : (
                <div className="space-y-2">
                  {itemList.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{item.procedure_name || "—"}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">Tooth: {Array.isArray(item.tooth_numbers) ? item.tooth_numbers.join(", ") : item.tooth_numbers || "—"}</p>
                        {item.assigned_doctor_name && <p className="text-xs text-blue-600">Dr. {item.assigned_doctor_name}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatIndianRupees(item.estimated_cost || 0)}</p>
                        {item.estimated_visits && <p className="text-xs text-muted-foreground">{item.estimated_visits} visit(s)</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {itemList.length > 0 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t text-sm">
                  <span className="text-muted-foreground">Total Estimated Cost</span>
                  <span className="font-semibold">{formatIndianRupees(totalCost)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isApproved ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-700">Treatment Plan Approved</p>
                  <p className="text-xs text-muted-foreground mt-1">Approved {c.treatment_plan_approved_at ? `on ${new Date(c.treatment_plan_approved_at).toLocaleDateString()}` : ""}</p>
                </div>
              ) : isRejected ? (
                <div className="text-center py-4">
                  <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-red-700">Treatment Plan Rejected</p>
                  {c.treatment_plan_rejection_reason && (
                    <p className="text-xs text-muted-foreground mt-1">Reason: {c.treatment_plan_rejection_reason}</p>
                  )}
                </div>
              ) : itemList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No items to approve. Add treatment plan items first.</p>
              ) : (
                <>
                  <Button className="w-full" onClick={() => setApproveDialogOpen(true)}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Approve ({itemList.length} items)
                  </Button>
                  <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => setRejectDialogOpen(true)}>
                    <XCircle className="h-4 w-4 mr-2" /> Reject All
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approve Confirmation Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-green-600" /> Confirm Approval
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will approve {itemList.length} procedure items and mark the treatment plan as approved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Reject Treatment Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will reject all {itemList.length} procedure items.</p>
            <Label>Reason for rejection *</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this plan being rejected?" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectReason("") }}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={!rejectReason || rejectMutation.isPending}>
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
