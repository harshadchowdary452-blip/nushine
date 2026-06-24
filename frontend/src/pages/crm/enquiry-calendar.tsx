import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, Phone, MessageCircle, CheckCircle, Clock, Loader2, Plus } from "lucide-react"
import { format, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths } from "date-fns"
import { enquiriesApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

const statusColors: Record<string, string> = {
  NEW: "bg-blue-50 border-blue-200 text-blue-700",
  CONTACTED: "bg-purple-50 border-purple-200 text-purple-700",
  INTERESTED: "bg-emerald-50 border-emerald-200 text-emerald-700",
  NOT_INTERESTED: "bg-gray-50 border-gray-200 text-gray-500",
  CONVERTED: "bg-green-50 border-green-200 text-green-700",
  LOST: "bg-red-50 border-red-200 text-red-600",
}

const treatmentLabels: Record<string, string> = {
  IMPLANT: "Implant", BRACES: "Braces", SMILE_DESIGN: "Smile Design",
  CROWN: "Crown", BRIDGE: "Bridge", VENEER: "Veneer", RCT: "RCT",
  EXTRACTION: "Extraction", DENTURE: "Denture", SCALING: "Scaling",
  FILLING: "Filling", BUDGET_APPROVAL: "Budget Approval", OTHER: "Other",
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

export default function EnquiryCalendar({ embedded }: { embedded?: boolean }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const today = new Date()
  const [calDate, setCalDate] = useState(today)
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("month")
  const [actionOpen, setActionOpen] = useState<string | null>(null)
  const [actionType, setActionType] = useState("CALL")
  const [actionNotes, setActionNotes] = useState("")
  const [nextFuDate, setNextFuDate] = useState("")

  const monthStart = startOfMonth(calDate)
  const monthEnd = endOfMonth(calDate)
  const startDay = monthStart.getDay()
  const daysInMonth = monthEnd.getDate()
  const calDays: (number | null)[] = []
  for (let i = 0; i < startDay; i++) calDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d)

  const ms = format(monthStart, "yyyy-MM-dd")
  const me = format(monthEnd, "yyyy-MM-dd")

  const { data: enquiries, isLoading } = useQuery({
    queryKey: ["enquiries", "calendar", ms, me],
    queryFn: () => enquiriesApi.calendar({ start_date: ms, end_date: me }),
  })
  const items: any[] = enquiries || []

  const eventsByDate: Record<string, any[]> = {}
  items.forEach((e: any) => {
    const d = e.enquiry_date
    if (d) { eventsByDate[d] = eventsByDate[d] || []; eventsByDate[d].push(e) }
  })

  const followUpMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => enquiriesApi.createFollowUp(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enquiries"] })
      addToast({ title: "Action Recorded", variant: "success" })
      setActionOpen(null); setActionNotes(""); setNextFuDate("")
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  function calNav(d: -1 | 1) {
    if (calendarView === "day") setCalDate(c => d > 0 ? addDays(c, 1) : subDays(c, 1))
    else if (calendarView === "week") setCalDate(c => d > 0 ? addWeeks(c, 1) : subWeeks(c, 1))
    else setCalDate(c => d > 0 ? addMonths(c, 1) : subMonths(c, 1))
  }

  function calLabel() {
    if (calendarView === "day") return format(calDate, "MMM dd, yyyy")
    if (calendarView === "week") {
      const sw = startOfWeek(calDate, { weekStartsOn: 1 }), ew = endOfWeek(calDate, { weekStartsOn: 1 })
      return `${format(sw, "MMM dd")} - ${format(ew, "MMM dd, yyyy")}`
    }
    return format(calDate, "MMMM yyyy")
  }

  function openAction(enqId: string, action: string) {
    setActionOpen(enqId)
    setActionType(action)
    setActionNotes("")
    setNextFuDate("")
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader title="Enquiry Calendar" description="Track and manage patient enquiries" />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 border rounded-md">
          <Button variant="ghost" size="icon-sm" onClick={() => calNav(-1)}><CalendarDays className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold min-w-[160px] text-center">{calLabel()}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => calNav(1)}><CalendarDays className="h-4 w-4" /></Button>
        </div>
        <Input type="date" value={format(calDate, "yyyy-MM-dd")}
          onChange={(e) => e.target.value && setCalDate(new Date(e.target.value + "T00:00:00"))}
          className="w-40 text-sm" />
        <div className="flex gap-1 ml-auto">
          {(["day", "week", "month"] as const).map((v) => (
            <Button key={v} variant={calendarView === v ? "default" : "outline"} size="sm"
              onClick={() => setCalendarView(v)} className="text-xs">
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No enquiries found for this period</div>
          ) : calendarView === "month" ? (
            <div className="grid grid-cols-7 gap-px rounded-lg border bg-gray-100">
              {DAYS.map((d) => <div key={d} className="bg-white p-2 text-center text-xs font-semibold text-gray-500">{d}</div>)}
              {calDays.map((day, i) => {
                if (day === null) return <div key={`e-${i}`} className="bg-gray-50 p-2" />
                const dateStr = `${format(calDate, "yyyy-MM")}-${String(day).padStart(2, "0")}`
                const enqs = eventsByDate[dateStr] || []
                const isToday = dateStr === format(today, "yyyy-MM-dd")
                return (
                  <div key={dateStr} onClick={() => { setCalDate(new Date(dateStr + "T00:00:00")); setCalendarView("day") }}
                    className={`min-h-[50px] bg-white p-1.5 cursor-pointer hover:bg-blue-50 ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}`}>
                    <div className={`text-xs font-bold ${isToday ? "text-blue-600" : "text-gray-700"}`}>{day}</div>
                    {enqs.map((e: any) => (
                      <div key={e.id} className="text-[9px] truncate text-blue-600 mt-0.5">{e.patient_name}</div>
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {items.map((enq: any) => (
                <div key={enq.id} className="rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{enq.patient_name}</span>
                        <Badge className={`text-[10px] ${statusColors[enq.status] || ""}`}>{enq.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {enq.patient_phone || "—"}</div>
                        <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {treatmentLabels[enq.treatment_interest] || enq.treatment_interest}</div>
                        <div className="flex items-center gap-1">Staff: {enq.assigned_staff || "Unassigned"}</div>
                        {enq.next_follow_up_date && <div>Next FU: {enq.next_follow_up_date}</div>}
                      </div>
                      {enq.notes && <p className="mt-1 text-xs text-gray-400">{enq.notes}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {enq.patient_phone && (
                        <Button variant="ghost" size="icon-sm" className="text-green-600"
                          onClick={() => openAction(enq.id, "CALL")} title="Log Call">
                          <Phone className="h-4 w-4" />
                        </Button>
                      )}
                      {enq.patient_phone && (
                        <Button variant="ghost" size="icon-sm" className="text-blue-600"
                          onClick={() => openAction(enq.id, "WHATSAPP")} title="Log WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-sm" className="text-purple-600"
                        onClick={() => openAction(enq.id, "MARK_INTERESTED")} title="Mark Interested">
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!actionOpen} onOpenChange={(o) => { if (!o) { setActionOpen(null); setActionNotes(""); setNextFuDate("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Enquiry Action</DialogTitle>
            <DialogDescription>
              {actionType === "CALL" ? "Record a call made to this enquiry" :
               actionType === "WHATSAPP" ? "Record a WhatsApp message sent" :
               actionType === "MARK_INTERESTED" ? "Mark this patient as interested" :
               actionType === "MARK_NOT_INTERESTED" ? "Mark as not interested" : "Record action"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Action Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALL">Phone Call</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp Message</SelectItem>
                  <SelectItem value="BOOK_APPOINTMENT">Book Appointment</SelectItem>
                  <SelectItem value="MARK_INTERESTED">Mark Interested</SelectItem>
                  <SelectItem value="MARK_NOT_INTERESTED">Mark Not Interested</SelectItem>
                  <SelectItem value="CONVERT_TO_TREATMENT">Convert to Treatment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} rows={3} placeholder="Action notes..." />
            </div>
            <div className="space-y-2">
              <Label>Next Follow-Up Date (optional)</Label>
              <Input type="date" value={nextFuDate} onChange={(e) => setNextFuDate(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => {
              if (actionOpen) followUpMutation.mutate({
                id: actionOpen,
                data: { action: actionType, notes: actionNotes || undefined, next_follow_up_date: nextFuDate || undefined }
              })
            }} disabled={followUpMutation.isPending}>
              {followUpMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Action
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
