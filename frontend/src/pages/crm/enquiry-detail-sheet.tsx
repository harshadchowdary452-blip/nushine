import { useState, useCallback, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Phone, MessageCircle, CheckCircle, Calendar,
  FileText, History, RotateCcw, Clock, User, Stethoscope,
  Activity, ChevronRight, MapPin, Mail, Building2, PhoneCall,
  CalendarCheck, ClipboardList, Percent, BadgeCheck,
  ArrowRight, BookOpen, Target, HeartPulse, AlertCircle,
  Loader2, ChevronDown,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { enquiriesApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"

const ENQUIRY_TYPE_LABELS: Record<string, string> = {
  LEAD_FOLLOW_UP: "Lead Follow-up",
  APPOINTMENT_REMINDER: "Appointment Reminder",
  OPD_FOLLOW_UP: "OPD Follow-up",
  TREATMENT_WELLNESS: "Treatment Wellness",
  CASE_WELLNESS: "Case Wellness",
  RECALL: "Recall",
  MISSED_APPOINTMENT: "Missed Appointment",
}

const TYPE_STYLES: Record<string, { dot: string; bg: string; text: string; icon: string }> = {
  LEAD_FOLLOW_UP: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700", icon: "bg-amber-100 text-amber-600" },
  APPOINTMENT_REMINDER: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", icon: "bg-blue-100 text-blue-600" },
  OPD_FOLLOW_UP: { dot: "bg-teal-500", bg: "bg-teal-50", text: "text-teal-700", icon: "bg-teal-100 text-teal-600" },
  TREATMENT_WELLNESS: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", icon: "bg-emerald-100 text-emerald-600" },
  CASE_WELLNESS: { dot: "bg-violet-500", bg: "bg-violet-50", text: "text-violet-700", icon: "bg-violet-100 text-violet-600" },
  RECALL: { dot: "bg-rose-500", bg: "bg-rose-50", text: "text-rose-700", icon: "bg-rose-100 text-rose-600" },
  MISSED_APPOINTMENT: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700", icon: "bg-red-100 text-red-600" },
}

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-emerald-100 text-emerald-700 border-emerald-200",
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  FOLLOW_UP: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  LOST: "bg-rose-100 text-rose-700",
  CONVERTED: "bg-violet-100 text-violet-700",
}

interface EnquiryDetail {
  id: string; source: string; enquiry_type: string; enquiry_number?: string
  status: string; priority: string; due_date: string
  created_at?: string; updated_at?: string
  description: string; notes?: string; trigger_event?: string
  generation_reason?: string; visit_number?: number; total_visits?: number
  patient?: {
    id: string; name?: string; phone?: string; email?: string; age?: number; gender?: string
    op_number?: string; status?: string; address?: string; city?: string
    date_of_birth?: string; blood_group?: string
  }
  lead?: {
    id: string; name?: string; mobile?: string; email?: string; source?: string
    status?: string; interested_treatment?: string; notes?: string
    alternate_mobile?: string; preferred_visit_date?: string
    age?: number; gender?: string; city?: string; lead_score?: number
    assigned_staff?: string; assigned_doctor?: string; converted_patient_id?: string
  }
  doctor?: { id?: string; name?: string; specialization?: string; photo_url?: string }
  hospital?: { id?: string; name?: string; phone?: string; email?: string; address?: string; logo_url?: string }
  case?: {
    id: string; case_number?: string; chief_complaint?: string; diagnosis?: string
    status?: string; hpi?: string; dental_history?: string; medical_history?: string
    completion_date?: string
  }
  treatment?: {
    id: string; treatment_name?: string; treatment_type?: string; treatment_number?: string
    description?: string; status?: string; start_date?: string; completion_date?: string
    total_visits?: number; completed_visits?: number; remaining_visits?: number
    current_stage?: string; cost?: number; paid_amount?: number; assigned_doctor?: string
  }
  appointment?: {
    id: string; date?: string; time?: string; end_time?: string; doctor_name?: string
    department?: string; purpose?: string; type?: string; status?: string
  }
  recurrence?: { is_recurring: boolean; occurrence_number?: number; interval_days?: number; chain_id?: string }
  assigned_staff?: { id: string; name: string; email?: string; phone?: string }
  completed_treatments?: Array<{ id: string; treatment_name: string; completed_at?: string }>
  case_treatments?: Array<{ id: string; treatment_name: string; status: string; completed_at?: string }>
  appointment_treatment?: {
    case_id?: string; case_number?: string
    treatments?: Array<{ id: string; name: string; status: string }>
  }
  previous_visit?: {
    date?: string; doctor?: string; treatment_name?: string; work_done?: string
    sitting_number?: number; status?: string; type?: string
  }
  template_variables?: Record<string, string>
  communication_history?: Array<{
    id: string; channel: string; message_type: string; message: string
    status: string; sent_at?: string; created_at?: string
  }>
  timeline?: Array<{
    id?: string; event_type?: string; description?: string; status?: string
    created_at?: string; due_date?: string
  }>
  display_name?: string; display_phone?: string; display_email?: string
}

interface PreviousVisit {
  date?: string; doctor?: string; treatment_name?: string; work_done?: string
  sitting_number?: number; status?: string; type?: string
}

function formatDate(d: string | undefined | null): string {
  if (!d) return "—"
  try { return format(parseISO(d), "dd MMM yyyy") } catch { return d }
}

function formatTime(t: string | undefined | null): string {
  if (!t) return ""
  return t.slice(0, 5)
}

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-muted" />
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-muted rounded w-48" />
          <div className="h-3 bg-muted rounded w-32" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}
      </div>
      <div className="h-32 bg-muted rounded-lg" />
      <div className="h-32 bg-muted rounded-lg" />
    </div>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-2 py-1.5">
      {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  )
}

