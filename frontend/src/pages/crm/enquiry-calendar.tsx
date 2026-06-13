import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays, Phone, MessageCircle, MessageSquare, CheckCircle, Clock,
  User, FileText, Tag, Activity, AlertTriangle, ChevronLeft, ChevronRight,
  Loader2, Send, Stethoscope, List, Grid3X3
} from "lucide-react"
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths } from "date-fns"
import { crmApi, campaignsApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"

const tabs = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This Week" },
  { id: "overdue", label: "Overdue" },
  { id: "recalls", label: "6 Month Recalls" },
  { id: "completed", label: "Completed" },
  { id: "calendar", label: "Calendar View" },
]

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-50 border-blue-200 text-blue-700",
  PENDING: "bg-yellow-50 border-yellow-200 text-yellow-700",
  CONTACTED: "bg-purple-50 border-purple-200 text-purple-700",
  RESPONDED: "bg-emerald-50 border-emerald-200 text-emerald-700",
  APPOINTMENT_BOOKED: "bg-indigo-50 border-indigo-200 text-indigo-700",
  COMPLETED: "bg-green-50 border-green-200 text-green-700",
  NO_RESPONSE: "bg-red-50 border-red-200 text-red-700",
  MISSED: "bg-red-50 border-red-200 text-red-600",
  CANCELLED: "bg-gray-50 border-gray-200 text-gray-500",
}

