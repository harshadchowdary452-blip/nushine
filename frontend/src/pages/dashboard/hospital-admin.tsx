import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Calendar, DollarSign, Users, FolderOpen, TrendingUp, Award, Activity, BarChart3, IndianRupee, PieChart, Sparkles, FileText } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi, consentFormsApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Leaderboard from "@/components/ui/leaderboard"
import QuickViewDrawer from "@/components/ui/quick-view-drawer"
import DateFilterBar from "@/components/ui/date-filter-bar"
import AnalyticsDrawer from "@/components/analytics-drawer"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

const ChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((p: any, i: number) => {
          const isFinancial = ["Revenue", "Expenses", "Profit", "revenue", "expenses", "profit"].includes(p.name) || ["revenue", "expenses", "profit"].includes(p.dataKey)
          return (
            <p key={i} className="text-xs" style={{ color: p.color }}>
              {p.name}: {isFinancial ? formatIndianRupees(p.value != null ? p.value : 0) : formatIndianNumber(p.value != null ? p.value : 0)}
            </p>
          )
        })}
      </div>
    )
  }
  return null
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good Morning"
  if (h < 17) return "Good Afternoon"
  return "Good Evening"
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

export default function HospitalAdminDashboard() {
  const { user } = useAuthStore()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)
  const [drawerMetric, setDrawerMetric] = useState<string | null>(null)
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const { addToast } = useToast()

  const dashParams = useMemo(() => {
    const p: Record<string, string> = { period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    return p
  }, [period, startDate, endDate])

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "hospital", user?.id, dashParams],
    queryFn: () => dashboardApi.hospitalAdmin(dashParams),
    staleTime: 10000,
    gcTime: 60000,
    refetchInterval: 30000,
  })

  const { data: consentStats } = useQuery({
    queryKey: ["consent-form-stats", user?.hospital_id],
    queryFn: () => consentFormsApi.getStats(user?.hospital_id || ""),
    enabled: !!user?.hospital_id,
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-[90px] rounded-xl" />)}
        </div>
      </div>
    )
  }

  const hasData = stats && (stats.total_patients || stats.today_appointments || stats.total_cases)
  const cmp = stats?.comparison as Record<string, number> | undefined
  const revChange = cmp?.revenue_change
  const patChange = cmp?.patient_change
  const apptChange = cmp?.appointment_change
  const caseChange = cmp?.case_change

  return (
    <motion.div className="space-y-4" variants={container} initial="hidden" animate="show">
      {/* Compact header */}
      <div className="gradient-hero rounded-xl px-5 py-3.5 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">{getGreeting()}, {user.full_name?.split(" ").slice(0, 2).join(" ") || "User"}</h1>
              <p className="text-xs text-white/70">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] text-white/70 uppercase tracking-wider">Revenue</p>
                <p className="text-sm font-bold text-white">{formatIndianRupees(stats?.total_revenue || 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/70 uppercase tracking-wider">Patients</p>
                <p className="text-sm font-bold text-white">{stats?.total_patients || 0}</p>
              </div>
            </div>
            <DateFilterBar period={period} onPeriodChange={setPeriod} startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
          </div>
        </div>
      </div>

      {/* KPI Grid - 4 columns on desktop */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard icon={DollarSign} title="Revenue" value={formatIndianRupees(stats?.total_revenue ?? 0)} color="success" delay={0} onClick={() => setDrawerMetric("revenue")} />
        <KpiCard icon={Calendar} title="Appointments" value={formatIndianNumber(stats?.today_appointments ?? 0)} color="warning" delay={0.04} onClick={() => setDrawerMetric("appointments")} />
        <KpiCard icon={Users} title="Patients" value={formatIndianNumber(stats?.total_patients ?? 0)} color="info" delay={0.08} onClick={() => setDrawerMetric("patients")} />
        <KpiCard icon={FolderOpen} title="Active Cases" value={formatIndianNumber(stats?.total_active_cases ?? 0)} color="danger" delay={0.12} onClick={() => setDrawerMetric("cases")} />
        <KpiCard icon={TrendingUp} title="Period Revenue" value={formatIndianRupees(stats?.period_revenue ?? 0)} color="primary" delay={0.16} onClick={() => setDrawerMetric("period-revenue")} />
        <KpiCard icon={IndianRupee} title="Expenses" value={formatIndianRupees(stats?.total_expenses ?? 0)} color="danger" delay={0.2} onClick={() => setDrawerMetric("expenses")} />
      </div>

      {/* Second KPI row - 4 columns */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard icon={TrendingUp} title="Monthly Revenue" value={formatIndianRupees(stats?.monthly_revenue ?? 0)} color="primary" delay={0.04} onClick={() => setDrawerMetric("monthly-revenue")} />
        <KpiCard icon={BarChart3} title="Yearly Revenue" value={formatIndianRupees(stats?.yearly_revenue ?? 0)} color="warning" delay={0.08} onClick={() => setDrawerMetric("yearly-revenue")} />
        <KpiCard icon={TrendingUp} title="Net Profit" value={formatIndianRupees(stats?.net_profit ?? 0)} color={(stats?.net_profit ?? 0) >= 0 ? "success" : "danger"} delay={0.12} onClick={() => setDrawerMetric("profit")} />
        <KpiCard icon={PieChart} title="Profit Margin" value={stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%"} color="primary" delay={0.16} onClick={() => setDrawerMetric("margin")} />
        <KpiCard icon={FileText} title="Consent Forms" value={formatIndianNumber(consentStats?.total ?? 0)} description={`${formatIndianNumber(consentStats?.this_month ?? 0)} this month`} color="info" delay={0.2} />
      </div>

      {hasData && (
        <>
          {/* Charts row - max 280px height */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue vs Expenses</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={stats?.revenue_expense_trend || stats?.revenue_trend?.map((d: any) => ({ ...d, expenses: 0, profit: 0 })) || []}>
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
              <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Expense Breakdown</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats?.expense_trend || stats?.revenue_expense_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="expenses" name="Expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Capacity + Leaderboards */}
          {(stats?.capacity_most_booked_doctors?.length > 0 || stats?.capacity_peak_hours?.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {stats?.capacity_most_booked_doctors?.length > 0 && (
                <Card>
                  <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Most Booked Doctors</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {stats.capacity_most_booked_doctors.map((d: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                            <span className="text-sm font-medium text-gray-900">{d.doctor_name}</span>
                          </div>
                          <span className="text-sm font-semibold text-primary">{d.appointments} appts</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {stats?.capacity_peak_hours?.length > 0 && (
                <Card>
                  <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Peak Hours</CardTitle></CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {stats.capacity_peak_hours.map((h: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <span className="text-sm text-gray-900">{h.hour.toString().padStart(2, '0')}:00 - {String(h.hour + 1).padStart(2, '0')}:00</span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-gray-100">
                              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min((h.appointments / 4) * 100, 100)}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 w-6 text-right">{h.appointments}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Leaderboards */}
          <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
            <Leaderboard
              title="Doctor Performance"
              valueLabel="Revenue"
              icon={Award}
              items={(stats?.doctor_performance ?? []).map((d: any, i: number) => ({
                rank: i + 1, name: d.name, value: formatIndianRupees(d.value), id: d.id,
              }))}
              onItemClick={(id) => {
                const item = (stats?.doctor_performance ?? []).find((d: any) => d.id === id)
                if (item) setQuickView({ type: "doctor", id: item.id, name: item.name })
              }}
            />
            <Leaderboard
              title="Top Treatments"
              valueLabel="Count"
              icon={Activity}
              items={(stats?.treatment_performance ?? []).map((t: any, i: number) => ({
                rank: i + 1, name: t.name, value: `${t.value} patients`,
              }))}
            />
          </motion.div>

          {consentStats?.recent?.length > 0 && (
            <motion.div variants={item}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Recent Consent Uploads</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {consentStats.recent.slice(0, 5).map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{r.patient_name}</span>
                        <span className="text-muted-foreground">{r.consent_type} - {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}

      {!hasData && (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
            <Calendar className="h-6 w-6 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No activity yet</h2>
          <p className="mt-1 text-sm text-gray-500 max-w-sm">Patient registrations and appointments will appear here.</p>
        </motion.div>
      )}

      {quickView && (
        <QuickViewDrawer open={!!quickView} onClose={() => setQuickView(null)} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}

      <AnalyticsDrawer
        open={!!drawerMetric}
        onClose={() => setDrawerMetric(null)}
        period={period}
        onPeriodChange={setPeriod}
        title={
          drawerMetric === "revenue" ? "Total Revenue" :
          drawerMetric === "monthly-revenue" ? "Monthly Revenue" :
          drawerMetric === "yearly-revenue" ? "Yearly Revenue" :
          drawerMetric === "appointments" ? "Appointments" :
          drawerMetric === "patients" ? "Patients" :
          drawerMetric === "cases" ? "Active Cases" :
          drawerMetric === "period-revenue" ? "Period Revenue" :
          drawerMetric === "expenses" ? "Expenses" :
          drawerMetric === "profit" ? "Net Profit" :
          drawerMetric === "margin" ? "Profit Margin" : ""
        }
        icon={
          drawerMetric === "revenue" || drawerMetric === "period-revenue" ? <DollarSign className="h-5 w-5" /> :
          drawerMetric === "monthly-revenue" || drawerMetric === "yearly-revenue" || drawerMetric === "profit" ? <TrendingUp className="h-5 w-5" /> :
          drawerMetric === "appointments" ? <Calendar className="h-5 w-5" /> :
          drawerMetric === "patients" ? <Users className="h-5 w-5" /> :
          drawerMetric === "cases" ? <FolderOpen className="h-5 w-5" /> :
          drawerMetric === "expenses" ? <IndianRupee className="h-5 w-5" /> :
          drawerMetric === "margin" ? <PieChart className="h-5 w-5" /> : undefined
        }
        color={
          drawerMetric === "revenue" || drawerMetric === "period-revenue" ? "#10B981" :
          drawerMetric === "expenses" ? "#EF4444" :
          drawerMetric === "profit" ? "#10B981" :
          drawerMetric === "margin" ? "#4F46E5" :
          drawerMetric === "appointments" ? "#F59E0B" :
          drawerMetric === "patients" ? "#06B6D4" :
          drawerMetric === "cases" ? "#EF4444" :
          drawerMetric === "monthly-revenue" || drawerMetric === "yearly-revenue" ? "#4F46E5" : "#4F46E5"
        }
        valueType={drawerMetric === "appointments" || drawerMetric === "patients" || drawerMetric === "cases" ? "number" : "currency"}
        data={
          drawerMetric === "revenue" || drawerMetric === "period-revenue" || drawerMetric === "monthly-revenue" || drawerMetric === "yearly-revenue" || drawerMetric === "profit" || drawerMetric === "margin"
            ? (stats?.revenue_expense_trend || stats?.revenue_trend || [])
            : drawerMetric === "expenses"
            ? (stats?.expense_trend || stats?.revenue_expense_trend || [])
            : drawerMetric === "patients"
            ? (stats?.patient_growth_trend || [])
            : drawerMetric === "appointments"
            ? (stats?.appointment_count_trend || [])
            : drawerMetric === "cases"
            ? (stats?.case_count_trend || [])
            : []
        }
        dataKeys={
          drawerMetric === "revenue" || drawerMetric === "period-revenue"
            ? [{ key: "revenue", name: "Revenue", color: "#10B981" }, { key: "expenses", name: "Expenses", color: "#EF4444" }, { key: "profit", name: "Profit", color: "#4F46E5" }]
            : drawerMetric === "monthly-revenue"
            ? [{ key: "revenue", name: "Revenue", color: "#4F46E5" }]
            : drawerMetric === "yearly-revenue"
            ? [{ key: "revenue", name: "Revenue", color: "#F59E0B" }]
            : drawerMetric === "profit" || drawerMetric === "margin"
            ? [{ key: "profit", name: "Profit", color: "#10B981" }]
            : drawerMetric === "expenses"
            ? [{ key: "expenses", name: "Expenses", color: "#EF4444" }]
            : drawerMetric === "patients"
            ? [{ key: "count", name: "Patients", color: "#06B6D4" }]
            : drawerMetric === "appointments"
            ? [{ key: "count", name: "Appointments", color: "#F59E0B" }]
            : drawerMetric === "cases"
            ? [{ key: "count", name: "Cases", color: "#EF4444" }]
            : [{ key: "value", name: "Value", color: "#4F46E5" }]
        }
        xAxisKey="month"
        chartType={drawerMetric === "pending-billing" ? "bar" : "area"}
        trend={
          drawerMetric === "revenue" || drawerMetric === "period-revenue"
            ? (revChange != null ? { value: `${revChange > 0 ? "+" : ""}${revChange}%`, positive: revChange >= 0 } : null)
            : drawerMetric === "patients"
            ? (patChange != null ? { value: `${patChange > 0 ? "+" : ""}${patChange}%`, positive: patChange >= 0 } : null)
            : drawerMetric === "appointments"
            ? (apptChange != null ? { value: `${apptChange > 0 ? "+" : ""}${apptChange}%`, positive: apptChange >= 0 } : null)
            : drawerMetric === "cases"
            ? (caseChange != null ? { value: `${caseChange > 0 ? "+" : ""}${caseChange}%`, positive: caseChange >= 0 } : null)
            : drawerMetric === "monthly-revenue" || drawerMetric === "yearly-revenue" || drawerMetric === "profit"
            ? (revChange != null ? { value: `${revChange > 0 ? "+" : ""}${revChange}%`, positive: revChange >= 0 } : null)
            : null
        }
        metrics={
          drawerMetric === "revenue"
            ? [
                { label: "Total Revenue", value: formatIndianRupees(stats?.total_revenue ?? 0), color: "#10B981" },
                { label: "Monthly", value: formatIndianRupees(stats?.monthly_revenue ?? 0), color: "#4F46E5" },
                { label: "Yearly", value: formatIndianRupees(stats?.yearly_revenue ?? 0), color: "#F59E0B" },
                { label: "Period", value: formatIndianRupees(stats?.period_revenue ?? 0), color: "#06B6D4" },
              ]
            : drawerMetric === "expenses"
            ? [
                { label: "Total Expenses", value: formatIndianRupees(stats?.total_expenses ?? 0), color: "#EF4444" },
                { label: "Pending Billing", value: formatIndianRupees(stats?.total_pending_billing ?? 0), color: "#F59E0B" },
              ]
            : drawerMetric === "profit"
            ? [
                { label: "Net Profit", value: formatIndianRupees(stats?.net_profit ?? 0), color: "#10B981" },
                { label: "Margin", value: stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%", color: "#4F46E5" },
              ]
            : drawerMetric === "margin"
            ? [
                { label: "Profit Margin", value: stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%", color: "#4F46E5" },
                { label: "Net Profit", value: formatIndianRupees(stats?.net_profit ?? 0), color: "#10B981" },
              ]
            : drawerMetric === "appointments"
            ? [
                { label: "Today", value: formatIndianNumber(stats?.today_appointments ?? 0), color: "#F59E0B" },
                { label: "Active Cases", value: formatIndianNumber(stats?.total_active_cases ?? 0), color: "#EF4444" },
              ]
            : drawerMetric === "patients"
            ? [{ label: "Total Patients", value: formatIndianNumber(stats?.total_patients ?? 0), color: "#06B6D4" }]
            : drawerMetric === "cases"
            ? [{ label: "Active Cases", value: formatIndianNumber(stats?.total_active_cases ?? 0), color: "#EF4444" }]
            : undefined
        }
      />
    </motion.div>
  )
}
