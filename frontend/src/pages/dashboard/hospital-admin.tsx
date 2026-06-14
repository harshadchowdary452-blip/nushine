import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Calendar, DollarSign, Users, FolderOpen, TrendingUp, Award, Activity, BarChart3, IndianRupee, PieChart } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
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
          const isFinancial = p.name === "Revenue" || p.name === "Expenses" || p.name === "Profit" || p.dataKey === "revenue" || p.dataKey === "expenses" || p.dataKey === "profit"
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
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function HospitalAdminDashboard() {
  const { user } = useAuthStore()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)
  const [drawerMetric, setDrawerMetric] = useState<string | null>(null)

  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const dashParams = useMemo(() => {
    const params: Record<string, string> = { period }
    if (period === "custom" && startDate) params.start_date = startDate
    if (period === "custom" && endDate) params.end_date = endDate
    return params
  }, [period, startDate, endDate])

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "hospital", user?.id, dashParams],
    queryFn: () => dashboardApi.hospitalAdmin(dashParams),
    staleTime: 30000,
    gcTime: 60000,
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-[130px] rounded-2xl" />)}
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
    <motion.div className="space-y-8 relative" variants={container} initial="hidden" animate="show">
      {/* Welcome Banner */}
      <div className="gradient-hero rounded-2xl p-6 md:p-8 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                {getGreeting()}, {user?.full_name?.split(" ").slice(0, 2).join(" ") || "User"} 👋
              </h1>
              <p className="text-white/80 mt-1">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="bg-white/20 rounded-xl px-4 py-3 text-center min-w-[100px]">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Revenue</p>
                <p className="text-white text-xl font-bold">{formatIndianRupees(stats?.total_revenue || 0)}</p>
              </div>
              <div className="bg-white/20 rounded-xl px-4 py-3 text-center min-w-[100px]">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Patients</p>
                <p className="text-white text-xl font-bold">{stats?.total_patients || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="fixed top-40 -left-32 h-80 w-80 rounded-full bg-teal-100/20 blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-40 -right-32 h-80 w-80 rounded-full bg-blue-100/20 blur-3xl pointer-events-none -z-10" />
      <motion.div variants={item} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{user.full_name}</h1>
            <span className="hidden sm:flex h-2 w-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          </div>
          <p className="mt-1 text-gray-500">Hospital operations at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <DateFilterBar
            period={period}
            onPeriodChange={setPeriod}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard className="card-hover" icon={DollarSign} title="Total Revenue" value={stats?.total_revenue != null ? formatIndianRupees(stats.total_revenue) : "₹0"} color="success" delay={0} onClick={() => setDrawerMetric("revenue")} />
        <KpiCard className="card-hover" icon={TrendingUp} title="Monthly Revenue" value={formatIndianRupees(stats?.monthly_revenue ?? 0)} color="primary" delay={0.05} onClick={() => setDrawerMetric("monthly-revenue")} />
        <KpiCard className="card-hover" icon={BarChart3} title="Yearly Revenue" value={formatIndianRupees(stats?.yearly_revenue ?? 0)} color="warning" delay={0.1} onClick={() => setDrawerMetric("yearly-revenue")} />
        <KpiCard className="card-hover" icon={Calendar} title="Today Appointments" value={formatIndianNumber(stats?.today_appointments ?? 0)} color="warning" delay={0.15} onClick={() => setDrawerMetric("appointments")} />
        <KpiCard className="card-hover" icon={Users} title="Total Patients" value={formatIndianNumber(stats?.total_patients ?? 0)} color="info" delay={0.2} onClick={() => setDrawerMetric("patients")} />
        <KpiCard className="card-hover" icon={FolderOpen} title="Active Cases" value={formatIndianNumber(stats?.total_active_cases ?? 0)} color="danger" delay={0.25} onClick={() => setDrawerMetric("cases")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard className="card-hover" icon={DollarSign} title="Period Revenue" value={formatIndianRupees(stats?.period_revenue ?? 0)} color="success" delay={0.28} onClick={() => setDrawerMetric("period-revenue")} />
        <KpiCard className="card-hover" icon={IndianRupee} title="Expenses" value={formatIndianRupees(stats?.total_expenses ?? 0)} color="danger" delay={0.31} onClick={() => setDrawerMetric("expenses")} />
        <KpiCard className="card-hover" icon={TrendingUp} title="Net Profit" value={formatIndianRupees(stats?.net_profit ?? 0)} color={(stats?.net_profit ?? 0) >= 0 ? "success" : "danger"} delay={0.34} onClick={() => setDrawerMetric("profit")} />
        <KpiCard className="card-hover" icon={PieChart} title="Profit Margin" value={stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%"} color="primary" delay={0.37} onClick={() => setDrawerMetric("margin")} />
        <KpiCard className="card-hover" icon={BarChart3} title="Pending Billing" value={formatIndianRupees(stats?.total_pending_billing ?? 0)} color="warning" delay={0.4} onClick={() => setDrawerMetric("pending-billing")} />
      </div>

      {hasData && (
        <>
          {(stats?.capacity_most_booked_doctors?.length > 0 || stats?.capacity_peak_hours?.length > 0) && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wider">Appointment Capacity</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                {stats?.capacity_most_booked_doctors?.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Most Booked Doctors Today</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stats.capacity_most_booked_doctors.map((d: any, i: number) => (
                          <div key={i} className="flex items-center justify-between">
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
                    <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Peak Hours Today</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stats.capacity_peak_hours.map((h: any, i: number) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">{h.hour.toString().padStart(2, '0')}:00 - {String(h.hour + 1).padStart(2, '0')}:00</span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 rounded-full bg-gray-100">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min((h.appointments / 4) * 100, 100)}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-gray-600 w-8 text-right">{h.appointments}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue vs Expenses</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={stats?.revenue_expense_trend || stats?.revenue_trend?.map((d: any) => ({ ...d, expenses: 0, profit: 0 })) || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Monthly Expense Breakdown</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats?.expense_trend || stats?.revenue_expense_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

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
        </>
      )}

      {!hasData && (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-warning to-amber-500 shadow-lg shadow-warning/20">
            <Calendar className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">No activity yet</h2>
          <p className="mt-1.5 text-sm text-gray-500 max-w-sm">Patient registrations and appointments will appear here.</p>
        </motion.div>
      )}

      {quickView && (
        <QuickViewDrawer
          open={!!quickView}
          onClose={() => setQuickView(null)}
          type={quickView.type}
          entityId={quickView.id}
          entityName={quickView.name}
        />
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
          drawerMetric === "margin" ? "Profit Margin" :
          drawerMetric === "pending-billing" ? "Pending Billing" :
          ""
        }
        icon={
          drawerMetric === "revenue" || drawerMetric === "period-revenue" ? <DollarSign className="h-5 w-5" /> :
          drawerMetric === "monthly-revenue" || drawerMetric === "yearly-revenue" || drawerMetric === "profit" ? <TrendingUp className="h-5 w-5" /> :
          drawerMetric === "appointments" ? <Calendar className="h-5 w-5" /> :
          drawerMetric === "patients" ? <Users className="h-5 w-5" /> :
          drawerMetric === "cases" ? <FolderOpen className="h-5 w-5" /> :
          drawerMetric === "expenses" ? <IndianRupee className="h-5 w-5" /> :
          drawerMetric === "margin" ? <PieChart className="h-5 w-5" /> :
          drawerMetric === "pending-billing" ? <BarChart3 className="h-5 w-5" /> :
          undefined
        }
        color={
          drawerMetric === "revenue" || drawerMetric === "period-revenue" ? "#22C55E" :
          drawerMetric === "expenses" ? "#EF4444" :
          drawerMetric === "profit" ? "#22C55E" :
          drawerMetric === "margin" ? "#2563EB" :
          drawerMetric === "pending-billing" ? "#F59E0B" :
          drawerMetric === "appointments" ? "#F59E0B" :
          drawerMetric === "patients" ? "#06B6D4" :
          drawerMetric === "cases" ? "#EF4444" :
          drawerMetric === "monthly-revenue" || drawerMetric === "yearly-revenue" ? "#2563EB" :
          "#2563EB"
        }
        valueType={
          drawerMetric === "appointments" || drawerMetric === "patients" || drawerMetric === "cases"
            ? "number" : "currency"
        }
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
            ? [{ key: "revenue", name: "Revenue", color: "#22C55E" }, { key: "expenses", name: "Expenses", color: "#EF4444" }, { key: "profit", name: "Profit", color: "#2563EB" }]
            : drawerMetric === "monthly-revenue"
            ? [{ key: "revenue", name: "Revenue", color: "#2563EB" }]
            : drawerMetric === "yearly-revenue"
            ? [{ key: "revenue", name: "Revenue", color: "#F59E0B" }]
            : drawerMetric === "profit" || drawerMetric === "margin"
            ? [{ key: "profit", name: "Profit", color: "#22C55E" }]
            : drawerMetric === "expenses"
            ? [{ key: "expenses", name: "Expenses", color: "#EF4444" }]
            : drawerMetric === "patients"
            ? [{ key: "count", name: "Patients", color: "#06B6D4" }]
            : drawerMetric === "appointments"
            ? [{ key: "count", name: "Appointments", color: "#F59E0B" }]
            : drawerMetric === "cases"
            ? [{ key: "count", name: "Cases", color: "#EF4444" }]
            : [{ key: "value", name: "Value", color: "#2563EB" }]
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
                { label: "Total Revenue", value: formatIndianRupees(stats?.total_revenue ?? 0), color: "#22C55E" },
                { label: "Monthly", value: formatIndianRupees(stats?.monthly_revenue ?? 0), color: "#2563EB" },
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
                { label: "Net Profit", value: formatIndianRupees(stats?.net_profit ?? 0), color: "#22C55E" },
                { label: "Margin", value: stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%", color: "#2563EB" },
              ]
            : drawerMetric === "margin"
            ? [
                { label: "Profit Margin", value: stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%", color: "#2563EB" },
                { label: "Net Profit", value: formatIndianRupees(stats?.net_profit ?? 0), color: "#22C55E" },
              ]
            : drawerMetric === "appointments"
            ? [
                { label: "Today", value: formatIndianNumber(stats?.today_appointments ?? 0), color: "#F59E0B" },
                { label: "Active Cases", value: formatIndianNumber(stats?.total_active_cases ?? 0), color: "#EF4444" },
              ]
            : drawerMetric === "patients"
            ? [
                { label: "Total Patients", value: formatIndianNumber(stats?.total_patients ?? 0), color: "#06B6D4" },
              ]
            : drawerMetric === "cases"
            ? [
                { label: "Active Cases", value: formatIndianNumber(stats?.total_active_cases ?? 0), color: "#EF4444" },
              ]
            : drawerMetric === "pending-billing"
            ? [
                { label: "Pending Billing", value: formatIndianRupees(stats?.total_pending_billing ?? 0), color: "#F59E0B" },
                { label: "Total Expenses", value: formatIndianRupees(stats?.total_expenses ?? 0), color: "#EF4444" },
              ]
            : undefined
        }
      />
    </motion.div>
  )
}