function SectionCard({ title, icon, children, className = "" }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{title}</span>
        </div>
      )}
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function BadgeRow({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <div key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/50 border text-xs">
          <span className="text-muted-foreground">{item.label}:</span>
          <span className={`font-semibold ${item.color || ""}`}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function QuickAction({ label, icon, onClick, variant = "default" }: { label: string; icon: React.ReactNode; onClick: () => void; variant?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-accent hover:shadow-sm transition-all text-sm font-medium"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  )
}

type TimelineItem = NonNullable<EnquiryDetail["timeline"]>[number]

function TimelineEntry({ entry }: { entry: TimelineItem }) {
  const typeColors: Record<string, string> = {
    LEAD_CREATED: "bg-amber-500", LEAD_FOLLOW_UP: "bg-blue-500",
    LEAD_COMMUNICATION: "bg-emerald-500", APPOINTMENT: "bg-violet-500",
    TREATMENT: "bg-teal-500", CASE: "bg-rose-500",
    PAYMENT: "bg-green-500", VISIT: "bg-cyan-500",
  }
  const dotColor = typeColors[entry.event_type || ""] || "bg-primary"
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor} mt-1.5 ring-2 ring-background`} />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 pb-4">
        <div className="text-sm">{entry.description || entry.event_type}</div>
        <div className="flex items-center gap-2 mt-0.5">
          {entry.created_at && (
            <span className="text-[11px] text-muted-foreground">{formatDate(entry.created_at)}</span>
          )}
          {entry.status && (
            <Badge variant="outline" className="text-[9px] h-4">{entry.status}</Badge>
          )}
        </div>
      </div>
    </div>
  )
}

interface DetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enquiryId: string | null
  onCall?: (item: any) => void
  onWhatsApp?: (item: any) => void
  onFeedback?: (item: any) => void
  onReschedule?: (id: string, date: string) => void
  onComplete?: (id: string, source?: string) => void
  onTimeline?: (item: any) => void
  calendarItem?: any
}

export function EnquiryDetailSheet({
  open, onOpenChange, enquiryId,
  onCall, onWhatsApp, onFeedback, onReschedule, onComplete, onTimeline,
  calendarItem,
}: DetailSheetProps) {
  const [waPreviewOpen, setWaPreviewOpen] = useState(false)
  const [waPreviewMsg, setWaPreviewMsg] = useState("")
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    timeline: true, communication: true, notes: true,
  })

  useEffect(() => {
    setWaPreviewMsg("")
    setWaPreviewOpen(false)
    setExpandedSections({ timeline: true, communication: true, notes: true })
  }, [enquiryId])

  const { data: detail, isLoading } = useQuery({
    queryKey: ["enquiry-detail", enquiryId],
    queryFn: async () => {
      if (!enquiryId) return null
      const resp = await enquiriesApi.getDetail(enquiryId)
      return (resp?.data || resp) as EnquiryDetail | null
    },
    enabled: !!enquiryId && open,
    staleTime: 30_000,
  })

  const item = detail || calendarItem
  const isLead = item?.enquiry_type === "LEAD_FOLLOW_UP"
  const style = TYPE_STYLES[item?.enquiry_type || ""] || TYPE_STYLES["APPOINTMENT_REMINDER"]

  const loadWaPreview = useCallback(async () => {
    if (!enquiryId) return
    try {
      const r = await enquiriesApi.whatsappPreview(enquiryId)
      setWaPreviewMsg(r?.rendered_message || "No preview available")
    } catch {
      setWaPreviewMsg("Unable to load preview")
    }
  }, [enquiryId])

  const createItemProxy = (extra?: Record<string, any>) => {
    if (!item) return {}
    return {
      ...item,
      ...(detail || {}),
      ...(extra || {}),
    }
  }

  function toggleSection(key: string) {
    setExpandedSections(s => ({ ...s, [key]: !s[key] }))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 overflow-y-auto">
        <SheetTitle className="sr-only">Enquiry Detail</SheetTitle>
        <SheetDescription className="sr-only">Enquiry details and actions</SheetDescription>
        {isLoading && !detail ? (
          <DetailSkeleton />
        ) : item ? (
          <div className="flex flex-col min-h-full">

            {/* ── HEADER ── */}
            <div className={`${style.bg} px-6 pt-6 pb-4`}>
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl ${style.icon} flex items-center justify-center shadow-sm`}>
                  <span className="text-xl font-bold">
                    {(isLead
                      ? (item.lead?.name || "L")
                      : (item.patient?.name || "P")
                    ).charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold truncate">
                      {isLead ? item.lead?.name : item.patient?.name || "Enquiry"}
                    </h2>
                    {item.enquiry_number && (
                      <span className="text-xs font-mono text-muted-foreground/70 bg-background/60 px-2 py-0.5 rounded">
                        #{item.enquiry_number}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={`${style.dot.replace("bg-", "bg-").replace("500", "100")} ${style.text} border-0 text-[10px]`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${style.dot} mr-1`} />
                      {ENQUIRY_TYPE_LABELS[item.enquiry_type || ""] || item.enquiry_type}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLES[item.priority || ""] || ""}`}>
                      {item.priority || "MEDIUM"}
                    </Badge>
                    <Badge className={`text-[10px] border-0 ${STATUS_STYLES[item.status || ""] || "bg-slate-100"}`}>
                      {item.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Quick stat pills */}
              <div className="flex gap-3 mt-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background/60 px-3 py-1.5 rounded-lg">
                  <Calendar className="h-3 w-3" />
                  {item.due_date ? formatDate(item.due_date) : "—"}
                </div>
                {item.created_at && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background/60 px-3 py-1.5 rounded-lg">
                    <Clock className="h-3 w-3" />
                    Created {formatDate(item.created_at)}
                  </div>
                )}
                {item.assigned_staff?.name && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background/60 px-3 py-1.5 rounded-lg">
                    <User className="h-3 w-3" />
                    {item.assigned_staff.name}
                  </div>
                )}
              </div>

              {item.description && (
                <div className="mt-3 text-sm text-muted-foreground bg-background/40 rounded-lg px-3 py-2">
                  {item.description}
                </div>
              )}
            </div>

            {/* ── MAIN CONTENT GRID ── */}
            <div className="flex-1 p-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                {/* ── LEFT COLUMN (3/5) ── */}
                <div className="lg:col-span-3 space-y-4">

                  {/* LEAD SECTION */}
                  {isLead && detail?.lead && (
                    <>
                      <SectionCard title="Lead Information" icon={<Target className="h-3.5 w-3.5" />}>
                        <div className="grid grid-cols-2 gap-x-4">
                          <InfoRow label="Name" value={detail.lead.name} />
                          <InfoRow label="Mobile" value={detail.lead.mobile} icon={<Phone className="h-3 w-3" />} />
                          <InfoRow label="Email" value={detail.lead.email} icon={<Mail className="h-3 w-3" />} />
                          <InfoRow label="Source" value={detail.lead.source?.replace("_", " ")} />
                          <InfoRow label="Interest" value={detail.lead.interested_treatment} />
                          <InfoRow label="Status" value={detail.lead.status} />
                          <InfoRow label="Assigned To" value={detail.lead.assigned_staff || detail.lead.assigned_doctor} icon={<User className="h-3 w-3" />} />
                          <InfoRow label="Lead Score" value={detail.lead.lead_score != null ? `${detail.lead.lead_score}` : null} />
                          <InfoRow label="City" value={detail.lead.city} icon={<MapPin className="h-3 w-3" />} />
                          <InfoRow label="Age / Gender" value={detail.lead.age ? `${detail.lead.age} yrs${detail.lead.gender ? ` / ${detail.lead.gender}` : ""}` : detail.lead.gender} />
                          <InfoRow label="Alternate Mobile" value={detail.lead.alternate_mobile} icon={<Phone className="h-3 w-3" />} />
                          <InfoRow label="Preferred Visit" value={detail.lead.preferred_visit_date ? formatDate(detail.lead.preferred_visit_date) : null} />
                        </div>
                        {detail.lead.notes && (
                          <div className="mt-2 pt-2 border-t">
                            <InfoRow label="Notes" value={detail.lead.notes} />
                          </div>
                        )}
                      </SectionCard>
                    </>
                  )}

                  {/* PATIENT SECTION */}
                  {!isLead && detail?.patient && (
                    <SectionCard title="Patient Information" icon={<User className="h-3.5 w-3.5" />}>
                      <div className="flex items-center gap-3 mb-3 pb-3 border-b">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                          {(detail.patient.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold">{detail.patient.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {detail.patient.op_number && <>OP: {detail.patient.op_number}</>}
                          </div>
                        </div>
                        {detail?.patient?.phone && (
                          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => window.open(`tel:${detail?.patient?.phone}`, '_self')}>
                            <Phone className="h-3 w-3 mr-1" /> {detail?.patient?.phone}
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4">
                        <InfoRow label="Age" value={detail.patient.age != null ? `${detail.patient.age} yrs` : null} />
                        <InfoRow label="Gender" value={detail.patient.gender} />
                        <InfoRow label="Phone" value={detail.patient.phone} icon={<Phone className="h-3 w-3" />} />
                        <InfoRow label="Email" value={detail.patient.email} icon={<Mail className="h-3 w-3" />} />
                        <InfoRow label="OP Number" value={detail.patient.op_number} />
                        <InfoRow label="Status" value={detail.patient.status} />
                        {detail.patient.city && <InfoRow label="City" value={detail.patient.city} icon={<MapPin className="h-3 w-3" />} />}
                        {detail.patient.blood_group && <InfoRow label="Blood Group" value={detail.patient.blood_group} />}
                      </div>
                    </SectionCard>
                  )}

                  {/* APPOINTMENT DETAILS */}
                  {!isLead && detail?.appointment && (
                    <SectionCard title="Appointment Details" icon={<CalendarCheck className="h-3.5 w-3.5" />}>
                      <div className="grid grid-cols-2 gap-x-4">
                        <InfoRow label="Date" value={detail.appointment.date ? formatDate(detail.appointment.date) : null} />
                        <InfoRow label="Time" value={detail.appointment.time ? formatTime(detail.appointment.time) : null} />
                        <InfoRow label="Doctor" value={detail.appointment.doctor_name ? `Dr. ${detail.appointment.doctor_name}` : null} icon={<Stethoscope className="h-3 w-3" />} />
                        {detail.appointment.department && <InfoRow label="Department" value={detail.appointment.department} />}
                        <InfoRow label="Type" value={detail.appointment.type?.replace("_", " ")} />
                        <InfoRow label="Status" value={detail.appointment.status} />
                      </div>
                      {detail.appointment.purpose && (
                        <div className="mt-2 pt-2 border-t">
                          <InfoRow label="Notes" value={detail.appointment.purpose} />
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* APPOINTMENT TREATMENT */}
                  {!isLead && detail?.appointment_treatment?.treatments && detail.appointment_treatment.treatments.length > 0 && (
                    <SectionCard title="Current Treatment" icon={<Activity className="h-3.5 w-3.5" />}>
                      <div className="space-y-2">
                        {detail.appointment_treatment.treatments.map((t, i) => (
                          <div key={t.id || i} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${t.status === "COMPLETED" ? "bg-emerald-500" : t.status === "IN_PROGRESS" ? "bg-blue-500" : "bg-amber-500"}`} />
                              <span className="font-medium text-sm">{t.name}</span>
                            </div>
                            <Badge variant="outline" className="text-[9px]">{t.status?.replace("_", " ")}</Badge>
                          </div>
                        ))}
                      </div>
                      {detail.appointment_treatment.case_number && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Case: {detail.appointment_treatment.case_number}
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* PREVIOUS VISIT */}
                  {!isLead && detail?.previous_visit && (
                    <SectionCard title="Previous Visit" icon={<History className="h-3.5 w-3.5" />}>
                      <div className="grid grid-cols-2 gap-x-4">
                        <InfoRow label="Date" value={detail.previous_visit.date ? formatDate(detail.previous_visit.date) : null} />
                        {detail.previous_visit.doctor && <InfoRow label="Doctor" value={`Dr. ${detail.previous_visit.doctor}`} />}
                        {detail.previous_visit.treatment_name && <InfoRow label="Treatment" value={detail.previous_visit.treatment_name} />}
                        {detail.previous_visit.sitting_number != null && <InfoRow label="Session" value={`Visit #${detail.previous_visit.sitting_number}`} />}
                        {detail.previous_visit.type && <InfoRow label="Type" value={detail.previous_visit.type.replace("_", " ")} />}
                        <InfoRow label="Status" value={detail.previous_visit.status} />
                      </div>
                      {detail.previous_visit.work_done && (
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Work Done</div>
                          <div className="text-sm mt-0.5">{detail.previous_visit.work_done}</div>
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* NO PREVIOUS VISIT */}
                  {!isLead && detail?.enquiry_type === "APPOINTMENT_REMINDER" && !detail?.previous_visit && (
                    <SectionCard title="Previous Visit" icon={<History className="h-3.5 w-3.5" />}>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <AlertCircle className="h-4 w-4" />
                        <em>No previous visit found.</em>
                      </div>
                    </SectionCard>
                  )}

                  {/* TREATMENT DETAILS */}
                  {!isLead && detail?.treatment && (
                    <SectionCard title="Treatment Details" icon={<Activity className="h-3.5 w-3.5" />}>
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                        <div className="text-lg font-bold">{detail.treatment.treatment_name}</div>
                        {detail.treatment.treatment_type && (
                          <Badge variant="outline" className="text-[9px]">{detail.treatment.treatment_type}</Badge>
                        )}
                        <Badge className={`text-[9px] ml-auto ${STATUS_STYLES[detail.treatment.status || ""] || ""}`}>
                          {detail.treatment.status?.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4">
                        <InfoRow label="Treatment #" value={detail.treatment.treatment_number} />
                        {detail.treatment.assigned_doctor && <InfoRow label="Doctor" value={`Dr. ${detail.treatment.assigned_doctor}`} />}
                        {detail.treatment.start_date && <InfoRow label="Start Date" value={formatDate(detail.treatment.start_date)} />}
                        {detail.treatment.completion_date && <InfoRow label="Completed" value={formatDate(detail.treatment.completion_date)} />}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-muted/30 p-2.5 text-center">
                          <div className="text-[11px] text-muted-foreground">Completed</div>
                          <div className="text-lg font-bold">{detail.treatment.completed_visits || 0}</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 text-center">
                          <div className="text-[11px] text-muted-foreground">Remaining</div>
                          <div className="text-lg font-bold">{detail.treatment.remaining_visits || 0}</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-2.5 text-center">
                          <div className="text-[11px] text-muted-foreground">Total</div>
                          <div className="text-lg font-bold">{detail.treatment.total_visits || 0}</div>
                        </div>
                      </div>
                      {detail.treatment.current_stage && (
                        <div className="mt-2 flex items-center gap-2 text-sm">
                          <ArrowRight className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium">{detail.treatment.current_stage}</span>
                        </div>
                      )}
                      {detail.treatment.description && (
                        <div className="mt-2 pt-2 border-t text-sm text-muted-foreground">
                          {detail.treatment.description}
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* CASE DETAILS */}
                  {!isLead && detail?.case && (
                    <SectionCard title="Case Details" icon={<FolderOpen className="h-3.5 w-3.5" />}>
                      <div className="flex items-center justify-between mb-3 pb-2 border-b">
                        <div>
                          <div className="font-semibold">{detail.case.case_number || detail.case.id}</div>
                        </div>
                        <Badge className={`text-[9px] ${STATUS_STYLES[detail.case.status || ""] || ""}`}>
                          {detail.case.status?.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {detail.case.chief_complaint && (
                          <div>
                            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Chief Complaint</div>
                            <div className="text-sm">{detail.case.chief_complaint}</div>
                          </div>
                        )}
                        {detail.case.diagnosis && (
                          <div>
                            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Diagnosis</div>
                            <div className="text-sm">{detail.case.diagnosis}</div>
                          </div>
                        )}
                        {detail.case.completion_date && (
                          <div className="text-xs text-muted-foreground">
                            Completed: {formatDate(detail.case.completion_date)}
                          </div>
                        )}
                      </div>
                      {(detail.case.hpi || detail.case.medical_history || detail.case.dental_history) && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          {detail.case.hpi && (
                            <div>
                              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">HPI</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">{detail.case.hpi}</div>
                            </div>
                          )}
                          {detail.case.medical_history && (
                            <div>
                              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Medical History</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">{detail.case.medical_history}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* CASE TREATMENTS (for CASE_WELLNESS and RECALL) */}
                  {detail?.case_treatments && detail.case_treatments.length > 0 && (
                    <SectionCard title="Treatments" icon={<ClipboardList className="h-3.5 w-3.5" />}>
                      <div className="space-y-1.5">
                        {detail.case_treatments.map((t, i) => (
                          <div key={t.id || i} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                            <div className="flex items-center gap-2">
                              {t.status === "COMPLETED" ? (
                                <BadgeCheck className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                              )}
                              <span className="text-sm font-medium">{t.treatment_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {t.completed_at && (
                                <span className="text-[10px] text-muted-foreground">{formatDate(t.completed_at)}</span>
                              )}
                              <Badge variant="outline" className="text-[9px]">{t.status?.replace("_", " ")}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {/* COMPLETED TREATMENTS (for RECALL) */}
                  {detail?.completed_treatments && detail.completed_treatments.length > 0 && detail?.enquiry_type === "RECALL" && (
                    <SectionCard title="Completed Treatments" icon={<BadgeCheck className="h-3.5 w-3.5" />}>
                      <div className="space-y-1.5">
                        {detail.completed_treatments.map((t, i) => (
                          <div key={t.id || i} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                              <span className="text-sm font-medium">{t.treatment_name}</span>
                            </div>
                            {t.completed_at && (
                              <span className="text-[10px] text-emerald-600">{formatDate(t.completed_at)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  )}

                  {/* DOCTOR */}
                  {!isLead && detail?.doctor?.name && !detail?.appointment?.doctor_name && (
                    <SectionCard title="Consulting Doctor" icon={<Stethoscope className="h-3.5 w-3.5" />}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                          Dr{(detail.doctor.name || "").charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold">Dr. {detail.doctor.name}</div>
                          {detail.doctor.specialization && (
                            <div className="text-xs text-muted-foreground">{detail.doctor.specialization}</div>
                          )}
                        </div>
                      </div>
                    </SectionCard>
                  )}

                  {/* HOSPITAL */}
                  {detail?.hospital?.name && (
                    <SectionCard title="Hospital" icon={<Building2 className="h-3.5 w-3.5" />}>
                      <div className="font-semibold">{detail.hospital.name}</div>
                      {detail.hospital.phone && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <Phone className="h-3 w-3" /> {detail.hospital.phone}
                        </div>
                      )}
                      {detail.hospital.address && (
                        <div className="flex items-start gap-1.5 text-sm text-muted-foreground mt-0.5">
                          <MapPin className="h-3 w-3 mt-0.5" /> {detail.hospital.address}
                        </div>
                      )}
                    </SectionCard>
                  )}

                </div>

                {/* ── RIGHT COLUMN (2/5) ── */}
                <div className="lg:col-span-2 space-y-4">

                  {/* NOTES */}
                  {item.notes && (
                    <SectionCard title="Notes">
                      <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
                    </SectionCard>
                  )}

                  {/* GENERATION INFO */}
                  {(item.trigger_event || item.generation_reason) && (
                    <SectionCard title="Generation Info">
                      {item.trigger_event && (
                        <InfoRow label="Trigger" value={item.trigger_event?.replace("_", " ")} />
                      )}
                      {item.generation_reason && (
                        <InfoRow label="Reason" value={item.generation_reason} />
                      )}
                      {item.visit_number != null && (
                        <InfoRow label="Visit" value={`${item.visit_number}${item.total_visits ? ` of ${item.total_visits}` : ""}`} />
                      )}
                    </SectionCard>
                  )}

                  {/* TIMELINE */}
                  {detail?.timeline && detail.timeline.length > 0 && (
                    <SectionCard title="Timeline" icon={<History className="h-3.5 w-3.5" />}>
                      <button
                        type="button"
                        onClick={() => toggleSection("timeline")}
                        className="flex items-center gap-1 text-xs text-muted-foreground mb-2"
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.timeline ? "" : "-rotate-90"}`} />
                        {detail.timeline.length} events
                      </button>
                      {expandedSections.timeline && (
                        <div className="max-h-[240px] overflow-y-auto -mx-1 px-1">
                          {detail.timeline.slice(0, 15).map((entry, idx) => (
                            <TimelineEntry key={entry.id || idx} entry={entry} />
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* COMMUNICATION HISTORY */}
                  {detail?.communication_history && detail.communication_history.length > 0 && (
                    <SectionCard title="Communication History" icon={<MessageCircle className="h-3.5 w-3.5" />}>
                      <button
                        type="button"
                        onClick={() => toggleSection("communication")}
                        className="flex items-center gap-1 text-xs text-muted-foreground mb-2"
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.communication ? "" : "-rotate-90"}`} />
                        {detail.communication_history.length} messages
                      </button>
                      {expandedSections.communication && (
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                          {detail.communication_history.slice(0, 10).map((c) => (
                            <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg border text-xs">
                              <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium text-[10px] ${
                                c.channel === "WHATSAPP" ? "bg-green-100 text-green-700" :
                                c.channel === "EMAIL" ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-700"
                              }`}>{c.channel}</span>
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{c.message?.substring(0, 100)}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-muted-foreground">
                                    {c.created_at && formatDate(c.created_at)}
                                  </span>
                                  <Badge variant="outline" className="text-[8px] h-3.5">{c.status}</Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* WHATSAPP PREVIEW */}
                  <SectionCard title="WhatsApp Template" icon={<MessageCircle className="h-3.5 w-3.5" />}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !waPreviewOpen
                        setWaPreviewOpen(next)
                        if (next) loadWaPreview()
                      }}
                      className="flex items-center justify-between w-full text-xs text-muted-foreground"
                    >
                      <span>Template Preview</span>
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${waPreviewOpen ? "rotate-90" : ""}`} />
                    </button>
                    {waPreviewOpen && (
                      <div className="mt-2 space-y-2">
                        {detail?.template_variables && Object.keys(detail.template_variables).length > 0 && (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs max-h-[100px] overflow-y-auto">
                            {Object.entries(detail.template_variables).slice(0, 10).map(([k, v]) => (
                              <div key={k} className="truncate">
                                <span className="text-muted-foreground">{k}:</span> {String(v || "—")}
                              </div>
                            ))}
                          </div>
                        )}
                        {waPreviewMsg ? (
                          <pre className="text-xs whitespace-pre-wrap bg-muted/30 rounded-lg p-3 max-h-[160px] overflow-y-auto border">
                            {waPreviewMsg}
                          </pre>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full text-xs" onClick={loadWaPreview}>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Load Preview
                          </Button>
                        )}
                      </div>
                    )}
                  </SectionCard>

                </div>
              </div>
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div className="sticky bottom-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75 px-6 py-3">
              <div className="flex flex-wrap gap-2 justify-center">
                {onCall && (
                  <QuickAction label="Call" icon={<Phone className="h-4 w-4" />} onClick={() => { onOpenChange(false); onCall(createItemProxy()) }} />
                )}
                {onWhatsApp && (
                  <QuickAction label="WhatsApp" icon={<MessageCircle className="h-4 w-4" />} onClick={() => { onOpenChange(false); onWhatsApp(createItemProxy()) }} />
                )}
                {onFeedback && (
                  <QuickAction label="Feedback" icon={<FileText className="h-4 w-4" />} onClick={() => { onOpenChange(false); onFeedback(createItemProxy()) }} />
                )}
                {onReschedule && (
                  <QuickAction label="Reschedule" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { onReschedule(item.id || enquiryId || "", item.due_date || ""); onOpenChange(false) }} />
                )}
                {onComplete && item.status !== "COMPLETED" && item.status !== "LOST" && item.status !== "CANCELLED" && (
                  <QuickAction label="Complete" icon={<CheckCircle className="h-4 w-4" />} onClick={() => { onComplete(item.id || enquiryId || "", item.source); onOpenChange(false) }} />
                )}
                {onTimeline && (
                  <QuickAction label="Timeline" icon={<History className="h-4 w-4" />} onClick={() => { onTimeline(createItemProxy()); onOpenChange(false) }} />
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Select an enquiry to view details
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// Missing lucide icon import
import { FolderOpen } from "lucide-react"
