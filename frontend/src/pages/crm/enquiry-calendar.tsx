import { useState, useEffect, useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Phone,
  MessageCircle,
  CheckCircle,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Calendar,
  FileText,
  History,
  RotateCcw,
  X,
  AlertTriangle,
  Filter,
  Keyboard,
} from "lucide-react"
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isToday,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns"
import { enquiriesApi, crmApi, doctorsApi, whatsappTemplatesApi } from "@/services/endpoints"
import { extractDetail } from "@/types"
import { PageHeader } from "@/design-system"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EnquiryDetailSheet } from "./enquiry-detail-sheet"
import { FeedbackDrawer } from "@/components/crm/FeedbackDrawer"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface CalendarItem {
  id: string
  source?: string
  enquiry_type?: string
  display_name?: string
  display_phone?: string
  display_email?: string
  patient_name?: string
  patient_phone?: string
  op_number?: string
  doctor_id?: string
  doctor_name?: string
  treatment_type?: string
  treatment_name?: string
  follow_up_type?: string
  due_date?: string
  priority?: string
  status?: string
  response_status?: string
  feedback?: string
  staff_notes?: string
  response?: string
  next_action?: string
  last_contact_date?: string
  patient_id?: string
  appointment_date?: string
  hospital_phone?: string
  enquiry_number?: string
  description?: string
  visit_number?: number
  completed_treatments?: Array<{ id: string; treatment_name: string; completed_at?: string }>
  // New enriched nested fields
  patient?: {
    id: string
    name: string
    photo_url?: string
    phone?: string
    op_number?: string
    age?: number
    gender?: string
    status?: string
  }
  lead?: {
    id: string
    name: string
    mobile: string
    email?: string
    source?: string
    status?: string
    interested_treatment?: string
    priority?: string
    next_follow_up_date?: string
    notes?: string
    alternate_mobile?: string
    age?: number
    gender?: string
    city?: string
    lead_score?: number
    preferred_visit_date?: string
    assigned_doctor?: string
    assigned_staff?: string
  }
  doctor?: {
    id?: string
    name?: string
    specialization?: string
    photo_url?: string
  }
  hospital?: {
    id: string
    name: string
    phone?: string
    address?: string
    logo_url?: string
  }
  case?: {
    id: string
    case_number?: string
    chief_complaint?: string
    status?: string
    diagnosis?: string
  }
  treatment?: {
    id: string
    treatment_name?: string
    treatment_type?: string
    status?: string
    start_date?: string
    completion_date?: string
    total_visits?: number
    completed_visits?: number
    remaining_visits?: number
    current_visit?: number
    current_stage?: string
  }
  appointment?: {
    id: string
    date?: string
    time?: string
    doctor_name?: string
    appointment_type?: string
    purpose?: string
    status?: string
  }
  occurrence_number?: number
  total_attempts?: number
  recurrence?: {
    is_recurring: boolean
    occurrence_number?: number
    interval_days?: number
    chain_id?: string
  }
  assigned_staff?: { id: string; name: string }
  template_variables?: Record<string, string>
}

// Enriched detail response from /detail endpoint
interface EnquiryDetail {
  id: string
  source: string
  enquiry_type: string
  enquiry_number?: string
  status: string
  priority: string
  due_date: string
  created_at?: string
  updated_at?: string
  description: string
  notes?: string
  trigger_event?: string
  generation_reason?: string
  visit_number?: number
  total_visits?: number
  patient?: CalendarItem["patient"]
  lead?: CalendarItem["lead"]
  doctor?: CalendarItem["doctor"]
  hospital?: CalendarItem["hospital"]
  case?: CalendarItem["case"]
  treatment?: CalendarItem["treatment"]
  appointment?: CalendarItem["appointment"]
  recurrence?: CalendarItem["recurrence"]
  assigned_staff?: { id: string; name: string; email?: string; phone?: string }
  template_variables?: Record<string, string>
  communication_history?: Array<{
    id: string
    channel: string
    message_type: string
    message: string
    status: string
    sent_at?: string
    created_at?: string
  }>
  timeline?: Array<{
    id: string
    enquiry_type: string
    status: string
    due_date?: string
    created_at?: string
    description?: string
  }>
  display_name?: string
  display_phone?: string
  display_email?: string
}

interface DoctorItem {
  id: string
  full_name?: string
  name?: string
  username?: string
}

interface TimelineEntry {
  id?: string
  created_at?: string
  action?: string
  status?: string
  follow_up_type?: string
  notes?: string
  patient_feedback?: string
  response_summary?: string
  event_type?: string
  description?: string
  enquiry_type?: string
  due_date?: string
}

interface WhatsAppTemplate {
  id?: string
  name?: string
  message?: string
  enquiry_type?: string
  is_active?: boolean
}

interface CalendarSummary {
  total: number
  pending: number
  completed: number
  overdue: number
  due_today: number
  due_tomorrow: number
  due_this_week: number
  by_type: Record<string, number>
  by_status: Record<string, number>
}

const ENQUIRY_TYPE_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  LEAD_FOLLOW_UP: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  APPOINTMENT_REMINDER: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    dot: "bg-orange-500",
  },
  OPD_FOLLOW_UP: {
    bg: "bg-[var(--ds-accent-50)]",
    text: "text-[var(--ds-accent-700)]",
    border: "border-[var(--ds-accent-200)]",
    dot: "bg-[var(--ds-accent-500)]",
  },
  TREATMENT_WELLNESS: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    dot: "bg-green-500",
  },
  CASE_WELLNESS: {
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
    dot: "bg-teal-500",
  },
  RECALL: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  MISSED_APPOINTMENT: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    dot: "bg-rose-500",
  },
  ENQUIRY: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-400",
  },
  "1_DAY_FOLLOW_UP": {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  "7_DAY_FOLLOW_UP": {
    bg: "bg-[var(--ds-accent-50)]",
    text: "text-[var(--ds-accent-700)]",
    border: "border-[var(--ds-accent-200)]",
    dot: "bg-[var(--ds-accent-500)]",
  },
  "6_MONTH_RECALL": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  "12_MONTH_RECALL": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  CUSTOM_FOLLOW_UP: {
    bg: "bg-[var(--ds-background-subtle)]",
    text: "text-[var(--ds-text-secondary)]",
    border: "border-[var(--ds-border)]",
    dot: "bg-[var(--ds-text-tertiary)]",
  },
  CRM_RULE: {
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    border: "border-cyan-200",
    dot: "bg-cyan-500",
  },
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONTACTED: "bg-blue-100 text-blue-800",
  INTERESTED: "bg-emerald-100 text-emerald-800",
  APPOINTMENT_REQUIRED: "bg-[var(--ds-accent-100)] text-[var(--ds-accent-800)]",
  APPOINTMENT_BOOKED: "bg-[var(--ds-primary-100)] text-[var(--ds-primary-800)]",
  COMPLETED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  NO_RESPONSE: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  LOST: "bg-red-100 text-red-800",
  CANCELLED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  NEW: "bg-blue-100 text-blue-700",
  NOT_INTERESTED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  CONVERTED: "bg-green-100 text-green-800",
}

