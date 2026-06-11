import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Calendar, DollarSign, Users, FolderOpen, Building2, Sparkles, TrendingUp, Award, Activity } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import Leaderboard from "@/components/ui/leaderboard"
import DashboardDateFilter from "@/components/ui/dashboard-date-filter"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function HospitalAdminDashboard() {
  const { user } = useAuthStore()
  const [dateRange, setDateRange] = useState<string>("month")

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "hospital", user?.id],
    queryFn: () => dashboardApi.hospitalAdmin(),
  })

  if (!user) return null

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[130px] rounded-2xl" />)}
        </div>
      </div>
    )
  }

  const hasData = stats && (stats.total_patients || stats.today_appointments || stats.total_cases)

  return (
    <motion.div className="space-y-8 relative" variants={container} initial="hidden" animate="show">
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
          <DashboardDateFilter value={dateRange as any} onChange={setDateRange} />
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-soft border border-primary-100 shadow-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Hospital Dashboard</span>
          </div>
        </div>
      </motion.div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Revenue & Operations</h2>
        <motion.div variants={container} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={DollarSign} title="Total Revenue" value={stats?.total_revenue != null ? formatIndianRupees(stats.total_revenue) : "₹0"} color="success" delay={0}
            trend={stats?.revenue_growth ? { value: `${stats.revenue_growth}%`, positive: stats.revenue_growth >= 0 } : undefined} />
          <KpiCard icon={Calendar} title="Today Appointments" value={formatIndianNumber(stats?.today_appointments ?? 0)} color="warning" delay={0.05} />
          <KpiCard icon={Users} title="Total Patients" value={formatIndianNumber(stats?.total_patients ?? 0)} color="info" delay={0.1} />
          <KpiCard icon={FolderOpen} title="Total Cases" value={formatIndianNumber(stats?.total_cases ?? 0)} color="primary" delay={0.15} />
        </motion.div>
      </div>

      {!hasData ? (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-warning to-amber-500 shadow-lg shadow-warning/20">
            <Calendar className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">No activity yet</h2>
          <p className="mt-1.5 text-sm text-gray-500 max-w-sm">Patient registrations and appointments will appear here.</p>
        </motion.div>
      ) : (
        <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
          <Leaderboard
            title="Top Doctors"
            valueLabel="Revenue"
            icon={Award}
            items={(stats?.top_doctors ?? []).map((d: any, i: number) => ({
              rank: i + 1,
              name: d.name,
              value: formatIndianRupees(d.value),
            }))}
          />
          <Leaderboard
            title="Top Treatments"
            valueLabel="Patients"
            icon={Activity}
            items={(stats?.top_treatments ?? []).map((t: any, i: number) => ({
              rank: i + 1,
              name: t.name,
              value: `${t.value} patients`,
            }))}
          />
        </motion.div>
      )}
    </motion.div>
  )
}
