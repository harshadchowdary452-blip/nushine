import { useState, useMemo, useRef, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Users, UserPlus, CheckCircle2, TrendingUp, Clock, MessageSquare,
  BarChart3, Activity, Send, Award, DollarSign, Target, Phone, Bell, Settings,
  Plus, Megaphone, CalendarDays, Eye, List, Loader2,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import { crmApi, doctorsApi, treatmentFollowUpsApi, recallsApi, crmSettingsApi, enquiriesApi } from "@/services/endpoints"
import DashboardDateFilter, { type DateRangePreset } from "@/components/ui/dashboard-date-filter"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import DentalEmptyState from "@/components/ui/dental-empty-state"
import { useAuthStore } from "@/store/authStore"

const COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"]

const sections = [
  { id: "leads", label: "Leads" },
  { id: "enquiries", label: "Enquiries" },
  { id: "followups", label: "Treatment Follow-Ups" },
  { id: "recalls", label: "Recalls" },
]

const enquiryStatusCounts = ["NEW", "CONTACTED", "INTERESTED", "NOT_INTERESTED", "CONVERTED", "LOST"]

function ChartTooltip({ active, payload, label, financial }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {financial ? formatIndianRupees(p.value ?? 0) : formatIndianNumber(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

function CrmDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [period, setPeriod] = useState<DateRangePreset>("month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [activeSection, setActiveSection] = useState("leads")
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const { data: doctorsList } = useQuery({
    queryKey: ["dashboard-doctors"],
    queryFn: () => doctorsApi.list(),
    staleTime: 60000,
  })
  const doctorOptions = Array.isArray(doctorsList) ? doctorsList : doctorsList?.items || []

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute("data-section")
          if (id) setActiveSection(id)
        }
      })
    }, { rootMargin: "-80px 0px -60% 0px", threshold: 0 })
    sections.forEach((s) => {
      const el = document.querySelector(`[data-section="${s.id}"]`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const params = useMemo(() => {
    const periodMap: Record<string, string> = {
      today: "today", week: "this_week", month: "this_month",
      last_month: "last_month", quarter: "this_quarter", year: "this_year", custom: "custom",
    }
    const p: Record<string, string> = { period: periodMap[period] || period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    return p
  }, [period, startDate, endDate])

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-dashboard2", period, startDate, endDate],
    queryFn: () => crmApi.dashboard2(params),
    staleTime: 30000,
  })

  const { data: fuStats } = useQuery({
    queryKey: ["crm", "treatment-fu-stats"],
    queryFn: () => treatmentFollowUpsApi.stats(),
  })

  const { data: recallStats } = useQuery({
    queryKey: ["crm", "recall-stats"],
    queryFn: () => recallsApi.stats(),
  })

  const { data: settingsSummary } = useQuery({
    queryKey: ["crm", "settings-summary"],
    queryFn: () => crmSettingsApi.summary(),
  })

  const kpis = data?.kpis ?? {}
  const leadAnalytics = data?.lead_analytics ?? {}
  const enquiryDashboard = data?.enquiry_dashboard ?? {}
  const followUpDashboard = data?.follow_up_dashboard ?? {}

  const scrollTo = (id: string) => {
    setActiveSection(id)
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const quickActions = [
    { label: "Add Lead", icon: Plus, onClick: () => navigate("/leads?action=create") },
    { label: "Enquiry Calendar", icon: CalendarDays, onClick: () => navigate("/crm/enquiry-calendar") },
    { label: "Follow-Ups", icon: Clock, onClick: () => navigate("/crm/follow-ups") },
    { label: "Recalls", icon: Bell, onClick: () => navigate("/crm/recalls") },
    { label: "Send WhatsApp", icon: Send, onClick: () => navigate("/whatsapp") },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60 rounded-lg" />
        <Skeleton className="h-4 w-80 rounded-lg" />
        <div className="flex gap-2">{sections.map((s) => <Skeleton key={s.id} className="h-8 w-24 rounded-lg" />)}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[90px] rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <DentalEmptyState icon={Activity} title="Error Loading Dashboard"
        description="Could not load CRM dashboard data. Try adjusting your filters or check back later." />
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">CRM Dashboard</h1>
            <p className="text-sm text-gray-500">Real-time CRM performance metrics</p>
          </div>
          <DashboardDateFilter value={period} onChange={setPeriod} />
        </div>
        <DentalEmptyState icon={MessageSquare} title="No Data" description="No CRM data available for this period." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-section-title text-gray-900">CRM Dashboard</h1>
          <p className="text-sm text-text-secondary">Leads · Enquiries · Follow-Ups · Recalls</p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardDateFilter value={period} onChange={setPeriod} />
          {period === "custom" && (
            <>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-[140px] rounded-xl text-xs" />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-[140px] rounded-xl text-xs" />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Quick Actions</span>
        {quickActions.map((a) => (
          <Button key={a.label} variant="outline" size="sm" onClick={a.onClick} className="h-8 text-xs gap-1.5">
            <a.icon className="h-3.5 w-3.5" />{a.label}
          </Button>
        ))}
      </div>

      <div className="sticky top-0 z-20 -mx-6 px-6 py-2 bg-gray-50/90 backdrop-blur-sm border-b border-gray-100">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {sections.map((s) => (
            <button key={s.id} onClick={() => scrollTo(s.id)}
              className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeSection === s.id ? "bg-primary text-white shadow-sm" : "text-gray-500 hover:bg-gray-100")}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== LEADS SECTION ===== */}
      <div id="section-leads" data-section="leads" className="scroll-mt-16">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Leads
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Total Leads" value={formatIndianNumber(kpis.total_leads ?? 0)} icon={Users} color="primary" />
          <KpiCard title="New Leads" value={formatIndianNumber(kpis.new_leads ?? 0)} icon={UserPlus} color="info" />
          <KpiCard title="Converted" value={formatIndianNumber(kpis.converted_leads ?? 0)} icon={CheckCircle2} color="success" />
          <KpiCard title="Conversion Rate" value={`${kpis.conversion_rate ?? 0}%`} icon={TrendingUp} color="success" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><List className="h-4 w-4 text-primary" /> Recent Leads</CardTitle></CardHeader>
            <CardContent>
              {data?.lead_dashboard?.length > 0 ? (
                <div className="max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.lead_dashboard.slice(0, 10).map((l: any) => (
                        <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leads/${l.id}`)}>
                          <TableCell className="font-medium text-xs">{l.lead_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{l.source}</Badge></TableCell>
                          <TableCell><Badge className="text-[10px]">{l.status}</Badge></TableCell>
                          <TableCell className="text-xs font-semibold">{l.lead_score ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : <p className="text-sm text-gray-400 text-center py-10">No leads data</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><BarChart3 className="h-4 w-4 text-primary" /> Lead Sources</CardTitle></CardHeader>
            <CardContent>
              {leadAnalytics.by_source?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={leadAnalytics.by_source.filter((s: any) => s.count > 0)} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80}>
                      {leadAnalytics.by_source.filter((s: any) => s.count > 0).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-10">No source data</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== ENQUIRIES SECTION ===== */}
      <div id="section-enquiries" data-section="enquiries" className="scroll-mt-16">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" /> Enquiries
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {enquiryStatusCounts.map((s) => (
            <Card key={s}>
              <CardContent className="p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">{s.replace(/_/g, " ")}</p>
                <p className="text-lg font-bold">{formatIndianNumber(enquiryDashboard[s.toLowerCase()] ?? 0)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Clock className="h-4 w-4 text-primary" /> Today's Enquiries</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary text-center py-4">{formatIndianNumber(enquiryDashboard.today ?? 0)}</div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><p className="text-muted-foreground">Tomorrow</p><p className="font-semibold">{formatIndianNumber(enquiryDashboard.tomorrow ?? 0)}</p></div>
                <div><p className="text-muted-foreground">This Week</p><p className="font-semibold">{formatIndianNumber(enquiryDashboard.this_week ?? 0)}</p></div>
                <div><p className="text-muted-foreground">Overdue</p><p className="font-semibold text-red-500">{formatIndianNumber(enquiryDashboard.overdue ?? 0)}</p></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Activity className="h-4 w-4 text-primary" /> Enquiry Follow-Up Detail</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Pending</p>
                  <p className="text-lg font-bold text-amber-600">{formatIndianNumber(followUpDashboard.pending ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Completed</p>
                  <p className="text-lg font-bold text-green-600">{formatIndianNumber(followUpDashboard.completed ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== TREATMENT FOLLOW-UPS SECTION ===== */}
      <div id="section-followups" data-section="followups" className="scroll-mt-16">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" /> Treatment Follow-Ups
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{fuStats?.total ?? followUpDashboard.pending ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Open</p><p className="text-xl font-bold text-amber-600">{fuStats?.open ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold text-green-600">{fuStats?.completed ?? followUpDashboard.completed ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-xl font-bold text-red-600">{fuStats?.overdue ?? 0}</p></CardContent></Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Activity className="h-4 w-4 text-primary" /> Rules Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Treatments with Rules</p>
                  <p className="text-lg font-bold text-primary">{settingsSummary?.total_treatments_with_rules ?? 0}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Active Rules</p>
                  <p className="text-lg font-bold text-green-600">{settingsSummary?.active_rules ?? 0}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">With 1-Day FU</p>
                  <p className="text-sm font-semibold">{settingsSummary?.treatments_with_1_day ?? 0}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">With 7-Day FU</p>
                  <p className="text-sm font-semibold">{settingsSummary?.treatments_with_7_day ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Clock className="h-4 w-4 text-primary" /> Recent Follow-Ups</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/crm/follow-ups")}>View All</Button>
            </CardHeader>
            <CardContent>
              {followUpDashboard.recent?.length > 0 ? (
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {followUpDashboard.recent.slice(0, 6).map((fu: any) => (
                    <div key={fu.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-900">{fu.patient_name}</p>
                        <Badge variant={fu.status === "COMPLETED" ? "default" : "outline"} className="text-[10px]">{fu.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-400">Due: {fu.follow_up_date}</span>
                        <div className="flex gap-1">
                          {fu.patient_phone && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(`tel:${fu.patient_phone}`)} title="Call"><Phone className="h-3.5 w-3.5" /></Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-gray-400 text-center py-10">No follow-ups</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== RECALLS SECTION ===== */}
      <div id="section-recalls" data-section="recalls" className="scroll-mt-16">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-purple-500" /> Recalls
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{recallStats?.total ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Open</p><p className="text-xl font-bold text-amber-600">{recallStats?.open ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-xl font-bold text-red-600">{recallStats?.overdue ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold text-green-600">{recallStats?.completed ?? 0}</p></CardContent></Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><BarChart3 className="h-4 w-4 text-primary" /> 6-Month vs 12-Month</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-amber-50 p-4 text-center border border-amber-200">
                  <p className="text-xs text-amber-700">6-Month Recalls</p>
                  <p className="text-2xl font-bold text-amber-800">{recallStats?.six_month ?? 0}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 text-center border border-emerald-200">
                  <p className="text-xs text-emerald-700">12-Month Recalls</p>
                  <p className="text-2xl font-bold text-emerald-800">{recallStats?.twelve_month ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Settings className="h-4 w-4 text-primary" /> Recall Settings</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/crm/settings")}>Configure</Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">6-Month Recall Enabled</p>
                  <p className="text-lg font-bold">{settingsSummary?.treatments_with_6m_recall ?? 0} treatments</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">12-Month Recall Enabled</p>
                  <p className="text-lg font-bold">{settingsSummary?.treatments_with_12m_recall ?? 0} treatments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== WHATSAPP MESSAGING WIDGET ===== */}
      <div id="section-whatsapp" data-section="whatsapp" className="scroll-mt-16">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-green-500" /> WhatsApp Messaging
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Messages Sent</p>
              <p className="text-xl font-bold text-gray-900">{data?.whatsapp_analytics?.messages_sent ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Appt Reminders</p>
              <p className="text-xl font-bold text-blue-600">{data?.whatsapp_analytics?.appointment_reminders ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Recall Msgs</p>
              <p className="text-xl font-bold text-purple-600">{data?.whatsapp_analytics?.recall_messages ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Broadcast</p>
              <p className="text-xl font-bold text-amber-600">{data?.whatsapp_analytics?.broadcast_messages ?? 0}</p>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><BarChart3 className="h-4 w-4 text-primary" /> Messages by Day</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/whatsapp")}>Send Message</Button>
            </CardHeader>
            <CardContent>
              {data?.whatsapp_analytics?.messages_by_day?.length > 0 ? (
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {data.whatsapp_analytics.messages_by_day.slice(0, 10).map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{d.day}</span>
                      <span className="font-semibold text-gray-900">{d.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No message data</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700"><MessageSquare className="h-4 w-4 text-primary" /> Campaign Messages</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/whatsapp/templates")}>Templates</Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Campaign</p>
                  <p className="text-lg font-bold text-blue-700">{data?.whatsapp_analytics?.campaign_messages ?? 0}</p>
                </div>
                <div className="rounded-xl bg-green-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Lead Msgs</p>
                  <p className="text-lg font-bold text-green-700">{data?.whatsapp_analytics?.lead_messages ?? 0}</p>
                </div>
                <div className="rounded-xl bg-purple-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Enquiry Msgs</p>
                  <p className="text-lg font-bold text-purple-700">{data?.whatsapp_analytics?.enquiry_messages ?? 0}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Enquiry FU</p>
                  <p className="text-lg font-bold text-amber-700">{data?.whatsapp_analytics?.enquiry_messages ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CrmDashboardPage