const ENQUIRY_TYPE_LABELS: Record<string, string> = {
  LEAD_FOLLOW_UP: "Lead Follow-Up",
  APPOINTMENT_REMINDER: "Appointment Reminder",
  OPD_FOLLOW_UP: "OPD Follow-Up",
  TREATMENT_WELLNESS: "Treatment Wellness",
  CASE_WELLNESS: "Case Wellness",
  RECALL: "Recall",
  MISSED_APPOINTMENT: "Missed Appointment",
  ENQUIRY: "Enquiry",
  "1_DAY_FOLLOW_UP": "1-Day Follow-Up",
  "7_DAY_FOLLOW_UP": "7-Day Follow-Up",
  "6_MONTH_RECALL": "6-Month Recall",
  "12_MONTH_RECALL": "12-Month Recall",
  CUSTOM_FOLLOW_UP: "Custom Follow-Up",
  CRM_RULE: "CRM Rule",
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  LEAD_FOLLOW_UP: `Hello {{lead_name}},

Thank you for contacting {{hospital_name}}.

We understand that you are interested in {{treatment_name}}.

Our team is available to answer your questions and help you schedule a consultation at your convenience.

Please let us know a suitable time, and we will be happy to assist you.

Thank you,
{{hospital_name}}

Contact:
{{hospital_phone}}`,
  APPOINTMENT_REMINDER: `Hello {{patient_name}},

This is a friendly reminder about your appointment with Dr. {{doctor_name}}.

Appointment

Date:
{{appointment_date}}

Time:
{{appointment_time}}

OP Number:
{{op_number}}

If you are unable to attend, kindly let us know so we can assist with rescheduling.

Thank you,
{{hospital_name}}`,
  OPD_FOLLOW_UP: `Hello {{patient_name}},

We hope your consultation at {{hospital_name}} was helpful.

Dr. {{doctor_name}} has recommended further care based on your consultation.

If you have any questions or would like to begin your treatment, please contact us.

We are happy to assist you.

Thank you,
{{hospital_name}}`,
  TREATMENT_WELLNESS: `Hello {{patient_name}},

We hope you are doing well after your recent {{treatment_name}} at {{hospital_name}}.

We would like to know how you are feeling now.

• Are you recovering well?
• Are you experiencing any discomfort?
• If required, would you like to schedule a follow-up visit with Dr. {{doctor_name}}?

Please let us know.

We are always happy to assist you.

Thank you,
{{hospital_name}}`,
  CASE_WELLNESS: `Hello {{patient_name}},

We hope you are recovering well after completing your treatment for {{case_name}}.

Completed Treatments

{{completed_treatments}}

If you have any concerns or need further guidance, please contact us.

Our team and Dr. {{doctor_name}} are always available to help.

Thank you,
{{hospital_name}}`,
  RECALL: `Hello {{patient_name}},

This is your scheduled dental recall reminder from {{hospital_name}}.

Based on your previous treatment

{{completed_treatments}}

your next preventive dental check-up is due on

{{next_recall_date}}

Regular reviews help maintain your oral health and allow early detection of any issues.

Please contact us to schedule your appointment.

Thank you,
{{hospital_name}}`,
}

function getDefaultTemplate(enquiryType?: string): string {
  if (enquiryType && DEFAULT_TEMPLATES[enquiryType]) return DEFAULT_TEMPLATES[enquiryType]
  return DEFAULT_TEMPLATES.APPOINTMENT_REMINDER || ""
}

function renderTemplateLocal(
  template: string,
  vars: Record<string, string>,
): { message: string; unresolved: string[] } {
  const unresolved: string[] = []
  const message = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    if (!v || !v.trim()) {
      if (!unresolved.includes(key)) unresolved.push(key)
      return ""
    }
    return v
  })
  return { message, unresolved }
}

function getTypeColor(enquiryType: string) {
  return ENQUIRY_TYPE_COLORS[enquiryType] || ENQUIRY_TYPE_COLORS.ENQUIRY
}

function isOverdue(dueDate: string, status: string) {
  if (["COMPLETED", "APPOINTMENT_BOOKED", "LOST", "CONVERTED", "CANCELLED"].includes(status))
    return false
  return isBefore(parseISO(dueDate), startOfDay(new Date()))
}

