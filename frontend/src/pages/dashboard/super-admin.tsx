import { Fragment, useMemo, useState, useCallback } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Building2, CalendarCheck2, CalendarDays, CircleDollarSign, CreditCard, FileText,
  FolderKanban, IndianRupee, Megaphone, Send, Sparkles, Stethoscope, UserPlus,
  UserRound, Users, Wallet, Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi, subscriptionsApi } from "@/services/endpoints"
import { useDashboardActivity } from "@/lib/dashboard-activity"
import { useUnbilledBilling } from "@/lib/use-unbilled-billing"
import { QuickViewDrawer } from "@/design-system"
import {
  AlertCenter, BusinessInsights, CommandCenter, DashboardChart, DashboardHeader,
  DashboardShell, DashboardWidget, DepartmentPerformance, DonutChart, ExecutiveSummary,
  HeatmapChart, KpiGrid, QuickActionCenter, RecentActivity, SavedViewsMenu, downloadCSV,
  useDashboardFilter, useDashboardPersonalization,
} from "@/design-system/dashboard"
import type {
  AlertItem, ChartPoint, HeatmapDatum, Insight, KpiDatum, PerformerDatum, QuickAction,
  SummaryHighlight,
} from "@/design-system/dashboard"
import { buildDrilldownPath } from "@/lib/dashboard-links"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"

/* ────────────────────────────────────────────────────────────────────────────
   Types mirroring GET /dashboards/super-admin
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

interface AppointmentTrendPoint {
  label: string
  count: number
}

interface HeatmapPoint {
  day: number
  hour: number
  count: number
}

interface CategoryPoint {
  name: string
  count: number
  cost: number
}

interface GroupPerf {
  id?: string
  name?: string
  revenue?: number
  hospitals?: number
  patients?: number
}

interface HospitalPerf {
  id?: string
  name?: string
  revenue?: number
  patients?: number
  cases?: number
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

interface SuperAdminStats {
  total_groups: number
  total_hospitals: number
  total_doctors: number
  total_patients: number
  total_active_cases: number
  total_appointments: number
  total_revenue: number
  monthly_revenue: number
  yearly_revenue: number
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
  previous_revenue_expense_trend: TrendPoint[]
  expense_breakdown: ExpenseBreakdownPoint[]
  admin_group_performance: GroupPerf[]
  hospital_performance: HospitalPerf[]
  doctor_performance: DoctorPerf[]
  appointment_trend: AppointmentTrendPoint[]
  appointment_heatmap: HeatmapPoint[]
  treatment_category_breakdown: CategoryPoint[]
  lead_source_breakdown: { source: string; count: number }[]
  payment_method_breakdown: { method: string; amount: number }[]
  gender_distribution: { gender: string; count: number }[]
  age_group_distribution: { group: string; count: number }[]
  comparison: Comparison
}

/* ────────────────────────────────────────────────────────────────────────────
   Personalizable widget registry for this dashboard
   ──────────────────────────────────────────────────────────────────────────── */

const SUPER_ADMIN_WIDGETS = [
  "subscription-summary",
  "executive-summary",
  "revenue-expense",
  "appointments",
  "profit",
  "heatmap",
  "treatment-categories",
  "lead-sources",
  "payment-methods",
  "age-groups",
  "gender",
]

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const WIDGET_META: Record<string, { title: string; description: string; icon: LucideIcon; span?: boolean }> = {
  "subscription-summary": { title: "Subscription Overview", description: "Active subscriptions and monthly revenue", icon: Zap, span: true },
  "executive-summary": { title: "Executive Summary", description: "What happened this period, in plain language", icon: Sparkles, span: true },
  "revenue-expense": { title: "Revenue vs Expenses", description: "Current period against the previous period", icon: IndianRupee },
  "appointments": { title: "Appointment Volume", description: "Click a point to open those appointments", icon: CalendarCheck2 },
  "profit": { title: "Profit Trend", description: "Net profit per period bucket", icon: Wallet },
  "heatmap": { title: "Appointment Heatmap", description: "Volume by weekday and hour — click a cell", icon: CalendarDays },
  "treatment-categories": { title: "Treatment Categories", description: "Most planned treatments this period", icon: FolderKanban },
  "lead-sources": { title: "Lead Sources", description: "Where enquiries come from", icon: Megaphone },
  "payment-methods": { title: "Payment Methods", description: "How this period's collections are split", icon: CreditCard },
  "age-groups": { title: "Patient Age Groups", description: "New patients by age band", icon: Users },
  "gender": { title: "Patient Gender", description: "New patients by gender", icon: UserRound },
}

