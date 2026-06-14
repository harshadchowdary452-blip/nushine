import { useState, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, Stethoscope, Users, DollarSign, TrendingUp, Sparkles, Hospital, Award, Activity, BarChart3, CalendarCheck, RefreshCw, IndianRupee, PieChart } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Leaderboard from "@/components/ui/leaderboard"
import QuickViewDrawer from "@/components/ui/quick-view-drawer"
import DateFilterBar from "@/components/ui/date-filter-bar"
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

export default function GroupAdminDashboard() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)

  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const dashParams = useMemo(() => {
    const params: Record<string, string> = { period }
    if (period === "custom" && startDate) params.start_date = startDate
    if (period === "custom" && endDate) params.end_date = endDate
    return params
  }, [period, startDate, endDate])

  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dash", "group", user?.id, dashParams],
    queryFn: () => dashboardApi.groupAdmin(dashParams),
    staleTime: 30000,
    gcTime: 60000,
    refetchOnWindowFocus: true,
  })

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dash"] })
    refetch()
  }, [queryClient, refetch])

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

  const hasData = stats && (stats.total_hospitals || stats.total_doctors || stats.total_patients)

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
          <p className="mt-1 text-gray-500">Group-level performance overview</p>
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
        <KpiCard className="card-hover" icon={Building2} title="Hospitals" value={formatIndianNumber(stats?.total_hospitals ?? 0)} color="info" delay={0} />
        <KpiCard className="card-hover" icon={Stethoscope} title="Doctors" value={formatIndianNumber(stats?.total_doctors ?? 0)} color="primary" delay={0.05} />
        <KpiCard className="card-hover" icon={Users} title="Patients" value={formatIndianNumber(stats?.total_patients ?? 0)} color="success" delay={0.1} />
        <KpiCard className="card-hover" icon={Activity} title="Active Cases" value={formatIndianNumber(stats?.total_active_cases ?? 0)} color="danger" delay={0.15} />
        <KpiCard className="card-hover" icon={CalendarCheck} title="Appointments" value={formatIndianNumber(stats?.total_appointments ?? 0)} color="info" delay={0.2} />
        <KpiCard className="card-hover" icon={DollarSign} title="Total Revenue" value={stats?.total_revenue != null ? formatIndianRupees(stats.total_revenue) : "₹0"} color="warning" delay={0.25} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard className="card-hover" icon={TrendingUp} title="Period Revenue" value={formatIndianRupees(stats?.period_revenue ?? 0)} color="primary" delay={0.28} />
        <KpiCard className="card-hover" icon={IndianRupee} title="Total Expenses" value={formatIndianRupees(stats?.total_expenses ?? 0)} color="danger" delay={0.31} />
        <KpiCard className="card-hover" icon={TrendingUp} title="Net Profit" value={formatIndianRupees(stats?.net_profit ?? 0)} color={(stats?.net_profit ?? 0) >= 0 ? "success" : "danger"} delay={0.34} />
        <KpiCard className="card-hover" icon={PieChart} title="Profit Margin" value={stats?.profit_margin != null ? `${stats.profit_margin.toFixed(1)}%` : "0%"} color="primary" delay={0.37} />
      </div>

      {hasData && (
        <>
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
              <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Profit Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats?.profit_trend || stats?.monthly_growth_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <motion.div variants={item}>
            <Tabs defaultValue="hospitals">
              <TabsList className="mb-4">
                <TabsTrigger value="hospitals">Hospitals</TabsTrigger>
                <TabsTrigger value="doctors">Doctors</TabsTrigger>
              </TabsList>
              <TabsContent value="hospitals">
                <Leaderboard
                  title="Hospital Performance"
                  valueLabel="Revenue"
                  icon={Hospital}
                  items={(stats?.hospital_performance ?? []).map((h: any, i: number) => ({
                    rank: i + 1, name: h.name,
                    value: `${formatIndianRupees(h.revenue ?? h.value)} | Profit: ${formatIndianRupees(h.profit ?? 0)}`,
                    subtitle: `Patients: ${h.patients ?? 0} | Cases: ${h.cases ?? 0} | Doctors: ${h.doctors ?? 0}`,
                    id: h.id,
                  }))}
                  onItemClick={(id) => {
                    const item = (stats?.hospital_performance ?? []).find((h: any) => h.id === id)
                    if (item) setQuickView({ type: "hospital", id: item.id, name: item.name })
                  }}
                />
              </TabsContent>
              <TabsContent value="doctors">
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
              </TabsContent>
            </Tabs>
          </motion.div>
        </>
      )}

      {!hasData && (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-info to-primary shadow-lg shadow-info/20">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">No data yet</h2>
          <p className="mt-1.5 text-sm text-gray-500 max-w-sm">Hospitals and doctors under your group will appear here once configured.</p>
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
    </motion.div>
  )
}
