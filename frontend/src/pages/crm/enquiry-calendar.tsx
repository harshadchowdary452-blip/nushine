import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Phone, MessageCircle, CheckCircle, Loader2,
  Search, ChevronLeft, ChevronRight, ChevronsLeft, Calendar,
  FileText, History, RotateCcw, User, Stethoscope, X, Copy, Check,
} from "lucide-react"
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths } from "date-fns"
import { enquiriesApi, crmApi, appointmentsApi, doctorsApi, whatsappTemplatesApi } from "@/services/endpoints"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"


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

const followUpStatusColors: Record<string, string> = {
  PENDING: "bg-amber-50 border-amber-200 text-amber-700",
  CONTACTED: "bg-blue-50 border-blue-200 text-blue-700",
  INTERESTED: "bg-emerald-50 border-emerald-200 text-emerald-700",
  APPOINTMENT_REQUIRED: "bg-purple-50 border-purple-200 text-purple-700",
  APPOINTMENT_BOOKED: "bg-indigo-50 border-indigo-200 text-indigo-700",
  COMPLETED: "bg-green-50 border-green-200 text-green-700",
  NO_RESPONSE: "bg-gray-50 border-gray-200 text-gray-500",
  LOST: "bg-red-50 border-red-200 text-red-600",
  NEW: "bg-blue-50 border-blue-200 text-blue-700",
  NOT_INTERESTED: "bg-gray-50 border-gray-200 text-gray-500",
  CONVERTED: "bg-green-50 border-green-200 text-green-700",
}

