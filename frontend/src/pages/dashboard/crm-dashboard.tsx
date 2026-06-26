import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  CalendarDays, Phone, MessageCircle, CheckCircle, Clock, FileText, History,
  RotateCcw, User, Stethoscope, Loader2, Activity, TrendingUp, Users,
  BarChart3, PieChart, Target, Send, Award, DollarSign, ArrowRight,
  ChevronRight, BookOpen, AlertCircle, ThumbsUp, ThumbsDown, Meh,
  Frown, Smile, HeartPulse, Zap, UserPlus, Search, Filter, X,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import { crmApi, doctorsApi, campaignsApi } from "@/services/endpoints"
import DashboardDateFilter, { type DateRangePreset } from "@/components/ui/dashboard-date-filter"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import DentalEmptyState from "@/components/ui/dental-empty-state"
import ExpensesVsRevenueQuickView from "@/components/dashboard/expenses-vs-revenue-quick-view"
import { useAuthStore } from "@/store/authStore"

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316", "#14B8A6", "#84CC16"]
const GLASS = "bg-white/80 backdrop-blur-xl border border-white/20 shadow-lg"

const fuTypeLabels: Record<string, string> = {
  "1_DAY_FOLLOW_UP": "1-Day FU", "7_DAY_FOLLOW_UP": "7-Day FU",
  "6_MONTH_RECALL": "6-Month Recall", "12_MONTH_RECALL": "12-Month Recall",
  CUSTOM_FOLLOW_UP: "Custom FU", ENQUIRY: "Enquiry", MANUAL: "Manual",
}
const fuTypeColors: Record<string, string> = {
  "1_DAY_FOLLOW_UP": "bg-blue-50 text-blue-700 border-blue-200",
  "7_DAY_FOLLOW_UP": "bg-purple-50 text-purple-700 border-purple-200",
  "6_MONTH_RECALL": "bg-amber-50 text-amber-700 border-amber-200",
  "12_MONTH_RECALL": "bg-green-50 text-green-700 border-green-200",
  CUSTOM_FOLLOW_UP: "bg-gray-50 text-gray-700 border-gray-200",
  ENQUIRY: "bg-indigo-50 text-indigo-700 border-indigo-200",
  MANUAL: "bg-rose-50 text-rose-700 border-rose-200",
}
const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800", CONTACTED: "bg-blue-100 text-blue-800",
  INTERESTED: "bg-emerald-100 text-emerald-800", APPOINTMENT_BOOKED: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-green-100 text-green-800", NO_RESPONSE: "bg-gray-100 text-gray-500",
  LOST: "bg-red-100 text-red-700", APPOINTMENT_REQUIRED: "bg-purple-100 text-purple-800",
}

const COLORS_RESPONSE = ["#10B981", "#34D399", "#FBBF24", "#F59E0B", "#9CA3AF", "#EF4444"]

