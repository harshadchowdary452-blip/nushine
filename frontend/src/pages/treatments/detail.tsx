import { useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  Clock,
  Stethoscope,
  User,
  FileText,
  Calendar,
  Loader2,
  Activity,
  Eye,
  Save,
  Pause,
  Beaker,
} from "lucide-react"
import { format } from "date-fns"
import { PageHeader } from "@/design-system"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { treatmentApi, treatmentSittingsApi, casesApi } from "@/services/endpoints"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"
import { useTrackRecent } from "@/hooks/useTrackRecent"
import AppointmentScheduler from "@/components/appointments/AppointmentScheduler"
import type {
  TreatmentPlan,
  TreatmentSitting,
  Case,
  Patient,
  VisitPayload,
  WaitingPayload,
  AppointmentSchedulerSelectData,
} from "@/types"

const STATUS_COLORS: Record<string, string> = {
  GENERATED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  ASSIGNED: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-[var(--ds-primary-100)] text-[var(--ds-primary-700)]",
  IN_PROGRESS: "bg-green-100 text-green-700",
  WAITING_PATIENT: "bg-yellow-100 text-yellow-700",
  WAITING_LAB: "bg-orange-100 text-orange-700",
  ON_HOLD: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  OVERDUE: "bg-red-200 text-red-800",
}

const SITTING_STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
}

