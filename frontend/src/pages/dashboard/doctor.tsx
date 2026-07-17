import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Users, Calendar, FolderOpen, ClipboardList, Stethoscope, DollarSign, BarChart3 } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import QuickViewDrawer from "@/components/ui/quick-view-drawer"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

export default function DoctorDashboard() {
  const { user } = useAuthStore()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "doctor", user?.id],
    queryFn: () => dashboardApi.doctor(),
    enabled: !!user?.id,
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

  const hasData = stats && (stats.my_patients || stats.today_appointments || stats.active_cases)

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number; dataKey: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
          {payload.map((p: { color: string; name: string; value: number }, i: number) => (
            <p key={i} className="text-xs" style={{ color: p.color }}>
              {p.name}: {p.name?.includes("Revenue") || p.dataKey === "revenue" ? formatIndianRupees(p.value) : formatIndianNumber(p.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <motion.div className="space-y-4" variants={container} initial="hidden" animate="show">
      {/* Compact header */}
      <div className="gradient-hero rounded-xl px-5 py-3.5 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">Dr. {user.full_name}</h1>
              <p className="text-xs text-white/70">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-white/70 uppercase tracking-wider">Revenue</p>
              <p className="text-sm font-bold text-white">{formatIndianRupees(stats?.personal_revenue || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/70 uppercase tracking-wider">Patients</p>
              <p className="text-sm font-bold text-white">{stats?.my_patients || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Grid - up to 6 columns */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard icon={Users} title="My Patients" value={formatIndianNumber(stats?.my_patients ?? 0)} color="primary" delay={0} onClick={() => setQuickView({ type: "patient", id: "", name: "Patients" })} />
        <KpiCard icon={Calendar} title="Today Appts" value={formatIndianNumber(stats?.today_appointments ?? 0)} color="warning" delay={0.04} />
        <KpiCard icon={FolderOpen} title="Active Cases" value={formatIndianNumber(stats?.active_cases ?? 0)} color="danger" delay={0.08} />
        <KpiCard icon={ClipboardList} title="Follow-Ups" value={formatIndianNumber(stats?.follow_ups ?? 0)} color="info" delay={0.12} />
        <KpiCard icon={DollarSign} title="Personal Revenue" value={formatIndianRupees(stats?.personal_revenue ?? 0)} color="success" delay={0.16} />
        <KpiCard icon={BarChart3} title="Cases Completed" value={formatIndianNumber(stats?.cases_completed ?? 0)} color="primary" delay={0.2} />
      </div>

      {hasData && (
        <>
          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue Trend</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={stats?.revenue_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Case Completion</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats?.case_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="completed" name="Completed" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="active" name="Active" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Performance metrics */}
          <motion.div variants={item} className="grid gap-4 lg:grid-cols-3">
            {stats?.treatment_success_rate != null && (
              <Card>
                <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Treatment Success Rate</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-2xl font-bold text-emerald-600">{stats.treatment_success_rate}%</p>
                </CardContent>
              </Card>
            )}
            {stats?.follow_up_rate != null && (
              <Card>
                <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Follow-Up Rate</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-2xl font-bold text-indigo-600">{stats.follow_up_rate}%</p>
                </CardContent>
              </Card>
            )}
            {stats?.today_capacity != null && (
              <Card>
                <CardHeader className="px-4 py-3"><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Today's Capacity</CardTitle></CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-2xl font-bold text-cyan-600">{stats.today_capacity}%</p>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </>
      )}

      {!hasData && (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
            <Stethoscope className="h-6 w-6 text-indigo-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Welcome to your dashboard</h2>
          <p className="mt-1 text-sm text-gray-500 max-w-sm">Your patients, appointments and performance metrics will appear here.</p>
        </motion.div>
      )}

      {quickView && (
        <QuickViewDrawer open={!!quickView} onClose={() => setQuickView(null)} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}
    </motion.div>
  )
}