function KpiCard({ title, value, icon: Icon, color, onClick }: any) {
  const colorMap: Record<string, string> = {
    primary: "from-indigo-500 to-blue-600", info: "from-blue-500 to-cyan-600",
    success: "from-emerald-500 to-green-600", warning: "from-amber-500 to-yellow-600",
    danger: "from-red-500 to-rose-600", purple: "from-purple-500 to-violet-600",
    pink: "from-pink-500 to-rose-600", teal: "from-teal-500 to-cyan-600",
  }
  return (
    <div onClick={onClick} className={cn(GLASS, "rounded-2xl p-4 cursor-pointer hover:shadow-xl transition-all duration-300 group border", onClick ? "cursor-pointer" : "")}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={cn("rounded-xl p-2.5 text-white bg-gradient-to-br shadow-sm", colorMap[color] || colorMap.primary)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

function FunnelStep({ label, value, total, color, isLast }: any) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
      <div className={cn("w-full h-2 rounded-full", color)} style={{ opacity: Math.max(0.15, pct / 100) }} />
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500 text-center leading-tight">{label}</p>
      <p className="text-[10px] font-semibold text-gray-400">{pct}%</p>
      {!isLast && <ChevronRight className="h-3.5 w-3.5 text-gray-300 mt-0.5" />}
    </div>
  )
}

export default function CrmDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [period, setPeriod] = useState<DateRangePreset>("today")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [doctorFilter, setDoctorFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [upcomingTab, setUpcomingTab] = useState("tomorrow")
  const [showFilters, setShowFilters] = useState(false)

  const { data: doctorsList } = useQuery({
    queryKey: ["dashboard-doctors"],
    queryFn: () => doctorsApi.list(),
    staleTime: 60000,
  })
  const doctorOptions = Array.isArray(doctorsList) ? doctorsList : doctorsList?.items || []

  const params = useMemo(() => {
    const periodMap: Record<string, string> = {
      today: "today", tomorrow: "tomorrow", week: "this_week", month: "this_month",
      last_month: "last_month", quarter: "this_quarter", year: "this_year", custom: "custom",
    }
    const p: Record<string, string> = { period: periodMap[period] || period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    if (doctorFilter) p.doctor = doctorFilter
    if (typeFilter) p.type = typeFilter
    if (statusFilter) p.status = statusFilter
    return p
  }, [period, startDate, endDate, doctorFilter, typeFilter, statusFilter])

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-enhanced-dashboard", params],
    queryFn: () => crmApi.enhancedDashboard(params),
    staleTime: 30000,
  })

  const { data: campaignWidgets } = useQuery({
    queryKey: ["campaigns", "dashboard-widgets"],
    queryFn: () => campaignsApi.dashboardWidgets(),
    staleTime: 30000,
  })

  const overview = useMemo(() => data?.overview ?? {}, [data])
  const workQueue = useMemo(() => data?.work_queue ?? [], [data])
  const fuSummary = useMemo(() => data?.follow_up_summary ?? {}, [data])
  const funnel = useMemo(() => data?.conversion_funnel ?? {}, [data])
  const responses = useMemo(() => data?.patient_responses ?? [], [data])
  const conditions = useMemo(() => data?.patient_conditions ?? [], [data])
  const treatmentPerf = useMemo(() => data?.treatment_performance ?? [], [data])
  const doctorEngagement = useMemo(() => data?.doctor_engagement ?? [], [data])
  const acquisition = useMemo(() => data?.patient_acquisition ?? [], [data])
  const revenueBySource = useMemo(() => data?.revenue_by_source ?? [], [data])
  const timeline = useMemo(() => data?.timeline ?? [], [data])
  const upcomingWork = useMemo(() => data?.upcoming_work ?? {}, [data])

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-60 rounded-xl" />
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <DentalEmptyState icon={AlertCircle} title="Error Loading Dashboard"
          description="Could not load CRM dashboard data. Try adjusting filters or check back later." />
      </div>
    )
  }

  function navToCalendar(filter?: string) {
    navigate("/crm/enquiry-calendar")
  }

  return (
    <div className="space-y-5 p-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">CRM Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Patient Engagement & Retention · Real-time operational view</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DashboardDateFilter value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}
            className={cn("h-9 gap-1.5 text-xs", showFilters && "bg-primary text-white border-primary")}>
            <Filter className="h-3.5 w-3.5" /> Filters
          </Button>
          {period === "custom" && (
            <>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-[130px] rounded-xl text-xs" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="h-9 w-[130px] rounded-xl text-xs" />
            </>
          )}
        </div>
      </div>

      {/* ── FILTERS ── */}
      {showFilters && (
        <div className={cn(GLASS, "rounded-2xl p-4 flex flex-wrap gap-3 items-end")}>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Doctor</label>
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger className="h-8 w-40 text-xs rounded-xl"><SelectValue placeholder="All Doctors" /></SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="" className="text-xs">All Doctors</SelectItem>
                {doctorOptions.map((d: any) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">{d.full_name || d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Follow-Up Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-36 text-xs rounded-xl"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="" className="text-xs">All Types</SelectItem>
                {Object.entries(fuTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs rounded-xl"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="" className="text-xs">All Status</SelectItem>
                {Object.entries(statusColors).map(([k]) => (
                  <SelectItem key={k} value={k} className="text-xs">{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setDoctorFilter(""); setTypeFilter(""); setStatusFilter("") }}
            className="h-8 text-xs">Clear</Button>
        </div>
      )}

      {/* ── QUICK ACTIONS ── */}
      <div className={cn(GLASS, "rounded-2xl p-3 flex flex-wrap items-center gap-2")}>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Quick</span>
        {[
          { label: "Enquiry Calendar", icon: CalendarDays, path: "/crm/enquiry-calendar" },
          { label: "Add Lead", icon: UserPlus, path: "/leads?action=create" },
          { label: "Send WhatsApp", icon: Send, path: "/whatsapp" },
        ].map((a) => (
          <Button key={a.label} variant="outline" size="sm" onClick={() => navigate(a.path)}
            className="h-8 text-xs gap-1.5 rounded-xl">
            <a.icon className="h-3.5 w-3.5" />{a.label}
          </Button>
        ))}
      </div>

      {/* ════════════════════════════════════
         SECTION 1: TODAY'S CRM OVERVIEW
         ════════════════════════════════════ */}
      <div>
        <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-500" /> Today's CRM Overview
        </h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8">
          <KpiCard title="CRM Tasks" value={formatIndianNumber(overview.crm_tasks ?? 0)} icon={Target} color="primary" onClick={navToCalendar} />
          <KpiCard title="Follow-Ups Today" value={formatIndianNumber(overview.follow_ups_today ?? 0)} icon={Clock} color="info" onClick={navToCalendar} />
          <KpiCard title="6-Month Recalls" value={formatIndianNumber(overview.six_month_recalls ?? 0)} icon={CalendarDays} color="warning" onClick={navToCalendar} />
          <KpiCard title="12-Month Recalls" value={formatIndianNumber(overview.twelve_month_recalls ?? 0)} icon={CalendarDays} color="purple" onClick={navToCalendar} />
          <KpiCard title="Contacted Today" value={formatIndianNumber(overview.patients_contacted ?? 0)} icon={Phone} color="success" />
          <KpiCard title="Appts Created" value={formatIndianNumber(overview.appointments_created_today ?? 0)} icon={BookOpen} color="teal" />
          <KpiCard title="CRM Appointments" value={formatIndianNumber(overview.appointments_from_crm ?? 0)} icon={CalendarDays} color="pink" />
          <KpiCard title="Overdue" value={formatIndianNumber(overview.overdue_tasks ?? 0)} icon={AlertCircle} color="danger" />
        </div>
      </div>

      {/* ════════════════════════════════════
         SECTION 2: CAMPAIGN PERFORMANCE
         ════════════════════════════════════ */}
      <div>
        <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-indigo-500" /> Campaign Performance
        </h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
          <KpiCard title="Campaign Messages Today" value={formatIndianNumber(campaignWidgets?.messages_today ?? 0)} icon={Send} color="primary" />
          <KpiCard title="Campaign Replies Today" value={formatIndianNumber(campaignWidgets?.replies_today ?? 0)} icon={MessageCircle} color="success" />
          <KpiCard title="Campaign Appointments" value={formatIndianNumber(campaignWidgets?.appointments ?? 0)} icon={CalendarDays} color="info" />
          <KpiCard title="Campaign Conversions" value={formatIndianNumber(campaignWidgets?.conversions ?? 0)} icon={TrendingUp} color="warning" />
        </div>
      </div>

      {/* ════════════════════════════════════
         SECTION 3: TODAY'S WORK QUEUE
         ════════════════════════════════════ */}
      <div className={cn(GLASS, "rounded-2xl overflow-hidden")}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" /> Today's Work Queue
            <Badge variant="secondary" className="ml-2 text-[10px]">{workQueue.length}</Badge>
          </h2>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={navToCalendar}>
            View All <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        {workQueue.length > 0 ? (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                <TableRow>
                  <TableHead className="text-[10px]">Patient</TableHead>
                  <TableHead className="text-[10px]">OP No</TableHead>
                  <TableHead className="text-[10px]">Doctor</TableHead>
                  <TableHead className="text-[10px]">Type</TableHead>
                  <TableHead className="text-[10px]">Time</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead className="text-[10px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workQueue.map((item: any) => (
                  <TableRow key={item.id} className="group hover:bg-gray-50/50">
                    <TableCell className="font-medium text-xs">{item.patient_name}</TableCell>
                    <TableCell className="text-xs text-gray-500">{item.op_number || "-"}</TableCell>
                    <TableCell className="text-xs text-gray-500">{item.doctor_name || "-"}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] font-medium", fuTypeColors[item.follow_up_type] || "bg-gray-50 text-gray-600")}>
                        {fuTypeLabels[item.follow_up_type] || item.follow_up_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{item.due_time || "-"}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px]", statusColors[item.status] || "bg-gray-100 text-gray-600")}>{item.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                        {item.patient_phone && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg"
                            onClick={() => window.open(`tel:${item.patient_phone}`, "_self")} title="Call">
                            <Phone className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        )}
                        {item.patient_phone && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg"
                            onClick={() => window.open(`https://wa.me/${item.patient_phone.replace(/[^0-9]/g, "")}`, "_blank")} title="WhatsApp">
                            <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg"
                          onClick={() => navigate(`/crm/enquiry-calendar?focus=${item.id}`)} title="Record Feedback">
                          <FileText className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg"
                          onClick={() => navigate(`/crm/enquiry-calendar?focus=${item.id}`)} title="Create Appointment">
                          <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg"
                          onClick={() => navigate(`/crm/enquiry-calendar?focus=${item.id}`)} title="View Timeline">
                          <History className="h-3.5 w-3.5 text-purple-600" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-lg"
                          onClick={() => navigate(`/crm/enquiry-calendar?focus=${item.id}`)} title="Mark Completed">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-gray-400">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            All caught up! No pending tasks for today.
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
         SECTIONS 4+5: FOLLOW-UP SUMMARY + FUNNEL (side by side)
         ════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* SECTION 3: Follow-Up Summary */}
        <div className={cn(GLASS, "rounded-2xl p-5")}>
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-500" /> Follow-Up Summary
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "1-Day FU", value: fuSummary["1_day_due"] ?? 0, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "7-Day FU", value: fuSummary["7_day_due"] ?? 0, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "6-Month Recall", value: fuSummary["6_month_due"] ?? 0, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "12-Month Recall", value: fuSummary["12_month_due"] ?? 0, color: "text-green-600", bg: "bg-green-50" },
              { label: "Custom FU", value: fuSummary["custom_due"] ?? 0, color: "text-gray-600", bg: "bg-gray-50" },
              { label: "Completed Today", value: fuSummary["completed_today"] ?? 0, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Overdue", value: fuSummary["overdue"] ?? 0, color: "text-red-600", bg: "bg-red-50" },
            ].map((s) => (
              <div key={s.label} className={cn("rounded-xl p-3 text-center", s.bg)}>
                <p className="text-[10px] text-gray-500">{s.label}</p>
                <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 4: Appointment Conversion Funnel */}
        <div className={cn(GLASS, "rounded-2xl p-5")}>
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Appointment Conversion
          </h2>
          <div className="flex items-start gap-1">
            <FunnelStep label="CRM Tasks" value={funnel.total_due ?? 0} total={funnel.total_due || 1} color="bg-indigo-400" />
            <FunnelStep label="Contacted" value={funnel.contacted ?? 0} total={funnel.total_due || 1} color="bg-blue-400" />
            <FunnelStep label="Positive" value={funnel.positive ?? 0} total={funnel.total_due || 1} color="bg-emerald-400" />
            <FunnelStep label="Booked" value={funnel.appointments_booked ?? 0} total={funnel.total_due || 1} color="bg-amber-400" />
            <FunnelStep label="Completed" value={funnel.appointments_completed ?? 0} total={funnel.total_due || 1} color="bg-green-400" isLast />
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            <div className="text-center"><p className="text-[10px] text-gray-400">Contact Rate</p><p className="text-sm font-bold text-blue-600">{funnel.contact_rate ?? 0}%</p></div>
            <div className="text-center"><p className="text-[10px] text-gray-400">Positive Rate</p><p className="text-sm font-bold text-emerald-600">{funnel.positive_rate ?? 0}%</p></div>
            <div className="text-center"><p className="text-[10px] text-gray-400">Booking Rate</p><p className="text-sm font-bold text-amber-600">{funnel.booking_rate ?? 0}%</p></div>
            <div className="text-center"><p className="text-[10px] text-gray-400">Completion Rate</p><p className="text-sm font-bold text-green-600">{funnel.completion_rate ?? 0}%</p></div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════
         SECTIONS 6+7: PATIENT RESPONSE + CONDITION (side by side)
         ════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* SECTION 5: Patient Response Analytics */}
        <div className={cn(GLASS, "rounded-2xl p-5")}>
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-emerald-500" /> Patient Response Analytics
          </h2>
          {responses.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <RePieChart>
                <Pie data={responses} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {responses.map((_: any, i: number) => <Cell key={i} fill={COLORS_RESPONSE[i % COLORS_RESPONSE.length]} />)}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No response data for this period</p>
          )}
        </div>

        {/* SECTION 6: Patient Condition Analytics */}
        <div className={cn(GLASS, "rounded-2xl p-5")}>
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-rose-500" /> Patient Condition Analytics
          </h2>
          {conditions.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={conditions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No condition data for this period</p>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════
         SECTIONS 8+9: TREATMENT TYPE + DOCTOR (side by side)
         ════════════════════════════════════ */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* SECTION 7: Treatment Type Performance */}
        <div className={cn(GLASS, "rounded-2xl p-5")}>
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-500" /> Treatment Type Performance
          </h2>
          {treatmentPerf.length > 0 ? (
            <div className="space-y-3">
              {treatmentPerf.slice(0, 8).map((t: any, i: number) => {
                const pct = Math.max(t.follow_ups, t.appointments, 1)
                const fw = (t.follow_ups / pct) * 100
                const aw = (t.appointments / pct) * 100
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{t.name}</span>
                      <span className="text-gray-400">{t.follow_ups} FU · {t.appointments} Appts</span>
                    </div>
                    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-gray-100">
                      <div style={{ width: `${fw}%` }} className="bg-indigo-400 transition-all" />
                      <div style={{ width: `${aw}%` }} className="bg-emerald-400 transition-all" />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No treatment data</p>
          )}
        </div>

        {/* SECTION 8: Doctor Engagement Leaderboard */}
        <div className={cn(GLASS, "rounded-2xl p-5")}>
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" /> Doctor Engagement Leaderboard
          </h2>
          {doctorEngagement.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {doctorEngagement.map((d: any, i: number) => (
                <div key={d.doctor_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                    i === 0 ? "bg-amber-400" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-700" : "bg-gray-200 text-gray-500")}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{d.doctor_name}</p>
                    <div className="flex gap-3 text-[10px] text-gray-400">
                      <span>{d.patients_contacted} contacted</span>
                      <span>{d.appointments_generated} appts</span>
                      <span>{d.follow_ups_completed} done</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-indigo-600">{d.positive_feedback}</p>
                    <p className="text-[9px] text-gray-400">positive</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No doctor engagement data</p>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════
         SECTION 10: EXPENSES VS REVENUE QUICK VIEW
         ════════════════════════════════════ */}
      <ExpensesVsRevenueQuickView className={cn(GLASS, "rounded-2xl p-5")} />

      {/* ════════════════════════════════════
         SECTION 11: PATIENT ACQUISITION & REVENUE
         ════════════════════════════════════ */}
      <div className={cn(GLASS, "rounded-2xl p-5")}>
        <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" /> Patient Acquisition & Revenue by Source
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Acquisition Source</p>
            {acquisition.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <RePieChart>
                  <Pie data={acquisition} dataKey="patients" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`}>
                    {acquisition.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-10">No acquisition data</p>}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Revenue by Source</p>
            {revenueBySource.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueBySource}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="source" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatIndianRupees(v)} />
                  <Bar dataKey="revenue" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-10">No revenue data</p>}
          </div>
        </div>
        {acquisition.length > 0 && (
          <div className="overflow-x-auto mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Source</TableHead>
                  <TableHead className="text-[10px] text-right">Patients</TableHead>
                  <TableHead className="text-[10px] text-right">Conversion Rate</TableHead>
                  <TableHead className="text-[10px] text-right">Revenue</TableHead>
                  <TableHead className="text-[10px] text-right">Avg/Patient</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acquisition.slice(0, 6).map((s: any) => (
                  <TableRow key={s.source}>
                    <TableCell className="text-xs font-medium">{s.source}</TableCell>
                    <TableCell className="text-xs text-right">{s.patients}</TableCell>
                    <TableCell className="text-xs text-right">{s.conversion_rate}%</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{formatIndianRupees(s.revenue)}</TableCell>
                    <TableCell className="text-xs text-right">{formatIndianRupees(s.avg_revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
         SECTION 12: CRM TIMELINE
         ════════════════════════════════════ */}
      <div className={cn(GLASS, "rounded-2xl p-5")}>
        <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" /> CRM Activity Timeline
          <Badge variant="secondary" className="ml-1 text-[10px]">{timeline.length}</Badge>
        </h2>
        {timeline.length > 0 ? (
          <div className="space-y-1 max-h-[350px] overflow-y-auto">
            {timeline.slice(0, 25).map((entry: any) => {
              const iconMap: Record<string, any> = {
                CALL: { icon: Phone, color: "text-green-500 bg-green-50" },
                WHATSAPP: { icon: MessageCircle, color: "text-emerald-500 bg-emerald-50" },
                SMS: { icon: MessageCircle, color: "text-blue-500 bg-blue-50" },
                EMAIL: { icon: Send, color: "text-purple-500 bg-purple-50" },
                IN_PERSON: { icon: User, color: "text-amber-500 bg-amber-50" },
                STATUS_UPDATE: { icon: Activity, color: "text-gray-500 bg-gray-50" },
                APPOINTMENT_BOOKED: { icon: CalendarDays, color: "text-indigo-500 bg-indigo-50" },
                COMPLETED: { icon: CheckCircle, color: "text-green-500 bg-green-50" },
              }
              const meta = iconMap[entry.activity] || iconMap.STATUS_UPDATE
              const Icon = meta.icon
              return (
                <div key={entry.id} className="flex items-start gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={cn("rounded-lg p-1.5 mt-0.5", meta.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800">{entry.patient_name}</p>
                    <p className="text-[10px] text-gray-500">{entry.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={cn("text-[9px]", statusColors[entry.status] || "bg-gray-100")}>{entry.status}</Badge>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">No activity for this period</p>
        )}
      </div>

      {/* ════════════════════════════════════
         SECTION 13: UPCOMING WORK
         ════════════════════════════════════ */}
      <div className={cn(GLASS, "rounded-2xl p-5")}>
        <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" /> Upcoming Work
        </h2>
        <Tabs value={upcomingTab} onValueChange={setUpcomingTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="tomorrow" className="text-xs">Tomorrow</TabsTrigger>
            <TabsTrigger value="next_7_days" className="text-xs">Next 7 Days</TabsTrigger>
            <TabsTrigger value="next_30_days" className="text-xs">Next 30 Days</TabsTrigger>
          </TabsList>
          {["tomorrow", "next_7_days", "next_30_days"].map((tab) => {
            const uw = upcomingWork[tab] ?? {}
            return (
              <TabsContent key={tab} value={tab}>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="rounded-xl bg-indigo-50 p-3 text-center">
                    <p className="text-[10px] text-gray-500">Total</p>
                    <p className="text-xl font-bold text-indigo-600">{uw.total ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-3 text-center">
                    <p className="text-[10px] text-gray-500">1-Day FU</p>
                    <p className="text-xl font-bold text-blue-600">{uw["1_day"] ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 p-3 text-center">
                    <p className="text-[10px] text-gray-500">7-Day FU</p>
                    <p className="text-xl font-bold text-purple-600">{uw["7_day"] ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3 text-center">
                    <p className="text-[10px] text-gray-500">6-Month Recall</p>
                    <p className="text-xl font-bold text-amber-600">{uw["6_month"] ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-green-50 p-3 text-center">
                    <p className="text-[10px] text-gray-500">12-Month Recall</p>
                    <p className="text-xl font-bold text-green-600">{uw["12_month"] ?? 0}</p>
                  </div>
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </div>
  )
}