const typeLabels: Record<string, string> = {
  TREATMENT_CREATED: "Treatment Created",
  TREATMENT_UPDATED: "Treatment Updated",
  NEXT_SITTING: "Next Sitting",
  TREATMENT_COMPLETION: "Treatment Completion",
  "6_MONTH_RECALL": "6-Month Recall",
  MANUAL: "Follow-Up",
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"]
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function EnquiryCalendar() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const today = new Date()
  const todayStr = format(today, "yyyy-MM-dd")

  // Tab state
  const [activeTab, setActiveTab] = useState("today")

  // Calendar view state
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("month")
  const [calDate, setCalDate] = useState(today)

  // Action dialog states
  const [recordRespOpen, setRecordRespOpen] = useState<string | null>(null)
  const [respMsg, setRespMsg] = useState("")
  const [respStatus, setRespStatus] = useState("POSITIVE")
  const [respFeedback, setRespFeedback] = useState("")

  // Follow-up creation state
  const [savedResponseId, setSavedResponseId] = useState<string | null>(null)
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null)
  const [fuReason, setFuReason] = useState("")
  const [fuPriority, setFuPriority] = useState("NORMAL")
  const [fuDoctorId, setFuDoctorId] = useState("")
  const [fuDate, setFuDate] = useState("")
  const [fuTime, setFuTime] = useState("")
  const [fuNotes, setFuNotes] = useState("")

  const [communicateOpen, setCommunicateOpen] = useState<string | null>(null)
  const [commMessage, setCommMessage] = useState("")
  const [commNotes, setCommNotes] = useState("")

  // Query key depends on active tab
  const queryKey = activeTab === "calendar"
    ? ["enquiry", "calendar", calDate.toISOString().split("T")[0]]
    : ["enquiry", activeTab]

  const queryFn = activeTab === "calendar"
    ? () => crmApi.getTodaysEnquiries("calendar", format(calDate, "yyyy-MM-dd"))
    : () => crmApi.getTodaysEnquiries(activeTab)

  const { data: enquiries, isLoading } = useQuery({
    queryKey,
    queryFn,
    refetchInterval: 30000,
  })

  // Dashboard metrics for KPI cards (always uses today tab)
  const { data: dashboard } = useQuery({
    queryKey: ["enquiry", "dashboard"],
    queryFn: () => crmApi.getEnquiryDashboard(),
    refetchInterval: 30000,
  })

  const items: any[] = enquiries || []

  // Calendar navigation helpers
  function calNav(direction: -1 | 1) {
    if (calendarView === "day") setCalDate(d => direction > 0 ? addDays(d, 1) : subDays(d, 1))
    else if (calendarView === "week") setCalDate(d => direction > 0 ? addWeeks(d, 1) : subWeeks(d, 1))
    else setCalDate(d => direction > 0 ? addMonths(d, 1) : subMonths(d, 1))
  }

  function calLabel(): string {
    if (calendarView === "day") return format(calDate, "MMM dd, yyyy")
    if (calendarView === "week") {
      const sw = startOfWeek(calDate, { weekStartsOn: 1 })
      const ew = endOfWeek(calDate, { weekStartsOn: 1 })
      return `${format(sw, "MMM dd")} - ${format(ew, "MMM dd, yyyy")}`
    }
    return format(calDate, "MMMM yyyy")
  }

  // For month calendar: days grid
  const monthStart = startOfMonth(calDate)
  const monthEnd = endOfMonth(calDate)
  const startDay = monthStart.getDay()
  const daysInMonth = monthEnd.getDate()
  const calDays: (number | null)[] = []
  for (let i = 0; i < startDay; i++) calDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d)

  // For month calendar: events per date
  const monthStartStr = format(monthStart, "yyyy-MM-dd")
  const monthEndStr = format(monthEnd, "yyyy-MM-dd")
  const { data: monthEvents } = useQuery({
    queryKey: ["enquiry-calendar", monthStartStr, monthEndStr],
    queryFn: () => campaignsApi.analytics.followUpCalendar(monthStartStr, monthEndStr),
    enabled: activeTab === "calendar" && calendarView === "month",
  })

  const eventsByDate: Record<string, number> = {}
  ;(monthEvents || []).forEach((e: any) => {
    const d = e.follow_up_date
    eventsByDate[d] = (eventsByDate[d] || 0) + 1
  })

  // Mutations
  const markDoneMutation = useMutation({
    mutationFn: (id: string) => crmApi.markDone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enquiry"] })
      addToast({ title: "Done", description: "Enquiry marked completed", variant: "success" })
    },
  })

  const recordRespMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      crmApi.recordResponse(id, data),
    onSuccess: (resp: any, vars: { id: string; data: any }) => {
      queryClient.invalidateQueries({ queryKey: ["enquiry"] })
      queryClient.invalidateQueries({ queryKey: ["patient"] })
      const severe = ["NEEDS_ATTENTION", "COMPLAINT", "EMERGENCY"].includes(vars.data.response_status)
      if (severe) {
        setSavedResponseId(resp.response_id)
        const enq = items.find((e: any) => e.id === vars.id)
        setSavedPatientId(enq?.patient_id || null)
        setFuReason("")
        setFuPriority("NORMAL")
        setFuDoctorId(enq?.doctor_id || "")
        setFuDate("")
        setFuTime("")
        setFuNotes("")
        addToast({ title: "Response saved", description: "Now create a follow-up for this patient" })
      } else {
        setSavedResponseId(null)
        setSavedPatientId(null)
        setRecordRespOpen(null)
        setRespMsg(""); setRespFeedback("")
        addToast({ title: "Recorded", description: "Response saved", variant: "success" })
      }
    },
    onError: (err: any) =>
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const communicateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { channel: string; message: string; notes?: string } }) =>
      crmApi.communicate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enquiry"] })
      addToast({ title: "Sent", description: "Communication logged", variant: "success" })
      setCommunicateOpen(null); setCommMessage(""); setCommNotes("")
    },
    onError: (err: any) =>
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const createFuMutation = useMutation({
    mutationFn: (data: any) => crmApi.createFollowUpFromEnquiry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enquiry"] })
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      addToast({ title: "Follow-Up Created", description: "Appointment auto-created", variant: "success" })
      setSavedResponseId(null); setSavedPatientId(null)
      setRecordRespOpen(null); setRespMsg(""); setRespFeedback("")
      setFuReason(""); setFuPriority("NORMAL"); setFuDoctorId(""); setFuDate(""); setFuTime(""); setFuNotes("")
    },
    onError: (err: any) =>
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  function handleCall(phone: string) {
    if (phone) window.open(`tel:${phone}`, "_blank")
  }

  function handleWhatsApp(phone: string) {
    if (phone) {
      const cleaned = phone.replace(/[^0-9]/g, "")
      window.open(`https://wa.me/${cleaned}`, "_blank")
    }
  }

  function handleRecordResponse(id: string) {
    setRecordRespOpen(id)
    setRespMsg("")
    setRespStatus("POSITIVE")
    setRespFeedback("")
  }

  function getKpiValue(key: string): number {
    if (!dashboard) return 0
    return dashboard[key] ?? 0
  }

  function renderEnquiryRow(enq: any) {
    return (
      <div key={enq.id} className="rounded-lg border p-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-semibold">{enq.patient_name}</span>
              {enq.patient_id && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  #{enq.patient_id.slice(-8)}
                </span>
              )}
              {enq.follow_up_type && (
                <Badge variant="outline" className="text-[10px]">
                  {typeLabels[enq.follow_up_type] || enq.follow_up_type}
                </Badge>
              )}
              {enq.treatment_status && (
                <Badge variant="outline" className="text-[10px] bg-blue-50">
                  {enq.treatment_status}
                </Badge>
              )}
              <Badge className={`text-[10px] ${statusColors[enq.status] || ""}`}>
                {enq.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {enq.patient_phone && (
                <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {enq.patient_phone}</div>
              )}
              {enq.doctor_name && (
                <div className="flex items-center gap-1"><Activity className="h-3 w-3" /> Dr. {enq.doctor_name}</div>
              )}
              {enq.treatment_name && (
                <div className="flex items-center gap-1"><FileText className="h-3 w-3" /> {enq.treatment_name}</div>
              )}
              {enq.case_number && (
                <div className="flex items-center gap-1"><Tag className="h-3 w-3" /> Case: #{enq.case_number}</div>
              )}
              {enq.follow_up_date && (
                <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {format(new Date(enq.follow_up_date), "dd MMM yy")}</div>
              )}
              {enq.billing_paid_at && (
                <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> Paid: {format(new Date(enq.billing_paid_at), "dd MMM yy")}</div>
              )}
            </div>
            {enq.notes && <p className="mt-1 text-xs text-gray-400">{enq.notes}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {enq.patient_phone && (
              <Button variant="ghost" size="icon-sm" className="text-green-600"
                onClick={() => handleCall(enq.patient_phone)} title="Call">
                <Phone className="h-4 w-4" />
              </Button>
            )}
            {enq.patient_phone && (
              <Button variant="ghost" size="icon-sm" className="text-blue-600"
                onClick={() => handleWhatsApp(enq.patient_phone)} title="WhatsApp">
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" className="text-purple-600"
              onClick={() => handleRecordResponse(enq.id)} title="Record Response">
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="text-green-600"
              onClick={() => markDoneMutation.mutate(enq.id)}
              disabled={markDoneMutation.isPending} title="Mark Done">
              <CheckCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enquiry Calendar"
        description="Manage patient enquiries, record responses, and create follow-ups."
      />

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Today's</p>
            <p className="text-xl font-bold text-blue-600">{getKpiValue("todays_enquiries")}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-bold text-yellow-600">{getKpiValue("pending_enquiries")}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-xl font-bold text-green-600">{getKpiValue("completed_enquiries")}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Emergency</p>
            <p className="text-xl font-bold text-red-600">{getKpiValue("emergency_responses")}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Follow-Ups</p>
            <p className="text-xl font-bold text-purple-600">{getKpiValue("follow_ups_created")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-sm font-medium rounded-t-md transition-colors
              ${activeTab === t.id
                ? "bg-white border border-b-white rounded-b-none text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-gray-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Calendar navigation (only for calendar tab) */}
      {activeTab === "calendar" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 border rounded-md">
            <Button variant="ghost" size="icon-sm" onClick={() => calNav(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[160px] text-center">{calLabel()}</span>
            <Button variant="ghost" size="icon-sm" onClick={() => calNav(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Input type="date" value={format(calDate, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && setCalDate(new Date(e.target.value + "T00:00:00"))}
            className="w-40 text-sm" />
          <div className="flex gap-1 ml-auto">
            {(["day", "week", "month"] as const).map((v) => (
              <Button key={v} variant={calendarView === v ? "default" : "outline"} size="sm"
                onClick={() => setCalendarView(v)} className="text-xs">
                {v === "day" ? <List className="h-3 w-3 mr-1" /> : v === "week" ? <Grid3X3 className="h-3 w-3 mr-1" /> : <CalendarDays className="h-3 w-3 mr-1" />}
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Content area */}
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === "calendar" && calendarView === "month" ? (
            /* Month Calendar Grid */
            <div>
              <div className="grid grid-cols-7 gap-px rounded-lg border bg-gray-100">
                {DAYS.map((d) => (
                  <div key={d} className="bg-white p-2 text-center text-xs font-semibold text-gray-500">{d}</div>
                ))}
                {calDays.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} className="bg-gray-50 p-2" />
                  const dateStr = `${format(calDate, "yyyy-MM").replace(/-/g, "-")}-${String(day).padStart(2, "0")}`
                  const actualDateStr = `${format(calDate, "yyyy-MM")}-${String(day).padStart(2, "0")}`
                  const count = eventsByDate[actualDateStr] || 0
                  const isToday = actualDateStr === todayStr
                  const isSelected = actualDateStr === format(calDate, "yyyy-MM-dd")
                  return (
                    <div key={actualDateStr} onClick={() => { setCalDate(new Date(actualDateStr + "T00:00:00")); setCalendarView("day") }}
                      className={`min-h-[50px] bg-white p-1.5 cursor-pointer hover:bg-blue-50
                        ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}
                        ${isSelected ? "bg-blue-50" : ""}`}>
                      <div className={`text-xs font-bold ${isToday ? "text-blue-600" : "text-gray-700"}`}>{day}</div>
                      {count > 0 && <div className="text-[10px] text-blue-500 font-medium mt-0.5">{count} enquiry{count > 1 ? "ies" : "y"}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {activeTab === "today" && "No enquiries due today"}
                {activeTab === "tomorrow" && "No enquiries due tomorrow"}
                {activeTab === "week" && "No enquiries this week"}
                {activeTab === "overdue" && "No overdue enquiries"}
                {activeTab === "recalls" && "No pending 6-month recalls"}
                {activeTab === "completed" && "No completed enquiries"}
                {activeTab === "calendar" && "No enquiries for this date"}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {items.map((enq: any) => renderEnquiryRow(enq))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Response Dialog */}
      <Dialog open={!!recordRespOpen} onOpenChange={(o) => { if (!o) { setRecordRespOpen(null); setSavedResponseId(null); setSavedPatientId(null) } }}>
        <DialogContent className={savedResponseId ? "sm:max-w-lg" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle>{savedResponseId ? "Create Follow-Up" : "Record Patient Response"}</DialogTitle>
            <DialogDescription>
              {savedResponseId
                ? "This patient needs a hospital visit. Create a follow-up to schedule an appointment."
                : "Record the patient's response to this enquiry."}
            </DialogDescription>
          </DialogHeader>

          {!savedResponseId ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Response Status</Label>
                <Select value={respStatus} onValueChange={setRespStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POSITIVE">Positive - Feeling Good</SelectItem>
                    <SelectItem value="NEGATIVE">Negative - Unsatisfied</SelectItem>
                    <SelectItem value="NEEDS_ATTENTION">Needs Attention - Still has pain/issues</SelectItem>
                    <SelectItem value="COMPLAINT">Complaint</SelectItem>
                    <SelectItem value="EMERGENCY">Emergency - Needs immediate help</SelectItem>
                    <SelectItem value="NOT_INTERESTED">Not Interested - Declined</SelectItem>
                    <SelectItem value="NO_RESPONSE">No Response</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Patient Message</Label>
                <Textarea value={respMsg} onChange={(e) => setRespMsg(e.target.value)} rows={3}
                  placeholder='e.g. "Feeling good", "Still having pain"' />
              </div>
              <div className="space-y-2">
                <Label>Feedback</Label>
                <Select value={respFeedback} onValueChange={setRespFeedback}>
                  <SelectTrigger><SelectValue placeholder="Auto-detect from status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Auto-detect from status</SelectItem>
                    <SelectItem value="POSITIVE">Positive</SelectItem>
                    <SelectItem value="NEGATIVE">Negative</SelectItem>
                    <SelectItem value="NEUTRAL">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full gap-2" onClick={() => {
                if (recordRespOpen) recordRespMutation.mutate({
                  id: recordRespOpen,
                  data: {
                    response_message: respMsg || undefined,
                    response_status: respStatus,
                    feedback: respFeedback || undefined,
                  }
                })
              }} disabled={recordRespMutation.isPending}>
                {recordRespMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Response
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Response recorded as <strong>{respStatus}</strong></p>
                    <p className="mt-1 text-yellow-700">Fill in the details to create a follow-up and auto-schedule an appointment.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Follow-Up Reason *</Label>
                <Textarea value={fuReason} onChange={(e) => setFuReason(e.target.value)} rows={2}
                  placeholder="Why does the patient need to visit again?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={fuPriority} onValueChange={setFuPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="NORMAL">Normal</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned Doctor *</Label>
                  <Input value={fuDoctorId} onChange={(e) => setFuDoctorId(e.target.value)} placeholder="Doctor ID" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Follow-Up Date *</Label>
                  <Input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input type="time" value={fuTime} onChange={(e) => setFuTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={fuNotes} onChange={(e) => setFuNotes(e.target.value)} rows={2} placeholder="Additional notes..." />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => {
                  setSavedResponseId(null); setSavedPatientId(null)
                  setRecordRespOpen(null); setRespMsg(""); setRespFeedback("")
                }}>
                  Cancel
                </Button>
                <Button className="flex-1 gap-2" onClick={() => {
                  if (!fuDate || !fuDoctorId) {
                    addToast({ title: "Required fields", description: "Date and Doctor are required", variant: "destructive" })
                    return
                  }
                  createFuMutation.mutate({
                    patient_id: savedPatientId,
                    response_id: savedResponseId,
                    follow_up_reason: fuReason || "Patient requires follow-up visit",
                    priority: fuPriority,
                    doctor_id: fuDoctorId,
                    follow_up_date: fuDate,
                    follow_up_time: fuTime || undefined,
                    notes: fuNotes || undefined,
                  })
                }} disabled={createFuMutation.isPending}>
                  {createFuMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Stethoscope className="h-4 w-4" />
                  Create Follow-Up & Appointment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Communicate Dialog */}
      <Dialog open={!!communicateOpen} onOpenChange={(o) => { if (!o) setCommunicateOpen(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Send WhatsApp Message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={commMessage} onChange={(e) => setCommMessage(e.target.value)} rows={5}
                placeholder="Enter WhatsApp message..." />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input value={commNotes} onChange={(e) => setCommNotes(e.target.value)} placeholder="Call notes..." />
            </div>
            <Button className="w-full gap-2" onClick={() => {
              if (communicateOpen) communicateMutation.mutate({
                id: communicateOpen,
                data: { channel: "WHATSAPP", message: commMessage || "Patient contacted", notes: commNotes || undefined }
              })
            }} disabled={communicateMutation.isPending}>
              {communicateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" /> Send WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}