const followUpTypeLabels: Record<string, string> = {
  "1_DAY_FOLLOW_UP": "1-Day FU",
  "7_DAY_FOLLOW_UP": "7-Day FU",
  "6_MONTH_RECALL": "6-Month Recall",
  "12_MONTH_RECALL": "12-Month Recall",
  CUSTOM_FOLLOW_UP: "Custom FU",
  ENQUIRY: "Enquiry",
  OPD_FOLLOW_UP: "OPD Follow-Up",
  MANUAL: "Manual",
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

export default function EnquiryCalendar() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(format(today, "yyyy-MM-dd"))
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day")
  const [statusFilter, setStatusFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const selDate = new Date(selectedDate + "T00:00:00")

  function getRange() {
    const d = new Date(selectedDate + "T00:00:00")
    if (viewMode === "day") return { start: selectedDate, end: selectedDate }
    if (viewMode === "week") return { start: format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd") }
    return { start: format(startOfMonth(d), "yyyy-MM-dd"), end: format(endOfMonth(d), "yyyy-MM-dd") }
  }

  const dateRange = getRange()

  const { data: items, isFetching } = useQuery({
    queryKey: ["enquiry-calendar", dateRange.start, dateRange.end, statusFilter, typeFilter],
    queryFn: () => enquiriesApi.calendar({ start_date: dateRange.start, end_date: dateRange.end, status: statusFilter || undefined, type: typeFilter || undefined }),
  })
  const allItems: any[] = items || []

  const searchedItems = searchQuery
    ? allItems.filter((i: any) =>
        (i.patient_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.op_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.treatment_name || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : allItems

  const filteredItems = viewMode === "day" ? searchedItems.filter((i: any) => i.due_date === selectedDate) : searchedItems

  // --- Doctors scoped to hospital ---
  const currentUser = (() => {
    try { return JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "null") } catch { return null }
  })()
  const hospitalId = currentUser?.hospital_id

  const { data: doctors } = useQuery({
    queryKey: ["doctors-list", hospitalId],
    queryFn: () => doctorsApi.list(hospitalId ? { hospital_id: hospitalId, limit: 200 } : { limit: 200 }).then((r: any) => {
      if (Array.isArray(r)) return r
      if (r?.users) return r.users
      if (r?.data) return r.data
      return []
    }),
  })
  const doctorsList: any[] = Array.isArray(doctors) ? doctors : []

  // --- Feedback Dialog ---
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null)
  const [feedbackItem, setFeedbackItem] = useState<any>(null)
  const [fbResponseStatus, setFbResponseStatus] = useState("")
  const [fbPatientFeedback, setFbPatientFeedback] = useState("")
  const [fbStaffNotes, setFbStaffNotes] = useState("")
  const [fbSummary, setFbSummary] = useState("")
  const [fbNextAction, setFbNextAction] = useState("")
  const [fbSaving, setFbSaving] = useState(false)

  // Interested to Visit Again
  const [fbInterested, setFbInterested] = useState("")
  // Appointment from feedback
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

  function openFeedback(item: any, channel?: string) {
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

  async function handleRecordFeedback() {
    if (!feedbackOpen || !fbResponseStatus) return
    setFbSaving(true)
    try {
      let status = "PENDING"
      if (["NO_RESPONSE", "BUSY", "WRONG_NUMBER"].includes(fbResponseStatus)) status = "NO_RESPONSE"
      else if (fbResponseStatus === "NOT_INTERESTED") status = "LOST"
      else if (["INTERESTED", "APPOINTMENT_REQUIRED", "NEEDS_MORE_TIME", "REQUESTED_CALLBACK", "NEEDS_REVIEW"].includes(fbResponseStatus)) status = "CONTACTED"
      else if (fbResponseStatus === "TREATMENT_COMPLETED") status = "COMPLETED"

      await crmApi.followUps.update(feedbackOpen, {
        status, response_status: fbResponseStatus,
        patient_feedback: fbPatientFeedback || undefined,
        staff_notes: fbStaffNotes || undefined,
        response_summary: fbSummary || undefined,
        next_action: fbNextAction || undefined,
        interested_to_visit_again: fbInterested || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-doctors"] })
      addToast({ title: "Feedback saved", variant: "success" })
      closeFeedback()
    } catch (err: any) {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to save feedback", variant: "destructive" })
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
      await crmApi.followUps.update(feedbackOpen, {
        status: "APPOINTMENT_BOOKED",
        appointment_id: resp.id || resp.appointment_id,
      })
      queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-doctors"] })
      addToast({ title: "Appointment created & feedback saved", variant: "success" })
      closeFeedback()
    } catch (err: any) {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Booking failed", variant: "destructive" })
    }
    setFbApptSaving(false)
  }

  // --- Mark Completed ---
  async function handleMarkCompleted(id: string) {
    try {
      await crmApi.followUps.markCompleted(id)
      queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-doctors"] })
      addToast({ title: "Marked completed, dashboard updated", variant: "success" })
    } catch (err: any) {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" })
    }
  }

  // --- Reschedule Dialog ---
  const [reschedOpen, setReschedOpen] = useState<string | null>(null)
  const [reschedDate, setReschedDate] = useState("")
  const [reschedTime, setReschedTime] = useState("")
  const [reschedSaving, setReschedSaving] = useState(false)

  async function handleReschedule() {
    if (!reschedOpen || !reschedDate) return
    setReschedSaving(true)
    try {
      await crmApi.followUps.reschedule(reschedOpen, { follow_up_date: reschedDate, follow_up_time: reschedTime || undefined })
      queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
      addToast({ title: "Rescheduled", variant: "success" })
      setReschedOpen(null); setReschedSaving(false)
    } catch (err: any) {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" })
      setReschedSaving(false)
    }
  }

  // --- Appointment Booking Dialog ---
  const [apptOpen, setApptOpen] = useState<string | null>(null)
  const [apptItem, setApptItem] = useState<any>(null)
  const [apptDoctorId, setApptDoctorId] = useState("")
  const [apptDate, setApptDate] = useState("")
  const [apptTime, setApptTime] = useState("")
  const [apptSaving, setApptSaving] = useState(false)

  const { data: availableSlots, isFetching: slotsLoading } = useQuery({
    queryKey: ["appointment-slots", apptDoctorId, apptDate],
    queryFn: () => appointmentsApi.slots({ doctor_id: apptDoctorId, date: apptDate }),
    enabled: !!apptDoctorId && !!apptDate,
  })
  const slotsList: string[] = Array.isArray(availableSlots) ? availableSlots :
    availableSlots?.slots ? availableSlots.slots : []

  function openAppointment(item: any) {
    setApptItem(item)
    setApptOpen(item.id)
    setApptDoctorId(item.doctor_id || "")
    setApptDate("")
    setApptTime("")
  }

  async function handleBookAppointment() {
    if (!apptOpen || !apptItem || !apptDoctorId || !apptDate || !apptTime) return
    setApptSaving(true)
    try {
      // Create appointment
      const resp = await appointmentsApi.create({
        patient_id: apptItem.patient_id,
        doctor_id: apptDoctorId,
        appointment_date: apptDate,
        appointment_time: apptTime,
        appointment_type: "FOLLOW_UP",
        notes: "Created from enquiry calendar follow-up",
      })
      // Update follow-up status
      await crmApi.followUps.update(apptOpen, {
        status: "APPOINTMENT_BOOKED",
        appointment_id: resp.id || resp.appointment_id,
        next_action: "BOOK_APPOINTMENT",
      })
      queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard-doctors"] })
      addToast({ title: "Appointment created, timeline & dashboard updated", variant: "success" })
      setApptOpen(null); setApptItem(null); setApptDoctorId(""); setApptDate(""); setApptTime(""); setApptSaving(false)
    } catch (err: any) {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Booking failed", variant: "destructive" })
      setApptSaving(false)
    }
  }

  // --- WhatsApp Dialog ---
  const [waOpen, setWaOpen] = useState<string | null>(null)
  const [waItem, setWaItem] = useState<any>(null)
  const [waMessage, setWaMessage] = useState("")
  const [waLoading, setWaLoading] = useState(false)
  const [waTemplateError, setWaTemplateError] = useState("")

  function buildWhatsAppVars(item: any): Record<string, string> {
    return {
      patient_name: item.patient_name || "Patient",
      doctor_name: item.doctor_name || "Doctor",
      hospital_name: currentUser?.hospital_name || "our clinic",
      treatment_name: item.treatment_name || "treatment",
      appointment_date: item.appointment_date || "soon",
      hospital_phone: currentUser?.hospital_phone || item.hospital_phone || "",
    }
  }

  async function openWhatsApp(item: any) {
    const phone = item.patient_phone
    if (!phone) { addToast({ title: "Patient mobile number is not available.", variant: "destructive" }); return }
    setWaItem(item)
    setWaOpen(item.id)
    setWaTemplateError("")
    setWaLoading(true)
    // Try to load backend template named "Enquiry Follow-Up" or "1-Day Enquiry"
    try {
      const templates = await whatsappTemplatesApi.list({ hospital_id: currentUser?.hospital_id })
      const list: any[] = Array.isArray(templates) ? templates : templates?.items || templates?.data || []
      const template = list.find((t: any) =>
        t.is_active !== false && t.name && /enquiry|follow.?up/i.test(t.name) && t.message
      )
      if (template && template.message) {
        const vars = buildWhatsAppVars(item)
        setWaMessage(replaceTemplateVars(template.message, vars))
      } else {
        // No enquiry template found, try any active template
        const anyTemplate = list.find((t: any) => t.is_active !== false && t.message)
        if (anyTemplate?.message) {
          const vars = buildWhatsAppVars(item)
          setWaMessage(replaceTemplateVars(anyTemplate.message, vars))
        } else {
          setWaMessage(replaceTemplateVars(DEFAULT_ENQUIRY_TEMPLATE, buildWhatsAppVars(item)))
        }
      }
    } catch {
      setWaMessage(replaceTemplateVars(DEFAULT_ENQUIRY_TEMPLATE, buildWhatsAppVars(item)))
    }
    setWaLoading(false)
  }

  async function sendWhatsApp() {
    if (!waOpen || !waItem || !waMessage) return
    // Validate no unresolved template variables
    const unresolved = waMessage.match(/\{\{(\w+)\}\}/g)
    if (unresolved && unresolved.length > 0) {
      setWaTemplateError(`Unresolved variables: ${unresolved.join(", ")}. Please replace them before sending.`)
      return
    }
    const rawPhone = waItem.patient_phone || ""
    const phone = rawPhone.replace(/[^0-9]/g, "")
    if (!phone) { addToast({ title: "Patient mobile number is not available.", variant: "destructive" }); return }
    // Open WhatsApp with message
    const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(waMessage)}`
    window.open(waLink, "_blank")
    // Auto-mark as contacted
    try {
      await crmApi.followUps.update(waOpen, { status: "CONTACTED", contact_channel: "WHATSAPP", whatsapp_message: waMessage })
      queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
    } catch {}
    setWaOpen(null); setWaMessage(""); setWaTemplateError("")
    setTimeout(() => openFeedback(waItem, "WHATSAPP"), 800)
  }

  // --- Call handler ---
  function handleCall(item: any) {
    const phone = item.patient_phone
    if (!phone) { addToast({ title: "No phone number for this patient", variant: "destructive" }); return }
    // Copy number to clipboard as fallback
    navigator.clipboard.writeText(phone).catch(() => {})
    // Open dialer
    window.location.href = `tel:${phone}`
    addToast({ title: `Dialing ${phone}`, description: "Number copied to clipboard", variant: "default" })
    // Auto-mark as contacted
    crmApi.followUps.update(item.id, { status: "CONTACTED", contact_channel: "CALL" }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["enquiry-calendar"] })
    }).catch(() => {})
    setTimeout(() => openFeedback(item, "CALL"), 600)
  }

  // --- Timeline Dialog ---
  const [timelineOpen, setTimelineOpen] = useState<string | null>(null)
  const [timelineItem, setTimelineItem] = useState<any>(null)
  const { data: timelineData } = useQuery({
    queryKey: ["patient-timeline", timelineItem?.patient_id],
    queryFn: () => crmApi.patientFollowUpHistory(timelineItem.patient_id),
    enabled: !!timelineItem?.patient_id,
  })
  const timelineEntries: any[] = Array.isArray(timelineData) ? timelineData : []

  // --- Navigation ---
  function navDay(d: -1 | 1) { setSelectedDate(format(d > 0 ? addDays(selDate, 1) : subDays(selDate, 1), "yyyy-MM-dd")) }
  function navWeek(d: -1 | 1) { setSelectedDate(format(d > 0 ? addWeeks(selDate, 1) : subWeeks(selDate, 1), "yyyy-MM-dd")) }
  function navMonth(d: -1 | 1) { setSelectedDate(format(d > 0 ? addMonths(selDate, 1) : subMonths(selDate, 1), "yyyy-MM-dd")) }
  function navToday() { setSelectedDate(format(today, "yyyy-MM-dd")) }
  function handleNav(d: -1 | 1) { if (viewMode === "day") navDay(d); else if (viewMode === "week") navWeek(d); else navMonth(d) }
  function handleDayClick(dateStr: string) { setSelectedDate(dateStr); setViewMode("day") }

  // --- Calendar grid ---
  const calStart = startOfMonth(selDate)
  const calEnd = endOfMonth(selDate)

  // --- Summary counts ---
  const dayItems = allItems.filter((i: any) => i.due_date === selectedDate)
  const dayFU = dayItems.filter((i: any) => i.follow_up_type === "1_DAY_FOLLOW_UP").length
  const day7FU = dayItems.filter((i: any) => i.follow_up_type === "7_DAY_FOLLOW_UP").length
  const day6m = dayItems.filter((i: any) => i.follow_up_type === "6_MONTH_RECALL").length
  const day12m = dayItems.filter((i: any) => i.follow_up_type === "12_MONTH_RECALL").length
  const dayOther = dayItems.filter((i: any) => !["1_DAY_FOLLOW_UP", "7_DAY_FOLLOW_UP", "6_MONTH_RECALL", "12_MONTH_RECALL"].includes(i.follow_up_type)).length

  return (
    <div className="space-y-6">
      <PageHeader title="Enquiry Calendar" description="Single CRM action center — manage all follow-ups from one screen">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={navToday}><ChevronsLeft className="h-4 w-4 mr-1" />Today</Button>
          <Button variant="outline" size="sm" onClick={() => handleNav(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold min-w-[160px] text-center">
            {viewMode === "day" ? format(selDate, "dd MMM yyyy") :
             viewMode === "week" ? `${format(startOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM")} - ${format(endOfWeek(selDate, { weekStartsOn: 1 }), "dd MMM yyyy")}` :
             format(selDate, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => handleNav(1)}><ChevronRight className="h-4 w-4" /></Button>
          <div className="flex border rounded-md ml-2">
            <Button variant={viewMode === "day" ? "default" : "ghost"} size="sm" className="rounded-r-none text-xs h-8" onClick={() => setViewMode("day")}>Day</Button>
            <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" className="rounded-none text-xs h-8" onClick={() => setViewMode("week")}>Week</Button>
            <Button variant={viewMode === "month" ? "default" : "ghost"} size="sm" className="rounded-l-none text-xs h-8" onClick={() => setViewMode("month")}>Month</Button>
          </div>
        </div>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "1-Day Follow-Ups", count: dayFU, color: "bg-blue-50 text-blue-700 border-blue-200" },
          { label: "7-Day Follow-Ups", count: day7FU, color: "bg-purple-50 text-purple-700 border-purple-200" },
          { label: "6-Month Recalls", count: day6m, color: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "12-Month Recalls", count: day12m, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
          { label: "Other", count: dayOther, color: "bg-gray-50 text-gray-700 border-gray-200" },
        ].map((s) => (
          <Card key={s.label} className={`py-2 px-3 border ${s.color}`}>
            <div className="text-lg font-bold">{s.count}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient, OP number, treatment..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Types</SelectItem>
                <SelectItem value="1_DAY_FOLLOW_UP">1-Day FU</SelectItem>
                <SelectItem value="7_DAY_FOLLOW_UP">7-Day FU</SelectItem>
                <SelectItem value="6_MONTH_RECALL">6-Month Recall</SelectItem>
                <SelectItem value="12_MONTH_RECALL">12-Month Recall</SelectItem>
                <SelectItem value="CUSTOM_FOLLOW_UP">Custom FU</SelectItem>
                <SelectItem value="ENQUIRY">Enquiry</SelectItem>
                <SelectItem value="OPD_FOLLOW_UP">OPD Follow-Up</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isFetching ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {viewMode === "day" ? `No items for ${format(selDate, "dd MMM yyyy")}` : "No items found for this period"}
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto relative">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Patient Name</TableHead>
                    <TableHead className="whitespace-nowrap">OP No.</TableHead>
                    <TableHead className="whitespace-nowrap">Doctor</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">Treatment</TableHead>
                    <TableHead className="whitespace-nowrap">FU Type</TableHead>
                    <TableHead className="whitespace-nowrap">Due</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Last Contact</TableHead>
                    <TableHead className="whitespace-nowrap sticky right-0 bg-white z-10">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item: any) => {
                    const isOverdue = item.due_date && item.due_date < format(today, "yyyy-MM-dd") && !["COMPLETED", "APPOINTMENT_BOOKED", "LOST", "CONVERTED"].includes(item.status)
                    return (
                      <TableRow key={`${item.source}-${item.id}`} className={isOverdue ? "bg-red-50/30" : ""}>
                        <TableCell className="font-medium whitespace-nowrap">{item.patient_name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{item.op_number || "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{item.doctor_name || "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{item.treatment_type || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">{item.treatment_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                            {followUpTypeLabels[item.follow_up_type] || item.follow_up_type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-xs whitespace-nowrap ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
                          {item.due_date || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${followUpStatusColors[item.status] || "bg-gray-50"}`}>
                            {item.status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {item.last_contact_date ? format(new Date(item.last_contact_date), "dd MMM HH:mm") : "—"}
                        </TableCell>
                        <TableCell className="sticky right-0 bg-white">
                          <TooltipProvider>
                            <div className="flex items-center gap-0.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => handleCall(item)}>
                                    <Phone className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Call {item.patient_phone || ""}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openWhatsApp(item)}>
                                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Send WhatsApp</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openFeedback(item)}>
                                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Record Feedback</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openAppointment(item)}>
                                    <Calendar className="h-3.5 w-3.5 text-purple-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Create Follow-Up / Book Appointment</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7"
                                    onClick={() => { setReschedOpen(item.id); setReschedDate(item.due_date || selectedDate); setReschedTime("") }}>
                                    <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Reschedule</TooltipContent>
                              </Tooltip>
                              {item.status !== "COMPLETED" && item.status !== "LOST" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => handleMarkCompleted(item.id)}>
                                      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Mark Completed</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" className="h-7 w-7"
                                    onClick={() => { setTimelineItem(item); setTimelineOpen(item.id) }}>
                                    <History className="h-3.5 w-3.5 text-gray-500" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">View Timeline</TooltipContent>
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

      {/* Calendar Grid */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Calendar — click a day</CardTitle></CardHeader>
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
                const dayItems = allItems.filter((i: any) => i.due_date === dateStr)
                const isToday = dateStr === format(today, "yyyy-MM-dd")
                const isSelected = dateStr === selectedDate
                cells.push(
                  <div key={dateStr} onClick={() => handleDayClick(dateStr)}
                    className={`min-h-[55px] bg-white p-1.5 cursor-pointer hover:bg-blue-50 transition-colors
                      ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}
                      ${isSelected ? "bg-blue-100 ring-2 ring-inset ring-blue-500" : ""}`}>
                    <div className={`text-xs font-bold ${isToday ? "text-blue-600" : isSelected ? "text-blue-700" : "text-gray-700"}`}>{d}</div>
                    <div className="text-[9px] text-blue-600 mt-0.5 leading-tight">
                      {dayItems.slice(0, 3).map((item: any) => (
                        <div key={item.id} className="truncate">{item.patient_name}</div>
                      ))}
                      {dayItems.length > 3 && <div className="text-gray-400">+{dayItems.length - 3}</div>}
                    </div>
                  </div>
                )
              }
              return cells
            })()}
          </div>
        </CardContent>
      </Card>

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
              <Textarea value={fbPatientFeedback} onChange={(e) => setFbPatientFeedback(e.target.value)} rows={2} placeholder="How is the patient feeling? Any discomfort?" />
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
                  <Button
                    key={opt}
                    type="button"
                    variant={fbInterested === opt ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setFbInterested(opt)}
                  >
                    {opt}
                  </Button>
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
                      {doctorsList.length === 0 && <SelectItem value="__loading__" disabled>No doctors available</SelectItem>}
                      {doctorsList.map((doc: any) => (
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
                      <p className="text-xs text-muted-foreground">No slots found. Select a time manually below.</p>
                    )}
                    <Select value={fbApptTime} onValueChange={setFbApptTime}>
                      <SelectTrigger><SelectValue placeholder="Or select time" /></SelectTrigger>
                      <SelectContent position="popper" className="max-h-[220px]">
                        {timeSlots.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            <div className="text-sm text-muted-foreground">
              To: <strong>{waItem?.patient_phone || ""}</strong>
            </div>
            <div className="space-y-2">
              <Label>Message Preview</Label>
              {waLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading template...</div>
              ) : (
                <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={8} className="text-sm font-mono" placeholder="Type your message..." />
              )}
            </div>
            {waTemplateError && (
              <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{waTemplateError}</div>
            )}
            <p className="text-xs text-muted-foreground">WhatsApp will open in a new tab with this message pre-filled. You can edit the message before sending.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setWaOpen(null); setWaMessage(""); setWaTemplateError("") }}>Cancel</Button>
              <Button className="flex-1" onClick={sendWhatsApp} disabled={!waMessage || waLoading}>
                <MessageCircle className="h-4 w-4 mr-2" /> Open WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Booking Dialog */}
      <Dialog open={!!apptOpen} onOpenChange={(o) => { if (!o) { setApptOpen(null); setApptItem(null); setApptDoctorId(""); setApptDate(""); setApptTime("") } }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Book Appointment (Follow-Up)</DialogTitle></DialogHeader>
          <div className="space-y-4 px-1">
            <p className="text-sm text-muted-foreground">Patient: <strong>{apptItem?.patient_name || ""}</strong></p>
            <div className="space-y-2">
              <Label>Assigned Doctor <span className="text-red-500">*</span></Label>
              <Select value={apptDoctorId} onValueChange={setApptDoctorId}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent position="popper" className="max-h-[220px]">
                  {doctorsList.length === 0 && <SelectItem value="__loading__" disabled>No doctors available</SelectItem>}
                  {doctorsList.map((doc: any) => (
                    <SelectItem key={doc.id} value={doc.id}>{doc.full_name || doc.name || doc.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Appointment Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} min={format(today, "yyyy-MM-dd")} />
            </div>
            {apptDoctorId && apptDate && (
              <div className="space-y-2">
                <Label>Available Time Slots</Label>
                {slotsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading slots...</div>
                ) : slotsList.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1.5 max-h-[180px] overflow-y-auto p-1 border rounded-md">
                    {slotsList.map((slot: string) => (
                      <Button key={slot} variant={apptTime === slot ? "default" : "outline"} size="sm"
                        className={`text-xs h-8 ${apptTime === slot ? "ring-2 ring-primary" : ""}`}
                        onClick={() => setApptTime(slot)}>
                        {slot.replace(/^(\d{2})(\d{2})$/, "$1:$2")}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">No available slots for this doctor on this date. Try another date or doctor.</p>
                )}
                <div className="space-y-2 mt-2">
                  <Label>Or enter time manually</Label>
                  <Select value={apptTime} onValueChange={setApptTime}>
                    <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                    <SelectContent position="popper" className="max-h-[220px]">
                      {timeSlots.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <Button className="w-full" onClick={handleBookAppointment}
              disabled={!apptDoctorId || !apptDate || !apptTime || apptSaving}>
              {apptSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Calendar className="h-4 w-4 mr-2" /> Book Appointment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={!!reschedOpen} onOpenChange={(o) => { if (!o) setReschedOpen(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reschedule Follow-Up</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={reschedDate} onChange={(e) => setReschedDate(e.target.value)} min={format(today, "yyyy-MM-dd")} />
            </div>
            <div className="space-y-2">
              <Label>New Time (optional)</Label>
              <Select value={reschedTime} onValueChange={setReschedTime}>
                <SelectTrigger><SelectValue placeholder="Select time" /></SelectTrigger>
                <SelectContent position="popper" className="max-h-[220px]">
                  {timeSlots.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              timelineEntries.map((entry: any, idx: number) => (
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