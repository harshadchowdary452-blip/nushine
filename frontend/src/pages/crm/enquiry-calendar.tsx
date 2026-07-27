import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Phone, MessageCircle, CheckCircle, Loader2,
  Search, ChevronLeft, ChevronRight, ChevronsLeft, Calendar,
  FileText, History, RotateCcw, X, Clock, AlertTriangle, Users, Filter,
  ArrowUpDown, Keyboard,
} from "lucide-react"
import {
  format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths, isToday, isBefore, parseISO, startOfDay,
} from "date-fns"
import { enquiriesApi, crmApi, appointmentsApi, doctorsApi, whatsappTemplatesApi } from "@/services/endpoints"
import { extractDetail } from "@/types"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"


interface CalendarItem {
  id: string
  source?: string
  enquiry_type?: string
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
}

interface WhatsAppTemplate {
  id?: string
  name?: string
  message?: string
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

const ENQUIRY_TYPE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  LEAD_FOLLOW_UP: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  APPOINTMENT_REMINDER: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
  OPD_FOLLOW_UP: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
  TREATMENT_WELLNESS: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  CASE_WELLNESS: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", dot: "bg-teal-500" },
  RECALL: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
  MISSED_APPOINTMENT: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
  ENQUIRY: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-400" },
  "1_DAY_FOLLOW_UP": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  "7_DAY_FOLLOW_UP": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
  "6_MONTH_RECALL": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  "12_MONTH_RECALL": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  CUSTOM_FOLLOW_UP: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-500" },
  CRM_RULE: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", dot: "bg-cyan-500" },
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONTACTED: "bg-blue-100 text-blue-800",
  INTERESTED: "bg-emerald-100 text-emerald-800",
  APPOINTMENT_REQUIRED: "bg-purple-100 text-purple-800",
  APPOINTMENT_BOOKED: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-gray-100 text-gray-600",
  NO_RESPONSE: "bg-gray-100 text-gray-500",
  LOST: "bg-red-100 text-red-800",
  CANCELLED: "bg-dark-gray-100 text-gray-700",
  NEW: "bg-blue-100 text-blue-700",
  NOT_INTERESTED: "bg-gray-100 text-gray-500",
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

const responseStatusOptions = [
  { value: "INTERESTED", label: "Interested" },
  { value: "APPOINTMENT_REQUIRED", label: "Appointment Requested" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "NEEDS_MORE_TIME", label: "Needs Callback" },
  { value: "REQUESTED_CALLBACK", label: "Requested Callback" },
  { value: "BUSY", label: "Busy" },
  { value: "NO_RESPONSE", label: "No Response" },
  { value: "WRONG_NUMBER", label: "Wrong Number" },
  { value: "TREATMENT_COMPLETED", label: "Treatment Successful" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
]

const nextActionOptions = [
  { value: "CALL_AGAIN", label: "Call Again" },
  { value: "CREATE_FOLLOW_UP", label: "Create Follow-Up" },
  { value: "BOOK_APPOINTMENT", label: "Book Appointment" },
  { value: "CLOSE_ENQUIRY", label: "Close Enquiry" },
]

const timeSlots = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
]

const DEFAULT_ENQUIRY_TEMPLATE = `Hello {{patient_name}},

We hope you are doing well after your recent {{treatment_name}} at {{hospital_name}}.

We would like to know how you are feeling now.

• Are you recovering well?
• Are you experiencing any discomfort?
• Would you like to schedule a follow-up visit with Dr. {{doctor_name}} if required?

Please let us know. We are happy to assist you.

Thank you,
{{hospital_name}}`

function replaceTemplateVars(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "")
}

function getTypeColor(enquiryType: string) {
  return ENQUIRY_TYPE_COLORS[enquiryType] || ENQUIRY_TYPE_COLORS.ENQUIRY
}

