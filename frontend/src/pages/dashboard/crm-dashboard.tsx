import { useState, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import {
  Users, UserPlus, CheckCircle2, TrendingUp, IndianRupee, DollarSign, Clock, MessageSquare,
  Phone, Mail, Calendar, BarChart3, PieChart, Activity, Target, Award, Send,
  ChevronDown, Filter, ArrowUpRight, ArrowDownRight,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line,
  PieChart as RePieChart, Pie, Cell,
} from "recharts"
import { cn } from "@/lib/utils"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import { crmApi } from "@/services/endpoints"
import DashboardDateFilter, { type DateRangePreset } from "@/components/ui/dashboard-date-filter"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import DentalEmptyState from "@/components/ui/dental-empty-state"

interface CrmDashboardData {
  total_leads: number; new_leads: number; converted_leads: number; conversion_rate: number;
  crm_revenue: number; cost_per_lead: number; pending_follow_ups_today: number; pending_enquiries: number;
  lead_growth_trend: { month: string; leads: number; converted: number }[];
  leads_by_source: { source: string; leads: number; converted: number }[];
  crm_funnel: { stage: string; count: number }[];
  todays_enquiries: number; todays_enquiries_detail: any[]; enquiry_by_type: { type: string; count: number }[]; follow_up_compliance_rate: number;
  follow_up_summary: { total_due: number; overdue: number; completed_this_month: number; completion_rate: number };
  follow_up_by_type: { follow_up_type: string; count: number }[];
  follow_up_trend: { month: string; completed: number; pending: number }[];
  follow_up_by_doctor: { doctor_name: string; count: number }[];
  active_campaigns: number; completed_campaigns: number; campaign_performance: any[];
  messages_sent: number; broadcast_messages: number; campaign_messages: number; appointment_reminders: number; recall_messages: number;
  messages_by_day: { day: string; count: number }[];
  messages_by_campaign: { campaign_name: string; count: number }[];
  messages_by_template: { template: string; count: number }[];
  messages_by_staff: { staff_name: string; count: number }[];
  revenue_by_source: { source: string; revenue: number; count: number }[];
  revenue_by_doctor: { doctor_name: string; revenue: number; count: number }[];
  patient_acquisition: { total_patients: number; from_crm: number; conversion_rate: number };
  lead_status_breakdown: { status: string; count: number }[];
  recent_communications: any[];
}

const sections = [
  { id: "overview", label: "Overview" },
  { id: "funnel", label: "Funnel" },
  { id: "sources", label: "Sources" },
  { id: "enquiries", label: "Enquiries" },
  { id: "followups", label: "Follow-Ups" },
  { id: "campaigns", label: "Campaigns" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "revenue", label: "Revenue" },
  { id: "acquisition", label: "Acquisition" },
]

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]

