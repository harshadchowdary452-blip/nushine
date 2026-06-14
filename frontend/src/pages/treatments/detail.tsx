import { useState } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Calendar, CalendarDays, Clock, User, Activity, FileText, Edit3, Plus, MessageSquare, History, DollarSign } from "lucide-react"
import { format } from "date-fns"
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { treatmentApi, treatmentSittingsApi, patientsApi, crmApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"
import type { TreatmentPlan, TreatmentSitting, Patient } from "@/types"

function S() {
  return <div className="space-y-4 p-6">
    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
  </div>
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`}>{status?.replace(/_/g, " ")}</span>
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 100 ? "bg-success" : value >= 50 ? "bg-primary" : value >= 25 ? "bg-warning" : "bg-danger"
  return (
    <div className="space-y-1">
      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <p className="text-xs font-medium text-muted-foreground text-right">{value}%</p>
    </div>
  )
}

export default function TreatmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [sittingDialogOpen, setSittingDialogOpen] = useState(false)
  const [sittingForm, setSittingForm] = useState({ sitting_number: 1, work_done: "", doctor_notes: "", next_appointment_date: "" })

  const { data: plan, isLoading } = useQuery({
    queryKey: ["treatment-plan", id],
    queryFn: () => treatmentApi.get(id!),
    enabled: !!id,
  })

  const { data: sittings } = useQuery({
    queryKey: ["treatment-sittings", id],
    queryFn: () => treatmentSittingsApi.listByPlan(id!),
    enabled: !!id,
  })

  const sittingList: TreatmentSitting[] = Array.isArray(sittings) ? sittings : (sittings?.items || [])

  const { data: patientData } = useQuery({
    queryKey: ["patient", plan?.patient_id],
    queryFn: () => patientsApi.get(plan!.patient_id!),
    enabled: !!plan?.patient_id,
  })

  const patient: Patient | null = patientData || null

  const statusMutation = useMutation({
    mutationFn: ({ sid, status }: { sid: string; status: string }) => treatmentApi.updateStatus(sid, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      addToast({ title: "Success", description: "Status updated", variant: "success" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ sid, data }: { sid: string; data: any }) => treatmentApi.update(sid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      addToast({ title: "Success", description: "Treatment plan updated", variant: "success" })
      setEditDialogOpen(false)
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const createSittingMutation = useMutation({
    mutationFn: (data: any) => treatmentSittingsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-sittings", id] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      addToast({ title: "Success", description: "Sitting added", variant: "success" })
      setSittingDialogOpen(false)
      setSittingForm({ sitting_number: (sittingList.length || 0) + 1, work_done: "", doctor_notes: "", next_appointment_date: "" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  function openEdit() {
    if (!plan) return
    setEditForm({
      treatment_name: plan.treatment_name,
      description: plan.description || "",
      cost: plan.cost,
      paid_amount: plan.paid_amount,
      duration_minutes: plan.duration_minutes,
      start_date: plan.start_date || "",
      expected_completion_date: plan.expected_completion_date || "",
      next_appointment_date: plan.next_appointment_date || "",
      notes: plan.notes || "",
    })
    setEditDialogOpen(true)
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plan) return
    const cleaned: Record<string, any> = {}
    for (const [key, value] of Object.entries(editForm)) {
      if (value !== null && value !== "" && value !== undefined) cleaned[key] = value
    }
    updateMutation.mutate({ sid: plan.id, data: cleaned })
  }

  if (isLoading) return <S />

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Treatment plan not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/treatments")}>Back to Treatments</Button>
      </div>
    )
  }

  const pendingAmount = plan.pending_amount ?? ((plan.cost || 0) - (plan.paid_amount || 0))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/treatments")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">{plan.treatment_name}</h1>
          <p className="text-xs text-muted-foreground font-mono">ID: {plan.id.slice(0, 8)}... | Case: {plan.case_number || plan.case_id.slice(0, 8)}</p>
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="bg-white border border-border rounded-xl p-1">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sittings">Sittings ({sittingList.length})</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* Treatment info card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Treatment Information</CardTitle>
                  <Button variant="outline" size="sm" onClick={openEdit}><Edit3 className="h-3.5 w-3.5" /> Edit</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Status</span>
                      <div className="mt-1">
                        <Select value={plan.status} onValueChange={(v) => statusMutation.mutate({ sid: plan.id, status: v })}>
                          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PLANNED">Planned</SelectItem>
                            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                            <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duration</span>
                      <p className="font-medium flex items-center gap-1 mt-0.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" /> {plan.duration_minutes || "—"} min</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Start Date</span>
                      <p className="font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {plan.start_date ? format(new Date(plan.start_date), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expected Completion</span>
                      <p className="font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {plan.expected_completion_date ? format(new Date(plan.expected_completion_date), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Next Appointment</span>
                      <p className="font-medium flex items-center gap-1 mt-0.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> {plan.next_appointment_date ? format(new Date(plan.next_appointment_date), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Description</span>
                      <p className="font-medium mt-0.5">{plan.description || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Notes</span>
                      <p className="font-medium mt-0.5">{plan.notes || "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Case information */}
              <Card>
                <CardHeader><CardTitle className="text-base">Case Information</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Case Number</span>
                      <p className="font-medium mt-0.5">
                        <Link to={`/cases/${plan.case_id}`} className="text-primary hover:underline">
                          {plan.case_number || plan.case_id.slice(0, 8)}
                        </Link>
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <p className="mt-0.5"><StatusBadge status={plan.case_status || ""} /></p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Doctor</span>
                      <p className="font-medium mt-0.5">{plan.doctor_name || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Treatment Category</span>
                      <p className="font-medium mt-0.5">{plan.category || "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right sidebar in Details tab */}
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Patient Information</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {patient ? (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-light text-primary font-bold text-sm">
                          {patient.full_name?.charAt(0) || "?"}
                        </div>
                        <div>
                          <p className="font-semibold">{patient.full_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">ID: {patient.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-border pt-3">
                        <div><span className="text-muted-foreground">Age</span><p className="font-medium">{patient.age || "—"}</p></div>
                        <div><span className="text-muted-foreground">Gender</span><p className="font-medium">{patient.gender || "—"}</p></div>
                        <div className="col-span-2"><span className="text-muted-foreground">Phone</span><p className="font-medium">{patient.phone || "—"}</p></div>
                        <div className="col-span-2"><span className="text-muted-foreground">Email</span><p className="font-medium truncate">{patient.email || "—"}</p></div>
                        <div><span className="text-muted-foreground">Status</span><p className="mt-1"><StatusBadge status={patient.status} /></p></div>
                        <div><span className="text-muted-foreground">Cases</span><p className="font-medium">{(patient as any)?.cases_count || "—"}</p></div>
                      </div>
                      <Link to={`/patients/${patient.id}`}>
                        <Button variant="outline" size="sm" className="w-full text-xs">View Full Profile</Button>
                      </Link>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{plan.patient_name || "Patient"}</p>
                        <p className="text-xs text-muted-foreground font-mono">ID: {plan.patient_id?.slice(0, 8) || "—"}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Quick Stats</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{format(new Date(plan.created_at), "dd MMM yy")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span className="font-medium">{format(new Date(plan.updated_at), "dd MMM yy")}</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sittings" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Sittings & Progress</CardTitle>
              <Button size="sm" onClick={() => {
                setSittingForm({ ...sittingForm, sitting_number: (sittingList.length || 0) + 1 })
                setSittingDialogOpen(true)
              }}><Plus className="h-3.5 w-3.5" /> Add Sitting</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{plan.total_sittings}</p>
                </div>
                <div className="rounded-lg bg-success-soft p-3 text-center">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-xl font-bold text-success">{plan.completed_sittings}</p>
                </div>
                <div className="rounded-lg bg-warning-soft p-3 text-center">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-xl font-bold text-warning">{plan.remaining_sittings}</p>
                </div>
                <div className="rounded-lg bg-primary-light p-3 text-center">
                  <p className="text-xs text-muted-foreground">Progress</p>
                  <p className="text-xl font-bold text-primary">{plan.progress}%</p>
                </div>
              </div>

              <ProgressBar value={plan.progress} />

              {sittingList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sitting History</p>
                  {sittingList.map((s) => (
                    <div key={s.id} className="flex items-start justify-between rounded-lg border border-border p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold">Sitting #{s.sitting_number}</span>
                          <StatusBadge status={s.status} />
                        </div>
                        {s.work_done && <p className="text-xs text-muted-foreground mt-1">{s.work_done}</p>}
                        {s.doctor_notes && <p className="text-xs text-muted-foreground mt-0.5 italic">Notes: {s.doctor_notes}</p>}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {s.next_appointment_date && <p>Next: {format(new Date(s.next_appointment_date), "dd MMM yy")}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sittingList.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No sittings recorded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Financial Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl bg-blue-50 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
                    <p className="text-lg font-bold text-blue-700">{formatIndianRupees(plan.cost)}</p>
                  </div>
                  <div className="rounded-xl bg-green-50 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Paid</p>
                    <p className="text-lg font-bold text-green-700">{formatIndianRupees(plan.paid_amount)}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Pending</p>
                    <p className={cn("text-lg font-bold", pendingAmount > 0 ? "text-amber-700" : "text-green-700")}>{formatIndianRupees(pendingAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="enquiries" className="mt-6">
          <EnquiryList patientId={plan.patient_id} treatmentPlanId={id!} />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <TreatmentHistory plan={plan} />
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Edit Treatment Plan</DialogTitle><DialogDescription>Update treatment details.</DialogDescription></DialogHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label>Treatment Name</Label>
                <Input value={editForm.treatment_name || ""} onChange={(e) => setEditForm({ ...editForm, treatment_name: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea value={editForm.description || ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Cost</Label>
                  <Input type="number" value={editForm.cost ?? ""} onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })} />
                </div>
                <div className="grid gap-2">
                  <Label>Paid Amount</Label>
                  <Input type="number" value={editForm.paid_amount ?? ""} onChange={(e) => setEditForm({ ...editForm, paid_amount: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Duration (min)</Label>
                  <Input type="number" value={editForm.duration_minutes ?? ""} onChange={(e) => setEditForm({ ...editForm, duration_minutes: Number(e.target.value) })} />
                </div>
                <div className="grid gap-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={editForm.start_date || ""} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Expected Completion Date</Label>
                <Input type="date" value={editForm.expected_completion_date || ""} onChange={(e) => setEditForm({ ...editForm, expected_completion_date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Next Appointment Date</Label>
                <Input type="date" value={editForm.next_appointment_date || ""} onChange={(e) => setEditForm({ ...editForm, next_appointment_date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add sitting dialog */}
      <Dialog open={sittingDialogOpen} onOpenChange={setSittingDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>Add Sitting</DialogTitle><DialogDescription>Record a new treatment sitting.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault()
            if (!plan) return
            createSittingMutation.mutate({
              treatment_plan_id: plan.id,
              sitting_number: sittingForm.sitting_number,
              work_done: sittingForm.work_done || undefined,
              doctor_notes: sittingForm.doctor_notes || undefined,
              next_appointment_date: sittingForm.next_appointment_date || undefined,
            })
          }} className="space-y-4">
            <div className="grid gap-2">
              <Label>Sitting #</Label>
              <Input type="number" min={1} value={sittingForm.sitting_number} onChange={(e) => setSittingForm({ ...sittingForm, sitting_number: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label>Work Done</Label>
              <Textarea value={sittingForm.work_done} onChange={(e) => setSittingForm({ ...sittingForm, work_done: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Doctor Notes</Label>
              <Textarea value={sittingForm.doctor_notes} onChange={(e) => setSittingForm({ ...sittingForm, doctor_notes: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Next Appointment Date</Label>
              <Input type="date" value={sittingForm.next_appointment_date} onChange={(e) => setSittingForm({ ...sittingForm, next_appointment_date: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSittingDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createSittingMutation.isPending}>Save Sitting</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EnquiryList({ patientId }: { patientId?: string; treatmentPlanId: string }) {
  const { data: followUpData, isLoading } = useQuery({
    queryKey: ["patient-follow-ups", patientId],
    queryFn: () => crmApi.followUps.list({ patient_id: patientId }),
    enabled: !!patientId,
  })
  const items: any[] = Array.isArray(followUpData) ? followUpData : followUpData?.items || []

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center border-border shadow-card">
        <MessageSquare className="h-12 w-12 text-text-muted mx-auto mb-3" />
        <p className="text-text-secondary">No follow-ups found for this patient</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((e: any) => (
        <Card key={e.id} className="p-4 border-border shadow-card">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="text-xs">{e.follow_up_type || "General"}</Badge>
                {e.status && <span className={`text-xs px-1.5 py-0.5 rounded ${e.status === "COMPLETED" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>{e.status}</span>}
              </div>
              {e.notes && <p className="text-sm text-text-primary">{e.notes}</p>}
              {e.response_message && <p className="text-xs text-text-secondary mt-1">Response: {e.response_message}</p>}
            </div>
            <span className="text-xs text-text-muted shrink-0">{e.created_at ? format(new Date(e.created_at), "dd MMM yy") : ""}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}

function TreatmentHistory({ plan }: { plan: any }) {
  const events = [
    { date: plan.created_at, label: "Treatment Plan Created", detail: `${plan.treatment_name} - ${plan.category || ""}` },
    { date: plan.start_date, label: "Treatment Started", detail: `Start date set to ${format(new Date(plan.start_date), "dd MMM yyyy")}` },
    { date: plan.expected_completion_date, label: "Expected Completion", detail: `Expected by ${format(new Date(plan.expected_completion_date), "dd MMM yyyy")}` },
    { date: plan.updated_at, label: "Last Updated", detail: `Status: ${plan.status}` },
  ].filter(e => e.date)

  return (
    <Card className="p-6 border-border shadow-card">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        Treatment History
      </h3>
      {events.length === 0 ? (
        <p className="text-text-secondary text-center py-8">No history available</p>
      ) : (
        <div className="relative pl-6 border-l-2 border-border space-y-6">
          {events.map((ev, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[21px] p-1 rounded-full bg-primary">
                <div className="h-2 w-2 rounded-full bg-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{ev.label}</p>
                <p className="text-xs text-text-secondary">{ev.detail}</p>
                <p className="text-xs text-text-muted mt-0.5">{ev.date ? format(new Date(ev.date), "dd MMM yyyy") : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}