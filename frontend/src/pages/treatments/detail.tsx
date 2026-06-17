/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Calendar, CalendarDays, Clock, User, Activity, FileText, Edit3, Plus, MessageSquare, History, DollarSign, Camera, ZoomIn, ZoomOut, RotateCcw, Download, ExternalLink, Maximize, Minimize, Eye } from "lucide-react"
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
  DialogBody,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { treatmentApi, treatmentSittingsApi, patientsApi, crmApi, billingApi } from "@/services/endpoints"
import api from "@/services/api"
import { useToast } from "@/components/ui/toast"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"
import type { TreatmentPlan, TreatmentSitting, Patient, Billing, PreOp, PostOp } from "@/types"

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
  const [sittingForm, setSittingForm] = useState({ sitting_number: 1, work_done: "", doctor_notes: "", next_appointment_date: "", next_appointment_time: "" })
  const [editingSitting, setEditingSitting] = useState<TreatmentSitting | null>(null)
  const [editSittingForm, setEditSittingForm] = useState({ work_done: "", doctor_notes: "", status: "", next_appointment_date: "", next_appointment_time: "" })
  const [viewSitting, setViewSitting] = useState<TreatmentSitting | null>(null)

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

  const { data: billings } = useQuery({
    queryKey: ["case-billings", plan?.case_id],
    queryFn: () => billingApi.list({ case_id: plan!.case_id }),
    enabled: !!plan?.case_id,
  })
  const billingList: Billing[] = useMemo(() => {
    const raw = Array.isArray(billings) ? billings : (billings?.items || [])
    return raw as Billing[]
  }, [billings])

  const { data: preOpsRaw } = useQuery({
    queryKey: ["case-preops", plan?.case_id],
    queryFn: async () => {
      const r = await api.get(`/pre-ops/${plan!.case_id}`)
      return r.data
    },
    enabled: !!plan?.case_id,
  })

  const { data: postOpsRaw } = useQuery({
    queryKey: ["case-postops", plan?.case_id],
    queryFn: async () => {
      const r = await api.get(`/post-ops/${plan!.case_id}`)
      return r.data
    },
    enabled: !!plan?.case_id,
  })

  const preOpPhotos: string[] = useMemo(() => {
    if (!preOpsRaw?.photo_urls) return []
    return preOpsRaw.photo_urls.split(",").filter(Boolean)
  }, [preOpsRaw])
  const preOpXrays: string[] = useMemo(() => {
    if (!preOpsRaw?.xray_urls) return []
    return preOpsRaw.xray_urls.split(",").filter(Boolean)
  }, [preOpsRaw])
  const postOpPhotos: string[] = useMemo(() => {
    if (!postOpsRaw?.photo_urls) return []
    return postOpsRaw.photo_urls.split(",").filter(Boolean)
  }, [postOpsRaw])

  const statusMutation = useMutation({
    mutationFn: ({ sid, status }: { sid: string; status: string }) => treatmentApi.updateStatus(sid, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Status updated", variant: "success" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ sid, data }: { sid: string; data: any }) => treatmentApi.update(sid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
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
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Sitting added", variant: "success" })
      setSittingDialogOpen(false)
      setSittingForm({ sitting_number: (sittingList.length || 0) + 1, work_done: "", doctor_notes: "", next_appointment_date: "", next_appointment_time: "" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const updateSittingMutation = useMutation({
    mutationFn: ({ sid, data }: { sid: string; data: any }) => treatmentSittingsApi.update(sid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-sittings", id] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Sitting updated", variant: "success" })
      setEditingSitting(null)
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
      next_appointment_time: "",
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
        <TabsList className="bg-white border border-border rounded-xl p-1 overflow-x-auto flex-nowrap scroll-smooth">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="sittings">Sittings ({sittingList.length})</TabsTrigger>
          <TabsTrigger value="billing">Billing ({billingList.length})</TabsTrigger>
          <TabsTrigger value="photos">Photos ({preOpPhotos.length + preOpXrays.length + postOpPhotos.length})</TabsTrigger>
          <TabsTrigger value="enquiries">Enquiries</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
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
                      <p className="font-medium flex items-center gap-1 mt-0.5"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> {plan.next_appointment_date ? `${format(new Date(plan.next_appointment_date), "dd MMM yyyy")}` : "—"}</p>
                      {plan.next_appointment_date && sittingList.some(s => s.next_appointment_time && s.next_appointment_date === plan.next_appointment_date) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Time: {sittingList.find(s => s.next_appointment_date === plan.next_appointment_date)?.next_appointment_time}
                        </p>
                      )}
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
                <CardHeader><CardTitle className="text-base">Treatment Progress</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <span className="text-sm font-bold">{plan.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className={cn("h-2.5 rounded-full transition-all duration-500", plan.progress >= 100 ? "bg-success" : plan.progress >= 50 ? "bg-primary" : "bg-warning")} style={{ width: `${Math.min(100, plan.progress)}%` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-success-soft p-2">
                      <p className="text-success font-bold">{plan.completed_sittings || 0}</p>
                      <p className="text-muted-foreground">Completed</p>
                    </div>
                    <div className="rounded-lg bg-warning-soft p-2">
                      <p className="text-warning font-bold">{plan.remaining_sittings}</p>
                      <p className="text-muted-foreground">Remaining</p>
                    </div>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">{plan.completed_sittings || 0} / {plan.total_sittings} Sittings</p>
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

        <TabsContent value="sittings" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
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
                  <p className="text-xl font-bold text-success">{plan.completed_sittings || 0}</p>
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
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{plan.completed_sittings || 0} / {plan.total_sittings} Sittings Completed</span>
                <span>Remaining: {plan.remaining_sittings}</span>
              </div>

              <ProgressBar value={plan.progress} />

              {sittingList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sitting History</p>
                  {sittingList.map((s) => (
                    <div key={s.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold">Sitting #{s.sitting_number}</span>
                            <StatusBadge status={s.status} />
                          </div>
                          {s.work_done && <p className="text-xs text-muted-foreground mt-1">{s.work_done}</p>}
                          {s.doctor_notes && <p className="text-xs text-muted-foreground mt-0.5 italic">Notes: {s.doctor_notes}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right text-xs text-muted-foreground">
                            {s.next_appointment_date && (
                              <p>Next: {format(new Date(s.next_appointment_date), "dd MMM yy")}{s.next_appointment_time ? ` ${s.next_appointment_time}` : ""}</p>
                            )}
                          </div>
                          {(s.status === "COMPLETED" || s.status === "CANCELLED") ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewSitting(s)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                              setEditingSitting(s)
                              setEditSittingForm({
                                work_done: s.work_done || "",
                                doctor_notes: s.doctor_notes || "",
                                status: "COMPLETED",
                                next_appointment_date: "",
                                next_appointment_time: "",
                              })
                            }}>
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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

        <TabsContent value="billing" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
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
                {plan.paid_amount > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Payment Status</p>
                    <Badge variant={pendingAmount <= 0 ? "success" : pendingAmount < plan.cost ? "warning" : "danger"}>
                      {pendingAmount <= 0 ? "PAID" : pendingAmount < plan.cost ? "PARTIALLY PAID" : "UNPAID"}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            {billingList.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Invoices & Payments</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {billingList.map((b: Billing) => (
                    <div key={b.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{b.invoice_number ? `#${b.invoice_number}` : `Bill ${b.id.slice(0, 8)}`}</span>
                        <Badge variant={b.payment_status === "PAID" ? "success" : b.payment_status === "PARTIAL" ? "warning" : "danger"}>{b.payment_status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between"><span>Total</span><span className="font-medium">{formatIndianRupees(b.total_amount)}</span></div>
                        <div className="flex justify-between"><span>Paid</span><span className="font-medium text-success">{formatIndianRupees(b.paid_amount)}</span></div>
                        <div className="flex justify-between"><span>Pending</span><span className="font-medium text-danger">{formatIndianRupees(b.pending_amount)}</span></div>
                        {b.created_at && <div className="flex justify-between"><span>Date</span><span>{format(new Date(b.created_at), "dd MMM yyyy")}</span></div>}
                        {b.payment_method && <div className="flex justify-between"><span>Method</span><span>{b.payment_method}</span></div>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
          {sittingList.length > 0 && (
            <Card className="mt-6">
              <CardHeader><CardTitle className="text-base">Work Done (Sittings)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {sittingList.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-semibold">Sitting #{s.sitting_number}</span>
                      <StatusBadge status={s.status} />
                      {s.created_at && <span className="text-xs text-muted-foreground ml-auto">{format(new Date(s.created_at), "dd MMM yyyy")}</span>}
                    </div>
                    {s.work_done ? (
                      <p className="text-sm">{s.work_done}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No work recorded</p>
                    )}
                    {s.doctor_notes && <p className="text-xs text-muted-foreground mt-1 italic">Notes: {s.doctor_notes}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Pre-Op Images ({preOpPhotos.length + preOpXrays.length})</CardTitle></CardHeader>
              <CardContent>
                {preOpPhotos.length === 0 && preOpXrays.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No Pre-Op images</p>
                ) : (
                  <div className="space-y-4">
                    {preOpPhotos.length > 0 && <ImageGrid photos={preOpPhotos} label="Photos" />}
                    {preOpXrays.length > 0 && <ImageGrid photos={preOpXrays} label="X-Rays" />}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Post-Op Images ({postOpPhotos.length})</CardTitle></CardHeader>
              <CardContent>
                {postOpPhotos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No Post-Op images</p>
                ) : (
                  <ImageGrid photos={postOpPhotos} label="Photos" />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
<TabsContent value="enquiries" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <EnquiryList patientId={plan.patient_id} treatmentPlanId={id!} />
        </TabsContent>
        <TabsContent value="history" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
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
        <DialogContent className="sm:max-w-[450px] max-h-[80vh]">
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
            <div className="overflow-y-auto max-h-[55vh] space-y-4 pr-1">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Next Appointment Date</Label>
                <Input type="date" value={sittingForm.next_appointment_date} onChange={(e) => setSittingForm({ ...sittingForm, next_appointment_date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Next Appointment Time</Label>
                <Input type="time" value={sittingForm.next_appointment_time} onChange={(e) => setSittingForm({ ...sittingForm, next_appointment_time: e.target.value })} />
              </div>
            </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSittingDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createSittingMutation.isPending}>Save Sitting</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mark sitting complete dialog */}
      <Dialog open={!!editingSitting} onOpenChange={(o) => { if (!o) setEditingSitting(null) }}>
        <DialogContent className="sm:max-w-[450px] max-h-[80vh]">
          <DialogHeader><DialogTitle>Mark Sitting Complete</DialogTitle><DialogDescription>Update sitting #{editingSitting?.sitting_number} status.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault()
            if (!editingSitting) return
            const data: Record<string, any> = {}
            if (editSittingForm.status) data.status = editSittingForm.status
            if (editSittingForm.work_done) data.work_done = editSittingForm.work_done
            if (editSittingForm.doctor_notes) data.doctor_notes = editSittingForm.doctor_notes
            if (editSittingForm.next_appointment_date) data.next_appointment_date = editSittingForm.next_appointment_date
            if (editSittingForm.next_appointment_time) data.next_appointment_time = editSittingForm.next_appointment_time
            updateSittingMutation.mutate({ sid: editingSitting.id, data })
          }} className="space-y-4">
            <div className="overflow-y-auto max-h-[55vh] space-y-4 pr-1">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={editSittingForm.status} onValueChange={(v) => setEditSittingForm({ ...editSittingForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Work Done</Label>
              <Textarea value={editSittingForm.work_done} onChange={(e) => setEditSittingForm({ ...editSittingForm, work_done: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Doctor Notes</Label>
              <Textarea value={editSittingForm.doctor_notes} onChange={(e) => setEditSittingForm({ ...editSittingForm, doctor_notes: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Next Appointment Date</Label>
                <Input type="date" value={editSittingForm.next_appointment_date} onChange={(e) => setEditSittingForm({ ...editSittingForm, next_appointment_date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Next Appointment Time</Label>
                <Input type="time" value={editSittingForm.next_appointment_time} onChange={(e) => setEditSittingForm({ ...editSittingForm, next_appointment_time: e.target.value })} />
              </div>
            </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingSitting(null)}>Cancel</Button>
              <Button type="submit" disabled={updateSittingMutation.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View sitting dialog */}
      <Dialog open={!!viewSitting} onOpenChange={(o) => { if (!o) setViewSitting(null) }}>
        <DialogContent className="sm:max-w-[500px]">
          {viewSitting && (
            <>
              <DialogHeader>
                <DialogTitle>Sitting #{viewSitting.sitting_number}</DialogTitle>
                <DialogDescription>Details of this sitting</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Status:</span>
                    <StatusBadge status={viewSitting.status} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Work Done</p>
                    <p className="text-sm">{viewSitting.work_done || <span className="italic text-muted-foreground">Not recorded</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Doctor Notes</p>
                    <p className="text-sm italic">{viewSitting.doctor_notes || <span className="italic text-muted-foreground">No notes</span>}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {viewSitting.created_at && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Created</p>
                        <p className="text-sm">{format(new Date(viewSitting.created_at), "dd MMM yyyy")}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Next Appointment</p>
                      <p className="text-sm">
                        {viewSitting.next_appointment_date
                          ? `${format(new Date(viewSitting.next_appointment_date), "dd MMM yy")}${viewSitting.next_appointment_time ? ` ${viewSitting.next_appointment_time}` : ""}`
                          : <span className="italic text-muted-foreground">Not scheduled</span>}
                      </p>
                    </div>
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewSitting(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ImagePreviewDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)

  if (!url) return null

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <DialogTitle className="text-sm">Image Preview</DialogTitle>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))} className="p-1.5 rounded-md hover:bg-gray-100"><ZoomIn className="h-4 w-4" /></button>
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} className="p-1.5 rounded-md hover:bg-gray-100"><ZoomOut className="h-4 w-4" /></button>
          <button onClick={() => setZoom(1)} className="p-1.5 rounded-md hover:bg-gray-100"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-md hover:bg-gray-100 ml-1">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div
        className="flex-1 flex items-center justify-center overflow-auto bg-gray-100 dark:bg-gray-900 cursor-grab active:cursor-grabbing select-none p-4"
        onWheel={(e) => { e.preventDefault(); setZoom(z => Math.max(0.25, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1)))) }}
        onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
      >
        <img src={url} alt="Preview" className="transition-transform duration-200 max-w-full max-h-full object-contain" style={{ transform: `scale(${zoom})` }} draggable={false} loading="lazy" />
      </div>
      <div className="flex justify-center gap-2 p-3 border-t shrink-0">
        <a href={url} download className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-1.5 rounded-md hover:bg-primary-soft">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
        <button onClick={() => { window.open(url, "_blank") }} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline px-3 py-1.5 rounded-md hover:bg-primary-soft">
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </button>
      </div>
    </div>
  )

  if (fullscreen) {
    return (
      <Dialog open={true} onOpenChange={() => { onClose(); setZoom(1); setFullscreen(false) }}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh] p-0">
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={true} onOpenChange={() => { onClose(); setZoom(1) }}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] h-[80vh] p-0">
        {content}
      </DialogContent>
    </Dialog>
  )
}

function ImageGrid({ photos, label }: { photos: string[]; label: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  if (photos.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{label} ({photos.length})</p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
            <img src={url} alt={`${label} ${i + 1}`} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewUrl(url)} loading="lazy" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button onClick={(e) => { e.stopPropagation(); window.open(url, "_blank") }} className="p-1.5 bg-white/90 rounded-full"><ExternalLink className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <ImagePreviewDialog url={previewUrl} onClose={() => setPreviewUrl(null)} />
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