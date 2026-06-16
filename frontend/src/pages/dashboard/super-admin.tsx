import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import {
  Building2, Hospital, Stethoscope, Users, DollarSign, TrendingUp, CalendarCheck,
  Sparkles, Shield, Activity, BarChart3, Award, IndianRupee, PieChart,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar,
} from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

export default function SuperAdminDashboard() {
  const { user } = useAuthStore()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const dashParams = useMemo(() => {
    const p: Record<string, string> = { period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    return p
  }, [period, startDate, endDate])

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "super", user?.id, dashParams],
    queryFn: () => dashboardApi.superAdmin(dashParams),
    staleTime: 30000,
    gcTime: 60000,
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[90px] rounded-xl" />)}
        </div>
      </div>
    )
  }

  const hasData = stats && (stats.total_groups || stats.total_hospitals || stats.total_patients)

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
              <h1 className="text-base font-semibold text-white">Super Admin Dashboard</h1>
              <p className="text-xs text-white/70">Enterprise overview at a glance</p>
            </div>
          </div>
          <DateFilterBar period={period} onPeriodChange={setPeriod} startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
        </div>
      </div>

      {/* KPI Grid - 4 columns */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard icon={Building2} title="Admin Groups" value={formatIndianNumber(stats?.total_groups ?? 0)} color="primary" delay={0} />
        <KpiCard icon={Building2} title="Hospitals" value={formatIndianNumber(stats?.total_hospitals ?? 0)} color="info" delay={0.04} />
        <KpiCard icon={Stethoscope} title="Doctors" value={formatIndianNumber(stats?.total_doctors ?? 0)} color="success" delay={0.08} />
        <KpiCard icon={Users} title="Patients" value={formatIndianNumber(stats?.total_patients ?? 0)} color="warning" delay={0.12} />
      </div>

      {/* Second row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard icon={DollarSign} title="Revenue" value={formatIndianRupees(stats?.total_revenue ?? 0)} color="success" delay={0.04} />
        <KpiCard icon={TrendingUp} title="Monthly" value={formatIndianRupees(stats?.monthly_revenue ?? 0)} color="primary" delay={0.08} />
        <KpiCard icon={BarChart3} title="Yearly" value={formatIndianRupees(stats?.yearly_revenue ?? 0)} color="warning" delay={0.12} />
        <KpiCard icon={IndianRupee} title="Expenses" value={formatIndianRupees(stats?.total_expenses ?? 0)} color="danger" delay={0.16} />
      </div>

      {hasData && (
        <>
          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue vs Expenses</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={stats?.revenue_expense_trend || []}>
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
              <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Profit Trend</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats?.revenue_expense_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="profit" name="Profit" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Leaderboards */}
          <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
            <Leaderboard
              title="Top Admin Groups"
              valueLabel="Revenue"
              icon={Award}
              items={(stats?.group_performance ?? []).map((d: any, i: number) => ({
                rank: i + 1, name: d.name, value: formatIndianRupees(d.value), id: d.id,
              }))}
              onItemClick={(id) => {
                const item = (stats?.group_performance ?? []).find((d: any) => d.id === id)
                if (item) setQuickView({ type: "admin-group", id: item.id, name: item.name })
              }}
            />
            <Leaderboard
              title="Top Hospitals"
              valueLabel="Revenue"
              icon={Award}
              items={(stats?.hospital_performance ?? []).map((d: any, i: number) => ({
                rank: i + 1, name: d.name, value: formatIndianRupees(d.value), id: d.id,
              }))}
              onItemClick={(id) => {
                const item = (stats?.hospital_performance ?? []).find((d: any) => d.id === id)
                if (item) setQuickView({ type: "hospital", id: item.id, name: item.name })
              }}
            />
          </motion.div>
        </>
      )}

      {!hasData && (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
            <Building2 className="h-6 w-6 text-indigo-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">No data yet</h2>
          <p className="mt-1 text-sm text-gray-500 max-w-sm">Groups, hospitals and patients will appear here.</p>
        </motion.div>
      )}

      {quickView && (
        <QuickViewDrawer open={!!quickView} onClose={() => setQuickView(null)} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}
    </motion.div>
  )
}
