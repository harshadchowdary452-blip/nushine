import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Stethoscope,
  FileText,
  FilePlus,
  RotateCcw,
  CheckCircle2,
  XCircle,
  CalendarClock,
  ExternalLink,
  Activity,
  CreditCard,
  ClipboardList,
  History,
  UserCircle,
  Phone,
  Droplets,
  ShieldCheck,
  Hash,
  ArrowUpRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/design-system"
import { appointmentsApi, casesApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useTrackRecent } from "@/hooks/useTrackRecent"
import type {
  AppointmentFullDetail,
  User as UserType,
  Case,
  CasePayload,
  ReassignDoctorResponse,
} from "@/types"
import { showErrorToast } from "@/utils/showErrorToast"
import AppointmentScheduler from "@/components/appointments/AppointmentScheduler"

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
  RESCHEDULED: "bg-orange-50 text-orange-700 border-orange-200",
  IN_PROGRESS: "bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)] border-[var(--ds-accent-200)]",
  PLANNED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)] border-[var(--ds-border)]",
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  ON_HOLD: "bg-yellow-50 text-yellow-700 border-yellow-200",
  PAID: "bg-green-50 text-green-700 border-green-200",
  PARTIAL: "bg-yellow-50 text-yellow-700 border-yellow-200",
  DRAFT: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)] border-[var(--ds-border)]",
  OVERDUE: "bg-red-50 text-red-700 border-red-200",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[status] || "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)] border-[var(--ds-border)]"}`}
    >
      {status?.replace(/_/g, " ")}
    </span>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  onClick?: () => void
}) {
  return (
    <div
      className={`flex items-start gap-3 py-2 ${onClick ? "cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded" : ""}`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
      {onClick && <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />}
    </div>
  )
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [createCaseOpen, setCreateCaseOpen] = useState(false)

  const [rescheduleDate, setRescheduleDate] = useState("")
  const [rescheduleTime, setRescheduleTime] = useState("")
  const [rescheduleReason, setRescheduleReason] = useState("")
  const [completeNotes, setCompleteNotes] = useState("")
  const [cancelReason, setCancelReason] = useState("")
  const [newDoctorId, setNewDoctorId] = useState("")
  const [reassignReason, setReassignReason] = useState("")
  const [caseComplaint, setCaseComplaint] = useState("")

  const { data: detail, isLoading } = useQuery<AppointmentFullDetail>({
    queryKey: ["appointment-full-detail", id],
    queryFn: () => appointmentsApi.fullDetail(id!),
    enabled: !!id,
  })

  useTrackRecent(
    "appointment",
    detail?.appointment?.id,
    detail,
    (d) => d?.patient?.full_name || "Appointment",
    (d) => {
      const a = d?.appointment
      if (!a) return undefined
      return [a.appointment_date, a.appointment_time].filter(Boolean).join(" · ") || undefined
    }
  )

  const { data: doctors } = useQuery({
    queryKey: ["doctors", "reassign"],
    queryFn: () => doctorsApi.list({ page_size: 200 }),
  })
  const doctorList: UserType[] = Array.isArray(doctors) ? doctors : doctors?.items || []

  const rescheduleMutation = useMutation({
    mutationFn: (data: { appointment_date: string; appointment_time: string; reason?: string }) =>
      appointmentsApi.reschedule(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment-full-detail", id] })
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Appointment Rescheduled", variant: "success" })
      setRescheduleOpen(false)
      setRescheduleDate("")
      setRescheduleTime("")
      setRescheduleReason("")
    },
    onError: (err: unknown) => showErrorToast(err, addToast),
  })

  const completeMutation = useMutation({
    mutationFn: (data: { notes?: string }) => appointmentsApi.complete(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment-full-detail", id] })
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      addToast({ title: "Appointment Completed", variant: "success" })
      setCompleteOpen(false)
      setCompleteNotes("")
    },
    onError: (err: unknown) => showErrorToast(err, addToast),
  })

  const cancelMutation = useMutation({
    mutationFn: (data: { reason?: string }) => appointmentsApi.cancel(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment-full-detail", id] })
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      addToast({ title: "Appointment Cancelled", variant: "success" })
      setCancelOpen(false)
      setCancelReason("")
    },
    onError: (err: unknown) => showErrorToast(err, addToast),
  })

  const reassignMutation = useMutation({
    mutationFn: (data: { doctor_id: string; reason?: string }) =>
      appointmentsApi.reassignDoctor(id!, data),
    onSuccess: (resp: ReassignDoctorResponse) => {
      queryClient.invalidateQueries({ queryKey: ["appointment-full-detail", id] })
      addToast({
        title: "Doctor Reassigned",
        description: `Changed to ${resp.new_doctor_name}`,
        variant: "success",
      })
      setReassignOpen(false)
      setNewDoctorId("")
      setReassignReason("")
    },
    onError: () =>
      addToast({
        title: "Error",
        description: "Failed to reassign doctor",
        variant: "destructive",
      }),
  })

  const createCaseMutation = useMutation({
    mutationFn: (data: CasePayload) => casesApi.create(data),
    onSuccess: (newCase: Case) => {
      addToast({ title: "Case Created", variant: "success" })
      setCreateCaseOpen(false)
      setCaseComplaint("")
      navigate(`/cases/${newCase.id}`)
    },
    onError: () =>
      addToast({ title: "Error", description: "Failed to create case", variant: "destructive" }),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Appointment not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/appointments")}>
          Back to Appointments
        </Button>
      </div>
    )
  }

  const {
    appointment: a,
    patient,
    cases,
    treatments,
    billings,
    timeline,
    related_appointments,
  } = detail
  const isScheduled = a.status === "SCHEDULED"

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Appointment"
        description={`${a.appointment_number || a.id.slice(0, 8)} — ${patient.full_name}`}
        actions={
          <Button variant="outline" onClick={() => navigate("/appointments")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      {/* Status + Actions Banner */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">{patient.full_name}</h2>
              <p className="text-sm text-muted-foreground">
                {a.appointment_number} · {a.duration_minutes} min
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={a.status} />
              {isScheduled && (
                <>
                  <Button size="sm" onClick={() => setCompleteOpen(true)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRescheduleDate(a.appointment_date)
                      setRescheduleTime(a.appointment_time)
                      setRescheduleOpen(true)
                    }}
                  >
                    <CalendarClock className="h-4 w-4 mr-1" /> Reschedule
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                    <XCircle className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCaseComplaint("")
                  setCreateCaseOpen(true)
                }}
              >
                <FilePlus className="h-4 w-4 mr-1" /> Create Case
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(`/patients/${patient.id}`)}>
          <UserCircle className="h-3.5 w-3.5 mr-1" /> Patient Profile
        </Button>
        {cases.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${cases[0].id}`)}>
            <ClipboardList className="h-3.5 w-3.5 mr-1" /> Case Report
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/billing?patient_id=${patient.id}`)}
        >
          <CreditCard className="h-3.5 w-3.5 mr-1" /> Billing
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/patients/${patient.id}?tab=timeline`)}
        >
          <Activity className="h-3.5 w-3.5 mr-1" /> Timeline
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Patient Profile ──────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Patient Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <InfoRow
              icon={User}
              label="Patient Name"
              value={patient.full_name}
              onClick={() => navigate(`/patients/${patient.id}`)}
            />
            <Separator />
            <InfoRow icon={Hash} label="OP Number" value={patient.op_no || "—"} />
            <Separator />
            <InfoRow icon={Phone} label="Mobile" value={patient.phone || "—"} />
            <Separator />
            <InfoRow icon={Droplets} label="Gender" value={patient.gender || "—"} />
            <Separator />
            <InfoRow
              icon={Calendar}
              label="Age"
              value={patient.age ? `${patient.age} years` : "—"}
            />
            <Separator />
            <InfoRow
              icon={Stethoscope}
              label="Assigned Doctor"
              value={patient.doctor_id ? a.doctor_name || "—" : "—"}
            />
            <Separator />
            <InfoRow
              icon={Calendar}
              label="Registration Date"
              value={
                patient.created_at ? format(new Date(patient.created_at), "MMM dd, yyyy") : "—"
              }
            />
            <Separator />
            <InfoRow
              icon={ShieldCheck}
              label="Patient Status"
              value={<StatusBadge status={patient.status} />}
            />
          </CardContent>
        </Card>

        {/* ── Appointment Info ─────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Appointment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <InfoRow
              icon={Calendar}
              label="Date"
              value={
                a.appointment_date
                  ? format(new Date(a.appointment_date), "EEEE, MMM dd, yyyy")
                  : "—"
              }
            />
            <Separator />
            <InfoRow
              icon={Clock}
              label="Time"
              value={`${a.appointment_time || "—"} — ${a.end_time || "—"}`}
            />
            <Separator />
            <InfoRow icon={Clock} label="Duration" value={`${a.duration_minutes || 30} minutes`} />
            <Separator />
            <InfoRow
              icon={Stethoscope}
              label="Doctor"
              value={
                <span className="flex items-center gap-2">
                  {a.doctor_name || "—"}
                  {isScheduled && (
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setNewDoctorId("")
                        setReassignReason("")
                        setReassignOpen(true)
                      }}
                      title="Change Doctor"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  )}
                </span>
              }
            />
            {a.notes && (
              <>
                <Separator />
                <InfoRow icon={FileText} label="Notes" value={a.notes} />
              </>
            )}
            <Separator />
            <InfoRow icon={UserCircle} label="Created by" value={a.created_by_name || "—"} />
            <InfoRow icon={UserCircle} label="Updated by" value={a.updated_by_name || "—"} />
          </CardContent>
        </Card>

        {/* ── Case Reports ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Case Reports ({cases.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 space-y-2">
            {cases.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No case reports for this patient.
              </p>
            ) : (
              cases.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/cases/${c.id}`)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.case_number || c.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.chief_complaint || "—"}
                    </p>
                    {c.diagnosis && (
                      <p className="text-xs text-muted-foreground">Dx: {c.diagnosis}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge status={c.status} />
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Treatments ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> Treatments ({treatments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 space-y-2">
            {treatments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No treatments for this patient.</p>
            ) : (
              treatments.map((t) => (
                <div
                  key={t.id}
                  className="p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/treatment-plans/${t.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t.treatment_name}</p>
                      {t.case_number && (
                        <p className="text-xs text-muted-foreground">Case: {t.case_number}</p>
                      )}
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                    {t.cost != null && <span>Cost: ₹{Number(t.cost).toLocaleString("en-IN")}</span>}
                    {t.total_sittings > 0 && (
                      <span>
                        Sittings: {t.completed_sittings}/{t.total_sittings}
                      </span>
                    )}
                    {t.paid_amount != null && t.paid_amount > 0 && (
                      <span>Paid: ₹{Number(t.paid_amount).toLocaleString("en-IN")}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Billing ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Billing ({billings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 space-y-2">
            {billings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No billing records for this patient.
              </p>
            ) : (
              billings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/billing/${b.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium">{b.invoice_number || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.created_at ? format(new Date(b.created_at), "MMM dd, yyyy") : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      ₹{Number(b.total_amount).toLocaleString("en-IN")}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Paid: ₹{Number(b.paid_amount).toLocaleString("en-IN")}
                      </span>
                      <StatusBadge status={b.payment_status} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Patient Timeline ─────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4" /> Patient Timeline ({timeline.length} events)
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No timeline events for this patient.
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {timeline.map((event) => (
                  <div key={event.id} className="flex gap-3 items-start">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{event.action}</p>
                        {event.module && (
                          <Badge variant="outline" className="text-[10px]">
                            {event.module}
                          </Badge>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {event.user_name && <span>by {event.user_name}</span>}
                        <span>
                          {event.created_at
                            ? format(new Date(event.created_at), "MMM dd, HH:mm")
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Related Appointments ─────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Related Appointments (
              {related_appointments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {related_appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No other appointments for this patient.
              </p>
            ) : (
              <div className="space-y-2">
                {related_appointments.map((ra) => (
                  <div
                    key={ra.id}
                    className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => navigate(`/appointments/${ra.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <p className="text-sm font-medium">{ra.appointment_number || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {ra.appointment_date
                            ? format(new Date(ra.appointment_date), "MMM dd, yyyy")
                            : "—"}{" "}
                          at {ra.appointment_time || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {ra.doctor_name || "—"}
                      </span>
                      <StatusBadge status={ra.status} />
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-1">
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="text-muted-foreground">
                Current:{" "}
                <span className="font-medium">
                  {format(new Date(a.appointment_date), "MMM dd, yyyy")} at {a.appointment_time}
                </span>
              </p>
            </div>
            <AppointmentScheduler
              doctorId={a.doctor_id}
              date={rescheduleDate}
              selectedTime={rescheduleTime}
              showDoctorSelector={false}
              onSelect={(data) => {
                setRescheduleDate(data.appointment_date)
                setRescheduleTime(data.appointment_time)
              }}
            />
            <div className="grid gap-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                rows={2}
                placeholder="Why is this appointment being rescheduled?"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                rescheduleMutation.mutate({
                  appointment_date: rescheduleDate,
                  appointment_time: rescheduleTime,
                  reason: rescheduleReason || undefined,
                })
              }
              disabled={!rescheduleDate || !rescheduleTime || rescheduleMutation.isPending}
            >
              {rescheduleMutation.isPending ? "Rescheduling..." : "Confirm Reschedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Mark Appointment as Completed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-1">
            <p className="text-sm text-muted-foreground">
              Patient: <span className="font-medium text-foreground">{patient.full_name}</span>
            </p>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                rows={2}
                placeholder="Any treatment notes..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => completeMutation.mutate({ notes: completeNotes || undefined })}
              disabled={completeMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {completeMutation.isPending ? "Completing..." : "Mark Completed"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-1">
            <p className="text-sm text-muted-foreground">
              Patient: <span className="font-medium text-foreground">{patient.full_name}</span> ·{" "}
              {format(new Date(a.appointment_date), "MMM dd, yyyy")}
            </p>
            <div className="grid gap-2">
              <Label>Reason for cancellation *</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                placeholder="Why is this appointment being cancelled?"
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate({ reason: cancelReason || undefined })}
              disabled={!cancelReason || cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Appointment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassign Doctor Dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Change Doctor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-1">
            <div className="grid gap-2">
              <Label>Current Doctor</Label>
              <p className="text-sm font-medium">{a.doctor_name || a.doctor_id}</p>
            </div>
            <div className="grid gap-2">
              <Label>New Doctor *</Label>
              <Select value={newDoctorId} onValueChange={setNewDoctorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a doctor..." />
                </SelectTrigger>
                <SelectContent>
                  {doctorList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Textarea
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                rows={2}
                placeholder="Reason for change..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setReassignOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                reassignMutation.mutate({
                  doctor_id: newDoctorId,
                  reason: reassignReason || undefined,
                })
              }
              disabled={!newDoctorId || reassignMutation.isPending}
            >
              {reassignMutation.isPending ? "Reassigning..." : "Reassign Doctor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Case Dialog */}
      <Dialog open={createCaseOpen} onOpenChange={setCreateCaseOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Case from Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-1">
            <div className="grid gap-2">
              <Label>Patient</Label>
              <p className="text-sm font-medium">{patient.full_name}</p>
            </div>
            <div className="grid gap-2">
              <Label>Doctor</Label>
              <p className="text-sm font-medium">{a.doctor_name || a.doctor_id}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="complaint">Chief Complaint</Label>
              <Input
                id="complaint"
                placeholder="e.g. Tooth pain, routine checkup"
                value={caseComplaint}
                onChange={(e) => setCaseComplaint(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateCaseOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createCaseMutation.mutate({
                  patient_id: patient.id,
                  doctor_id: a.doctor_id,
                  appointment_id: a.id,
                  chief_complaint: caseComplaint || `Follow-up from ${a.appointment_date}`,
                })
              }
              disabled={!caseComplaint || createCaseMutation.isPending}
            >
              {createCaseMutation.isPending ? "Creating..." : "Create Case"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