function isOverdue(dueDate: string, status: string) {
  if (["COMPLETED", "APPOINTMENT_BOOKED", "LOST", "CONVERTED", "CANCELLED"].includes(status)) return false
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
  const calendarRef = useRef<HTMLDivElement>(null)

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
    return { start: format(startOfMonth(d), "yyyy-MM-dd"), end: format(endOfMonth(d), "yyyy-MM-dd") }
  }

  const dateRange = getRange()

  const { data: calData, isFetching } = useQuery({
    queryKey: ["enquiry-calendar", dateRange.start, dateRange.end, statusFilter, typeFilter, doctorFilter, priorityFilter, includeTerminal],
    queryFn: () => enquiriesApi.calendar({
      start_date: dateRange.start, end_date: dateRange.end,
      status: statusFilter || undefined, type: typeFilter || undefined,
      doctor_id: doctorFilter || undefined, priority: priorityFilter || undefined,
      include_terminal: includeTerminal || undefined,
    }),
  })

  const apiItems: CalendarItem[] = (calData?.items as CalendarItem[]) || (Array.isArray(calData) ? calData as CalendarItem[] : [])
  const totalCount: number = calData?.total || apiItems.length

  const searchedItems = useMemo(() => {
    if (!searchQuery) return apiItems
    const sl = searchQuery.toLowerCase()
    return apiItems.filter((i) =>
      (i.patient_name || "").toLowerCase().includes(sl) ||
      (i.op_number || "").toLowerCase().includes(sl) ||
      (i.treatment_name || "").toLowerCase().includes(sl) ||
      (i.patient_phone || "").toLowerCase().includes(sl))
  }, [apiItems, searchQuery])

  const filteredItems = useMemo(() => {
    if (viewMode === "day") return searchedItems.filter((i) => i.due_date === selectedDate)
    return searchedItems
  }, [searchedItems, selectedDate, viewMode])

  // --- Summary ---
  const { data: summary } = useQuery<CalendarSummary>({
    queryKey: ["enquiry-calendar-summary", dateRange.start, dateRange.end, includeTerminal],
    queryFn: () => enquiriesApi.calendarSummary({ start_date: dateRange.start, end_date: dateRange.end, include_terminal: includeTerminal || undefined }),
  })

  // --- Doctors ---
  const currentUser = (() => {
    try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "null") } catch { return null }
  })()
  const hospitalId = currentUser?.hospital_id

  const { data: doctors } = useQuery({
    queryKey: ["doctors-list", hospitalId],
    queryFn: () => doctorsApi.list(hospitalId ? { hospital_id: hospitalId, limit: 200 } : { limit: 200 }).then((r: unknown) => {
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

  // --- Feedback Dialog ---
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null)
  const [feedbackItem, setFeedbackItem] = useState<CalendarItem | null>(null)
  const [fbResponseStatus, setFbResponseStatus] = useState("")
  const [fbPatientFeedback, setFbPatientFeedback] = useState("")
  const [fbStaffNotes, setFbStaffNotes] = useState("")
  const [fbSummary, setFbSummary] = useState("")
  const [fbNextAction, setFbNextAction] = useState("")
  const [fbSaving, setFbSaving] = useState(false)
  const [fbInterested, setFbInterested] = useState("")
  const [fbApptOpen, setFbApptOpen] = useState(false)
  const [fbApptDoctorId, setFbApptDoctorId] = useState("")
  const [fbApptDate, setFbApptDate] = useState("")
  const [fbApptTime, setFbApptTime] = useState("")
  const [fbApptSaving, setFbApptSaving] = useState(false)

  const { data: fbSlots } = useQuery({
    queryKey: ["fb-appointment-slots", fbApptDoctorId, fbApptDate],
    queryFn: () => appointmentsApi.slots({ doctor_id: fbApptDoctorId, date: fbApptDate }),
    enabled: !!fbApptDoctorId && !!fbApptDate && fbApptOpen,
  })
  const fbSlotsList: string[] = Array.isArray(fbSlots) ? fbSlots : fbSlots?.slots ? fbSlots.slots : []

  function openFeedback(item: CalendarItem, _channel?: string) {
    setFeedbackItem(item)
    setFeedbackOpen(item.id)
    setFbResponseStatus(item.response_status || "")
    setFbPatientFeedback(item.feedback || "")
    setFbStaffNotes(item.staff_notes || "")
    setFbSummary(item.response || "")
    setFbNextAction(item.next_action || "")
    setFbInterested("")
    setFbApptOpen(false)
    setFbApptDoctorId(item.doctor_id || "")
    setFbApptDate("")
    setFbApptTime("")
  }

  function closeFeedback() {
    setFeedbackOpen(null); setFeedbackItem(null); setFbSaving(false); setFbApptOpen(false)
    setFbResponseStatus(""); setFbPatientFeedback(""); setFbStaffNotes(""); setFbSummary(""); setFbNextAction("")
    setFbInterested(""); setFbApptDoctorId(""); setFbApptDate(""); setFbApptTime(""); setFbApptSaving(false)
  }

  const invalidateCalendar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
    queryClient.invalidateQueries({ queryKey: ["enquiry-calendar-summary"] })
    queryClient.invalidateQueries({ queryKey: ["dash"] })
    queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
  }, [queryClient])

  async function handleRecordFeedback() {
    if (!feedbackOpen || !fbResponseStatus) return
    setFbSaving(true)
    try {
      let status = "PENDING"
      if (["NO_RESPONSE", "BUSY", "WRONG_NUMBER"].includes(fbResponseStatus)) status = "NO_RESPONSE"
      else if (fbResponseStatus === "NOT_INTERESTED") status = "LOST"
      else if (["INTERESTED", "APPOINTMENT_REQUIRED", "NEEDS_MORE_TIME", "REQUESTED_CALLBACK", "NEEDS_REVIEW"].includes(fbResponseStatus)) status = "CONTACTED"
      else if (fbResponseStatus === "TREATMENT_COMPLETED") status = "COMPLETED"

      if (feedbackItem?.source === "generated_enquiry") {
        await enquiriesApi.updateStatus(feedbackOpen, { status })
      } else {
        await crmApi.followUps.update(feedbackOpen, {
          status, response_status: fbResponseStatus,
          patient_feedback: fbPatientFeedback || undefined,
          staff_notes: fbStaffNotes || undefined,
          response_summary: fbSummary || undefined,
          next_action: fbNextAction || undefined,
          interested_to_visit_again: fbInterested || undefined,
        })
      }
      invalidateCalendar()
      addToast({ title: "Feedback saved", variant: "success" })
      closeFeedback()
    } catch (err: unknown) {
      addToast({ title: "Error", description: extractDetail(err) || "Failed to save feedback", variant: "destructive" })
    }
    setFbSaving(false)
  }

  async function handleFbBookAppointment() {
    if (!feedbackItem || !feedbackOpen || !fbApptDoctorId || !fbApptDate || !fbApptTime) return
    setFbApptSaving(true)
    try {
      const resp = await appointmentsApi.create({
        patient_id: feedbackItem.patient_id,
        doctor_id: fbApptDoctorId,
        appointment_date: fbApptDate,
        appointment_time: fbApptTime,
        appointment_type: "FOLLOW_UP",
        notes: "Created from enquiry calendar feedback",
      })
      if (feedbackItem.source === "generated_enquiry") {
        await enquiriesApi.updateStatus(feedbackOpen, { status: "COMPLETED" })
      } else {
        await crmApi.followUps.update(feedbackOpen, {
          status: "APPOINTMENT_BOOKED",
          appointment_id: resp.id || resp.appointment_id,
        })
      }
      invalidateCalendar()
      addToast({ title: "Appointment created & feedback saved", variant: "success" })
      closeFeedback()
    } catch (err: unknown) {
      addToast({ title: "Error", description: extractDetail(err) || "Booking failed", variant: "destructive" })
    }
    setFbApptSaving(false)
  }

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
      addToast({ title: "Error", description: extractDetail(err) || "Failed", variant: "destructive" })
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
      addToast({ title: "Error", description: extractDetail(err) || "Failed to reschedule", variant: "destructive" })
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
    if (!draggedItem || draggedItem.due_date === targetDate) { setDraggedItem(null); return }
    try {
      await enquiriesApi.reschedule(draggedItem.id, { new_date: targetDate })
      invalidateCalendar()
      addToast({ title: `Moved to ${format(parseISO(targetDate), "dd MMM yyyy")}`, variant: "success" })
    } catch (err: unknown) {
      addToast({ title: "Error", description: extractDetail(err) || "Failed to move", variant: "destructive" })
    }
    setDraggedItem(null)
  }

  // --- WhatsApp ---
  const [waOpen, setWaOpen] = useState<string | null>(null)
  const [waItem, setWaItem] = useState<CalendarItem | null>(null)
  const [waMessage, setWaMessage] = useState("")
  const [waLoading, setWaLoading] = useState(false)
  const [waTemplateError, setWaTemplateError] = useState("")

  function buildWhatsAppVars(item: CalendarItem): Record<string, string> {
    return {
      patient_name: item.patient_name || "Patient",
      doctor_name: item.doctor_name || "Doctor",
      hospital_name: currentUser?.hospital_name || "our clinic",
      treatment_name: item.treatment_name || "treatment",
      appointment_date: item.appointment_date || "soon",
      hospital_phone: currentUser?.hospital_phone || item.hospital_phone || "",
    }
  }

  async function openWhatsApp(item: CalendarItem) {
    const phone = item.patient_phone
    if (!phone) { addToast({ title: "Patient mobile number is not available.", variant: "destructive" }); return }
    setWaItem(item)
    setWaOpen(item.id)
    setWaTemplateError("")
    setWaLoading(true)
    try {
      const templates = await whatsappTemplatesApi.list({ hospital_id: currentUser?.hospital_id })
      const list: WhatsAppTemplate[] = Array.isArray(templates) ? templates : (templates as { items?: WhatsAppTemplate[]; data?: WhatsAppTemplate[] })?.items || []
      const template = list.find((t) => t.is_active !== false && t.name && /enquiry|follow.?up/i.test(t.name) && t.message)
      if (template?.message) {
        setWaMessage(replaceTemplateVars(template.message, buildWhatsAppVars(item)))
      } else {
        const anyTemplate = list.find((t) => t.is_active !== false && t.message)
        setWaMessage(replaceTemplateVars(anyTemplate?.message || DEFAULT_ENQUIRY_TEMPLATE, buildWhatsAppVars(item)))
      }
    } catch {
      setWaMessage(replaceTemplateVars(DEFAULT_ENQUIRY_TEMPLATE, buildWhatsAppVars(item)))
    }
    setWaLoading(false)
  }

  async function sendWhatsApp() {
    if (!waOpen || !waItem || !waMessage) return
    const unresolved = waMessage.match(/\{\{(\w+)\}\}/g)
    if (unresolved?.length) {
      setWaTemplateError(`Unresolved variables: ${unresolved.join(", ")}. Please replace them before sending.`)
      return
    }
    const phone = (waItem.patient_phone || "").replace(/[^0-9]/g, "")
    if (!phone) { addToast({ title: "Patient mobile number is not available.", variant: "destructive" }); return }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMessage)}`, "_blank")
    try {
      if (waItem.source === "generated_enquiry") {
        await enquiriesApi.updateStatus(waOpen, { status: "CONTACTED" })
      } else {
        await crmApi.followUps.update(waOpen, { status: "CONTACTED", contact_channel: "WHATSAPP", whatsapp_message: waMessage })
      }
      invalidateCalendar()
    } catch { /* ignore */ }
    setWaOpen(null); setWaMessage(""); setWaTemplateError("")
    setTimeout(() => openFeedback(waItem!, "WHATSAPP"), 800)
  }

  function handleCall(item: CalendarItem) {
    const phone = item.patient_phone
    if (!phone) { addToast({ title: "No phone number for this patient", variant: "destructive" }); return }
    navigator.clipboard.writeText(phone).catch(() => {})
    window.location.href = `tel:${phone}`
    addToast({ title: `Dialing ${phone}`, description: "Number copied to clipboard", variant: "default" })
    if (item.source !== "generated_enquiry") {
      crmApi.followUps.update(item.id, { status: "CONTACTED", contact_channel: "CALL" }).then(() => invalidateCalendar()).catch(() => {})
    }
    setTimeout(() => openFeedback(item, "CALL"), 600)
  }

  // --- Timeline ---
  const [timelineOpen, setTimelineOpen] = useState<string | null>(null)
  const [timelineItem, setTimelineItem] = useState<CalendarItem | null>(null)
  const { data: timelineData } = useQuery({
    queryKey: ["patient-timeline", timelineItem?.patient_id],
    queryFn: () => crmApi.patientFollowUpHistory(timelineItem!.patient_id!),
    enabled: !!timelineItem?.patient_id,
  })
  const timelineEntries: TimelineEntry[] = Array.isArray(timelineData) ? timelineData : []

  // --- Navigation ---
  function navToday() { setSelectedDate(format(today, "yyyy-MM-dd")) }
  function handleNav(d: -1 | 1) {
    if (viewMode === "day") setSelectedDate(format(d > 0 ? addDays(selDate, 1) : subDays(selDate, 1), "yyyy-MM-dd"))
    else if (viewMode === "week" || viewMode === "agenda") setSelectedDate(format(d > 0 ? addWeeks(selDate, 1) : subWeeks(selDate, 1), "yyyy-MM-dd"))
    else setSelectedDate(format(d > 0 ? addMonths(selDate, 1) : subMonths(selDate, 1), "yyyy-MM-dd"))
  }

  function handleDayClick(dateStr: string) { setSelectedDate(dateStr); setViewMode("day") }

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
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
  }, [viewMode, selectedDate])

  // --- Calendar grid ---
  const calStart = startOfMonth(selDate)
  const calEnd = endOfMonth(selDate)

  // --- Summary counts (use API summary if available, else compute) ---
  const dayItems = useMemo(() => searchedItems.filter((i) => i.due_date === selectedDate), [searchedItems, selectedDate])
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of dayItems) {
      const t = item.enquiry_type || item.follow_up_type || "OTHER"
      counts[t] = (counts[t] || 0) + 1
    }
    return counts
  }, [dayItems])

  const overdueCount = useMemo(() => {
    const cutoff = format(subDays(new Date(), 0), "yyyy-MM-dd")
    return searchedItems.filter((i) => isOverdue(i.due_date || "", i.status || "")).length
  }, [searchedItems])

  return (
    <div className="space-y-4">
      <PageHeader title="Enquiry Calendar" description="Enterprise CRM action center — manage all enquiries from one screen">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={navToday}><ChevronsLeft className="h-4 w-4 mr-1" />Today</Button>
          <Button variant="outline" size="sm" onClick={() => handleNav(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold min-w-[160px] text-center">
            {viewMode === "day" ? format(selDate, "dd MMM yyyy") :
             viewMode === "week" || viewMode === "agenda" ? `${format(startOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM")} - ${format(endOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM yyyy")}` :
             format(selDate, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => handleNav(1)}><ChevronRight className="h-4 w-4" /></Button>
          <div className="flex border rounded-md ml-2">
            {(["day", "week", "month", "agenda"] as const).map((v, idx) => (
              <Button key={v} variant={viewMode === v ? "default" : "ghost"} size="sm"
                className={`${idx === 0 ? "rounded-r-none" : idx === 3 ? "rounded-l-none" : "rounded-none"} text-xs h-8`}
                onClick={() => setViewMode(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}<span className="ml-1 text-[9px] text-muted-foreground">({idx + 1})</span>
              </Button>
            ))}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => setShowFilters(!showFilters)}>
                  <Filter className={`h-4 w-4 ${showFilters ? "text-primary" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle Filters (F)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="py-2 px-3">
          <div className="text-lg font-bold">{summary?.total ?? totalCount}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </Card>
        <Card className="py-2 px-3 bg-amber-50 border-amber-200">
          <div className="text-lg font-bold text-amber-700">{summary?.pending ?? dayItems.filter((i) => ["PENDING", "NEW"].includes(i.status || "")).length}</div>
          <div className="text-xs text-amber-600">Pending</div>
        </Card>
        <Card className="py-2 px-3 bg-red-50 border-red-200">
          <div className="text-lg font-bold text-red-700">{summary?.overdue ?? overdueCount}</div>
          <div className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Overdue</div>
        </Card>
        <Card className="py-2 px-3 bg-blue-50 border-blue-200">
          <div className="text-lg font-bold text-blue-700">{summary?.due_today ?? 0}</div>
          <div className="text-xs text-blue-600 flex items-center gap-1"><Calendar className="h-3 w-3" />Today</div>
        </Card>
        <Card className="py-2 px-3 bg-indigo-50 border-indigo-200">
          <div className="text-lg font-bold text-indigo-700">{summary?.due_tomorrow ?? 0}</div>
          <div className="text-xs text-indigo-600">Tomorrow</div>
        </Card>
        <Card className="py-2 px-3 bg-purple-50 border-purple-200">
          <div className="text-lg font-bold text-purple-700">{summary?.due_this_week ?? 0}</div>
          <div className="text-xs text-purple-600">This Week</div>
        </Card>
      </div>

      {/* Filters Bar */}
      {showFilters && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient, OP number, phone, treatment..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === " " ? "" : v)}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
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
              <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
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
              <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="All Doctors" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Doctors</SelectItem>
                {doctorsList.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>{doc.full_name || doc.name || doc.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v === " " ? "" : v)}>
              <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="All Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Priority</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            {(statusFilter || typeFilter || doctorFilter || priorityFilter || searchQuery || includeTerminal) && (
              <Button variant="ghost" size="sm" className="h-9 text-xs"
                onClick={() => { setStatusFilter(""); setTypeFilter(""); setDoctorFilter(""); setPriorityFilter(""); setSearchQuery(""); setIncludeTerminal(false) }}>
                <X className="h-3 w-3 mr-1" /> Clear All
              </Button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={includeTerminal}
                  onChange={(e) => setIncludeTerminal(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300" />
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
                <Badge variant="outline" className="ml-2 text-xs">{filteredItems.length} items</Badge>
              </CardTitle>
              {!showFilters && (
                <div className="relative flex-1 max-w-xs ml-4">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Quick search..." value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isFetching ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No items for {format(selDate, "dd MMM yyyy")}</p>
                <p className="text-xs mt-1">Try changing the date or filters</p>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow>
                      <TableHead className="w-2" />
                      <TableHead className="whitespace-nowrap">Patient</TableHead>
                      <TableHead className="whitespace-nowrap">OP No.</TableHead>
                      <TableHead className="whitespace-nowrap">Doctor</TableHead>
                      <TableHead className="whitespace-nowrap">Type</TableHead>
                      <TableHead className="whitespace-nowrap">Treatment</TableHead>
                      <TableHead className="whitespace-nowrap">Priority</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap sticky right-0 bg-white z-10">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const tc = getTypeColor(item.enquiry_type || item.follow_up_type || "")
                      const od = isOverdue(item.due_date || "", item.status || "")
                      return (
                        <TableRow key={`${item.source}-${item.id}`}
                          className={`cursor-pointer hover:bg-muted/50 ${od ? "bg-red-50/40" : ""}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item)}
                          onClick={() => { setDetailItem(item); setDetailOpen(true) }}>
                          <TableCell className="w-2 p-0"><div className={`w-1.5 h-8 rounded-full ${tc.dot}`} /></TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{item.patient_name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{item.op_number || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{item.doctor_name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${tc.bg} ${tc.text} ${tc.border}`}>
                              {ENQUIRY_TYPE_LABELS[item.enquiry_type || ""] || item.enquiry_type || item.follow_up_type || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{item.treatment_name || "—"}</TableCell>
                          <TableCell>
                            {item.priority === "HIGH" ? (
                              <Badge className="text-[10px] bg-red-100 text-red-700">HIGH</Badge>
                            ) : item.priority === "LOW" ? (
                              <Badge className="text-[10px] bg-gray-100 text-gray-600">LOW</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">MED</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${STATUS_COLORS[item.status || ""] || "bg-gray-100"}`}>
                              {od && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                              {item.status || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-white z-10">
                            <TooltipProvider>
                              <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => handleCall(item)}>
                                    <Phone className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Call</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openWhatsApp(item)}>
                                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>WhatsApp</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openFeedback(item)}>
                                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Feedback</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7"
                                    onClick={() => { setReschedOpen(item.id); setReschedDate(item.due_date || selectedDate) }}>
                                    <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Reschedule</TooltipContent></Tooltip>
                                {item.status !== "COMPLETED" && item.status !== "LOST" && item.status !== "CANCELLED" && (
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" className="h-7 w-7"
                                      onClick={() => handleMarkCompleted(item.id, item.source)}>
                                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent>Complete</TooltipContent></Tooltip>
                                )}
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7"
                                    onClick={() => { setTimelineItem(item); setTimelineOpen(item.id) }}>
                                    <History className="h-3.5 w-3.5 text-gray-500" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Timeline</TooltipContent></Tooltip>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm">Week View — click a day</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px rounded-lg border bg-gray-100 overflow-hidden">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="bg-white p-2 text-center text-xs font-semibold text-gray-500">{d}</div>
              ))}
              {(() => {
                const weekStart = startOfWeek(selDate, { weekStartsOn: 1 })
                const cells: React.ReactNode[] = []
                for (let i = 0; i < 7; i++) {
                  const day = addDays(weekStart, i)
                  const dateStr = format(day, "yyyy-MM-dd")
                  const todayStr = format(today, "yyyy-MM-dd")
                  const dayItemsAll = searchedItems.filter((item) => item.due_date === dateStr)
                  const todayCheck = isToday(day)
                  cells.push(
                    <div key={dateStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      onClick={() => handleDayClick(dateStr)}
                      className={`min-h-[100px] bg-white p-2 cursor-pointer hover:bg-blue-50 transition-colors
                        ${todayCheck ? "ring-2 ring-inset ring-blue-400" : ""}`}>
                      <div className={`text-xs font-bold mb-1 ${todayCheck ? "text-blue-600" : "text-gray-700"}`}>
                        {format(day, "dd MMM")}
                      </div>
                      <div className="space-y-0.5">
                        {dayItemsAll.slice(0, 4).map((item) => {
                          const tc = getTypeColor(item.enquiry_type || "")
                          return (
                            <div key={item.id} className={`text-[10px] px-1.5 py-0.5 rounded ${tc.bg} ${tc.text} truncate border ${tc.border}`}>
                              {item.patient_name}
                            </div>
                          )
                        })}
                        {dayItemsAll.length > 4 && <div className="text-[9px] text-gray-400">+{dayItemsAll.length - 4} more</div>}
                      </div>
                    </div>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm">{format(selDate, "MMMM yyyy")} — click a day</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px rounded-lg border bg-gray-100 overflow-hidden">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="bg-white p-2 text-center text-xs font-semibold text-gray-500">{d}</div>
              ))}
              {(() => {
                const startDay = calStart.getDay(), daysInMonth = calEnd.getDate()
                const cells: React.ReactNode[] = []
                for (let i = 0; i < startDay; i++) cells.push(<div key={`e-${i}`} className="bg-gray-50 p-2" />)
                for (let d = 1; d <= daysInMonth; d++) {
                  const dateStr = `${format(selDate, "yyyy-MM")}-${String(d).padStart(2, "0")}`
                  const todayStr = format(today, "yyyy-MM-dd")
                  const dayItemsAll = searchedItems.filter((item) => item.due_date === dateStr)
                  const todayCheck = dateStr === format(today, "yyyy-MM-dd")
                  const isSelected = dateStr === selectedDate
                  cells.push(
                    <div key={dateStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, dateStr)}
                      onClick={() => handleDayClick(dateStr)}
                      className={`min-h-[55px] bg-white p-1.5 cursor-pointer hover:bg-blue-50 transition-colors
                        ${todayCheck ? "ring-2 ring-inset ring-blue-400" : ""}
                        ${isSelected ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""}`}>
                      <div className={`text-xs font-bold ${todayCheck ? "text-blue-600" : isSelected ? "text-blue-700" : "text-gray-700"}`}>{d}</div>
                      <div className="text-[9px] mt-0.5 leading-tight">
                        {dayItemsAll.slice(0, 3).map((item) => {
                          const tc = getTypeColor(item.enquiry_type || "")
                          return <div key={item.id} className={`truncate ${tc.text}`}>{item.patient_name}</div>
                        })}
                        {dayItemsAll.length > 3 && <div className="text-gray-400">+{dayItemsAll.length - 3}</div>}
                      </div>
                    </div>
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
              Agenda — {format(startOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM")} to {format(endOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM yyyy")}
              <Badge variant="outline" className="ml-2 text-xs">{filteredItems.length} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isFetching ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No items for this week</div>
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
                      <div key={dateStr} className="border-b last:border-b-0"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, dateStr)}>
                        <div className={`px-4 py-2 sticky top-0 z-10 flex items-center gap-2 ${todayCheck ? "bg-blue-50" : "bg-gray-50"}`}>
                          {todayCheck && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                          <span className={`text-sm font-semibold ${todayCheck ? "text-blue-700" : "text-gray-700"}`}>
                            {format(dayDate, "EEEE, dd MMM yyyy")}
                          </span>
                          <Badge variant="outline" className="text-[10px]">{dateItems.length}</Badge>
                        </div>
                        {dateItems.map((item) => {
                          const tc = getTypeColor(item.enquiry_type || "")
                          const od = isOverdue(item.due_date || "", item.status || "")
                          return (
                            <div key={`${item.source}-${item.id}`}
                              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 cursor-pointer border-l-4 ${tc.border} ${od ? "bg-red-50/30" : ""}`}
                              draggable
                              onDragStart={(e) => handleDragStart(e, item)}
                              onClick={() => { setDetailItem(item); setDetailOpen(true) }}>
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tc.dot}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{item.patient_name}</span>
                                  <Badge variant="outline" className={`text-[9px] ${tc.bg} ${tc.text} ${tc.border}`}>
                                    {ENQUIRY_TYPE_LABELS[item.enquiry_type || ""] || item.enquiry_type || "—"}
                                  </Badge>
                                  <Badge className={`text-[9px] ${STATUS_COLORS[item.status || ""] || ""}`}>
                                    {od && <AlertTriangle className="h-2 w-2 mr-0.5" />}
                                    {item.status}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.op_number && `OP: ${item.op_number}`}
                                  {item.doctor_name && ` · Dr. ${item.doctor_name}`}
                                  {item.treatment_name && ` · ${item.treatment_name}`}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <TooltipProvider>
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => handleCall(item)}>
                                      <Phone className="h-3 w-3 text-green-600" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent>Call</TooltipContent></Tooltip>
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => openWhatsApp(item)}>
                                      <MessageCircle className="h-3 w-3 text-green-600" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent>WhatsApp</TooltipContent></Tooltip>
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => openFeedback(item)}>
                                      <FileText className="h-3 w-3 text-blue-600" />
                                    </Button>
                                  </TooltipTrigger><TooltipContent>Feedback</TooltipContent></Tooltip>
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

      {/* Detail Drawer (Sheet) */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getTypeColor(detailItem.enquiry_type || "").dot}`} />
                  {detailItem.patient_name}
                </SheetTitle>
                <SheetDescription>
                  {ENQUIRY_TYPE_LABELS[detailItem.enquiry_type || ""] || detailItem.enquiry_type || "Enquiry"} · Due {detailItem.due_date}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Status</span><div>
                    <Badge className={`text-xs mt-1 ${STATUS_COLORS[detailItem.status || ""] || ""}`}>{detailItem.status}</Badge>
                  </div></div>
                  <div><span className="text-muted-foreground">Priority</span><div className="font-medium mt-1">{detailItem.priority || "MEDIUM"}</div></div>
                  <div><span className="text-muted-foreground">OP Number</span><div className="font-medium mt-1">{detailItem.op_number || "—"}</div></div>
                  <div><span className="text-muted-foreground">Phone</span><div className="font-medium mt-1">{detailItem.patient_phone || "—"}</div></div>
                  <div><span className="text-muted-foreground">Doctor</span><div className="font-medium mt-1">{detailItem.doctor_name || "—"}</div></div>
                  <div><span className="text-muted-foreground">Source</span><div className="font-medium mt-1 capitalize">{detailItem.source?.replace("_", " ") || "—"}</div></div>
                </div>
                {detailItem.treatment_name && (
                  <div><span className="text-xs text-muted-foreground">Treatment</span><p className="text-sm mt-0.5">{detailItem.treatment_name}</p></div>
                )}
                {detailItem.feedback && (
                  <div><span className="text-xs text-muted-foreground">Notes</span><p className="text-sm mt-0.5">{detailItem.feedback}</p></div>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button size="sm" className="flex-1" onClick={() => { setDetailOpen(false); openFeedback(detailItem) }}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Feedback
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setDetailOpen(false); handleCall(detailItem) }}>
                    <Phone className="h-3.5 w-3.5 mr-1" /> Call
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setDetailOpen(false); openWhatsApp(detailItem) }}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1"
                    onClick={() => { setReschedOpen(detailItem.id); setReschedDate(detailItem.due_date || selectedDate); setDetailOpen(false) }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reschedule
                  </Button>
                  {detailItem.status !== "COMPLETED" && detailItem.status !== "LOST" && detailItem.status !== "CANCELLED" && (
                    <Button size="sm" variant="outline" className="flex-1"
                      onClick={() => { handleMarkCompleted(detailItem.id, detailItem.source); setDetailOpen(false) }}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Complete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost"
                    onClick={() => { setTimelineItem(detailItem); setTimelineOpen(detailItem.id); setDetailOpen(false) }}>
                    <History className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Feedback Dialog */}
      <Dialog open={!!feedbackOpen} onOpenChange={(o) => { if (!o) closeFeedback() }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Feedback — {feedbackItem?.patient_name || ""}</DialogTitle></DialogHeader>
          <div className="space-y-4 px-1">
            <div className="space-y-2">
              <Label>Patient Response <span className="text-red-500">*</span></Label>
              <Select value={fbResponseStatus} onValueChange={setFbResponseStatus}>
                <SelectTrigger><SelectValue placeholder="Select patient response" /></SelectTrigger>
                <SelectContent position="popper" className="max-h-[220px]">
                  {responseStatusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Patient Condition / Feedback</Label>
              <Textarea value={fbPatientFeedback} onChange={(e) => setFbPatientFeedback(e.target.value)} rows={2} placeholder="How is the patient feeling?" />
            </div>
            <div className="space-y-2">
              <Label>Staff Notes</Label>
              <Textarea value={fbStaffNotes} onChange={(e) => setFbStaffNotes(e.target.value)} rows={2} placeholder="Internal notes..." />
            </div>
            <div className="space-y-2">
              <Label>Response Summary</Label>
              <Input value={fbSummary} onChange={(e) => setFbSummary(e.target.value)} placeholder="Brief outcome" />
            </div>
            <div className="space-y-2">
              <Label>Interested To Visit Again</Label>
              <div className="flex gap-2">
                {["Yes", "No", "Maybe"].map((opt) => (
                  <Button key={opt} type="button" variant={fbInterested === opt ? "default" : "outline"} size="sm"
                    className="flex-1" onClick={() => setFbInterested(opt)}>{opt}</Button>
                ))}
              </div>
            </div>
            {fbInterested === "Yes" && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <Label className="font-semibold text-primary">Create Appointment</Label>
                <div className="space-y-2">
                  <Label>Doctor <span className="text-red-500">*</span></Label>
                  <Select value={fbApptDoctorId} onValueChange={setFbApptDoctorId}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent position="popper" className="max-h-[220px]">
                      {doctorsList.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>{doc.full_name || doc.name || doc.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={fbApptDate} onChange={(e) => setFbApptDate(e.target.value)} min={format(today, "yyyy-MM-dd")} />
                </div>
                {fbApptDoctorId && fbApptDate && (
                  <div className="space-y-2">
                    <Label>Available Time Slots</Label>
                    {fbSlotsList.length > 0 ? (
                      <div className="grid grid-cols-4 gap-1.5 max-h-[150px] overflow-y-auto p-1 border rounded-md">
                        {fbSlotsList.map((slot: string) => (
                          <Button key={slot} variant={fbApptTime === slot ? "default" : "outline"} size="sm"
                            className={`text-xs h-8 ${fbApptTime === slot ? "ring-2 ring-primary" : ""}`}
                            onClick={() => setFbApptTime(slot)}>
                            {slot.replace(/^(\d{2})(\d{2})$/, "$1:$2")}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No slots found.</p>
                    )}
                  </div>
                )}
                <Button className="w-full" onClick={handleFbBookAppointment}
                  disabled={!fbApptDoctorId || !fbApptDate || !fbApptTime || fbApptSaving}>
                  {fbApptSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <Calendar className="h-4 w-4 mr-2" /> Create Appointment
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label>Next Action</Label>
              <Select value={fbNextAction} onValueChange={setFbNextAction}>
                <SelectTrigger><SelectValue placeholder="Select next action" /></SelectTrigger>
                <SelectContent>
                  {nextActionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={closeFeedback}>Cancel</Button>
              <Button className="flex-1" onClick={handleRecordFeedback} disabled={!fbResponseStatus || fbSaving}>
                {fbSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Feedback
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Dialog */}
      <Dialog open={!!waOpen} onOpenChange={(o) => { if (!o) { setWaOpen(null); setWaMessage(""); setWaTemplateError("") } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Send WhatsApp to {waItem?.patient_name || ""}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">To: <strong>{waItem?.patient_phone || ""}</strong></div>
            <div className="space-y-2">
              <Label>Message Preview</Label>
              {waLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading template...</div>
              ) : (
                <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={8} className="text-sm font-mono" />
              )}
            </div>
            {waTemplateError && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{waTemplateError}</div>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setWaOpen(null); setWaMessage(""); setWaTemplateError("") }}>Cancel</Button>
              <Button className="flex-1" onClick={sendWhatsApp} disabled={!waMessage || waLoading}>
                <MessageCircle className="h-4 w-4 mr-2" /> Open WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={!!reschedOpen} onOpenChange={(o) => { if (!o) setReschedOpen(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reschedule Enquiry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} min={format(today, "yyyy-MM-dd")} />
            </div>
            <Button className="w-full" onClick={handleReschedule} disabled={!reschedDate || reschedSaving}>
              {reschedSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reschedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Timeline Dialog */}
      <Dialog open={!!timelineOpen} onOpenChange={(o) => { if (!o) { setTimelineOpen(null); setTimelineItem(null) } }}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Patient Timeline — {timelineItem?.patient_name || ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 px-1">
            {timelineEntries.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No timeline entries found for this patient.
              </div>
            ) : (
              timelineEntries.map((entry: TimelineEntry, idx: number) => (
                <div key={entry.id || idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                    {idx < timelineEntries.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="text-xs text-muted-foreground">
                      {entry.created_at ? format(new Date(entry.created_at), "dd MMM yyyy HH:mm") : ""}
                    </div>
                    <div className="text-sm font-medium">{entry.action || entry.status || entry.follow_up_type || "Event"}</div>
                    {(entry.notes || entry.patient_feedback || entry.response_summary) && (
                      <div className="text-xs text-muted-foreground mt-0.5">{entry.notes || entry.patient_feedback || entry.response_summary}</div>
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
