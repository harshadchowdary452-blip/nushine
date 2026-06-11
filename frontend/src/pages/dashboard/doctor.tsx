import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Users, Calendar, FolderOpen, ClipboardList, Stethoscope, Sparkles, TrendingUp, Award, DollarSign, Activity } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import Leaderboard from "@/components/ui/leaderboard"
import DashboardDateFilter from "@/components/ui/dashboard-date-filter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }

export default function DoctorDashboard() {
  const { user } = useAuthStore()
  const [dateRange, setDateRange] = useState<string>("month")

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "doctor", user?.id],
    queryFn: () => dashboardApi.doctor(),
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

  const hasData = stats && (stats.my_patients || stats.today_appointments || stats.active_cases)

  return (
    <motion.div className="space-y-8 relative" variants={container} initial="hidden" animate="show">
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
          <DashboardDateFilter value={dateRange as any} onChange={setDateRange} />
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-soft border border-primary-100 shadow-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">My Practice</span>
          </div>
        </div>
      </motion.div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Practice Metrics</h2>
        <motion.div variants={container} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Users} title="My Patients" value={formatIndianNumber(stats?.my_patients ?? 0)} color="info" delay={0} />
          <KpiCard icon={Calendar} title="Today Appointments" value={formatIndianNumber(stats?.today_appointments ?? 0)} color="warning" delay={0.05} />
          <KpiCard icon={FolderOpen} title="Active Cases" value={formatIndianNumber(stats?.active_cases ?? 0)} color="primary" delay={0.1} />
          <KpiCard icon={ClipboardList} title="Follow-Ups" value={formatIndianNumber(stats?.pending_follow_ups ?? 0)} color="success" delay={0.15} />
        </motion.div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Performance</h2>
        <motion.div variants={container} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={DollarSign} title="Personal Revenue" value={stats?.personal_revenue != null ? formatIndianRupees(stats.personal_revenue) : "₹0"} color="success" delay={0.2} />
          <KpiCard icon={Activity} title="Cases Completed" value={formatIndianNumber(stats?.cases_completed ?? 0)} color="info" delay={0.25} />
          <KpiCard icon={TrendingUp} title="Treatment Success" value={stats?.treatment_success_rate != null ? `${stats.treatment_success_rate}%` : "0%"} color="primary" delay={0.3} />
          <KpiCard icon={ClipboardList} title="Follow-up Rate" value={stats?.follow_up_rate != null ? `${stats.follow_up_rate}%` : "0%"} color="warning" delay={0.35} />
        </motion.div>
      </div>

      {!hasData ? (
        <motion.div variants={item}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover shadow-lg shadow-primary/20">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Welcome, Dr. {user.full_name}</h2>
          <p className="mt-1.5 text-sm text-gray-500 max-w-sm">Your patients and appointments will show here.</p>
        </motion.div>
      ) : null}
    </motion.div>
  )
}