/* ──────────────────────────────────────────────────────────────────────────── */

export default function SuperAdminDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const filter = useDashboardFilter("this_month")
  const personalization = useDashboardPersonalization("super-admin", SUPER_ADMIN_WIDGETS)
  const [quickView, setQuickView] = useState<{ type: "admin-group" | "hospital" | "doctor"; id: string; name: string } | null>(null)
  const onQuickViewClose = useCallback(() => setQuickView(null), [])

  const dashParams = useMemo(() => filter.apiParams, [filter.apiParams])

  const { data: stats, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["dash", "super", user?.id, dashParams],
    queryFn: () => dashboardApi.superAdmin(dashParams),
    staleTime: 30000,
    gcTime: 60000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  const { items: activityFeed, loading: activityLoading } = useDashboardActivity()

  const unbilledQuery = useUnbilledBilling()

  const { data: subStats } = useQuery({
    queryKey: ["subscriptions", "dashboard"],
    queryFn: subscriptionsApi.dashboardStats,
    staleTime: 60000,
  })

  const onGroupClick = useCallback((perf?: GroupPerf) => {
    if (perf?.id) setQuickView({ type: "admin-group", id: perf.id, name: perf.name || "" })
  }, [])
  const onHospitalClick = useCallback((perf?: HospitalPerf) => {
    if (perf?.id) setQuickView({ type: "hospital", id: perf.id, name: perf.name || "" })
  }, [])
  const onDoctorClick = useCallback((perf?: DoctorPerf) => {
    if (perf?.id) setQuickView({ type: "doctor", id: perf.id, name: perf.name || "" })
  }, [])

  if (!user) return null

  const s = stats as SuperAdminStats | undefined
  const comparison = s?.comparison ?? {}
  const retry = () => void refetch()
  const drill = (entity: Parameters<typeof buildDrilldownPath>[0], opts: { status?: string; billingStatus?: string; source?: string } = {}) =>
    buildDrilldownPath(entity, filter.period, filter.startDate, filter.endDate, opts)

  /* ── Chart data ─────────────────────────────────────────────────────────── */
  const revenueCompareData = (s?.revenue_expense_trend ?? []).map((t, i) => ({
    month: t.month,
    revenue: t.revenue ?? 0,
    expenses: t.expenses ?? 0,
    prevRevenue: s?.previous_revenue_expense_trend?.[i]?.revenue ?? 0,
  }))
  const profitTrendData = (s?.profit_trend ?? []).map((t) => ({ month: t.month, profit: t.profit ?? 0 }))
  const appointmentTrendData = (s?.appointment_trend ?? []).map((t) => ({ label: t.label, count: t.count }))
  const heatmapData = s?.appointment_heatmap ?? []
  const treatmentCatData = (s?.treatment_category_breakdown ?? []).map((c) => ({ name: c.name, value: c.count }))
  const leadSourceData = (s?.lead_source_breakdown ?? []).map((l) => ({ name: l.source, value: l.count }))
  const paymentMethodData = (s?.payment_method_breakdown ?? []).map((p) => ({ name: p.method, value: p.amount }))
  const ageGroupData = (s?.age_group_distribution ?? []).map((a) => ({ name: a.group, value: a.count }))
  const genderData = (s?.gender_distribution ?? []).map((g) => ({ name: g.gender, value: g.count }))

  /* ── KPI rows ───────────────────────────────────────────────────────────── */
  const revenueSpark = (s?.revenue_trend ?? []).map((t) => t.revenue ?? 0)
  const patientSpark = (s?.patient_growth_trend ?? []).map((t) => t.count ?? 0)

  const primaryKpis: KpiDatum[] = [
    {
      id: "period-revenue", title: "Period Revenue", value: formatIndianRupees(s?.period_revenue ?? 0),
      rawValue: s?.period_revenue ?? 0, change: comparison.revenue_change ?? null,
      previousLabel: filter.previousLabel, icon: IndianRupee, tone: "primary",
      sparkline: revenueSpark, loading: isLoading, onClick: () => navigate(drill("billing")),
    },
    {
      id: "net-profit", title: "Net Profit", value: formatIndianRupees(s?.net_profit ?? 0),
      rawValue: s?.net_profit ?? 0, change: null, previousLabel: "This period",
      icon: Wallet, tone: "success", loading: isLoading, onClick: () => navigate(drill("billing")),
    },
    {
      id: "new-patients", title: "New Patients", value: formatIndianNumber(s?.period_patients ?? 0),
      rawValue: s?.period_patients ?? 0, change: comparison.patient_change ?? null,
      previousLabel: filter.previousLabel, icon: UserPlus, tone: "accent",
      sparkline: patientSpark, loading: isLoading, onClick: () => navigate(drill("patients")),
    },
    {
      id: "appointments", title: "Appointments", value: formatIndianNumber(s?.period_appointments ?? 0),
      rawValue: s?.period_appointments ?? 0, change: comparison.appointment_change ?? null,
      previousLabel: filter.previousLabel, icon: CalendarCheck2, tone: "info",
      loading: isLoading, onClick: () => navigate(drill("appointments")),
    },
  ]

  const secondaryKpis: KpiDatum[] = [
    {
      id: "period-cases", title: "New Cases", value: formatIndianNumber(s?.period_cases ?? 0),
      rawValue: s?.period_cases ?? 0, change: comparison.case_change ?? null,
      previousLabel: filter.previousLabel, icon: FolderKanban, tone: "primary",
      loading: isLoading, onClick: () => navigate(drill("cases")),
    },
    {
      id: "pending-billing", title: "Pending Billings", value: formatIndianRupees(s?.total_pending_billing ?? 0),
      rawValue: s?.total_pending_billing ?? 0, change: null, previousLabel: "Outstanding",
      positiveIsGood: false, icon: CircleDollarSign, tone: "warning",
      loading: isLoading, onClick: () => navigate(drill("billing", { billingStatus: "PARTIAL" })),
    },
    {
      id: "active-cases", title: "Active Cases", value: formatIndianNumber(s?.total_active_cases ?? 0),
      rawValue: s?.total_active_cases ?? 0, change: null, previousLabel: "Currently open",
      icon: FileText, tone: "info", loading: isLoading, onClick: () => navigate("/cases"),
    },
    {
      id: "total-patients", title: "Total Patients", value: formatIndianNumber(s?.total_patients ?? 0),
      rawValue: s?.total_patients ?? 0, change: null, previousLabel: "All-time",
      icon: Users, tone: "success", loading: isLoading, onClick: () => navigate("/patients"),
    },
  ]

  /* ── Critical alerts ─────────────────────────────────────────────────────── */
  const alerts: AlertItem[] = []
  const unbilledItems = unbilledQuery.items ?? []
  if (unbilledItems.length > 0) {
    alerts.push({
      id: "unbilled-treatments",
      title: `${unbilledItems.length} completed treatment(s) not invoiced`,
      description: `${formatIndianRupees(unbilledQuery.total)} pending — start billing to collect.`,
      severity: "warning",
      onClick: () => navigate("/billing"),
    })
  }
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

  /* ── Insights ────────────────────────────────────────────────────────────── */
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

  /* ── Leaderboards ─────────────────────────────────────────────────────────── */
  const groupLeaderboard: PerformerDatum[] = (s?.admin_group_performance ?? []).map((g) => ({
    id: g.id, name: g.name || "Unnamed group", value: formatIndianRupees(g.revenue ?? 0),
    subtitle: `${formatIndianNumber(g.hospitals ?? 0)} hospitals · ${formatIndianNumber(g.patients ?? 0)} patients`,
    onClick: () => onGroupClick(g),
  }))
  const hospitalLeaderboard: PerformerDatum[] = (s?.hospital_performance ?? []).map((h) => ({
    id: h.id, name: h.name || "Unnamed hospital", value: formatIndianRupees(h.revenue ?? 0),
    subtitle: `${formatIndianNumber(h.patients ?? 0)} patients · ${formatIndianNumber(h.doctors ?? 0)} doctors`,
    onClick: () => onHospitalClick(h),
  }))
  const doctorLeaderboard: PerformerDatum[] = (s?.doctor_performance ?? []).map((d) => ({
    id: d.id, name: d.name || "Unnamed doctor", value: formatIndianRupees(d.value ?? 0),
    subtitle: "All-time revenue", onClick: () => onDoctorClick(d),
  }))

  /* ── Quick actions ────────────────────────────────────────────────────────── */
  const quickActions: QuickAction[] = [
    { id: "manage-subscriptions", label: "Subscriptions", description: "Manage billing & access", icon: CreditCard, tone: "accent", onClick: () => navigate("/admin/subscriptions") },
    { id: "new-patient", label: "New Patient", description: "Register a patient", icon: UserPlus, tone: "accent", onClick: () => navigate("/patients") },
    { id: "book-appointment", label: "Book Appointment", description: "Schedule a visit", icon: CalendarCheck2, tone: "primary", onClick: () => navigate("/appointments") },
    { id: "open-case", label: "Open Case", description: "Start a treatment case", icon: FolderKanban, tone: "success", onClick: () => navigate("/cases") },
    { id: "record-billing", label: "Record Billing", description: "Capture a payment", icon: CircleDollarSign, tone: "warning", onClick: () => navigate("/billing") },
    { id: "manage-leads", label: "Manage Leads", description: "Track incoming leads", icon: Megaphone, tone: "info", onClick: () => navigate("/leads") },
    { id: "export-center", label: "Export Center", description: "Run period reports", icon: Send, tone: "primary", onClick: () => navigate("/exports") },
  ]

  /* ── Executive summary narrative (rule-based from real data) ─────────────── */
  const summaryMetrics = [
    { label: "Revenue", value: formatIndianRupees(s?.period_revenue ?? 0), change: comparison.revenue_change ?? null },
    { label: "New patients", value: formatIndianNumber(s?.period_patients ?? 0), change: comparison.patient_change ?? null },
    { label: "Appointments", value: formatIndianNumber(s?.period_appointments ?? 0), change: comparison.appointment_change ?? null },
    { label: "New cases", value: formatIndianNumber(s?.period_cases ?? 0), change: comparison.case_change ?? null },
    { label: "Net profit", value: formatIndianRupees(s?.net_profit ?? 0), change: null },
  ]
  const highlights: SummaryHighlight[] = []
  const topHospital = (s?.hospital_performance ?? [])[0]
  if (topHospital?.name) highlights.push({ icon: Building2, label: "Top hospital", text: `${topHospital.name} · ${formatIndianRupees(topHospital.revenue ?? 0)}` })
  const topDoctor = (s?.doctor_performance ?? [])[0]
  if (topDoctor?.name) highlights.push({ icon: Stethoscope, label: "Top doctor", text: `${topDoctor.name} · ${formatIndianRupees(topDoctor.value ?? 0)}` })
  const topTreatment = (s?.treatment_category_breakdown ?? [])[0]
  if (topTreatment?.name) highlights.push({ icon: FolderKanban, label: "Top treatment", text: `${topTreatment.name} · ${formatIndianNumber(topTreatment.count ?? 0)} planned` })
  const caution = (s?.total_pending_billing ?? 0) > 0
    ? `Pending billings of ${formatIndianRupees(s!.total_pending_billing)} need follow-up.`
    : margin > 0 && margin < 10
      ? `Profit margin is thin at ${margin.toFixed(1)}% — expenses are eating into revenue.`
      : undefined

  /* ── Export snapshot for the CommandCenter ───────────────────────────────── */
  const handleExport = () => {
    const rows = [
      { Metric: "Admin Groups", Value: s?.total_groups ?? 0 },
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
    downloadCSV(`super-admin-overview-${filter.period}`, rows, ["Metric", "Value"])
  }

  /* ── Drill-down handlers ─────────────────────────────────────────────────── */
  const onAppointmentTrendClick = (point: ChartPoint) => {
    const label = String(point.data.label ?? "")
    const datePart = label.slice(0, 10)
    if (/^\d{4}-\d{2}$/.test(label)) {
      const [y, m] = label.split("-").map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      navigate(`/appointments?date_from=${label}-01&date_to=${label}-${String(lastDay).padStart(2, "0")}`)
    } else {
      navigate(`/appointments?date_from=${datePart}&date_to=${datePart}`)
    }
  }
  const onHeatmapCellClick = (_cell: HeatmapDatum) => navigate(drill("appointments"))

  /* ── Widget renderer ──────────────────────────────────────────────────────── */
  const renderWidget = (id: string, index: number): ReactNode => {
    const meta = WIDGET_META[id]
    const shared = {
      id,
      title: meta.title,
      description: meta.description,
      icon: meta.icon,
      className: meta.span ? "lg:col-span-2" : undefined,
      pinned: personalization.isPinned(id),
      onTogglePin: () => personalization.togglePin(id),
      onHide: () => personalization.toggleHide(id),
      canMoveUp: index > 0,
      onMoveUp: () => personalization.moveUp(id),
      canMoveDown: index < personalization.orderedIds.length - 1,
      onMoveDown: () => personalization.moveDown(id),
    }

    switch (id) {
      case "subscription-summary": {
        const rows = subStats ? [
          { Metric: "Active", Value: subStats.total_active },
          { Metric: "Trial", Value: subStats.total_trial },
          { Metric: "Past Due", Value: subStats.total_past_due },
          { Metric: "Expired", Value: subStats.total_expired },
          { Metric: "Free", Value: subStats.total_free },
          { Metric: "Revenue (Month)", Value: `₹${subStats.revenue_this_month.toLocaleString("en-IN")}` },
        ] : []
        const content = (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "Active", value: subStats?.total_active ?? 0, color: "bg-emerald-500" },
              { label: "Trial", value: subStats?.total_trial ?? 0, color: "bg-blue-500" },
              { label: "Past Due", value: subStats?.total_past_due ?? 0, color: "bg-amber-500" },
              { label: "Expired", value: subStats?.total_expired ?? 0, color: "bg-red-500" },
              { label: "Free", value: subStats?.total_free ?? 0, color: "bg-purple-500" },
              { label: "Revenue", value: `₹${(subStats?.revenue_this_month ?? 0).toLocaleString("en-IN")}`, color: "bg-[var(--ds-primary)]" },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className={`mx-auto mb-2 h-2 w-8 rounded-full ${item.color}`} />
                <p className="text-lg font-bold text-[var(--ds-text)]">{item.value}</p>
                <p className="text-xs text-[var(--ds-text-secondary)]">{item.label}</p>
              </div>
            ))}
          </div>
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Metric", "Value"]} exportTitle="Subscription Overview" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "executive-summary": {
        const rows = summaryMetrics.map((m) => ({ Metric: m.label, Value: m.value }))
        const content = (
          <ExecutiveSummary
            bare
            metrics={summaryMetrics}
            highlights={highlights}
            caution={caution}
            loading={isLoading}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Metric", "Value"]} exportTitle="Executive Summary" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "revenue-expense": {
        const rows = revenueCompareData.map((r) => ({
          Period: r.month, Revenue: r.revenue, Expenses: r.expenses, "Previous revenue": r.prevRevenue,
        }))
        const content = (
          <DashboardChart
            bare
            data={revenueCompareData}
            xKey="month"
            series={[
              { dataKey: "revenue", name: "Revenue", color: "var(--ds-chart-1)", type: "area" },
              { dataKey: "expenses", name: "Expenses", color: "var(--ds-chart-2)", type: "area" },
              { dataKey: "prevRevenue", name: "Previous revenue", color: "var(--ds-chart-5)", type: "line" },
            ]}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            valueFormatter={formatIndianRupees}
            height={280}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Period", "Revenue", "Expenses", "Previous revenue"]} exportTitle="Revenue vs Expenses" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "appointments": {
        const rows = appointmentTrendData.map((t) => ({ Label: t.label, Appointments: t.count }))
        const content = (
          <DashboardChart
            bare
            data={appointmentTrendData}
            xKey="label"
            series={[{ dataKey: "count", name: "Appointments", color: "var(--ds-chart-4)", type: "bar" }]}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            onPointClick={onAppointmentTrendClick}
            height={280}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Label", "Appointments"]} exportTitle="Appointment Volume" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "profit": {
        const rows = profitTrendData.map((t) => ({ Period: t.month, Profit: t.profit }))
        const content = (
          <DashboardChart
            bare
            data={profitTrendData}
            xKey="month"
            series={[{ dataKey: "profit", name: "Net Profit", color: "var(--ds-chart-3)", type: "bar" }]}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            valueFormatter={formatIndianRupees}
            height={280}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Period", "Profit"]} exportTitle="Profit Trend" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "heatmap": {
        const rows = heatmapData.map((c) => ({ Day: DAY_LABELS[c.day] ?? String(c.day), Hour: `${c.hour}:00`, Appointments: c.count }))
        const content = (
          <HeatmapChart data={heatmapData} loading={isLoading} error={isError} onRetry={retry} onCellClick={onHeatmapCellClick} height={280} />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Day", "Hour", "Appointments"]} exportTitle="Appointment Heatmap" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "treatment-categories": {
        const rows = treatmentCatData.map((c) => ({ Category: c.name, Count: c.value }))
        const content = (
          <DonutChart
            bare
            data={treatmentCatData}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            valueFormatter={formatIndianNumber}
            height={260}
            onSliceClick={() => navigate(drill("cases"))}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Category", "Count"]} exportTitle="Treatment Categories" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "lead-sources": {
        const rows = leadSourceData.map((l) => ({ Source: l.name, Count: l.value }))
        const content = (
          <DonutChart
            bare
            data={leadSourceData}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            valueFormatter={formatIndianNumber}
            height={260}
            onSliceClick={(d) => navigate(drill("leads", { source: d.name }))}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Source", "Count"]} exportTitle="Lead Sources" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "payment-methods": {
        const rows = paymentMethodData.map((p) => ({ Method: p.name, Amount: p.value }))
        const content = (
          <DonutChart
            bare
            data={paymentMethodData}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            valueFormatter={formatIndianRupees}
            height={260}
            onSliceClick={() => navigate(drill("billing"))}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Method", "Amount"]} exportTitle="Payment Methods" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "age-groups": {
        const rows = ageGroupData.map((a) => ({ Group: a.name, Count: a.value }))
        const content = (
          <DashboardChart
            bare
            data={ageGroupData}
            xKey="name"
            series={[{ dataKey: "value", name: "Patients", color: "var(--ds-chart-6)", type: "bar" }]}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            valueFormatter={formatIndianNumber}
            height={280}
            onPointClick={() => navigate(drill("patients"))}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Group", "Count"]} exportTitle="Patient Age Groups" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      case "gender": {
        const rows = genderData.map((g) => ({ Gender: g.name, Count: g.value }))
        const content = (
          <DonutChart
            bare
            data={genderData}
            loading={isLoading}
            error={isError}
            onRetry={retry}
            valueFormatter={formatIndianNumber}
            height={260}
            onSliceClick={() => navigate(drill("patients"))}
          />
        )
        return (
          <DashboardWidget {...shared} exportRows={rows} exportColumns={["Gender", "Count"]} exportTitle="Patient Gender" fullscreenContent={content}>
            {content}
          </DashboardWidget>
        )
      }
      default:
        return null
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader
        eyebrow="Enterprise Overview"
        title="Super Admin Dashboard"
        subtitle={filter.rangeSummary}
        stats={[
          { label: "Admin Groups", value: formatIndianNumber(s?.total_groups ?? 0) },
          { label: "Hospitals", value: formatIndianNumber(s?.total_hospitals ?? 0) },
          { label: "Doctors", value: formatIndianNumber(s?.total_doctors ?? 0) },
          { label: "Patients", value: formatIndianNumber(s?.total_patients ?? 0) },
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
        onRefresh={retry}
        refreshing={isFetching}
        onExport={handleExport}
        extraFilters={
          <SavedViewsMenu
            views={personalization.views}
            onSave={personalization.saveView}
            onLoad={personalization.loadView}
            onDelete={personalization.deleteView}
            onReset={personalization.reset}
            disabled={isLoading}
          />
        }
      />

      <AlertCenter items={alerts} loading={isLoading} />

      <KpiGrid items={primaryKpis} cols={4} />

      <div className="grid gap-3 lg:grid-cols-2">
        {personalization.orderedIds.map((id, index) => (
          <Fragment key={id}>{renderWidget(id, index)}</Fragment>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <DepartmentPerformance title="Top Admin Groups" description="Ranked by revenue" items={groupLeaderboard} loading={isLoading} />
        <DepartmentPerformance title="Top Hospitals" description="Ranked by revenue" items={hospitalLeaderboard} loading={isLoading} />
        <DepartmentPerformance title="Top Doctors" description="Ranked by revenue" items={doctorLeaderboard} loading={isLoading} />
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