export default function TreatmentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [visitDialogOpen, setVisitDialogOpen] = useState(false)
  const [viewSitting, setViewSitting] = useState<TreatmentSitting | null>(null)
  const [waitingDialogOpen, setWaitingDialogOpen] = useState(false)
  const [waitingType, setWaitingType] = useState<"WAITING_PATIENT" | "WAITING_LAB">(
    "WAITING_PATIENT",
  )
  const [waitingReason, setWaitingReason] = useState("")
  const [waitingFollowup, setWaitingFollowup] = useState("")
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [completeOutcome, setCompleteOutcome] = useState("")
  const [completeRemarks, setCompleteRemarks] = useState("")
  const [nextVisitRequired, setNextVisitRequired] = useState(true)
  const [nextAppointmentSlot, setNextAppointmentSlot] =
    useState<AppointmentSchedulerSelectData | null>(null)

  // Visit form state
  const [visitForm, setVisitForm] = useState({
    clinical_notes: "",
    procedure_performed: "",
    prescription: "",
    materials_used: "",
    duration_minutes: "",
    notes: "",
    complications: "",
  })

  // Lab form state
  const [labForm, setLabForm] = useState({
    lab_name: "",
    lab_order_number: "",
    lab_sent_date: "",
    lab_return_date: "",
    lab_cost: "",
    lab_tracking_notes: "",
  })

  const { data: plan, isLoading } = useQuery({
    queryKey: ["treatment-plan", id],
    queryFn: () => treatmentApi.get(id!),
    enabled: !!id,
  })

  useTrackRecent(
    "treatment",
    plan?.id,
    plan,
    (p) => p?.treatment_name || "Treatment",
    (p) => (p?.patient_name ? p.patient_name : p?.treatment_number || undefined)
  )

  const { data: sittingData } = useQuery({
    queryKey: ["treatment-sittings", id],
    queryFn: () => treatmentSittingsApi.listByPlan(id!),
    enabled: !!id,
  })

  const { data: caseData } = useQuery({
    queryKey: ["case", plan?.case_id],
    queryFn: () => casesApi.get(plan!.case_id),
    enabled: !!plan?.case_id,
  })

  const sittings: TreatmentSitting[] = useMemo(
    () => (Array.isArray(sittingData) ? sittingData : []),
    [sittingData],
  )
  const currentSittingNumber = sittings.length + 1
  const p = plan as TreatmentPlan | undefined
  const c = caseData as Case | undefined
  const pat = p?.patient as Patient | undefined

  const startMutation = useMutation({
    mutationFn: () => treatmentApi.start(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
    },
  })

  const saveVisitMutation = useMutation({
    mutationFn: async () => {
      const payload: VisitPayload = {
        treatment_plan_id: id!,
        sitting_number: currentSittingNumber,
        status: "COMPLETED",
        clinical_notes: visitForm.clinical_notes || null,
        procedure_performed: visitForm.procedure_performed || null,
        prescription: visitForm.prescription || null,
        materials_used: visitForm.materials_used || null,
        duration_minutes: visitForm.duration_minutes ? Number(visitForm.duration_minutes) : null,
        work_done: visitForm.notes || visitForm.procedure_performed || null,
        doctor_notes: visitForm.notes || null,
        next_visit_required: nextVisitRequired,
        sitting_date: new Date().toISOString().split("T")[0],
      }
      if (nextVisitRequired && nextAppointmentSlot) {
        payload.next_appointment_date = nextAppointmentSlot.appointment_date
        payload.next_appointment_time = nextAppointmentSlot.appointment_time
        payload.next_appointment_doctor_id = nextAppointmentSlot.doctor_id
      }
      return treatmentSittingsApi.create(payload as Record<string, unknown>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-sittings", id] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      setVisitDialogOpen(false)
      setVisitForm({
        clinical_notes: "",
        procedure_performed: "",
        prescription: "",
        materials_used: "",
        duration_minutes: "",
        notes: "",
        complications: "",
      })
      setNextAppointmentSlot(null)
    },
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      return treatmentApi.complete(id!, { outcome: completeOutcome, notes: completeRemarks })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      setCompleteDialogOpen(false)
    },
  })

  const waitingMutation = useMutation({
    mutationFn: async () => {
      const payload: WaitingPayload = { reason: waitingReason }
      if (waitingType === "WAITING_LAB") {
        payload.lab_name = labForm.lab_name
        payload.lab_order_number = labForm.lab_order_number
        payload.lab_sent_date = labForm.lab_sent_date || undefined
        payload.lab_return_date = labForm.lab_return_date || undefined
        payload.lab_cost = labForm.lab_cost ? Number(labForm.lab_cost) : undefined
        payload.lab_tracking_notes = labForm.lab_tracking_notes
      }
      if (waitingFollowup) payload.expected_followup = waitingFollowup
      return treatmentApi.setWaiting(id!, waitingType, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan", id] })
      setWaitingDialogOpen(false)
      setWaitingReason("")
      setWaitingFollowup("")
      setLabForm({
        lab_name: "",
        lab_order_number: "",
        lab_sent_date: "",
        lab_return_date: "",
        lab_cost: "",
        lab_tracking_notes: "",
      })
    },
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    )
  }
  if (!p) return <div className="py-20 text-center text-muted-foreground">Treatment not found</div>

  const canStart = ["ASSIGNED", "SCHEDULED", "GENERATED"].includes(p.status)
  const isInProgress = p.status === "IN_PROGRESS"
  const isCompleted = p.status === "COMPLETED"
  const isWaiting = ["WAITING_PATIENT", "WAITING_LAB", "ON_HOLD"].includes(p.status)
  const progress =
    p.total_sittings > 0 ? Math.round((p.completed_sittings / p.total_sittings) * 100) : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.treatment_name || "Treatment"}
        description={`Visit ${p.completed_sittings || 0} of ${p.total_sittings || 0}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", STATUS_COLORS[p.status] || "bg-[var(--ds-background-subtle)]")}>
              {p.status?.replace(/_/g, " ")}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        }
      />

      {/* Progress Bar */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex-1 h-2 bg-[var(--ds-background-subtle)] rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground shrink-0">
          {p.completed_sittings || 0}/{p.total_sittings || 0} visits ({progress}%)
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-4">
          {/* Patient Summary */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" /> Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Name</span>
                  <p className="font-medium">{pat?.full_name || p.patient_name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">OP Number</span>
                  <p className="font-medium">{pat?.op_no || p.patient_op_no || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Age</span>
                  <p className="font-medium">
                    {pat?.date_of_birth
                      ? `${Math.floor((Date.now() - new Date(pat.date_of_birth).getTime()) / 31557600000)} Years`
                      : pat?.age
                        ? `${pat.age} Years`
                        : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Gender</span>
                  <p className="font-medium">{pat?.gender || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Phone</span>
                  <p className="font-medium">{pat?.phone || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Email</span>
                  <p className="font-medium">{pat?.email || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Blood Group</span>
                  <p className="font-medium">{pat?.blood_group || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">ABHA ID</span>
                  <p className="font-medium">{pat?.abha_id || "—"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Address</span>
                  <p className="font-medium">{pat?.address || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Emergency Contact</span>
                  <p className="font-medium">{pat?.emergency_contact || "—"}</p>
                </div>
              </div>
              {(pat?.medical_history || pat?.allergies) && (
                <div className="mt-3 pt-3 border-t">
                  <span className="text-muted-foreground text-xs">Medical Alerts</span>
                  <div className="mt-1 space-y-1">
                    {pat?.allergies && (
                      <p className="text-sm font-medium text-amber-700">
                        Allergies: {pat.allergies}
                      </p>
                    )}
                    {pat?.medical_history && (
                      <p className="text-sm font-medium text-amber-700">
                        Medical History: {pat.medical_history}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clinical Summary */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Clinical Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground text-xs">Diagnosis</span>
                  <p>{c?.diagnosis || c?.final_diagnosis || c?.provisional_diagnosis || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Chief Complaint</span>
                  <p>{c?.chief_complaint || "—"}</p>
                </div>
              </div>
              {c?.clinical_findings_summary && (
                <div>
                  <span className="text-muted-foreground text-xs">Clinical Summary</span>
                  <p>{c.clinical_findings_summary}</p>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => navigate(`/cases/${p.case_id}`)}
              >
                <FileText className="h-3 w-3 mr-1" /> Open Case Report (Read Only)
              </Button>
            </CardContent>
          </Card>

          {/* Treatment Information */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" /> Treatment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Procedure</span>
                  <p className="font-medium">{p.treatment_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Tooth Numbers</span>
                  <p className="font-medium">
                    {Array.isArray(p.tooth_numbers)
                      ? p.tooth_numbers.join(", ")
                      : p.tooth_numbers || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Doctor</span>
                  <p className="font-medium">
                    {p.assigned_doctor_name ? `Dr. ${p.assigned_doctor_name}` : "Unassigned"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Assistant</span>
                  <p className="font-medium">
                    {p.assistant_doctor_name ? `Dr. ${p.assistant_doctor_name}` : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Priority</span>
                  <p className="font-medium">{p.priority || "MEDIUM"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Estimated Visits</span>
                  <p className="font-medium">{p.total_sittings || 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Completed Visits</span>
                  <p className="font-medium">{p.completed_sittings || 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Estimated Cost</span>
                  <p className="font-medium">{formatIndianRupees(p.cost || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visit History */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> Visit History ({sittings.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              {sittings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No visits recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {sittings.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-[var(--ds-surface-hover)] cursor-pointer"
                      onClick={() => setViewSitting(s)}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          s.status === "COMPLETED"
                            ? "bg-green-100 text-green-700"
                            : "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
                        )}
                      >
                        {s.sitting_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {s.procedure_performed || s.work_done || "Visit"}
                          </span>
                          <Badge
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              SITTING_STATUS_COLORS[s.status] || "bg-[var(--ds-background-subtle)]",
                            )}
                          >
                            {s.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>
                            {s.sitting_date ? format(new Date(s.sitting_date), "dd MMM yyyy") : "—"}
                          </span>
                          <span>Dr. {s.doctor_name || "—"}</span>
                          {s.duration_minutes && <span>{s.duration_minutes} min</span>}
                        </div>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Action sidebar */}
        <div className="space-y-4">
          {/* Action Buttons */}
          <Card className="sticky top-4">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canStart && (
                <Button
                  className="w-full"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                >
                  {startMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start Treatment
                </Button>
              )}
              {isInProgress && (
                <>
                  <Button className="w-full" onClick={() => setVisitDialogOpen(true)}>
                    <Save className="h-4 w-4 mr-2" /> Add Visit {currentSittingNumber}
                  </Button>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setCompleteDialogOpen(true)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Complete Treatment
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={() => {
                      setWaitingType("WAITING_PATIENT")
                      setWaitingDialogOpen(true)
                    }}
                  >
                    <Pause className="h-4 w-4 mr-2" /> Waiting Patient
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => {
                      setWaitingType("WAITING_LAB")
                      setWaitingDialogOpen(true)
                    }}
                  >
                    <Beaker className="h-4 w-4 mr-2" /> Waiting Lab
                  </Button>
                </>
              )}
              {isWaiting && (
                <div className="text-center py-3">
                  <Badge className={cn("text-sm", STATUS_COLORS[p.status])}>
                    {p.status?.replace(/_/g, " ")}
                  </Badge>
                  {p.overdue_reason && (
                    <p className="text-xs text-muted-foreground mt-2">{p.overdue_reason}</p>
                  )}
                </div>
              )}
              {isCompleted && (
                <div className="text-center py-4">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-700">Treatment Completed</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Financial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated Cost</span>
                <span className="font-medium">{formatIndianRupees(p.cost || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium">{formatIndianRupees(p.paid_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pending</span>
                <span className="font-medium text-red-600">
                  {formatIndianRupees(p.pending_amount || 0)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* === DIALOGS === */}

      {/* Add Visit Dialog */}
      <Dialog open={visitDialogOpen} onOpenChange={setVisitDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5" /> Visit {currentSittingNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Procedure Performed *</Label>
              <Input
                value={visitForm.procedure_performed}
                onChange={(e) =>
                  setVisitForm({ ...visitForm, procedure_performed: e.target.value })
                }
                placeholder="e.g., Root Canal - Access Opening"
              />
            </div>
            <div>
              <Label>Clinical Notes</Label>
              <Textarea
                value={visitForm.clinical_notes}
                onChange={(e) => setVisitForm({ ...visitForm, clinical_notes: e.target.value })}
                placeholder="Clinical observations, findings during procedure..."
                rows={3}
              />
            </div>
            <div>
              <Label>Prescription</Label>
              <Textarea
                value={visitForm.prescription}
                onChange={(e) => setVisitForm({ ...visitForm, prescription: e.target.value })}
                placeholder="Medications prescribed, dosage, frequency..."
                rows={2}
              />
            </div>
            <div>
              <Label>Materials Used</Label>
              <Input
                value={visitForm.materials_used}
                onChange={(e) => setVisitForm({ ...visitForm, materials_used: e.target.value })}
                placeholder="e.g., NiTi files, Gutta Percha, Composite"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration (minutes)</Label>
                <NumericInput
                  mode="integer"
                  min={1}
                  value={visitForm.duration_minutes}
                  onChange={(v) => setVisitForm({ ...visitForm, duration_minutes: v })}
                  placeholder="30"
                />
              </div>
              <div>
                <Label>Doctor Notes</Label>
                <Input
                  value={visitForm.notes}
                  onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
                  placeholder="Internal notes..."
                />
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center gap-3 mb-3">
                <Label>Next Visit Required</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={nextVisitRequired ? "default" : "outline"}
                    onClick={() => setNextVisitRequired(true)}
                  >
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant={!nextVisitRequired ? "default" : "outline"}
                    onClick={() => {
                      setNextVisitRequired(false)
                      setNextAppointmentSlot(null)
                    }}
                  >
                    No
                  </Button>
                </div>
              </div>
              {nextVisitRequired && (
                <AppointmentScheduler
                  showDoctorSelector
                  showTypeSelector
                  appointmentType="TREATMENT"
                  onSelect={(data) => setNextAppointmentSlot(data)}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVisitDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveVisitMutation.mutate()}
              disabled={
                !visitForm.procedure_performed ||
                saveVisitMutation.isPending ||
                (nextVisitRequired && !nextAppointmentSlot)
              }
            >
              {saveVisitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Sitting Dialog */}
      <Dialog open={!!viewSitting} onOpenChange={() => setViewSitting(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Visit {viewSitting?.sitting_number}</DialogTitle>
          </DialogHeader>
          {viewSitting && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground text-xs">Date</span>
                  <p>
                    {viewSitting.sitting_date
                      ? format(new Date(viewSitting.sitting_date), "dd MMM yyyy")
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Doctor</span>
                  <p>{viewSitting.doctor_name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Status</span>
                  <Badge className={cn("text-[10px]", SITTING_STATUS_COLORS[viewSitting.status])}>
                    {viewSitting.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Duration</span>
                  <p>
                    {viewSitting.duration_minutes ? `${viewSitting.duration_minutes} min` : "—"}
                  </p>
                </div>
              </div>
              {viewSitting.procedure_performed && (
                <div>
                  <span className="text-muted-foreground text-xs">Procedure Performed</span>
                  <p>{viewSitting.procedure_performed}</p>
                </div>
              )}
              {viewSitting.clinical_notes && (
                <div>
                  <span className="text-muted-foreground text-xs">Clinical Notes</span>
                  <p>{viewSitting.clinical_notes}</p>
                </div>
              )}
              {viewSitting.prescription && (
                <div>
                  <span className="text-muted-foreground text-xs">Prescription</span>
                  <p>{viewSitting.prescription}</p>
                </div>
              )}
              {viewSitting.materials_used && (
                <div>
                  <span className="text-muted-foreground text-xs">Materials Used</span>
                  <p>{viewSitting.materials_used}</p>
                </div>
              )}
              {viewSitting.doctor_notes && (
                <div>
                  <span className="text-muted-foreground text-xs">Doctor Notes</span>
                  <p>{viewSitting.doctor_notes}</p>
                </div>
              )}
              {viewSitting.next_appointment_date && (
                <div className="border-t pt-3">
                  <span className="text-muted-foreground text-xs">Next Appointment</span>
                  <p className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{" "}
                    {format(new Date(viewSitting.next_appointment_date), "dd MMM yyyy")}
                  </p>
                </div>
              )}
              {viewSitting.lab_name && (
                <div className="border-t pt-3">
                  <span className="text-muted-foreground text-xs">Lab Tracking</span>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <span className="text-xs text-muted-foreground">Lab:</span>{" "}
                      {viewSitting.lab_name}
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Order #:</span>{" "}
                      {viewSitting.lab_order_number || "—"}
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Sent:</span>{" "}
                      {viewSitting.lab_sent_date
                        ? format(new Date(viewSitting.lab_sent_date), "dd MMM")
                        : "—"}
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Return:</span>{" "}
                      {viewSitting.lab_return_date
                        ? format(new Date(viewSitting.lab_return_date), "dd MMM")
                        : "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Waiting Dialog */}
      <Dialog open={waitingDialogOpen} onOpenChange={setWaitingDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {waitingType === "WAITING_PATIENT" ? (
                <Pause className="h-5 w-5 text-amber-600" />
              ) : (
                <Beaker className="h-5 w-5 text-orange-600" />
              )}
              {waitingType === "WAITING_PATIENT" ? "Waiting for Patient" : "Waiting for Lab"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason *</Label>
              <Textarea
                value={waitingReason}
                onChange={(e) => setWaitingReason(e.target.value)}
                placeholder={
                  waitingType === "WAITING_PATIENT"
                    ? "e.g., Patient needs to complete medication course"
                    : "e.g., Crown sent to lab for fabrication"
                }
                rows={2}
              />
            </div>
            {waitingType === "WAITING_PATIENT" && (
              <div>
                <Label>Expected Follow-up</Label>
                <Input
                  value={waitingFollowup}
                  onChange={(e) => setWaitingFollowup(e.target.value)}
                  placeholder="e.g., After 2 weeks"
                />
              </div>
            )}
            {waitingType === "WAITING_LAB" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Lab Name</Label>
                  <Input
                    value={labForm.lab_name}
                    onChange={(e) => setLabForm({ ...labForm, lab_name: e.target.value })}
                    placeholder="Lab name"
                  />
                </div>
                <div>
                  <Label>Lab Order Number</Label>
                  <Input
                    value={labForm.lab_order_number}
                    onChange={(e) => setLabForm({ ...labForm, lab_order_number: e.target.value })}
                    placeholder="Order #"
                  />
                </div>
                <div>
                  <Label>Sent Date</Label>
                  <Input
                    type="date"
                    value={labForm.lab_sent_date}
                    onChange={(e) => setLabForm({ ...labForm, lab_sent_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Expected Return</Label>
                  <Input
                    type="date"
                    value={labForm.lab_return_date}
                    onChange={(e) => setLabForm({ ...labForm, lab_return_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Lab Cost</Label>
                  <NumericInput
                    mode="currency"
                    prefix="₹"
                    min={0}
                    value={labForm.lab_cost}
                    onChange={(v) => setLabForm({ ...labForm, lab_cost: v })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={labForm.lab_tracking_notes}
                    onChange={(e) => setLabForm({ ...labForm, lab_tracking_notes: e.target.value })}
                    placeholder="Notes"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitingDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => waitingMutation.mutate()}
              disabled={!waitingReason || waitingMutation.isPending}
            >
              {waitingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Pause className="h-4 w-4 mr-1" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Treatment Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Complete Treatment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will mark the treatment as completed. This action cannot be undone.
            </p>
            <div>
              <Label>Outcome</Label>
              <Select value={completeOutcome} onValueChange={setCompleteOutcome}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUCCESSFUL">Successful</SelectItem>
                  <SelectItem value="PARTIALLY_COMPLETED">Partially Completed</SelectItem>
                  <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Clinical Remarks</Label>
              <Textarea
                value={completeRemarks}
                onChange={(e) => setCompleteRemarks(e.target.value)}
                placeholder="Final clinical remarks..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => completeMutation.mutate()}
              disabled={!completeOutcome || completeMutation.isPending}
            >
              {completeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
