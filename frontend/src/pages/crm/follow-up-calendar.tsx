import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, CalendarDays, Clock, User, Phone, FileText, Activity, Tag } from "lucide-react"
import { campaignsApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-50 border-blue-200 text-blue-700",
  COMPLETED: "bg-green-50 border-green-200 text-green-700",
  MISSED: "bg-red-50 border-red-200 text-red-700",
  CANCELLED: "bg-gray-50 border-gray-200 text-gray-500",
  PENDING: "bg-yellow-50 border-yellow-200 text-yellow-700",
  CONTACTED: "bg-purple-50 border-purple-200 text-purple-700",
  RESPONDED: "bg-emerald-50 border-emerald-200 text-emerald-700",
  APPOINTMENT_BOOKED: "bg-indigo-50 border-indigo-200 text-indigo-700",
  NO_RESPONSE: "bg-red-50 border-red-200 text-red-700",
}

const typeLabels: Record<string, string> = {
  "1_DAY": "1-Day Follow-Up",
  "6_MONTH_RECALL": "6-Month Recall",
  MANUAL: "Manual",
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export default function FollowUpCalendar() {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monthStart = new Date(currentYear, currentMonth, 1)
  const monthEnd = new Date(currentYear, currentMonth + 1, 0)

  const startStr = monthStart.toISOString().split("T")[0]
  const endStr = monthEnd.toISOString().split("T")[0]

  const { data: events, isLoading } = useQuery({
    queryKey: ["follow-up-calendar", startStr, endStr],
    queryFn: () => campaignsApi.analytics.followUpCalendar(startStr, endStr),
  })

  const items: any[] = events || []

  const daysInMonth = monthEnd.getDate()
  const startDay = monthStart.getDay()

  const calendarDays = useMemo(() => {
    const cells: (number | null)[] = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [daysInMonth, startDay])

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    items.forEach((e: any) => {
      const date = e.follow_up_date
      if (!map[date]) map[date] = []
      map[date].push(e)
    })
    return map
  }, [items])

  const selectedTasks = selectedDate ? (eventsByDate[selectedDate] || []) : []

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1) }
    else setCurrentMonth(currentMonth - 1)
    setSelectedDate(null)
  }

  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1) }
    else setCurrentMonth(currentMonth + 1)
    setSelectedDate(null)
  }

  const todayStr = today.toISOString().split("T")[0]

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="Follow-Up Calendar" description="View scheduled follow-ups by month. Click a date to see details." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {MONTHS[currentMonth]} {currentYear}
              </CardTitle>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="rounded-md border p-2 hover:bg-gray-50">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={nextMonth} className="rounded-md border p-2 hover:bg-gray-50">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-px rounded-lg border bg-gray-100">
                {DAYS.map((d) => (
                  <div key={d} className="bg-white p-2 text-center text-xs font-semibold text-gray-500">{d}</div>
                ))}
                {calendarDays.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} className="bg-gray-50 p-2" />
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  const dayEvents = eventsByDate[dateStr] || []
                  const isToday = dateStr === todayStr
                  const isSelected = dateStr === selectedDate
                  return (
                    <button key={dateStr} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`min-h-[80px] bg-white p-1 text-left transition-colors hover:bg-blue-50 cursor-pointer
                        ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}
                        ${isSelected ? "bg-blue-50 ring-2 ring-inset ring-blue-500" : ""}`}>
                      <div className={`mb-1 text-xs font-bold ${isToday ? "text-blue-600" : "text-gray-700"}`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev: any) => (
                          <div key={ev.id}
                            className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                              statusColors[ev.status]?.split(" ")[0] || "bg-gray-50"
                            }`}
                            title={`${ev.patient_name} - ${ev.status}`}>
                            {ev.patient_name?.split(" ")[0] || "#"}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected Date Task List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Select a Date"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <p className="text-center text-sm text-gray-400 py-8">Click a date on the calendar to view follow-ups</p>
            ) : selectedTasks.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No follow-ups for this date</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {selectedTasks.map((ev: any) => (
                  <div key={ev.id} className="rounded-lg border p-3 space-y-2 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-semibold">{ev.patient_name}</span>
                      </div>
                      <Badge className={`text-[10px] ${statusColors[ev.status] || "bg-gray-50 text-gray-600"}`}>
                        {ev.status}
                      </Badge>
                    </div>
                    {ev.patient_phone && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Phone className="h-3 w-3" />
                        {ev.patient_phone}
                      </div>
                    )}
                    {ev.doctor_name && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Activity className="h-3 w-3" />
                        Dr. {ev.doctor_name}
                      </div>
                    )}
                    {ev.follow_up_type && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Tag className="h-3 w-3" />
                        {typeLabels[ev.follow_up_type] || ev.follow_up_type}
                      </div>
                    )}
                    {ev.treatment_name && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <FileText className="h-3 w-3" />
                        {ev.treatment_name}
                      </div>
                    )}
                    {ev.invoice_number && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <FileText className="h-3 w-3" />
                        Invoice: {ev.invoice_number}
                      </div>
                    )}
                    {ev.follow_up_time && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        {ev.follow_up_time}
                      </div>
                    )}
                    {ev.notes && (
                      <p className="text-xs text-gray-400 mt-1">{ev.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
