import { useMemo, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Activity, BarChart3, Building2, CalendarCheck2, CircleDollarSign, FileText, FolderKanban,
  IndianRupee, Megaphone, Send, Stethoscope, UserPlus, Wallet,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { useHospitalStore } from "@/store/hospitalStore"
import { dashboardApi, hospitalsApi } from "@/services/endpoints"
import { useDashboardActivity } from "@/lib/dashboard-activity"
import { QuickViewDrawer, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Label } from "@/design-system"
import {
  AlertCenter, BusinessInsights, CommandCenter, DashboardChart, DashboardHeader,
  DashboardSection, DashboardShell, DepartmentPerformance, DonutChart, ExecutiveSummary,
  KpiGrid, QuickActionCenter, RecentActivity, SavedViewsMenu, downloadCSV, useDashboardFilter,
  useDashboardPersonalization, BiInsightsGrid, BI_INSIGHTS_WIDGETS,
} from "@/design-system/dashboard"
import type {
  AlertItem, Insight, KpiDatum, PerformerDatum, QuickAction, SummaryHighlight, SummaryMetric,
} from "@/design-system/dashboard"
import { buildDrilldownPath } from "@/lib/dashboard-links"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"

/* ────────────────────────────────────────────────────────────────────────────
   Types mirroring GET /dashboards/group-admin
   ──────────────────────────────────────────────────────────────────────────── */

interface TrendPoint {
  month: string
  revenue?: number
  expenses?: number
  profit?: number
  profit_margin?: number
  count?: number
}

interface ExpenseBreakdownPoint {
  category: string
  amount: number
}

interface HospitalPerf {
  id?: string
  name?: string
  revenue?: number
  patients?: number
  doctors?: number
}

interface DoctorPerf {
  id?: string
  name?: string
  value?: number
}

interface Comparison {
  revenue_change?: number
  patient_change?: number
  appointment_change?: number
  case_change?: number
}

interface GroupAdminStats {
  total_hospitals: number
  total_doctors: number
  total_patients: number
  total_active_cases: number
  total_appointments: number
  period_revenue: number
  period_patients: number
  period_appointments: number
  period_cases: number
  total_expenses: number
  net_profit: number
  profit_margin: number
  total_pending_billing: number
  revenue_trend: TrendPoint[]
  patient_growth_trend: TrendPoint[]
  revenue_expense_trend: TrendPoint[]
  profit_trend: TrendPoint[]
  expense_breakdown: ExpenseBreakdownPoint[]
  hospital_performance: HospitalPerf[]
  doctor_performance: DoctorPerf[]
  comparison: Comparison
  treatment_kpis?: {
    active_treatments: number
    overdue_treatments: number
    waiting_patient: number
    waiting_lab: number
  }
  appointment_trend?: { label: string; count: number }[]
  appointment_heatmap?: { day: number; hour: number; count: number }[]
  treatment_category_breakdown?: { name: string; count: number; cost?: number }[]
  lead_source_breakdown?: { source: string; count: number }[]
  payment_method_breakdown?: { method: string; amount: number }[]
  gender_distribution?: { gender: string; count: number }[]
  age_group_distribution?: { group: string; count: number }[]
}

/* ──────────────────────────────────────────────────────────────────────────── */

export default function GroupAdminDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { selectedHospitalId, setSelectedHospitalId } = useHospitalStore()
  const filter = useDashboardFilter("this_month")
  const biPersonalization = useDashboardPersonalization("group-admin-bi", BI_INSIGHTS_WIDGETS)
  const [quickView, setQuickView] = useState<{ type: "hospital" | "doctor"; id: string; name: string } | null>(null)
  const onQuickViewClose = useCallback(() => setQuickView(null), [])

  const { data: hospitals } = useQuery({
    queryKey: ["hospitals", "group-admin"],
    queryFn: () => hospitalsApi.list(),
    staleTime: 120000,
  })

  const dashParams = useMemo(
    () => ({
      ...filter.apiParams,
      ...(selectedHospitalId ? { hospital_id: selectedHospitalId } : {}),
    }),
    [filter.apiParams, selectedHospitalId],
  )

  const { data: stats, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["dash", "group", user?.id, dashParams],
    queryFn: () => dashboardApi.groupAdmin(dashParams),
    staleTime: 15000,
    gcTime: 60000,
    refetchInterval: 30000,
  })

  const { items: activityFeed, loading: activityLoading } = useDashboardActivity()

  const onHospitalClick = useCallback((perf?: HospitalPerf) => {
    if (perf?.id) setQuickView({ type: "hospital", id: perf.id, name: perf.name || "" })
  }, [])
  const onDoctorClick = useCallback((perf?: DoctorPerf) => {
    if (perf?.id) setQuickView({ type: "doctor", id: perf.id, name: perf.name || "" })
  }, [])

  if (!user) return null

  const s = stats as GroupAdminStats | undefined
  const comparison = s?.comparison ?? {}
  const treatmentKpis = s?.treatment_kpis
  const drill = (entity: Parameters<typeof buildDrilldownPath>[0], opts: { status?: string; billingStatus?: string } = {}) =>
    buildDrilldownPath(entity, filter.period, filter.startDate, filter.endDate, opts)

  const revenueSpark = (s?.revenue_trend ?? []).map((t) => t.revenue ?? 0)
  const patientSpark = (s?.patient_growth_trend ?? []).map((t) => t.count ?? 0)

  /* ── Hospital filter (extraFilters in CommandCenter) ─────────────────────── */
  const hospitalFilter = (
    <div className="space-y-1">
      <Label htmlFor="group-hospital" className="ds-form-label text-[var(--ds-text-tertiary)]">
        Hospital
      </Label>
      <Select value={selectedHospitalId || "all"} onValueChange={(v) => setSelectedHospitalId(v === "all" ? null : v)}>
        <SelectTrigger id="group-hospital" aria-label="Hospital filter" className="h-9 w-[180px] text-sm">
          <SelectValue placeholder="All Hospitals" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Hospitals</SelectItem>
          {(hospitals ?? []).map((h: { id: string; name: string }) => (
            <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  /* ── KPI rows ────────────────────────────────────────────────────────────── */
  const primaryKpis: KpiDatum[] = [
    {
      id: "period-revenue",
      title: "Period Revenue",
      value: formatIndianRupees(s?.period_revenue ?? 0),
      rawValue: s?.period_revenue ?? 0,
      change: comparison.revenue_change ?? null,
      previousLabel: filter.previousLabel,
      icon: IndianRupee,
      tone: "primary",
      sparkline: revenueSpark,
      loading: isLoading,
      onClick: () => navigate(drill("billing")),
    },
    {
      id: "new-patients",
      title: "New Patients",
      value: formatIndianNumber(s?.period_patients ?? 0),
      rawValue: s?.period_patients ?? 0,
      change: comparison.patient_change ?? null,
      previousLabel: filter.previousLabel,
      icon: UserPlus,
      tone: "accent",
      sparkline: patientSpark,
      loading: isLoading,
      onClick: () => navigate(drill("patients")),
    },
    {
      id: "appointments",
      title: "Appointments",
      value: formatIndianNumber(s?.period_appointments ?? 0),
      rawValue: s?.period_appointments ?? 0,
      change: comparison.appointment_change ?? null,
      previousLabel: filter.previousLabel,
      icon: CalendarCheck2,
      tone: "info",
      loading: isLoading,
      onClick: () => navigate(drill("appointments")),
    },
    {
      id: "net-profit",
      title: "Net Profit",
      value: formatIndianRupees(s?.net_profit ?? 0),
      rawValue: s?.net_profit ?? 0,
      change: null,
      previousLabel: "This period",
      icon: Wallet,
      tone: "success",
      loading: isLoading,
      onClick: () => navigate(drill("billing")),
    },
  ]

  const secondaryKpis: KpiDatum[] = [
    {
      id: "period-cases",
      title: "New Cases",
      value: formatIndianNumber(s?.period_cases ?? 0),
      rawValue: s?.period_cases ?? 0,
      change: comparison.case_change ?? null,
      previousLabel: filter.previousLabel,
      icon: FolderKanban,
      tone: "primary",
      loading: isLoading,
      onClick: () => navigate(drill("cases")),
    },
    {
      id: "active-treatments",
      title: "Active Treatments",
      value: formatIndianNumber(treatmentKpis?.active_treatments ?? 0),
      rawValue: treatmentKpis?.active_treatments ?? 0,
      change: null,
      previousLabel: "Currently in pipeline",
      icon: FileText,
      tone: "info",
      loading: isLoading,
      onClick: () => navigate("/treatments/workflow"),
    },
    {
      id: "overdue-treatments",
      title: "Overdue Treatments",
      value: formatIndianNumber(treatmentKpis?.overdue_treatments ?? 0),
      rawValue: treatmentKpis?.overdue_treatments ?? 0,
      change: null,
      previousLabel: "Need attention",
      positiveIsGood: false,
      icon: Activity,
      tone: "danger",
      loading: isLoading,
      onClick: () => navigate("/treatments/workflow"),
    },
    {
      id: "pending-billing",
      title: "Pending Billings",
      value: formatIndianRupees(s?.total_pending_billing ?? 0),
      rawValue: s?.total_pending_billing ?? 0,
      change: null,
      previousLabel: "Outstanding",
      positiveIsGood: false,
      icon: CircleDollarSign,
      tone: "warning",
      loading: isLoading,
      onClick: () => navigate(drill("billing", { billingStatus: "PARTIAL" })),
    },
  ]

  /* ── Critical alerts ─────────────────────────────────────────────────────── */
  const alerts: AlertItem[] = []
  const revenueChange = comparison.revenue_change ?? 0
  if (revenueChange < 0) {
    alerts.push({
      id: "revenue-drop",
      title: `Revenue down ${Math.abs(revenueChange).toFixed(1)}% vs previous period`,
      description: "Review collections and outstanding billings to close the gap.",
      severity: "critical",
      onClick: () => navigate(drill("billing")),
    })
  }
  if ((treatmentKpis?.overdue_treatments ?? 0) > 0) {
    alerts.push({
      id: "overdue-treatments",
      title: `${treatmentKpis!.overdue_treatments} overdue treatment plan(s)`,
      description: "Plans past their expected completion need rescheduling.",
      severity: "critical",
      onClick: () => navigate("/treatments/workflow"),
    })
  }
  if ((s?.total_pending_billing ?? 0) > 0) {
    alerts.push({
      id: "pending-billing",
      title: `${formatIndianRupees(s!.total_pending_billing)} in pending billings`,
      description: "Partial and overdue payments need follow-up.",
      severity: "warning",
      onClick: () => navigate(drill("billing", { billingStatus: "PARTIAL" })),
    })
  }
  const margin = s?.profit_margin ?? 0
  if (margin > 0 && margin < 10) {
    alerts.push({
      id: "thin-margin",
      title: `Profit margin is only ${margin.toFixed(1)}% this period`,
      description: "Expenses are consuming most of the revenue.",
      severity: "warning",
    })
  }

  /* ── Insights ───────────────────────────────────────────────────────────── */
  const insights: Insight[] = []
  if (revenueChange > 0) {
    insights.push({ id: "rev-up", text: `Revenue grew ${revenueChange.toFixed(1)}% versus the previous period.`, tone: "positive" })
  } else if (revenueChange < 0) {
    insights.push({ id: "rev-down", text: `Revenue declined ${Math.abs(revenueChange).toFixed(1)}% versus the previous period.`, tone: "negative" })
  }
  if ((comparison.patient_change ?? 0) >= 0) {
    insights.push({ id: "pat-up", text: "Patient registrations are tracking upward this period.", tone: "positive" })
  } else {
    insights.push({ id: "pat-down", text: "Patient registrations slowed this period — review lead sources.", tone: "negative" })
  }
  if (margin > 0) {
    insights.push({ id: "margin", text: `Net profit margin stands at ${margin.toFixed(1)}% for the selected period.`, tone: "neutral" })
  }

  /* ── Executive summary narrative (rule-based from real data) ─────────────── */
  const summaryMetrics: SummaryMetric[] = [
    { label: "Revenue", value: formatIndianRupees(s?.period_revenue ?? 0), change: comparison.revenue_change ?? null },
    { label: "New patients", value: formatIndianNumber(s?.period_patients ?? 0), change: comparison.patient_change ?? null },
    { label: "Appointments", value: formatIndianNumber(s?.period_appointments ?? 0), change: comparison.appointment_change ?? null },
    { label: "New cases", value: formatIndianNumber(s?.period_cases ?? 0), change: comparison.case_change ?? null },
    { label: "Net profit", value: formatIndianRupees(s?.net_profit ?? 0), change: null },
  ]
  const summaryHighlights: SummaryHighlight[] = []
  const topHospital = (s?.hospital_performance ?? [])[0]
  if (topHospital?.name) summaryHighlights.push({ icon: Building2, label: "Top hospital", text: `${topHospital.name} · ${formatIndianRupees(topHospital.revenue ?? 0)}` })
  const topDoctor = (s?.doctor_performance ?? [])[0]
  if (topDoctor?.name) summaryHighlights.push({ icon: Stethoscope, label: "Top doctor", text: `${topDoctor.name} · ${formatIndianRupees(topDoctor.value ?? 0)}` })
  const topTreatment = (s?.treatment_category_breakdown ?? [])[0]
  if (topTreatment?.name) summaryHighlights.push({ icon: FolderKanban, label: "Top treatment", text: `${topTreatment.name} · ${formatIndianNumber(topTreatment.count ?? 0)} planned` })
  const summaryCaution =
    (s?.total_pending_billing ?? 0) > 0
      ? `Pending billings of ${formatIndianRupees(s!.total_pending_billing)} need follow-up.`
      : margin > 0 && margin < 10
        ? `Profit margin is thin at ${margin.toFixed(1)}% — expenses are eating into revenue.`
        : undefined

  /* ── Leaderboards ────────────────────────────────────────────────────────── */
  const hospitalLeaderboard: PerformerDatum[] = (s?.hospital_performance ?? []).map((h) => ({
    id: h.id,
    name: h.name || "Unnamed hospital",
    value: formatIndianRupees(h.revenue ?? 0),
    subtitle: `${formatIndianNumber(h.patients ?? 0)} patients · ${formatIndianNumber(h.doctors ?? 0)} doctors`,
    onClick: () => onHospitalClick(h),
  }))

  const doctorLeaderboard: PerformerDatum[] = (s?.doctor_performance ?? []).map((d) => ({
    id: d.id,
    name: d.name || "Unnamed doctor",
    value: formatIndianRupees(d.value ?? 0),
    subtitle: "All-time revenue",
    onClick: () => onDoctorClick(d),
  }))

  /* ── Quick actions ───────────────────────────────────────────────────────── */
  const quickActions: QuickAction[] = [
    { id: "new-patient", label: "New Patient", description: "Register a patient", icon: UserPlus, tone: "accent", onClick: () => navigate("/patients") },
    { id: "book-appointment", label: "Book Appointment", description: "Schedule a visit", icon: CalendarCheck2, tone: "primary", onClick: () => navigate("/appointments") },
    { id: "open-case", label: "Open Case", description: "Start a treatment case", icon: FolderKanban, tone: "success", onClick: () => navigate("/cases") },
    { id: "record-billing", label: "Record Billing", description: "Capture a payment", icon: CircleDollarSign, tone: "warning", onClick: () => navigate("/billing") },
    { id: "manage-leads", label: "Manage Leads", description: "Track incoming leads", icon: Megaphone, tone: "info", onClick: () => navigate("/leads") },
    { id: "export-center", label: "Export Center", description: "Run period reports", icon: Send, tone: "primary", onClick: () => navigate("/exports") },
  ]

  /* ── Export snapshot ─────────────────────────────────────────────────────── */
  const handleExport = () => {
    const rows = [
      { Metric: "Hospitals", Value: s?.total_hospitals ?? 0 },
      { Metric: "Doctors", Value: s?.total_doctors ?? 0 },
      { Metric: "Total Patients", Value: s?.total_patients ?? 0 },
      { Metric: "Period Revenue", Value: s?.period_revenue ?? 0 },
      { Metric: "Net Profit", Value: s?.net_profit ?? 0 },
      { Metric: "Profit Margin %", Value: s?.profit_margin ?? 0 },
      { Metric: "New Patients", Value: s?.period_patients ?? 0 },
      { Metric: "Appointments", Value: s?.period_appointments ?? 0 },
      { Metric: "New Cases", Value: s?.period_cases ?? 0 },
      { Metric: "Pending Billings", Value: s?.total_pending_billing ?? 0 },
    ]
    downloadCSV(`group-admin-overview-${filter.period}`, rows, ["Metric", "Value"])
  }

  const revenueTrendData = (s?.revenue_expense_trend ?? []).map((t) => ({ month: t.month, revenue: t.revenue ?? 0, expenses: t.expenses ?? 0 }))
  const profitTrendData = (s?.profit_trend ?? []).map((t) => ({ month: t.month, profit: t.profit ?? 0 }))
  const expenseDonut = (s?.expense_breakdown ?? []).map((e) => ({ name: e.category, value: e.amount }))
  const patientTrendData = (s?.patient_growth_trend ?? []).map((t) => ({ month: t.month, count: t.count ?? 0 }))

  return (
    <DashboardShell>
      <DashboardHeader
        eyebrow="Group Overview"
        title={user.full_name}
        subtitle={filter.rangeSummary}
        stats={[
          { label: "Hospitals", value: formatIndianNumber(s?.total_hospitals ?? 0) },
          { label: "Doctors", value: formatIndianNumber(s?.total_doctors ?? 0) },
          { label: "Patients", value: formatIndianNumber(s?.total_patients ?? 0) },
          { label: "Active Cases", value: formatIndianNumber(s?.total_active_cases ?? 0) },
        ]}
      />

      <CommandCenter
        period={filter.period}
        onPeriodChange={filter.setPeriod}
        startDate={filter.startDate}
        endDate={filter.endDate}
        onStartDateChange={filter.setStartDate}
        onEndDateChange={filter.setEndDate}
        rangeSummary={filter.rangeSummary}
        extraFilters={
          <div className="flex flex-wrap items-end gap-3">
            {hospitalFilter}
            <SavedViewsMenu
              views={biPersonalization.views}
              onSave={biPersonalization.saveView}
              onLoad={biPersonalization.loadView}
              onDelete={biPersonalization.deleteView}
              onReset={biPersonalization.reset}
              disabled={isLoading}
            />
          </div>
        }
        onRefresh={() => void refetch()}
        refreshing={isFetching}
        onExport={handleExport}
      />

      <ExecutiveSummary metrics={summaryMetrics} highlights={summaryHighlights} caution={summaryCaution} loading={isLoading} />

      <AlertCenter items={alerts} loading={isLoading} />

      <KpiGrid items={primaryKpis} cols={4} />

      <DashboardSection
        title="Business Analytics"
        description={`Financial and growth trends for ${filter.label.toLowerCase()}`}
        icon={Activity}
        defaultOpen
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <DashboardChart
            title="Revenue vs Expenses"
            description="Period revenue against operating expenses"
            data={revenueTrendData}
            xKey="month"
            series={[
              { dataKey: "revenue", name: "Revenue", color: "var(--ds-chart-1)", type: "area" },
              { dataKey: "expenses", name: "Expenses", color: "var(--ds-chart-2)", type: "area" },
            ]}
            loading={isLoading}
            valueFormatter={formatIndianRupees}
          />
          <DashboardChart
            title="Profit Trend"
            description="Net profit per period bucket"
            data={profitTrendData}
            xKey="month"
            series={[{ dataKey: "profit", name: "Net Profit", color: "var(--ds-chart-3)", type: "bar" }]}
            loading={isLoading}
            valueFormatter={formatIndianRupees}
          />
          <DashboardChart
            title="Patient Growth"
            description="New patient registrations"
            data={patientTrendData}
            xKey="month"
            series={[{ dataKey: "count", name: "Patients", color: "var(--ds-chart-4)", type: "line" }]}
            loading={isLoading}
          />
          <DonutChart
            title="Expense Breakdown"
            description="Where the period's expenses went"
            data={expenseDonut}
            loading={isLoading}
            valueFormatter={formatIndianRupees}
          />
        </div>
      </DashboardSection>

      <DashboardSection
        title="Enterprise BI Insights"
        description={`Interactive analytics for ${filter.label.toLowerCase()}`}
        icon={BarChart3}
        defaultOpen
      >
        <BiInsightsGrid
          personalization={biPersonalization}
          stats={s ?? {}}
          loading={isLoading}
          error={isError}
          onRetry={() => void refetch()}
          onDrill={(entity, opts) => navigate(drill(entity, opts))}
        />
      </DashboardSection>

      <div className="grid gap-3 lg:grid-cols-2">
        <DepartmentPerformance
          title="Top Hospitals"
          description="Ranked by revenue"
          items={hospitalLeaderboard}
          loading={isLoading}
        />
        <DepartmentPerformance
          title="Top Doctors"
          description="Ranked by revenue"
          items={doctorLeaderboard}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <RecentActivity items={activityFeed} loading={activityLoading} />
        <QuickActionCenter items={quickActions} loading={isLoading} />
      </div>

      <BusinessInsights items={insights} loading={isLoading} />

      <KpiGrid items={secondaryKpis} cols={4} />

      {quickView && (
        <QuickViewDrawer open={!!quickView} onClose={onQuickViewClose} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}
    </DashboardShell>
  )
}
