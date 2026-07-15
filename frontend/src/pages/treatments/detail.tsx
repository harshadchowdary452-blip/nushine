/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, User, Activity, FileText, Clock, CheckCircle2, Play, PauseCircle,
  AlertTriangle, Stethoscope, DollarSign, MessageSquare, History, Loader2, Plus,
  Calendar, Camera, Edit3
} from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { treatmentApi, treatmentSittingsApi, patientsApi, billingApi, auditLogApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"
import type { TreatmentPlan, TreatmentSitting, Patient, Billing } from "@/types"

const STATUS_COLORS: Record<string, string> = {
  ASSIGNED: "bg-blue-100 text-blue-700 border-blue-200",
  SCHEDULED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  IN_PROGRESS: "bg-green-100 text-green-700 border-green-200",
  WAITING_PATIENT: "bg-yellow-100 text-yellow-700 border-yellow-200",
  WAITING_LAB: "bg-orange-100 text-orange-700 border-orange-200",
  ON_HOLD: "bg-gray-100 text-gray-700 border-gray-200",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  OVERDUE: "bg-red-200 text-red-800 border-red-300",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
}

export default function TreatmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [sittingDialogOpen, setSittingDialogOpen] = useState(false)
  const [sittingForm, setSittingForm] = useState({ work_done: "", doctor_notes: "", next_appointment_date: "", next_appointment_time: "" })
  const [viewSitting, setViewSitting] = useState<TreatmentSitting | null>(null)
  const [waitingDialogOpen, setWaitingDialogOpen] = useState(false)
  const [waitingType, setWaitingType] = useState("WAITING_PATIENT")

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

  const { data: patientData } = useQuery({
    queryKey: ["patient", plan?.patient_id],
    queryFn: () => patientsApi.get(plan!.patient_id!),
    enabled: !!plan?.patient_id,
  })

  const { data: billings } = useQuery({
    queryKey: ["case-billings", plan?.case_id],
    queryFn: () => billingApi.list({ case_id: plan!.case_id }),
    enabled: !!plan?.case_id,
  })

  const { data: auditLogs } = useQuery({
    queryKey: ["treatment-audit-logs", id],
    queryFn: () => auditLogApi.getForEntity("treatment", id!),
    enabled: !!id,
  })

  const sittingList: TreatmentSitting[] = Array.isArray(sittings) ? sittings : (sittings?.items || [])
  const billingList: Billing[] = useMemo(() => {
    const raw = Array.isArray(billings) ? billings : (billings?.items || [])
    return raw as Billing[]
  }, [billings])
  const patient: Patient | null = patientData || null

  const totalSittings = plan?.total_sittings || 0
  const completedSittings = plan?.completed_sittings || 0
  const progress = totalSittings > 0 ? Math.round((completedSittings / totalSittings) * 100) : 0
  const canStart = plan?.status === "ASSIGNED" || plan?.status === "SCHEDULED"
  const canComplete = plan?.status === "IN_PROGRESS"

  const startMutation = useMutation({
    mutationFn: () => treatmentApi.start(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] }); addToast({ title: "Treatment Started", variant: "success" }) },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const completeMutation = useMutation({
    mutationFn: () => treatmentApi.complete(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] }); addToast({ title: "Treatment Completed", variant: "success" }) },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const waitingMutation = useMutation({
    mutationFn: (type: string) => treatmentApi.setWaiting(id!, type),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] }); setWaitingDialogOpen(false); addToast({ title: "Status Updated", variant: "success" }) },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const createSittingMutation = useMutation({
    mutationFn: (data: any) => treatmentSittingsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-sittings", id] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      setSittingDialogOpen(false)
      setSittingForm({ work_done: "", doctor_notes: "", next_appointment_date: "", next_appointment_time: "" })
      addToast({ title: "Visit Recorded", variant: "success" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  if (isLoading) return <div className="p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
  if (!plan) return <div className="py-20 text-center text-muted-foreground">Treatment not found</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-lg font-bold">{plan.treatment_name}</h1>
            <p className="text-xs text-muted-foreground">{plan.treatment_number || plan.id.slice(0, 8)} · {plan.case_number || plan.case_id.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs", STATUS_COLORS[plan.status as string] || "bg-gray-100")}>{plan.status?.replace(/_/g, " ")}</Badge>
          {canStart && <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}><Play className="h-3.5 w-3.5 mr-1" /> Start</Button>}
          {plan.status === "IN_PROGRESS" && <Button size="sm" onClick={() => setSittingDialogOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add Visit</Button>}
          {canComplete && <Button size="sm" variant="outline" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete</Button>}
          {canComplete && <Button size="sm" variant="outline" onClick={() => setWaitingDialogOpen(true)}><PauseCircle className="h-3.5 w-3.5 mr-1" /> Waiting</Button>}
        </div>
      </div>

      {/* Progress */}
      {totalSittings > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{completedSittings}/{totalSittings} visits</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", progress >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
          <span>{progress}%</span>
        </div>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="visits">Visits ({sittingList.length})</TabsTrigger>
          <TabsTrigger value="billing">Billing ({billingList.length})</TabsTrigger>
          <TabsTrigger value="crm">CRM Activities</TabsTrigger>
          <TabsTrigger value="audit-log">Audit Log</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              {/* Treatment Info */}
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Treatment Information</CardTitle></CardHeader>
                <CardContent className="py-2 text-sm space-y-2">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    <div><span className="text-muted-foreground">Procedure:</span> <span className="font-medium">{plan.treatment_name}</span></div>
                    <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{plan.status?.replace(/_/g, " ")}</span></div>
                    <div><span className="text-muted-foreground">Teeth:</span> <span className="font-medium">{Array.isArray(plan.tooth_numbers) ? plan.tooth_numbers.join(", ") : plan.tooth_numbers || "—"}</span></div>
                    <div><span className="text-muted-foreground">Cost:</span> <span className="font-medium">{formatIndianRupees(plan.cost || 0)}</span></div>
                    <div><span className="text-muted-foreground">Visits:</span> <span className="font-medium">{completedSittings}/{totalSittings}</span></div>
                    <div><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">Dr. {plan.assigned_doctor_name || "—"}</span></div>
                    {plan.assistant_doctor_name && <div><span className="text-muted-foreground">Assistant:</span> <span className="font-medium">Dr. {plan.assistant_doctor_name}</span></div>}
                    {plan.description && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> <span className="font-medium">{plan.description}</span></div>}
                  </div>
                </CardContent>
              </Card>

              {/* Visit History */}
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Visit History</CardTitle></CardHeader>
                <CardContent className="py-2">
                  {sittingList.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No visits recorded yet</p>
                  ) : (
                    <div className="space-y-2">
                      {sittingList.map((s: any) => (
                        <div key={s.id} className="rounded-lg border p-3 text-xs cursor-pointer hover:bg-muted/50" onClick={() => setViewSitting(s)}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">Visit {s.sitting_number}</span>
                            <span className="text-muted-foreground">{s.created_at ? format(new Date(s.created_at), "dd MMM yyyy") : "—"}</span>
                          </div>
                          {s.work_done && <p className="text-muted-foreground">{s.work_done}</p>}
                          {s.doctor_notes && <p className="text-muted-foreground italic mt-1">{s.doctor_notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Patient Info */}
              {patient && (
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Patient Information</CardTitle></CardHeader>
                  <CardContent className="py-2 text-sm space-y-1">
                    <div><span className="text-muted-foreground">Name:</span> {patient.full_name}</div>
                    <div><span className="text-muted-foreground">OP No:</span> {patient.op_no || "—"}</div>
                    <div><span className="text-muted-foreground">Phone:</span> {patient.phone || "—"}</div>
                    <div><span className="text-muted-foreground">Age/Gender:</span> {[patient.age, patient.gender].filter(Boolean).join(" / ") || "—"}</div>
                  </CardContent>
                </Card>
              )}

              {/* Treatment Progress */}
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Progress</CardTitle></CardHeader>
                <CardContent className="py-2 text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Visits</span><span className="font-medium">{totalSittings}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span className="font-medium">{completedSittings}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className="font-medium">{plan.remaining_sittings || (totalSittings - completedSittings)}</span></div>
                  {plan.next_appointment_date && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Next Appointment</span><span className="font-medium">{format(new Date(plan.next_appointment_date), "dd MMM")}</span></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Visits Tab */}
        <TabsContent value="visits" className="mt-4">
          {sittingList.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No visits recorded</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {sittingList.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">Visit {s.sitting_number}</p>
                        <p className="text-xs text-muted-foreground">{s.created_at ? format(new Date(s.created_at), "dd MMM yyyy HH:mm") : "—"}</p>
                        {s.work_done && <p className="text-sm mt-2">{s.work_done}</p>}
                        {s.doctor_notes && <p className="text-sm text-muted-foreground italic mt-1">{s.doctor_notes}</p>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setViewSitting(s)}>View</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="mt-4">
          {billingList.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No billing records</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {billingList.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border bg-white p-4">
                  <div>
                    <p className="text-sm font-medium">{b.description || b.invoice_number || "—"}</p>
                    <p className="text-xs text-muted-foreground">{b.created_at ? format(new Date(b.created_at), "dd MMM yyyy") : "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatIndianRupees(b.total_amount || 0)}</p>
                    {b.paid_amount > 0 && <p className="text-xs text-green-600">Paid: {formatIndianRupees(b.paid_amount)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CRM Tab */}
        <TabsContent value="crm" className="mt-4">
          <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">CRM activities are managed automatically based on treatment status changes</CardContent></Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit-log" className="mt-4">
          {Array.isArray(auditLogs) && auditLogs.length > 0 ? (
            <div className="space-y-2">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex gap-3 text-xs">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">{log.created_at ? format(new Date(log.created_at), "dd MMM yyyy HH:mm") : ""}</p>
                    <p className="font-medium">{log.action}</p>
                    {log.details && <p className="text-muted-foreground">{log.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No audit entries</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Visit Dialog */}
      <Dialog open={sittingDialogOpen} onOpenChange={setSittingDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Record Visit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Procedure Done *</Label>
              <Textarea value={sittingForm.work_done} onChange={(e) => setSittingForm(p => ({ ...p, work_done: e.target.value }))} placeholder="What was done during this visit..." rows={3} />
            </div>
            <div className="grid gap-2">
              <Label>Clinical Notes</Label>
              <Textarea value={sittingForm.doctor_notes} onChange={(e) => setSittingForm(p => ({ ...p, doctor_notes: e.target.value }))} placeholder="Clinical observations, prescription..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Next Visit Date</Label>
                <Input type="date" value={sittingForm.next_appointment_date} onChange={(e) => setSittingForm(p => ({ ...p, next_appointment_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Next Visit Time</Label>
                <Input type="time" value={sittingForm.next_appointment_time} onChange={(e) => setSittingForm(p => ({ ...p, next_appointment_time: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSittingDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createSittingMutation.mutate({ treatment_plan_id: id, sitting_number: sittingList.length + 1, ...sittingForm })} disabled={!sittingForm.work_done || createSittingMutation.isPending}>
              {createSittingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Sitting Dialog */}
      <Dialog open={!!viewSitting} onOpenChange={() => setViewSitting(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Visit {viewSitting?.sitting_number}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">Date:</span> {viewSitting?.created_at ? format(new Date(viewSitting.created_at), "dd MMM yyyy HH:mm") : "—"}</div>
            {viewSitting?.work_done && <div><span className="text-muted-foreground">Procedure:</span> <p className="mt-1">{viewSitting.work_done}</p></div>}
            {viewSitting?.doctor_notes && <div><span className="text-muted-foreground">Notes:</span> <p className="mt-1 italic">{viewSitting.doctor_notes}</p></div>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Waiting Dialog */}
      <Dialog open={waitingDialogOpen} onOpenChange={setWaitingDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Set Waiting Status</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={waitingType} onValueChange={setWaitingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WAITING_PATIENT">Waiting for Patient</SelectItem>
                <SelectItem value="WAITING_LAB">Waiting for Lab</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitingDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => waitingMutation.mutate(waitingType)} disabled={waitingMutation.isPending}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
