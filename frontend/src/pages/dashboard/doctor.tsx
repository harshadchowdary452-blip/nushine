import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Users, Calendar, FolderOpen, ClipboardList, Stethoscope, Sparkles, TrendingUp, Award, DollarSign, Activity, BarChart3 } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import QuickViewDrawer from "@/components/ui/quick-view-drawer"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function DoctorDashboard() {
  const { user } = useAuthStore()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "doctor", user?.id],
    queryFn: () => dashboardApi.doctor(),
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

  const hasData = stats && (stats.my_patients || stats.today_appointments || stats.active_cases)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
          {payload.map((p: any, i: number) => (
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
              <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[100px]">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Revenue</p>
                <p className="text-white text-xl font-bold">{formatIndianRupees(stats?.personal_revenue || 0)}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[100px]">
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Patients</p>
                <p className="text-white text-xl font-bold">{stats?.my_patients || 0}</p>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dr. {user.full_name}</h1>
            <span className="hidden sm:flex h-2 w-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          </div>
          <p className="mt-1 text-gray-500">Your daily practice overview</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-soft border border-primary-100 shadow-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">My Practice</span>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard className="card-hover" icon={Users} title="My Patients" value={formatIndianNumber(stats?.my_patients ?? 0)} color="info" delay={0} />
        <KpiCard className="card-hover" icon={Calendar} title="Today Appointments" value={formatIndianNumber(stats?.today_appointments ?? 0)} color="warning" delay={0.05} />
        <KpiCard className="card-hover" icon={FolderOpen} title="Active Cases" value={formatIndianNumber(stats?.active_cases ?? 0)} color="danger" delay={0.1} />
        <KpiCard className="card-hover" icon={ClipboardList} title="Follow-Ups" value={formatIndianNumber(stats?.pending_follow_ups ?? 0)} color="success" delay={0.15} />
        <KpiCard className="card-hover" icon={DollarSign} title="Personal Revenue" value={stats?.personal_revenue != null ? formatIndianRupees(stats.personal_revenue) : "₹0"} color="success" delay={0.2} />
        <KpiCard className="card-hover" icon={Activity} title="Cases Completed" value={formatIndianNumber(stats?.cases_completed ?? 0)} color="info" delay={0.25} />
      </div>

      {hasData && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Performance</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-primary">{stats?.treatment_success_rate ?? 0}%</p>
                    <p className="text-xs text-gray-500">Treatment Success</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-warning">{stats?.follow_up_rate ?? 0}%</p>
                    <p className="text-xs text-gray-500">Follow-up Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={stats?.revenue_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Case Completion Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats?.case_completion_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="count" name="Cases" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Treatment Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats?.treatment_trend || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip />
                    <Bar dataKey="value" name="Treatments" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!hasData && (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover shadow-lg shadow-primary/20">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Welcome, Dr. {user.full_name}</h2>
          <p className="mt-1.5 text-sm text-gray-500 max-w-sm">Your patients and appointments will show here.</p>
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
