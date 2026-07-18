import { useMemo, useState, useCallback, lazy, Suspense } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import {
  Building2, Stethoscope, Users,
  Sparkles, Award,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import KpiCard from "@/components/layout/kpi-card"
import Leaderboard from "@/components/ui/leaderboard"
import QuickViewDrawer from "@/components/ui/quick-view-drawer"
import DateFilterBar from "@/components/ui/date-filter-bar"
const FinancialDashboard = lazy(() => import("@/components/dashboard/financial-dashboard"))
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

export default function SuperAdminDashboard() {
  const { user } = useAuthStore()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const onQuickViewClose = useCallback(() => setQuickView(null), [])

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

  const onGroupClick = useCallback((id?: string) => {
    const item = (stats?.group_performance ?? []).find((d: { id?: string; name?: string; value?: number }) => d.id === id)
    if (item) setQuickView({ type: "admin-group", id: item.id, name: item.name })
  }, [stats?.group_performance])
  const onHospitalClick = useCallback((id?: string) => {
    const item = (stats?.hospital_performance ?? []).find((d: { id?: string; name?: string; value?: number }) => d.id === id)
    if (item) setQuickView({ type: "hospital", id: item.id, name: item.name })
  }, [stats?.hospital_performance])
  const onDoctorClick = useCallback((id?: string) => {
    const item = (stats?.top_doctors ?? []).find((d: { id?: string; name?: string; value?: number }) => d.id === id)
    if (item) setQuickView({ type: "doctor", id: item.id, name: item.name })
  }, [stats?.top_doctors])

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

      {/* Financial Dashboard (period-aware) */}
      <Suspense fallback={<div className="h-[420px] rounded-xl bg-gray-50 animate-pulse" />}>
        <FinancialDashboard />
      </Suspense>

      {hasData && (
        <>
          {/* Leaderboards */}
          <motion.div variants={item} className="grid gap-4 lg:grid-cols-2">
            <Leaderboard
              title="Top Admin Groups"
              valueLabel="Revenue"
              icon={Award}
              items={(stats?.group_performance ?? []).map((d: { id?: string; name?: string; value?: number }, i: number) => ({
                rank: i + 1, name: d.name || "", value: formatIndianRupees(d.value || 0), id: d.id || "",
              }))}
              onItemClick={onGroupClick}
            />
            <Leaderboard
              title="Top Hospitals"
              valueLabel="Revenue"
              icon={Award}
              items={(stats?.hospital_performance ?? []).map((d: { id?: string; name?: string; value?: number }, i: number) => ({
                rank: i + 1, name: d.name || "", value: formatIndianRupees(d.value || 0), id: d.id || "",
              }))}
              onItemClick={onHospitalClick}
            />
            <Leaderboard
              title="Top Doctors"
              valueLabel="Revenue"
              icon={Award}
              items={(stats?.top_doctors ?? []).map((d: { id?: string; name?: string; value?: number }, i: number) => ({
                rank: i + 1, name: d.name || "", value: formatIndianRupees(d.value || 0), id: d.id || "",
              }))}
              onItemClick={onDoctorClick}
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
        <QuickViewDrawer open={!!quickView} onClose={onQuickViewClose} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}
    </motion.div>
  )
}