function ChartTooltip({ active, payload, label, financial }: any) {
  if (active && payload && payload.length) {
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
  return null
}

const kpiConfig = [
  { key: "total_leads", label: "Total Leads", icon: Users, color: "primary", format: (v: number) => formatIndianNumber(v) },
  { key: "new_leads", label: "New Leads", icon: UserPlus, color: "info", format: (v: number) => formatIndianNumber(v) },
  { key: "converted_leads", label: "Converted Leads", icon: CheckCircle2, color: "success", format: (v: number) => formatIndianNumber(v) },
  { key: "conversion_rate", label: "Conversion Rate", icon: TrendingUp, color: "success", format: (v: number) => `${v ?? 0}%` },
  { key: "crm_revenue", label: "CRM Revenue", icon: IndianRupee, color: "warning", format: (v: number) => formatIndianRupees(v ?? 0) },
  { key: "cost_per_lead", label: "Cost Per Lead", icon: DollarSign, color: "info", format: (v: number) => formatIndianRupees(v ?? 0) },
  { key: "pending_follow_ups_today", label: "Pending Follow-ups Today", icon: Clock, color: "danger", format: (v: number) => formatIndianNumber(v) },
  { key: "pending_enquiries", label: "Pending Enquiries", icon: MessageSquare, color: "warning", format: (v: number) => formatIndianNumber(v) },
]

function KpiDrawer({ open, onClose, data, kpi }: { open: boolean; onClose: () => void; data: CrmDashboardData | undefined; kpi: typeof kpiConfig[number] | null }) {
  if (!kpi || !data) return null
  const val = (data as any)[kpi.key]
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="pb-4 border-b border-gray-100">
          <SheetTitle className="flex items-center gap-2 text-base">
            <kpi.icon className="h-4 w-4 text-primary" />
            {kpi.label}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Current Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.format(val)}</p>
          </div>
          {kpi.key === "total_leads" && data.lead_status_breakdown && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status Breakdown</p>
              {data.lead_status_breakdown.map((s: any) => (
                <div key={s.status} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                  <Badge variant="outline">{s.status}</Badge>
                  <span className="text-sm font-semibold">{formatIndianNumber(s.count)}</span>
                </div>
              ))}
            </div>
          )}
          {kpi.key === "crm_revenue" && data.revenue_by_source && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">By Source</p>
              {data.revenue_by_source.map((s: any) => (
                <div key={s.source} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-700">{s.source}</span>
                  <span className="text-sm font-semibold">{formatIndianRupees(s.revenue)}</span>
                </div>
              ))}
            </div>
          )}
          {kpi.key === "pending_follow_ups_today" && data.follow_up_summary && (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(data.follow_up_summary).map(([key, val]) => (
                <div key={key} className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
                  <p className="text-[11px] text-gray-500 capitalize">{key.replace(/_/g, " ")}</p>
                  <p className="text-lg font-bold text-gray-900">{key === "completion_rate" ? `${val}%` : val}</p>
                </div>
              ))}
            </div>
          )}
          {kpi.key === "pending_enquiries" && data.todays_enquiries_detail && data.todays_enquiries_detail.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Recent Enquiries</p>
              {data.todays_enquiries_detail.slice(0, 5).map((e: any, i: number) => (
                <div key={i} className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{e.patient_name || e.patient || "N/A"}</p>
                  <p className="text-xs text-gray-500">{e.type || e.enquiry_type} - {e.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function CrmDashboardPage() {
  const [period, setPeriod] = useState<DateRangePreset>("month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [doctor, setDoctor] = useState("")
  const [source, setSource] = useState("")
  const [campaign, setCampaign] = useState("")
  const [treatment, setTreatment] = useState("")
  const [activeSection, setActiveSection] = useState("overview")
  const [selectedKpi, setSelectedKpi] = useState<typeof kpiConfig[number] | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const params = useMemo(() => {
    const periodMap: Record<string, string> = {
      today: "today", week: "this_week", month: "this_month",
      last_month: "last_month", quarter: "this_quarter", year: "this_year", custom: "custom",
    }
    const p: Record<string, string> = { period: periodMap[period] || period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    if (doctor) p.doctor = doctor
    if (source) p.source = source
    if (campaign) p.campaign = campaign
    if (treatment) p.treatment = treatment
    return p
  }, [period, startDate, endDate, doctor, source, campaign, treatment])

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-dashboard2", period, startDate, endDate, doctor, source, campaign, treatment],
    queryFn: () => crmApi.dashboard2(params),
    staleTime: 30000,
    gcTime: 60000,
  })

  const scrollTo = useCallback((id: string) => {
    setActiveSection(id)
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const openKpi = useCallback((kpi: typeof kpiConfig[number]) => {
    setSelectedKpi(kpi)
    setDrawerOpen(true)
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-60 rounded-xl" />
        <Skeleton className="h-4 w-80 rounded-xl" />
        <div className="flex gap-2">
          {sections.map((s) => <Skeleton key={s.id} className="h-8 w-24 rounded-lg" />)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[110px] rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <DentalEmptyState
        icon={Activity}
        title="No Data Available"
        description="Could not load CRM dashboard data. Try adjusting your filters or check back later."
      />
    )
  }

  const hasData = data.total_leads > 0 || data.crm_revenue > 0 || data.pending_follow_ups_today > 0

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">CRM Dashboard</h1>
            <p className="text-sm text-gray-500">Real-time CRM performance metrics</p>
          </div>
          <DashboardDateFilter value={period} onChange={setPeriod} />
        </div>
        <DentalEmptyState
          icon={MessageSquare}
          title="No CRM Data Yet"
          description="Start capturing leads and enquiries to see your CRM analytics here."
        />
      </div>
    )
  }

  const funnelData = data.crm_funnel.map((f: { stage: string; count: number }, i: number, arr: { stage: string; count: number }[]) => {
    const total = arr[0]?.count || 1
    const prev = arr[i - 1]?.count || 0
    return {
      ...f,
      percentage: ((f.count / total) * 100).toFixed(1),
      dropOff: i === 0 ? 0 : prev - f.count,
      dropOffRate: i === 0 ? 0 : ((prev - f.count) / prev) * 100,
    }
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CRM Dashboard</h1>
          <p className="text-sm text-gray-500">Real-time CRM performance metrics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardDateFilter value={period} onChange={setPeriod} />
          <select
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-600 outline-none focus:border-primary"
          >
            <option value="">All Doctors</option>
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-600 outline-none focus:border-primary"
          >
            <option value="">All Sources</option>
          </select>
          <select
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-600 outline-none focus:border-primary"
          >
            <option value="">All Campaigns</option>
          </select>
          <select
            value={treatment}
            onChange={(e) => setTreatment(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-600 outline-none focus:border-primary"
          >
            <option value="">All Treatments</option>
          </select>
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-6 px-6 py-2 bg-gray-50/90 backdrop-blur-sm border-b border-gray-100">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeSection === s.id
                  ? "bg-primary text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div id="section-overview" className="scroll-mt-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiConfig.map((kpi, i) => (
            <KpiCard
              key={kpi.key}
              title={kpi.label}
              value={kpi.format((data as any)[kpi.key])}
              icon={kpi.icon}
              color={kpi.color as any}
              delay={i * 0.03}
              onClick={() => openKpi(kpi)}
            />
          ))}
        </div>
      </div>

      <div id="section-funnel" className="scroll-mt-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Target className="h-4 w-4 text-primary" />
              CRM Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={funnelData.length * 50 + 60}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 100, right: 60, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="stage" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload
                      return (
                        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg text-xs">
                          <p className="font-semibold text-gray-900 mb-1">{d.stage}</p>
                          <p>Count: {formatIndianNumber(d.count)}</p>
                          <p>% of Total: {d.percentage}%</p>
                          {d.dropOff > 0 && <p className="text-danger">Drop-off: {formatIndianNumber(d.dropOff)} ({d.dropOffRate.toFixed(1)}%)</p>}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={24}>
                  {funnelData.map((_: { stage: string; count: number; percentage: string; dropOff: number; dropOffRate: number }, i: number) => (
                    <Cell key={i} fill={`hsl(200, 70%, ${55 - i * 5}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
              {funnelData.map((f: { stage: string; count: number; percentage: string; dropOff: number; dropOffRate: number }, i: number) => (
                <div key={f.stage} className="rounded-xl bg-gray-50 p-2.5 text-center">
                  <p className="text-[11px] text-gray-500 truncate">{f.stage}</p>
                  <p className="text-sm font-bold text-gray-900">{formatIndianNumber(f.count)}</p>
                  <p className="text-[10px] text-gray-400">{f.percentage}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="section-sources" className="scroll-mt-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <BarChart3 className="h-4 w-4 text-primary" />
              Lead Source Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, (data.leads_by_source?.length || 1) * 50)}>
              <BarChart data={data.leads_by_source || []} layout="vertical" margin={{ left: 100, right: 40, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="leads" name="Leads" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="converted" name="Converted" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div id="section-enquiries" className="scroll-mt-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <MessageSquare className="h-4 w-4 text-primary" />
                Enquiry Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Today's Enquiries</p>
                  <p className="text-xl font-bold text-gray-900">{formatIndianNumber(data.todays_enquiries)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 text-center">
                  <p className="text-[11px] text-gray-500">Compliance Rate</p>
                  <p className="text-xl font-bold text-gray-900">{data.follow_up_compliance_rate ?? 0}%</p>
                </div>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={data.enquiry_by_type || []}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {(data.enquiry_by_type || []).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Mail className="h-4 w-4 text-primary" />
                Today's Enquiry Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Patient</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.todays_enquiries_detail || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs text-gray-400 py-6">No enquiries today</TableCell>
                    </TableRow>
                  ) : (
                    (data.todays_enquiries_detail || []).map((e: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{e.patient_name || e.patient || "N/A"}</TableCell>
                        <TableCell className="text-xs">{e.type || e.enquiry_type || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={e.status === "open" || e.status === "pending" ? "warning" : "success"} className="text-[10px]">
                            {e.status || "N/A"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <div id="section-followups" className="scroll-mt-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Activity className="h-4 w-4 text-primary" />
                Follow-Up Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {data.follow_up_summary && Object.entries(data.follow_up_summary).map(([key, val]) => (
                  <div key={key} className="rounded-xl bg-gray-50 p-3 text-center">
                    <p className="text-[11px] text-gray-500 capitalize">{key.replace(/_/g, " ")}</p>
                    <p className="text-lg font-bold text-gray-900">{key === "completion_rate" ? `${val}%` : formatIndianNumber(val as number)}</p>
                  </div>
                ))}
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.follow_up_by_type || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="follow_up_type" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Count" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <TrendingUp className="h-4 w-4 text-primary" />
                Follow-Up Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.follow_up_trend || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Award className="h-4 w-4 text-primary" />
                Follow-Ups by Doctor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, (data.follow_up_by_doctor?.length || 1) * 45)}>
                <BarChart data={data.follow_up_by_doctor || []} layout="vertical" margin={{ left: 120, right: 40, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="doctor_name" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Follow-Ups" fill="#ec4899" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <div id="section-campaigns" className="scroll-mt-16">
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Active Campaigns</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{data.active_campaigns ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Completed Campaigns</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{data.completed_campaigns ?? 0}</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <BarChart3 className="h-4 w-4 text-primary" />
              Campaign Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Campaign</TableHead>
                  <TableHead className="text-xs">Sent</TableHead>
                  <TableHead className="text-xs">Responses</TableHead>
                  <TableHead className="text-xs">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.campaign_performance || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-gray-400 py-6">No campaign data</TableCell>
                  </TableRow>
                ) : (
                  (data.campaign_performance || []).map((c: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{c.campaign || c.campaign_name || c.name || "N/A"}</TableCell>
                      <TableCell className="text-xs">{formatIndianNumber(c.sent ?? c.messages_sent ?? 0)}</TableCell>
                      <TableCell className="text-xs">{formatIndianNumber(c.responses ?? c.response_count ?? 0)}</TableCell>
                      <TableCell className="text-xs">{c.conversion_rate != null ? `${c.conversion_rate}%` : "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div id="section-whatsapp" className="scroll-mt-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Messages Sent</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatIndianNumber(data.messages_sent ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Broadcast</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatIndianNumber(data.broadcast_messages ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Reminders</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatIndianNumber(data.appointment_reminders ?? 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Recall</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatIndianNumber(data.recall_messages ?? 0)}</p>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Messages by Day</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.messages_by_day || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Messages" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Messages by Campaign</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.messages_by_campaign || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="campaign_name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Messages" fill="#f97316" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-6 lg:grid-cols-2 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Messages by Template</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.messages_by_template || []} layout="vertical" margin={{ left: 100, right: 20, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="template" type="category" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Messages" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Messages by Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.messages_by_staff || []} layout="vertical" margin={{ left: 100, right: 20, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="staff_name" type="category" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Messages" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div id="section-revenue" className="scroll-mt-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <IndianRupee className="h-4 w-4 text-primary" />
                Revenue by Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenue_by_source || []} layout="vertical" margin={{ left: 100, right: 40, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="source" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip content={<ChartTooltip financial />} />
                    <Bar dataKey="revenue" name="Revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Award className="h-4 w-4 text-primary" />
                Revenue by Doctor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenue_by_doctor || []} layout="vertical" margin={{ left: 100, right: 40, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="doctor_name" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip content={<ChartTooltip financial />} />
                    <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div id="section-acquisition" className="scroll-mt-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Users className="h-4 w-4 text-primary" />
              Patient Acquisition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Patients</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatIndianNumber(data.patient_acquisition?.total_patients ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">From CRM</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatIndianNumber(data.patient_acquisition?.from_crm ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{data.patient_acquisition?.conversion_rate ?? 0}%</p>
              </div>
            </div>
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={[
                      { name: "From CRM", value: data.patient_acquisition?.from_crm ?? 0 },
                      { name: "Other", value: Math.max(0, (data.patient_acquisition?.total_patients ?? 0) - (data.patient_acquisition?.from_crm ?? 0)) },
                    ]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    <Cell fill="#0ea5e9" />
                    <Cell fill="#e5e7eb" />
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <KpiDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} data={data} kpi={selectedKpi} />
    </motion.div>
  )
}

export default CrmDashboardPage