export default function EnquiryCalendar() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(format(today, "yyyy-MM-dd"))
  const [viewMode, setViewMode] = useState<"day" | "week" | "month" | "agenda">("day")
  const [statusFilter, setStatusFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [doctorFilter, setDoctorFilter] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [includeTerminal, setIncludeTerminal] = useState(false)
  const selDate = new Date(selectedDate + "T00:00:00")

  function getRange() {
    const d = new Date(selectedDate + "T00:00:00")
    if (viewMode === "day") return { start: selectedDate, end: selectedDate }
    if (viewMode === "week" || viewMode === "agenda") {
      return {
        start: format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end: format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      }
    }
    return {
      start: format(startOfMonth(d), "yyyy-MM-dd"),
      end: format(endOfMonth(d), "yyyy-MM-dd"),
    }
  }

  const dateRange = getRange()

  const { data: calData, isFetching } = useQuery({
    queryKey: [
      "enquiry-calendar",
      dateRange.start,
      dateRange.end,
      statusFilter,
      typeFilter,
      doctorFilter,
      priorityFilter,
      includeTerminal,
    ],
    queryFn: () =>
      enquiriesApi.calendar({
        start_date: dateRange.start,
        end_date: dateRange.end,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        doctor_id: doctorFilter || undefined,
        priority: priorityFilter || undefined,
        include_terminal: includeTerminal || undefined,
      }),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })

  const apiItems: CalendarItem[] = useMemo(
    () =>
      (calData?.items as CalendarItem[]) ||
      (Array.isArray(calData) ? (calData as CalendarItem[]) : []),
    [calData],
  )
  const totalCount: number = calData?.total || apiItems.length

  const searchedItems = useMemo(() => {
    if (!searchQuery) return apiItems
    const sl = searchQuery.toLowerCase()
    return apiItems.filter(
      (i) =>
        (i.display_name || i.patient_name || "").toLowerCase().includes(sl) ||
        (i.op_number || "").toLowerCase().includes(sl) ||
        (i.treatment_name || "").toLowerCase().includes(sl) ||
        (i.display_phone || i.patient_phone || "").toLowerCase().includes(sl),
    )
  }, [apiItems, searchQuery])

  const filteredItems = useMemo(() => {
    if (viewMode === "day") return searchedItems.filter((i) => i.due_date === selectedDate)
    return searchedItems
  }, [searchedItems, selectedDate, viewMode])

  // --- Summary ---
  const { data: summary } = useQuery<CalendarSummary>({
    queryKey: ["enquiry-calendar-summary", dateRange.start, dateRange.end, includeTerminal],
    queryFn: () =>
      enquiriesApi.calendarSummary({
        start_date: dateRange.start,
        end_date: dateRange.end,
        include_terminal: includeTerminal || undefined,
      }),
    refetchInterval: 15000,
  })

  // --- Doctors ---
  const currentUser = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "null")
    } catch {
      return null
    }
  })()
  const hospitalId = currentUser?.hospital_id

  const { data: doctors } = useQuery({
    queryKey: ["doctors-list", hospitalId],
    queryFn: () =>
      doctorsApi
        .list(hospitalId ? { hospital_id: hospitalId, limit: 200 } : { limit: 200 })
        .then((r: unknown) => {
          if (Array.isArray(r)) return r as DoctorItem[]
          const resp = r as Record<string, unknown> | undefined
          if (resp?.users) return resp.users as DoctorItem[]
          if (resp?.data) return resp.data as DoctorItem[]
          return []
        }),
  })
  const doctorsList: DoctorItem[] = Array.isArray(doctors) ? doctors : []

  // --- Detail Drawer ---
  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const { data: detailData } = useQuery({
    queryKey: ["enquiry-detail", detailItem?.id],
    queryFn: async () => {
      if (!detailItem?.id) return null
      const resp = await enquiriesApi.getDetail(detailItem.id)
      return (resp?.data || resp) as EnquiryDetail | null
    },
    enabled: !!detailItem?.id && detailOpen,
    staleTime: 30_000,
  })

  // --- Feedback Drawer ---
  const [feedbackDrawerOpen, setFeedbackDrawerOpen] = useState(false)
  const [feedbackDrawerItem, setFeedbackDrawerItem] = useState<CalendarItem | null>(null)

  function openFeedback(item: CalendarItem, _channel?: string) {
    setFeedbackDrawerItem(item)
    setFeedbackDrawerOpen(true)
  }

  const invalidateCalendar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
    queryClient.invalidateQueries({ queryKey: ["enquiry-calendar-summary"] })
    queryClient.invalidateQueries({ queryKey: ["dash"] })
    queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
    queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
    queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
  }, [queryClient])

  async function handleMarkCompleted(id: string, source?: string) {
    try {
      if (source === "generated_enquiry") {
        await enquiriesApi.updateStatus(id, { status: "COMPLETED" })
      } else {
        await crmApi.followUps.markCompleted(id)
      }
      invalidateCalendar()
      addToast({ title: "Marked completed", variant: "success" })
    } catch (err: unknown) {
      addToast({
        title: "Error",
        description: extractDetail(err) || "Failed",
        variant: "destructive",
      })
    }
  }

  // --- Reschedule ---
  const [reschedOpen, setReschedOpen] = useState<string | null>(null)
  const [reschedDate, setReschedDate] = useState("")
  const [reschedSaving, setReschedSaving] = useState(false)

  async function handleReschedule() {
    if (!reschedOpen || !reschedDate) return
    setReschedSaving(true)
    try {
      await enquiriesApi.reschedule(reschedOpen, { new_date: reschedDate })
      invalidateCalendar()
      addToast({ title: "Rescheduled", variant: "success" })
      setReschedOpen(null)
    } catch (err: unknown) {
      addToast({
        title: "Error",
        description: extractDetail(err) || "Failed to reschedule",
        variant: "destructive",
      })
    }
    setReschedSaving(false)
  }

  // --- Drag and Drop ---
  const [draggedItem, setDraggedItem] = useState<CalendarItem | null>(null)

  function handleDragStart(e: React.DragEvent, item: CalendarItem) {
    setDraggedItem(item)
    e.dataTransfer.setData("text/plain", item.id)
    e.dataTransfer.effectAllowed = "move"
  }

  async function handleDrop(e: React.DragEvent, targetDate: string) {
    e.preventDefault()
    if (!draggedItem || draggedItem.due_date === targetDate) {
      setDraggedItem(null)
      return
    }
    try {
      await enquiriesApi.reschedule(draggedItem.id, { new_date: targetDate })
      invalidateCalendar()
      addToast({
        title: `Moved to ${format(parseISO(targetDate), "dd MMM yyyy")}`,
        variant: "success",
      })
    } catch (err: unknown) {
      addToast({
        title: "Error",
        description: extractDetail(err) || "Failed to move",
        variant: "destructive",
      })
    }
    setDraggedItem(null)
  }

  // --- WhatsApp ---
  const [waOpen, setWaOpen] = useState<string | null>(null)
  const [waItem, setWaItem] = useState<CalendarItem | null>(null)
  const [waMessage, setWaMessage] = useState("")
  const [waLoading, setWaLoading] = useState(false)
  const [waTemplateError, setWaTemplateError] = useState("")
  const [waUnresolved, setWaUnresolved] = useState<string[]>([])

  function buildWhatsAppVars(item: CalendarItem): Record<string, string> {
    if (item.template_variables && Object.keys(item.template_variables).length > 0) {
      return item.template_variables
    }
    const isLead = item.enquiry_type === "LEAD_FOLLOW_UP"
    const vars: Record<string, string> = {
      hospital_name: item.hospital?.name || currentUser?.hospital_name || "our clinic",
      hospital_phone: item.hospital?.phone || currentUser?.hospital_phone || "",
      hospital_address: item.hospital?.address || "",
      clinic_name: item.hospital?.name || "",
      current_date: new Date().toISOString().slice(0, 10),
      current_time: new Date().toTimeString().slice(0, 5),
    }
    if (isLead) {
      vars.lead_name = item.lead?.name || ""
      vars.lead_phone = item.lead?.mobile || ""
      vars.lead_source = item.lead?.source || ""
      vars.lead_status = item.lead?.status || ""
      vars.interested_treatment = item.lead?.interested_treatment || ""
      vars.treatment_name = item.lead?.interested_treatment || ""
      vars.assigned_staff = item.lead?.assigned_staff || item.assigned_staff?.name || ""
      vars.assigned_staff_name = item.lead?.assigned_staff || item.assigned_staff?.name || ""
      vars.preferred_branch = ""
      vars.preferred_time = ""
      vars.website = ""
    } else {
      vars.patient_name = item.patient?.name || item.patient_name || ""
      vars.patient_phone = item.patient?.phone || item.patient_phone || ""
      vars.doctor_name =
        item.doctor?.name || item.doctor_name || item.appointment?.doctor_name || ""
      vars.doctor_specialization = item.doctor?.specialization || ""
      vars.op_number = item.patient?.op_number || item.op_number || ""
      vars.treatment_name = item.treatment?.treatment_name || item.treatment_name || ""
      vars.treatment_type = item.treatment?.treatment_type || item.treatment_type || ""
      vars.treatment_status = item.treatment?.status || ""
      vars.visit_number = String(item.treatment?.current_visit || item.visit_number || "")
      vars.remaining_visits = String(item.treatment?.remaining_visits || "")
      vars.total_visits = String(item.treatment?.total_visits || "")
      vars.appointment_date = item.appointment?.date || item.appointment_date || ""
      vars.appointment_time = item.appointment?.time || ""
      vars.appointment_type = item.appointment?.appointment_type || ""
      vars.case_name = item.case?.case_number || ""
      vars.case_completion_date = ""
      vars.completed_treatments = ""
      vars.next_recall_date = item.recurrence ? item.due_date || "" : ""
      vars.recall_interval = ""
      vars.follow_up_date = item.due_date || ""
      vars.followup_date = item.due_date || ""
      vars.staff_name = item.assigned_staff?.name || item.doctor?.name || ""
    }
    return vars
  }

  async function openWhatsApp(item: CalendarItem) {
    const phone =
      item.enquiry_type === "LEAD_FOLLOW_UP"
        ? item.lead?.mobile
        : item.patient_phone || item.patient?.phone
    if (!phone) {
      addToast({ title: "Mobile number is not available.", variant: "destructive" })
      return
    }
    setWaItem(item)
    setWaOpen(item.id)
    setWaTemplateError("")
    setWaUnresolved([])
    setWaLoading(true)

    const applyPreview = (message: string, unresolved: string[]) => {
      setWaMessage(message)
      setWaUnresolved(unresolved)
      if (unresolved.length > 0) {
        setWaTemplateError(
          `Some values are missing: ${unresolved.join(", ")}. Sending is blocked until they are filled.`,
        )
      }
    }

    try {
      const resp = await enquiriesApi.whatsappPreview(item.id)
      if (resp?.rendered_message) {
        applyPreview(resp.rendered_message, resp.unresolved_variables || [])
      } else {
        throw new Error("no rendered_message")
      }
    } catch {
      try {
        const templates = await whatsappTemplatesApi.list({ hospital_id: currentUser?.hospital_id })
        const list: WhatsAppTemplate[] = Array.isArray(templates)
          ? templates
          : (templates as { items?: WhatsAppTemplate[]; data?: WhatsAppTemplate[] })?.items || []
        const template = list.find(
          (t) => t.is_active !== false && t.enquiry_type === item.enquiry_type && t.message,
        )
        if (template?.message) {
          const { message, unresolved } = renderTemplateLocal(template.message, buildWhatsAppVars(item))
          applyPreview(message, unresolved)
        } else {
          const defaultMsg = getDefaultTemplate(item.enquiry_type)
          const { message, unresolved } = renderTemplateLocal(defaultMsg, buildWhatsAppVars(item))
          applyPreview(message, unresolved)
        }
      } catch {
        const defaultMsg = getDefaultTemplate(item.enquiry_type)
        const { message, unresolved } = renderTemplateLocal(defaultMsg, buildWhatsAppVars(item))
        applyPreview(message, unresolved)
      }
    }
    setWaLoading(false)
  }

  async function sendWhatsApp() {
    if (!waOpen || !waItem || !waMessage) return
    const rawTokens = waMessage.match(/\{\{(\w+)\}\}/g)
    if (rawTokens?.length) {
      setWaUnresolved(rawTokens.map((t) => t.replace(/\{\{|\}\}/g, "")))
      setWaTemplateError(
        `Unresolved variables: ${rawTokens.join(", ")}. Please replace them before sending.`,
      )
      return
    }
    const phone = (
      waItem.enquiry_type === "LEAD_FOLLOW_UP"
        ? waItem.lead?.mobile || ""
        : waItem.patient_phone || waItem.patient?.phone || ""
    ).replace(/[^0-9]/g, "")
    if (!phone) {
      addToast({ title: "Mobile number is not available.", variant: "destructive" })
      return
    }

    // Re-validate against live data so no blank/empty substitutions are ever sent.
    let finalMessage = waMessage
    try {
      const check = await enquiriesApi.whatsappPreview(waOpen, { template_message: waMessage })
      if (check?.rendered_message) {
        const unresolved = check.unresolved_variables || []
        if (unresolved.length > 0) {
          setWaUnresolved(unresolved)
          setWaTemplateError(
            `Some values are missing: ${unresolved.join(", ")}. Sending is blocked until they are filled.`,
          )
          return
        }
        finalMessage = check.rendered_message
      }
    } catch {
      /* keep the text as typed when the preview service is unavailable */
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(finalMessage)}`, "_blank")
    try {
      if (waItem.source === "generated_enquiry") {
        await enquiriesApi.updateStatus(waOpen, { status: "CONTACTED" })
      } else {
        await crmApi.followUps.update(waOpen, {
          status: "CONTACTED",
          contact_channel: "WHATSAPP",
          whatsapp_message: finalMessage,
        })
      }
      invalidateCalendar()
    } catch {
      /* ignore */
    }
    setWaOpen(null)
    setWaMessage("")
    setWaTemplateError("")
    setWaUnresolved([])
  }

  function handleCall(item: CalendarItem) {
    const phone =
      item.patient_phone || item.lead?.mobile || item.patient?.phone || (item as { display_phone?: string }).display_phone
    if (!phone) {
      addToast({ title: "No phone number available", variant: "destructive" })
      return
    }
    window.location.href = `tel:${phone}`
    if (item.source !== "generated_enquiry") {
      crmApi.followUps
        .update(item.id, { status: "CONTACTED", contact_channel: "CALL" })
        .then(() => invalidateCalendar())
        .catch((err: unknown) => addToast({ title: "Could not mark as contacted", description: extractDetail(err), variant: "destructive" }))
    }
  }

  // --- Timeline ---
  const [timelineOpen, setTimelineOpen] = useState<string | null>(null)
  const [timelineItem, setTimelineItem] = useState<CalendarItem | null>(null)
  const isLeadTimeline = timelineItem?.enquiry_type === "LEAD_FOLLOW_UP"
  // Use rich PatientTimeline from detail endpoint for both lead and patient enquiries
  // Falls back to FollowUp-only history if detail not loaded yet
  const { data: timelineData } = useQuery({
    queryKey: ["patient-timeline", timelineItem?.patient_id],
    queryFn: () => crmApi.patientFollowUpHistory(timelineItem!.patient_id!),
    enabled: !!timelineItem?.patient_id && !isLeadTimeline && !detailData?.timeline,
  })

  const timelineEntries: TimelineEntry[] = detailData?.timeline ?? (Array.isArray(timelineData) ? timelineData : [])
  // --- Navigation ---
  const navToday = useCallback(() => setSelectedDate(format(new Date(), "yyyy-MM-dd")), [])
  const handleNav = useCallback(
    (d: -1 | 1) => {
      setSelectedDate((prev) => {
        const p = parseISO(prev)
        if (viewMode === "day") return format(d > 0 ? addDays(p, 1) : subDays(p, 1), "yyyy-MM-dd")
        if (viewMode === "week" || viewMode === "agenda")
          return format(d > 0 ? addWeeks(p, 1) : subWeeks(p, 1), "yyyy-MM-dd")
        return format(d > 0 ? addMonths(p, 1) : subMonths(p, 1), "yyyy-MM-dd")
      })
    },
    [viewMode],
  )
  function handleDayClick(dateStr: string) {
    setSelectedDate(dateStr)
    setViewMode("day")
  }

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return
      if (e.key === "ArrowLeft") handleNav(-1)
      else if (e.key === "ArrowRight") handleNav(1)
      else if (e.key === "t" || e.key === "T") navToday()
      else if (e.key === "1") setViewMode("day")
      else if (e.key === "2") setViewMode("week")
      else if (e.key === "3") setViewMode("month")
      else if (e.key === "4") setViewMode("agenda")
      else if (e.key === "f" || e.key === "F") setShowFilters((p) => !p)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [viewMode, handleNav, navToday])

  // --- Calendar grid ---
  const calStart = startOfMonth(selDate)
  const calEnd = endOfMonth(selDate)

  const dayItems = useMemo(
    () => searchedItems.filter((i) => i.due_date === selectedDate),
    [searchedItems, selectedDate],
  )

  const overdueCount = useMemo(
    () => searchedItems.filter((i) => isOverdue(i.due_date || "", i.status || "")).length,
    [searchedItems],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Enquiry Calendar"
        description="Enterprise CRM action center — manage all enquiries from one screen"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={navToday}>
              <ChevronsLeft className="h-4 w-4 mr-1" />
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleNav(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[160px] text-center">
              {viewMode === "day"
                ? format(selDate, "dd MMM yyyy")
                : viewMode === "week" || viewMode === "agenda"
                  ? `${format(startOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM")} - ${format(endOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM yyyy")}`
                  : format(selDate, "MMMM yyyy")}
            </span>
            <Button variant="outline" size="sm" onClick={() => handleNav(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="flex border rounded-md ml-2">
              {(["day", "week", "month", "agenda"] as const).map((v, idx) => (
                <Button
                  key={v}
                  variant={viewMode === v ? "default" : "ghost"}
                  size="sm"
                  className={`${idx === 0 ? "rounded-r-none" : idx === 3 ? "rounded-l-none" : "rounded-none"} text-xs h-8`}
                  onClick={() => setViewMode(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                  <span className="ml-1 text-[9px] text-muted-foreground">({idx + 1})</span>
                </Button>
              ))}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-8 w-8"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className={`h-4 w-4 ${showFilters ? "text-primary" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle Filters (F)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="py-2 px-3">
          <div className="text-lg font-bold">{summary?.total ?? totalCount}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </Card>
        <Card className="py-2 px-3 bg-amber-50 border-amber-200">
          <div className="text-lg font-bold text-amber-700">
            {summary?.pending ??
              dayItems.filter((i) => ["PENDING", "NEW"].includes(i.status || "")).length}
          </div>
          <div className="text-xs text-amber-600">Pending</div>
        </Card>
        <Card className="py-2 px-3 bg-red-50 border-red-200">
          <div className="text-lg font-bold text-red-700">{summary?.overdue ?? overdueCount}</div>
          <div className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Overdue
          </div>
        </Card>
        <Card className="py-2 px-3 bg-blue-50 border-blue-200">
          <div className="text-lg font-bold text-blue-700">{summary?.due_today ?? 0}</div>
          <div className="text-xs text-blue-600 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Today
          </div>
        </Card>
        <Card className="py-2 px-3 bg-[var(--ds-primary-50)] border-[var(--ds-primary-200)]">
          <div className="text-lg font-bold text-[var(--ds-primary-700)]">{summary?.due_tomorrow ?? 0}</div>
          <div className="text-xs text-[var(--ds-primary-600)]">Tomorrow</div>
        </Card>
        <Card className="py-2 px-3 bg-[var(--ds-accent-50)] border-[var(--ds-accent-200)]">
          <div className="text-lg font-bold text-[var(--ds-accent-700)]">{summary?.due_this_week ?? 0}</div>
          <div className="text-xs text-[var(--ds-accent-600)]">This Week</div>
        </Card>
      </div>

      {/* Filters Bar */}
      {showFilters && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient, OP number, phone, treatment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === " " ? "" : v)}>
              <SelectTrigger className="w-[150px] h-9 text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CONTACTED">Contacted</SelectItem>
                <SelectItem value="INTERESTED">Interested</SelectItem>
                <SelectItem value="APPOINTMENT_REQUIRED">Appointment Required</SelectItem>
                <SelectItem value="APPOINTMENT_BOOKED">Appointment Booked</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="NO_RESPONSE">No Response</SelectItem>
                <SelectItem value="LOST">Lost</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v === " " ? "" : v)}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Types</SelectItem>
                <SelectItem value="LEAD_FOLLOW_UP">Lead Follow-Up</SelectItem>
                <SelectItem value="APPOINTMENT_REMINDER">Appointment Reminder</SelectItem>
                <SelectItem value="OPD_FOLLOW_UP">OPD Follow-Up</SelectItem>
                <SelectItem value="TREATMENT_WELLNESS">Treatment Wellness</SelectItem>
                <SelectItem value="CASE_WELLNESS">Case Wellness</SelectItem>
                <SelectItem value="RECALL">Recall</SelectItem>
                <SelectItem value="MISSED_APPOINTMENT">Missed Appointment</SelectItem>
                <SelectItem value="1_DAY_FOLLOW_UP">1-Day Follow-Up</SelectItem>
                <SelectItem value="7_DAY_FOLLOW_UP">7-Day Follow-Up</SelectItem>
                <SelectItem value="6_MONTH_RECALL">6-Month Recall</SelectItem>
                <SelectItem value="12_MONTH_RECALL">12-Month Recall</SelectItem>
              </SelectContent>
            </Select>
            <Select value={doctorFilter} onValueChange={(v) => setDoctorFilter(v === " " ? "" : v)}>
              <SelectTrigger className="w-[160px] h-9 text-sm">
                <SelectValue placeholder="All Doctors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Doctors</SelectItem>
                {doctorsList.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.full_name || doc.name || doc.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v === " " ? "" : v)}
            >
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue placeholder="All Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Priority</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            {(statusFilter ||
              typeFilter ||
              doctorFilter ||
              priorityFilter ||
              searchQuery ||
              includeTerminal) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setStatusFilter("")
                  setTypeFilter("")
                  setDoctorFilter("")
                  setPriorityFilter("")
                  setSearchQuery("")
                  setIncludeTerminal(false)
                }}
              >
                <X className="h-3 w-3 mr-1" /> Clear All
              </Button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTerminal}
                  onChange={(e) => setIncludeTerminal(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--ds-border-strong)]"
                />
                Include Completed/Cancelled
              </label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Keyboard className="h-3 w-3" />
                <span>Keys: 1-4 views | T today | F filter | ←→ navigate</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Day View */}
      {viewMode === "day" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {format(selDate, "EEEE, dd MMMM yyyy")}
                <Badge variant="outline" className="ml-2 text-xs">
                  {filteredItems.length} items
                </Badge>
              </CardTitle>
              {!showFilters && (
                <div className="relative flex-1 max-w-xs ml-4">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Quick search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isFetching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No items for {format(selDate, "dd MMM yyyy")}</p>
                <p className="text-xs mt-1">Try changing the date or filters</p>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-[var(--ds-surface)] z-[var(--ds-z-sticky)]">
                    <TableRow>
                      <TableHead className="w-2" />
                      <TableHead className="whitespace-nowrap">Patient / Description</TableHead>
                      <TableHead className="whitespace-nowrap">OP No.</TableHead>
                      <TableHead className="whitespace-nowrap">Doctor</TableHead>
                      <TableHead className="whitespace-nowrap">Hospital</TableHead>
                      <TableHead className="whitespace-nowrap">Type</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap sticky right-0 bg-[var(--ds-surface)] z-[var(--ds-z-sticky)]">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const tc = getTypeColor(item.enquiry_type || item.follow_up_type || "")
                      const od = isOverdue(item.due_date || "", item.status || "")
                      const desc = item.description
                      const patName =
                        item.display_name || item.patient?.name || item.patient_name || "-"
                      const docName = item.doctor?.name || item.doctor_name
                      const docSpec = item.doctor?.specialization
                      const hospName = item.hospital?.name
                      const treatmentLabel = item.treatment?.treatment_name || item.treatment_name
                      return (
                        <TableRow
                          key={`${item.source}-${item.id}`}
                          className={`cursor-pointer hover:bg-muted/50 ${od ? "bg-red-50/40" : ""}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item)}
                          onClick={() => {
                            setDetailItem(item)
                            setDetailOpen(true)
                          }}
                        >
                          <TableCell className="w-2 p-0">
                            <div className={`w-1.5 h-10 rounded-full ${tc.dot}`} />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm whitespace-nowrap">{patName}</div>
                            {item.enquiry_type === "APPOINTMENT_REMINDER" && item.appointment && (
                              <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                                {treatmentLabel && <>{treatmentLabel} · </>}
                                {item.treatment?.current_visit && (
                                  <>
                                    Visit {item.treatment.current_visit + 1}/
                                    {item.treatment.total_visits} ·{" "}
                                  </>
                                )}
                                {item.appointment.time && <>{item.appointment.time}</>}
                              </div>
                            )}
                            {item.enquiry_type === "TREATMENT_WELLNESS" && (
                              <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                                {treatmentLabel && <>{treatmentLabel}</>}
                                {item.treatment?.status && <> · {item.treatment.status}</>}
                                {item.treatment?.completion_date && (
                                  <> · {item.treatment.completion_date}</>
                                )}
                              </div>
                            )}
                            {(item.enquiry_type === "CASE_WELLNESS" ||
                              item.enquiry_type === "RECALL") &&
                              item.case && (
                                <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                                  {item.case.case_number && <>{item.case.case_number}</>}
                                  {desc && <> · {desc}</>}
                                </div>
                              )}
                            {![
                              "APPOINTMENT_REMINDER",
                              "TREATMENT_WELLNESS",
                              "CASE_WELLNESS",
                              "RECALL",
                            ].includes(item.enquiry_type || "") &&
                              desc && (
                                <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                                  {desc}
                                </div>
                              )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {item.patient?.op_number || item.op_number || "—"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {docName ? (
                              <span>
                                Dr. {docName}
                                {docSpec && (
                                  <span className="text-muted-foreground ml-1">({docSpec})</span>
                                )}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {hospName || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${tc.bg} ${tc.text} ${tc.border}`}
                            >
                              {ENQUIRY_TYPE_LABELS[item.enquiry_type || ""] ||
                                item.enquiry_type ||
                                item.follow_up_type ||
                                "—"}
                            </Badge>
                            {item.enquiry_type === "LEAD_FOLLOW_UP" && item.occurrence_number && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 ml-1"
                              >
                                {item.total_attempts
                                  ? `Attempt ${item.occurrence_number} of ${item.total_attempts}`
                                  : `Attempt #${item.occurrence_number}`}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge
                                className={`text-[10px] ${STATUS_COLORS[item.status || ""] || "bg-[var(--ds-background-subtle)]"}`}
                              >
                                {od && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                                {item.status || "—"}
                              </Badge>
                              {item.priority === "HIGH" && (
                                <Badge className="text-[9px] bg-red-100 text-red-700">HIGH</Badge>
                              )}
                              {treatmentLabel && (
                                <span className="text-[9px] text-muted-foreground truncate max-w-[80px] hidden lg:inline">
                                  {treatmentLabel}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-[var(--ds-surface)] z-[var(--ds-z-sticky)]">
                            <TooltipProvider>
                              <div
                                className="flex items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-7 w-7"
                                      onClick={() => handleCall(item)}
                                    >
                                      <Phone className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Call</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-7 w-7"
                                      onClick={() => openWhatsApp(item)}
                                    >
                                      <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>WhatsApp</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-7 w-7"
                                      onClick={() => openFeedback(item)}
                                    >
                                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Feedback</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        setReschedOpen(item.id)
                                        setReschedDate(item.due_date || selectedDate)
                                      }}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reschedule</TooltipContent>
                                </Tooltip>
                                {item.status !== "COMPLETED" &&
                                  item.status !== "LOST" &&
                                  item.status !== "CANCELLED" && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          className="h-7 w-7"
                                          onClick={() => handleMarkCompleted(item.id, item.source)}
                                        >
                                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Complete</TooltipContent>
                                    </Tooltip>
                                  )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        setTimelineItem(item)
                                        setTimelineOpen(item.id)
                                      }}
                                    >
                                      <History className="h-3.5 w-3.5 text-[var(--ds-text-secondary)]" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Timeline</TooltipContent>
                                </Tooltip>
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Week View */}
      {viewMode === "week" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Week View — click a day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px rounded-lg border bg-[var(--ds-background-subtle)] overflow-hidden">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div
                  key={d}
                  className="bg-[var(--ds-surface)] p-2 text-center text-xs font-semibold text-[var(--ds-text-secondary)]"
                >
                  {d}
                </div>
              ))}
              {(() => {
                const weekStart = startOfWeek(selDate, { weekStartsOn: 1 })
                const cells: React.ReactNode[] = []
                for (let i = 0; i < 7; i++) {
                  const day = addDays(weekStart, i)
                  const dateStr = format(day, "yyyy-MM-dd")
                  const dayItemsAll = searchedItems.filter((item) => item.due_date === dateStr)
                  const todayCheck = isToday(day)
                  cells.push(
                    <div
                      key={dateStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      onClick={() => handleDayClick(dateStr)}
                      className={`min-h-[100px] bg-[var(--ds-surface)] p-2 cursor-pointer hover:bg-blue-50 transition-colors
                        ${todayCheck ? "ring-2 ring-inset ring-blue-400" : ""}`}
                    >
                      <div
                        className={`text-xs font-bold mb-1 ${todayCheck ? "text-blue-600" : "text-[var(--ds-text-secondary)]"}`}
                      >
                        {format(day, "dd MMM")}
                      </div>
                      <div className="space-y-0.5">
                        {dayItemsAll.slice(0, 4).map((item) => {
                          const tc = getTypeColor(item.enquiry_type || "")
                          return (
                            <div
                              key={item.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${tc.bg} ${tc.text} truncate border ${tc.border}`}
                            >
                              {item.display_name || item.patient_name || "-"}
                            </div>
                          )
                        })}
                        {dayItemsAll.length > 4 && (
                          <div className="text-[9px] text-[var(--ds-text-tertiary)]">
                            +{dayItemsAll.length - 4} more
                          </div>
                        )}
                      </div>
                    </div>,
                  )
                }
                return cells
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month View */}
      {viewMode === "month" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{format(selDate, "MMMM yyyy")} — click a day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px rounded-lg border bg-[var(--ds-background-subtle)] overflow-hidden">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="bg-[var(--ds-surface)] p-2 text-center text-xs font-semibold text-[var(--ds-text-secondary)]"
                >
                  {d}
                </div>
              ))}
              {(() => {
                const startDay = calStart.getDay(),
                  daysInMonth = calEnd.getDate()
                const cells: React.ReactNode[] = []
                for (let i = 0; i < startDay; i++)
                  cells.push(<div key={`e-${i}`} className="bg-[var(--ds-background-subtle)] p-2" />)
                for (let d = 1; d <= daysInMonth; d++) {
                  const dateStr = `${format(selDate, "yyyy-MM")}-${String(d).padStart(2, "0")}`
                  const dayItemsAll = searchedItems.filter((item) => item.due_date === dateStr)
                  const todayCheck = dateStr === format(today, "yyyy-MM-dd")
                  const isSelected = dateStr === selectedDate
                  cells.push(
                    <div
                      key={dateStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      onClick={() => handleDayClick(dateStr)}
                      className={`min-h-[55px] bg-[var(--ds-surface)] p-1.5 cursor-pointer hover:bg-blue-50 transition-colors
                        ${todayCheck ? "ring-2 ring-inset ring-blue-400" : ""}
                        ${isSelected ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""}`}
                    >
                      <div
                        className={`text-xs font-bold ${todayCheck ? "text-blue-600" : isSelected ? "text-blue-700" : "text-[var(--ds-text-secondary)]"}`}
                      >
                        {d}
                      </div>
                      <div className="text-[9px] mt-0.5 leading-tight">
                        {dayItemsAll.slice(0, 3).map((item) => {
                          const tc = getTypeColor(item.enquiry_type || "")
                          return (
                            <div key={item.id} className={`truncate ${tc.text}`}>
                              {item.display_name || item.patient_name || "-"}
                            </div>
                          )
                        })}
                        {dayItemsAll.length > 3 && (
                          <div className="text-[var(--ds-text-tertiary)]">+{dayItemsAll.length - 3}</div>
                        )}
                      </div>
                    </div>,
                  )
                }
                return cells
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agenda View */}
      {viewMode === "agenda" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Agenda — {format(startOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM")} to{" "}
              {format(endOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM yyyy")}
              <Badge variant="outline" className="ml-2 text-xs">
                {filteredItems.length} items
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isFetching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No items for this week
              </div>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                {(() => {
                  const grouped: Record<string, CalendarItem[]> = {}
                  for (const item of filteredItems) {
                    const key = item.due_date || "unknown"
                    if (!grouped[key]) grouped[key] = []
                    grouped[key].push(item)
                  }
                  const sortedDates = Object.keys(grouped).sort()
                  return sortedDates.map((dateStr) => {
                    const dateItems = grouped[dateStr]
                    const dayDate = parseISO(dateStr)
                    const todayCheck = isToday(dayDate)
                    return (
                      <div
                        key={dateStr}
                        className="border-b last:border-b-0"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, dateStr)}
                      >
                        <div
                          className={`px-4 py-2 sticky top-0 z-[var(--ds-z-sticky)] flex items-center gap-2 ${todayCheck ? "bg-blue-50" : "bg-[var(--ds-background-subtle)]"}`}
                        >
                          {todayCheck && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                          <span
                            className={`text-sm font-semibold ${todayCheck ? "text-blue-700" : "text-[var(--ds-text-secondary)]"}`}
                          >
                            {format(dayDate, "EEEE, dd MMM yyyy")}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {dateItems.length}
                          </Badge>
                        </div>
                        {dateItems.map((item) => {
                          const tc = getTypeColor(item.enquiry_type || "")
                          const od = isOverdue(item.due_date || "", item.status || "")
                          return (
                            <div
                              key={`${item.source}-${item.id}`}
                              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer border-l-4 ${tc.border} ${od ? "bg-red-50/30" : ""}`}
                              draggable
                              onDragStart={(e) => handleDragStart(e, item)}
                              onClick={() => {
                                setDetailItem(item)
                                setDetailOpen(true)
                              }}
                            >
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tc.dot}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">
                                    {item.display_name || item.patient_name || "-"}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] ${tc.bg} ${tc.text} ${tc.border}`}
                                  >
                                    {ENQUIRY_TYPE_LABELS[item.enquiry_type || ""] ||
                                      item.enquiry_type ||
                                      "—"}
                                  </Badge>
                                  <Badge
                                    className={`text-[9px] ${STATUS_COLORS[item.status || ""] || ""}`}
                                  >
                                    {od && <AlertTriangle className="h-2 w-2 mr-0.5" />}
                                    {item.status}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.op_number && `OP: ${item.op_number}`}
                                  {item.doctor_name && ` · Dr. ${item.doctor_name}`}
                                  {item.treatment_name && ` · ${item.treatment_name}`}
                                </div>
                                {item.enquiry_type === "APPOINTMENT_REMINDER" &&
                                  item.appointment?.time && (
                                    <div className="text-xs font-medium text-blue-600">
                                      {item.appointment.time}
                                    </div>
                                  )}
                                {item.enquiry_type === "TREATMENT_WELLNESS" &&
                                  item.treatment?.status && (
                                    <div className="text-xs text-muted-foreground">
                                      {item.treatment.status.replace("_", " ")}
                                    </div>
                                  )}
                                {(item.enquiry_type === "CASE_WELLNESS" ||
                                  item.enquiry_type === "RECALL") &&
                                  item.completed_treatments &&
                                  item.completed_treatments.length > 0 && (
                                    <div className="text-xs text-muted-foreground truncate">
                                      {item.completed_treatments
                                        .slice(0, 3)
                                        .map((ct: { treatment_name?: string }) => ct.treatment_name)
                                        .join(" · ")}
                                      {item.completed_treatments.length > 3 &&
                                        ` +${item.completed_treatments.length - 3}`}
                                    </div>
                                  )}
                              </div>
                              <div
                                className="flex items-center gap-0.5 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="h-6 w-6"
                                        onClick={() => handleCall(item)}
                                      >
                                        <Phone className="h-3 w-3 text-green-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Call</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="h-6 w-6"
                                        onClick={() => openWhatsApp(item)}
                                      >
                                        <MessageCircle className="h-3 w-3 text-green-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>WhatsApp</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="h-6 w-6"
                                        onClick={() => openFeedback(item)}
                                      >
                                        <FileText className="h-3 w-3 text-blue-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Feedback</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detail Drawer (Sheet) — Premium EnquiryDetailSheet */}
      <EnquiryDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        enquiryId={detailItem?.id || null}
        onCall={(item) => {
          setDetailOpen(false)
          handleCall(item)
        }}
        onWhatsApp={(item) => {
          setDetailOpen(false)
          openWhatsApp(item)
        }}
        onFeedback={(item) => {
          setDetailOpen(false)
          openFeedback(item)
        }}
        onReschedule={(id, date) => {
          setReschedOpen(id)
          setReschedDate(date)
          setDetailOpen(false)
        }}
        onComplete={(id, source) => {
          handleMarkCompleted(id, source)
          setDetailOpen(false)
        }}
        onTimeline={(item) => {
          setTimelineItem(item)
          setTimelineOpen(item.id)
          setDetailOpen(false)
        }}
        calendarItem={detailItem}
      />

      {/* Feedback Drawer (context-aware Lead/Patient) */}
      <FeedbackDrawer
        open={feedbackDrawerOpen}
        onOpenChange={setFeedbackDrawerOpen}
        enquiry={feedbackDrawerItem}
        onSaved={() => {
          invalidateCalendar()
        }}
      />

      {/* WhatsApp Dialog */}
      <Dialog
        open={!!waOpen}
        onOpenChange={(o) => {
          if (!o) {
            setWaOpen(null)
            setWaMessage("")
            setWaTemplateError("")
            setWaUnresolved([])
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Send WhatsApp to{" "}
              {waItem?.enquiry_type === "LEAD_FOLLOW_UP"
                ? waItem?.lead?.name || "Lead"
                : waItem?.patient_name || ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              To: <strong>{waItem?.patient_phone || waItem?.lead?.mobile || ""}</strong>
            </div>
            <div className="space-y-2">
              <Label>Message Preview</Label>
              {waLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading template...
                </div>
              ) : (
                <Textarea
                  value={waMessage}
                  onChange={(e) => {
                    setWaMessage(e.target.value)
                    if (waTemplateError) {
                      setWaTemplateError("")
                      setWaUnresolved([])
                    }
                  }}
                  rows={8}
                  className="text-sm font-mono"
                />
              )}
            </div>
            {waTemplateError && (
              <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">
                {waTemplateError}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!waItem) return
                  setWaLoading(true)
                  setWaTemplateError("")
                  setWaUnresolved([])
                  try {
                    const r = await enquiriesApi.whatsappPreview(waItem.id)
                    if (r?.rendered_message) {
                      setWaMessage(r.rendered_message)
                      const unresolved = r.unresolved_variables || []
                      setWaUnresolved(unresolved)
                      if (unresolved.length > 0) {
                        setWaTemplateError(
                          `Some values are missing: ${unresolved.join(", ")}. Sending is blocked until they are filled.`,
                        )
                      }
                    }
                  } catch (e) {
                    console.error("Preview failed", e)
                  }
                  setWaLoading(false)
                }}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Refresh
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setWaOpen(null)
                  setWaMessage("")
                  setWaTemplateError("")
                  setWaUnresolved([])
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={sendWhatsApp}
                disabled={!waMessage || waLoading || waUnresolved.length > 0}
              >
                <MessageCircle className="h-4 w-4 mr-2" /> Open WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog
        open={!!reschedOpen}
        onOpenChange={(o) => {
          if (!o) setReschedOpen(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule Enquiry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                New Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={reschedDate}
                onChange={(e) => setReschedDate(e.target.value)}
                min={format(today, "yyyy-MM-dd")}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleReschedule}
              disabled={!reschedDate || reschedSaving}
            >
              {reschedSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reschedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timeline Dialog */}
      <Dialog
        open={!!timelineOpen}
        onOpenChange={(o) => {
          if (!o) {
            setTimelineOpen(null)
            setTimelineItem(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {timelineItem?.enquiry_type === "LEAD_FOLLOW_UP"
                ? "Lead Timeline"
                : "Patient Timeline"}
              {timelineItem?.enquiry_type === "LEAD_FOLLOW_UP"
                ? ` — ${timelineItem?.lead?.name || ""}`
                : ` — ${timelineItem?.patient_name || ""}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-1">
            {timelineEntries.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No timeline entries found.
              </div>
            ) : (
              timelineEntries.map((entry: TimelineEntry, idx: number) => (
                <div key={entry.id || idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                    {idx < timelineEntries.length - 1 && (
                      <div className="w-px flex-1 bg-[var(--ds-surface-secondary)]" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="text-xs text-muted-foreground">
                      {entry.created_at
                        ? format(new Date(entry.created_at), "dd MMM yyyy HH:mm")
                        : ""}
                    </div>
                    <div className="text-sm font-medium">
                      {entry.action ||
                        entry.status ||
                        entry.follow_up_type ||
                        entry.event_type ||
                        "Event"}
                    </div>
                    {(entry.notes ||
                      entry.patient_feedback ||
                      entry.response_summary ||
                      entry.description) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {entry.notes ||
                          entry.patient_feedback ||
                          entry.response_summary ||
                          entry.description}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
