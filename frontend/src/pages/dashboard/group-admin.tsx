import { useState, useMemo, useCallback, lazy, Suspense } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { Building2, Stethoscope, Users, Sparkles, Hospital, Award, Activity, CalendarCheck } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { useHospitalStore } from "@/store/hospitalStore"
import { dashboardApi, hospitalsApi } from "@/services/endpoints"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import KpiCard from "@/components/layout/kpi-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Leaderboard from "@/components/ui/leaderboard"
import QuickViewDrawer from "@/components/ui/quick-view-drawer"
import DateFilterBar from "@/components/ui/date-filter-bar"
const FinancialDashboard = lazy(() => import("@/components/dashboard/financial-dashboard"))
import { formatIndianRupees, formatIndianNumber } from "@/lib/currency"

interface HospitalPerfItem { id: string; name: string; value: number; revenue?: number; patients?: number; doctors?: number }
interface DoctorPerfItem { id: string; name: string; value: number }

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }

export default function GroupAdminDashboard() {
  const { user } = useAuthStore()
  const { selectedHospitalId, setSelectedHospitalId } = useHospitalStore()
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor" | "patient"; id: string; name: string } | null>(null)
  const [period, setPeriod] = useState("this_month")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const onQuickViewClose = useCallback(() => setQuickView(null), [])

  const { data: hospitals } = useQuery({
    queryKey: ["hospitals", "group-admin"],
    queryFn: () => hospitalsApi.list(),
    staleTime: 120000,
  })

  const dashParams = useMemo(() => {
    const p: Record<string, string> = { period }
    if (period === "custom" && startDate) p.start_date = startDate
    if (period === "custom" && endDate) p.end_date = endDate
    if (selectedHospitalId) p.hospital_id = selectedHospitalId
    return p
  }, [period, startDate, endDate, selectedHospitalId])

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dash", "group", user?.id, dashParams],
    queryFn: () => dashboardApi.groupAdmin(dashParams),
    staleTime: 15000,
    gcTime: 60000,
    refetchInterval: 30000,
  })

  const onHospitalClick = useCallback((id?: string) => {
    const item = (stats?.hospital_performance ?? []).find((h: HospitalPerfItem) => h.id === id)
    if (item) setQuickView({ type: "hospital", id: item.id, name: item.name })
  }, [stats?.hospital_performance])
  const onDoctorClick = useCallback((id?: string) => {
    const item = (stats?.doctor_performance ?? []).find((d: DoctorPerfItem) => d.id === id)
    if (item) setQuickView({ type: "doctor", id: item.id, name: item.name })
  }, [stats?.doctor_performance])

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

  const hasData = stats && (stats.total_hospitals || stats.total_doctors || stats.total_patients)

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
              <h1 className="text-base font-semibold text-white">{user.full_name}</h1>
              <p className="text-xs text-white/70">Group performance overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hospitals?.length > 0 && (
              <Select value={selectedHospitalId || "all"} onValueChange={(v) => setSelectedHospitalId(v === "all" ? null : v)}>
                <SelectTrigger aria-label="Hospital filter" title={selectedHospitalId || "All Hospitals"} className="h-8 w-[180px] rounded-lg border-white/20 bg-white/10 text-xs text-white [&>svg]:text-white/60">
                  <SelectValue placeholder="All Hospitals" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitals.map((h: { id: string; name: string }) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <DateFilterBar period={period} onPeriodChange={setPeriod} startDate={startDate} endDate={endDate} onStartDateChange={setStartDate} onEndDateChange={setEndDate} />
          </div>
        </div>
      </div>

      {/* Operational KPI cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard icon={Building2} title="Hospitals" value={formatIndianNumber(stats?.total_hospitals ?? 0)} color="info" delay={0} />
        <KpiCard icon={Stethoscope} title="Doctors" value={formatIndianNumber(stats?.total_doctors ?? 0)} color="primary" delay={0.04} />
        <KpiCard icon={Users} title="Patients" value={formatIndianNumber(stats?.total_patients ?? 0)} color="success" delay={0.08} />
        <KpiCard icon={Activity} title="Active Cases" value={formatIndianNumber(stats?.total_active_cases ?? 0)} color="danger" delay={0.12} />
        <KpiCard icon={CalendarCheck} title="Appointments" value={formatIndianNumber(stats?.total_appointments ?? 0)} color="info" delay={0.16} />
      </div>

      {/* Financial Dashboard (period-aware) */}
      <Suspense fallback={<div className="h-[420px] rounded-xl bg-gray-50 animate-pulse" />}>
        <FinancialDashboard />
      </Suspense>

      {hasData && (
        <>
          {/* Leaderboards */}
          <motion.div variants={item}>
            <Tabs defaultValue="hospitals">
              <TabsList className="mb-3">
                <TabsTrigger value="hospitals">Hospitals</TabsTrigger>
                <TabsTrigger value="doctors">Doctors</TabsTrigger>
              </TabsList>
              <TabsContent value="hospitals">
                <Leaderboard
                  title="Hospital Performance"
                  valueLabel="Revenue"
                  icon={Hospital}
                  items={(stats?.hospital_performance ?? []).map((h: HospitalPerfItem, i: number) => ({
                    rank: i + 1, name: h.name,
                    value: `${formatIndianRupees(h.revenue ?? h.value)}`,
                    subtitle: `Patients: ${h.patients ?? 0} | Doctors: ${h.doctors ?? 0}`,
                    id: h.id,
                  }))}
                  onItemClick={onHospitalClick}
                />
              </TabsContent>
              <TabsContent value="doctors">
                <Leaderboard
                  title="Doctor Performance"
                  valueLabel="Revenue"
                  icon={Award}
                  items={(stats?.doctor_performance ?? []).map((d: DoctorPerfItem, i: number) => ({
                    rank: i + 1, name: d.name, value: formatIndianRupees(d.value), id: d.id,
                  }))}
                  onItemClick={onDoctorClick}
                />
              </TabsContent>
            </Tabs>
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
          <p className="mt-1 text-sm text-gray-500 max-w-sm">Hospitals and doctors under your group will appear here.</p>
        </motion.div>
      )}

      {quickView && (
        <QuickViewDrawer open={!!quickView} onClose={onQuickViewClose} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}
    </motion.div>
  )
}
