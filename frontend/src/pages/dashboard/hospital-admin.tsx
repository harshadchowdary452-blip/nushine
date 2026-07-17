import { useState, useMemo, useCallback } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import {
  Calendar, Users, FolderOpen, Activity, FileText, DollarSign, TrendingUp,
  IndianRupee, PieChart, Clock, AlertTriangle, CheckCircle2, UserPlus,
  Phone, BarChart3, Sparkles, Stethoscope,
  PauseCircle, AlertOctagon, Timer, ClipboardCheck, LayoutList,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart as RePieChart, Pie, Cell,
} from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi, consentFormsApi, doctorsApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import QuickViewDrawer from "@/components/ui/quick-view-drawer"
import DateFilterBar from "@/components/ui/date-filter-bar"
import AnalyticsDrawer from "@/components/analytics-drawer"
import type { Performer } from "@/types"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"
import { cn } from "@/lib/utils"

const PIE_COLORS = ["#4F46E5", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"]

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-green-100 text-green-700",
  CHECKED_IN: "bg-purple-100 text-purple-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-gray-100 text-gray-600",
  RESCHEDULED: "bg-orange-100 text-orange-700",
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-xs" style={{ color: p.color }}>
            {p.name}: {formatIndianRupees(p.value ?? 0)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } }
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good Morning"
  if (h < 17) return "Good Afternoon"
  return "Good Evening"
}

export default function HospitalAdminDashboard() {
  const { user } = useAuthStore()
  const [quickView, setQuickView] = useState<{ type: "doctor" | "patient"; id: string; name: string } | null>(null)
  const [drawerMetric, setDrawerMetric] = useState<string | null>(null)
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [doctorId, setDoctorId] = useState("")

  const dashParams = useMemo(() => {
    const p: Record<string, string> = { period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    if (doctorId) p.doctor_id = doctorId
    return p
  }, [period, startDate, endDate, doctorId])

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "hospital", user?.id, dashParams],
    queryFn: () => dashboardApi.hospitalAdmin(dashParams),
    staleTime: 10000,
    gcTime: 60000,
    refetchInterval: 30000,
  })

  const { data: consentStats } = useQuery({
    queryKey: ["consent-form-stats", user?.hospital_id, period, doctorId],
    queryFn: () => consentFormsApi.getStats(user?.hospital_id || ""),
    enabled: !!user?.hospital_id,
  })

  const { data: doctorsList } = useQuery({
    queryKey: ["doctors-list", user?.hospital_id],
    queryFn: () => doctorsApi.list({ page: 1, page_size: 100 }),
    enabled: !!user?.hospital_id,
  })

  const onDoctorClick = useCallback((id?: string) => {
    const item = (stats?.doctor_performance ?? []).find((d) => d.id === id)
    if (item) setQuickView({ type: "doctor", id: item.id, name: item.name })
  }, [stats?.doctor_performance])

  if (!user) return null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[340px] rounded-xl" />
          <Skeleton className="h-[340px] rounded-xl" />
        </div>
      </div>
    )
  }

  const cmp = stats?.comparison as Record<string, number> | undefined
  const todayApptsList: Record<string, string>[] = stats?.today_appointments_list || []
  const recentActivity: Array<{ type: string; description: string; date: string }> = stats?.recent_activity || []
  const revenueSources: Array<{ method: string; amount: number }> = stats?.revenue_sources || []
  const crmInsights = stats?.crm_insights || {}
  const pendingActions = stats?.pending_actions || {}
  const revenueExpenseTrend: Array<{ month: string; revenue: number; expenses: number; profit: number }> = stats?.revenue_expense_trend || []
  const doctorPerf: Performer[] = stats?.doctor_performance || []
  const treatmentPerf: Performer[] = stats?.treatment_performance || []

  return (
    <motion.div className="space-y-5" variants={container} initial="hidden" animate="show">
      {/* 1. Hero Header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 px-6 py-5">
        <div className="absolute inset-0 bg-grid-pattern opacity-10" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                {getGreeting()}, {user.full_name?.split(" ").slice(0, 2).join(" ") || "User"}
              </h1>
              <p className="text-sm text-white/70">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] text-white/60 uppercase tracking-wider font-medium">Revenue</p>
              <p className="text-base font-bold text-white">{formatIndianRupees(stats?.total_revenue || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/60 uppercase tracking-wider font-medium">Patients</p>
              <p className="text-base font-bold text-white">{formatIndianNumber(stats?.total_patients || 0)}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. Global Period Filter */}
      <motion.div variants={item} className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-500" /> Dashboard Overview
        </h2>
        <DateFilterBar
          period={period} onPeriodChange={setPeriod}
          startDate={startDate} endDate={endDate}
          onStartDateChange={setStartDate} onEndDateChange={setEndDate}
          doctorId={doctorId} onDoctorIdChange={setDoctorId}
          doctors={doctorsList?.items || doctorsList || []}
        />
      </motion.div>

      {/* 3. Operational KPI Cards */}
      <motion.div variants={item} className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Calendar} title="Today's Appts" value={formatIndianNumber(stats?.today_appointments ?? 0)} color="warning" delay={0} onClick={() => setDrawerMetric("appointments")} />
        <KpiCard icon={Users} title="Total Patients" value={formatIndianNumber(stats?.total_patients ?? 0)} color="info" delay={0.03} onClick={() => setDrawerMetric("patients")} trend={cmp?.patient_change != null ? { value: `${cmp.patient_change > 0 ? "+" : ""}${cmp.patient_change}%`, positive: cmp.patient_change >= 0 } : undefined} />
        <KpiCard icon={FolderOpen} title="Active Cases" value={formatIndianNumber(stats?.total_active_cases ?? 0)} color="danger" delay={0.06} onClick={() => setDrawerMetric("cases")} trend={cmp?.case_change != null ? { value: `${cmp.case_change > 0 ? "+" : ""}${cmp.case_change}%`, positive: cmp.case_change >= 0 } : undefined} />
        <KpiCard icon={AlertTriangle} title="Pending Billing" value={formatIndianRupees(stats?.total_pending_billing ?? 0)} color="warning" delay={0.09} />
      </motion.div>

      {/* 4. Financial KPI Cards */}
      <motion.div variants={item} className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={DollarSign} title="Period Revenue" value={formatIndianRupees(stats?.period_revenue ?? 0)} color="success" delay={0.12} trend={cmp?.revenue_change != null ? { value: `${cmp.revenue_change > 0 ? "+" : ""}${cmp.revenue_change}%`, positive: cmp.revenue_change >= 0 } : undefined} />
        <KpiCard icon={IndianRupee} title="Expenses" value={formatIndianRupees(stats?.total_expenses ?? 0)} color="danger" delay={0.15} />
        <KpiCard icon={TrendingUp} title="Net Profit" value={formatIndianRupees(stats?.net_profit ?? 0)} color={(stats?.net_profit ?? 0) >= 0 ? "success" : "danger"} delay={0.18} />
        <KpiCard icon={PieChart} title="Profit Margin" value={stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%"} color="primary" delay={0.21} />
      </motion.div>

      {/* 4b. Treatment KPI Cards */}
      {stats?.treatment_kpis && (
        <motion.div variants={item}>
          <div className="flex items-center gap-2 mb-2">
            <LayoutList className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-800">Treatment Queue</h2>
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={Stethoscope} title="Active Treatments" value={String(stats.treatment_kpis.active_treatments ?? 0)} color="info" delay={0} onClick={() => setDrawerMetric("treatments")} />
            <KpiCard icon={AlertOctagon} title="Overdue" value={String(stats.treatment_kpis.overdue_treatments ?? 0)} color={(stats.treatment_kpis.overdue_treatments ?? 0) > 0 ? "danger" : "success"} delay={0.03} />
            <KpiCard icon={PauseCircle} title="Waiting (Patient)" value={String(stats.treatment_kpis.waiting_patient ?? 0)} color="warning" delay={0.06} />
            <KpiCard icon={Timer} title="Waiting (Lab)" value={String(stats.treatment_kpis.waiting_lab ?? 0)} color="warning" delay={0.09} />
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-3">
            <KpiCard icon={CheckCircle2} title="Completed Today" value={String(stats.treatment_kpis.completed_today ?? 0)} color="success" delay={0.12} />
            <KpiCard icon={ClipboardCheck} title="Completed (Month)" value={String(stats.treatment_kpis.completed_this_month ?? 0)} color="primary" delay={0.15} />
            <KpiCard icon={TrendingUp} title="Completion Rate" value={stats.treatment_kpis.completion_rate != null ? `${stats.treatment_kpis.completion_rate}%` : "0%"} color="primary" delay={0.18} />
            <KpiCard icon={FolderOpen} title="Total Treatments" value={String(stats.treatment_kpis.total_treatments ?? 0)} color="info" delay={0.21} />
          </div>
        </motion.div>
      )}

      {/* 5. Revenue vs Expenses Chart + Revenue Sources */}
      <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="px-5 py-3.5">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueExpenseTrend.length > 0 ? revenueExpenseTrend : [{ month: "No data", revenue: 0, expenses: 0, profit: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-3.5">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue Sources</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {revenueSources.length > 0 ? (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={160}>
                  <RePieChart>
                    <Pie
                      data={revenueSources}
                      dataKey="amount"
                      nameKey="method"
                      cx="50%" cy="50%"
                      outerRadius={65}
                      innerRadius={35}
                    >
                      {revenueSources.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: string | number | (string | number)[]) => formatIndianRupees(Number(value))} />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {revenueSources.map((src, i) => (
                    <div key={src.method} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="font-medium text-gray-700">{src.method}</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatIndianRupees(src.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-sm text-gray-400">
                No payment data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 6. Doctor Performance + Top Treatments Tables */}
      <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="px-5 py-3.5">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Doctor Performance</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {doctorPerf.length > 0 ? (
              <div className="space-y-1">
                {doctorPerf.map((doc, i) => (
                  <div
                    key={doc.id || i}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => onDoctorClick(doc.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                        i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-gray-50 text-gray-500"
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{doc.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-indigo-600">{formatIndianRupees(doc.value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No doctor data for this period</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-3.5">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Top Treatments</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {treatmentPerf.length > 0 ? (
              <div className="space-y-1">
                {treatmentPerf.map((tp, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
                        i === 0 ? "bg-emerald-100 text-emerald-700" : i === 1 ? "bg-blue-100 text-blue-700" : "bg-gray-50 text-gray-500"
                      )}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{tp.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-600">{tp.value} patients</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No treatment data for this period</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 7. Today's Appointments + Pending Actions */}
      <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="px-5 py-3.5 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Today's Appointments</CardTitle>
            <span className="text-xs font-medium text-gray-400">{todayApptsList.length} scheduled</span>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {todayApptsList.length > 0 ? (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {todayApptsList.map((appt) => (
                  <div key={appt.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
                        <Clock className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{appt.patient_name}</p>
                        <p className="text-xs text-gray-500">{appt.doctor_name} &middot; {appt.time}</p>
                      </div>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[appt.status] || "bg-gray-100 text-gray-600")}>
                      {appt.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Calendar className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No appointments scheduled for today</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-3.5">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Pending Actions</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <Phone className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-amber-600 font-medium">Follow-ups Due</p>
                <p className="text-lg font-bold text-amber-700">{pendingActions.follow_ups || 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-red-600 font-medium">Pending Billings</p>
                <p className="text-lg font-bold text-red-700">{pendingActions.billings_count || 0}</p>
                {pendingActions.billings_amount > 0 && (
                  <p className="text-xs text-red-500">{formatIndianRupees(pendingActions.billings_amount)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-blue-600 font-medium">Completed Follow-ups</p>
                <p className="text-lg font-bold text-blue-700">{stats?.completed_follow_ups || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 8. Recent Activity + CRM Insights */}
      <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="px-5 py-3.5">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-[280px] overflow-y-auto">
                {recentActivity.map((act, i) => (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <div className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full mt-0.5",
                      act.type === "patient_registered" ? "bg-emerald-100" : "bg-blue-100"
                    )}>
                      {act.type === "patient_registered"
                        ? <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
                        : <Calendar className="h-3.5 w-3.5 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{act.description}</p>
                      <p className="text-xs text-gray-400">{act.date ? new Date(act.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Activity className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-5 py-3.5">
            <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">CRM Insights</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-center">
                <p className="text-2xl font-bold text-indigo-700">{crmInsights.total_leads || 0}</p>
                <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-wider">Total Leads</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                <p className="text-2xl font-bold text-emerald-700">{crmInsights.conversion_rate || 0}%</p>
                <p className="text-[10px] text-emerald-500 font-medium uppercase tracking-wider">Conversion</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                <p className="text-xl font-bold text-blue-700">{crmInsights.new_leads || 0}</p>
                <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wider">New</p>
              </div>
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-center">
                <p className="text-xl font-bold text-purple-700">{crmInsights.converted_leads || 0}</p>
                <p className="text-[10px] text-purple-500 font-medium uppercase tracking-wider">Converted</p>
              </div>
            </div>
            {crmInsights.leads_by_source?.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-2">Top Sources</p>
                {crmInsights.leads_by_source.map((src: { source: string; count: number }, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1">
                    <span className="font-medium text-gray-700">{src.source.replace(/_/g, " ")}</span>
                    <span className="font-semibold text-gray-900">{src.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 9. Consent Forms */}
      {consentStats && (
        <motion.div variants={item}>
          <Card>
            <CardHeader className="px-5 py-3.5 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4" /> Consent Forms
              </CardTitle>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Total: <span className="font-bold text-gray-900">{consentStats.total ?? 0}</span></span>
                <span>This month: <span className="font-bold text-indigo-600">{consentStats.this_month ?? 0}</span></span>
              </div>
            </CardHeader>
            {consentStats.recent?.length > 0 && (
              <CardContent className="px-5 pb-5">
                <div className="space-y-2">
                  {consentStats.recent.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <span className="font-medium text-gray-900">{r.patient_name}</span>
                      <span className="text-xs text-gray-500">{r.consent_type} &middot; {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </motion.div>
      )}

      {/* 10. Empty State */}
      {!stats?.total_patients && !stats?.today_appointments && !stats?.total_cases && (
        <motion.div variants={item} className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
            <Calendar className="h-6 w-6 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No activity yet</h2>
          <p className="mt-1 text-sm text-gray-500 max-w-sm">Patient registrations and appointments will appear here once you start using the system.</p>
        </motion.div>
      )}

      {/* Drawers */}
      {quickView && (
        <QuickViewDrawer open={!!quickView} onClose={() => setQuickView(null)} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}

      <AnalyticsDrawer
        open={!!drawerMetric}
        onClose={() => setDrawerMetric(null)}
        title={
          drawerMetric === "appointments" ? "Appointments" :
          drawerMetric === "patients" ? "Patients" :
          drawerMetric === "cases" ? "Active Cases" : ""
        }
        icon={
          drawerMetric === "appointments" ? <Calendar className="h-5 w-5" /> :
          drawerMetric === "patients" ? <Users className="h-5 w-5" /> :
          drawerMetric === "cases" ? <FolderOpen className="h-5 w-5" /> : undefined
        }
        color={
          drawerMetric === "appointments" ? "#F59E0B" :
          drawerMetric === "patients" ? "#06B6D4" :
          drawerMetric === "cases" ? "#EF4444" : "#4F46E5"
        }
        valueType="number"
        data={
          drawerMetric === "patients" ? (stats?.patient_growth_trend || []) :
          drawerMetric === "appointments" ? (stats?.appointment_count_trend || []) :
          drawerMetric === "cases" ? (stats?.case_count_trend || []) : []
        }
        dataKeys={
          drawerMetric === "patients" ? [{ key: "count", name: "Patients", color: "#06B6D4" }] :
          drawerMetric === "appointments" ? [{ key: "count", name: "Appointments", color: "#F59E0B" }] :
          drawerMetric === "cases" ? [{ key: "count", name: "Cases", color: "#EF4444" }] :
          [{ key: "value", name: "Value", color: "#4F46E5" }]
        }
        xAxisKey="month"
        chartType="area"
        trend={
          drawerMetric === "patients" && cmp?.patient_change != null
            ? { value: `${cmp.patient_change > 0 ? "+" : ""}${cmp.patient_change}%`, positive: cmp.patient_change >= 0 }
            : drawerMetric === "appointments" && cmp?.appointment_change != null
            ? { value: `${cmp.appointment_change > 0 ? "+" : ""}${cmp.appointment_change}%`, positive: cmp.appointment_change >= 0 }
            : drawerMetric === "cases" && cmp?.case_change != null
            ? { value: `${cmp.case_change > 0 ? "+" : ""}${cmp.case_change}%`, positive: cmp.case_change >= 0 }
            : null
        }
      />
    </motion.div>
  )
}
