import { useState, useMemo, useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Activity, AlertOctagon, AlertTriangle, BarChart3, CalendarCheck2, CheckCircle2,
  CircleDollarSign, ClipboardCheck, Clock, FileText, FolderKanban, FolderOpen,
  IndianRupee, LayoutList, Megaphone, PauseCircle, Phone, Stethoscope,
  Timer, TrendingUp, UserPlus, Wallet,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { consentFormsApi, dashboardApi, doctorsApi } from "@/services/endpoints"
import { useUnbilledBilling } from "@/lib/use-unbilled-billing"
import { getHospitalOverride, setHospitalOverride } from "@/lib/hospital-override"
import { cn } from "@/lib/utils"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"
import { Label, QuickViewDrawer, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useToast } from "@/design-system"
import {
  AlertCenter, BusinessInsights, CommandCenter, DashboardChart, DashboardHeader,
  DashboardSection, DashboardShell, DepartmentPerformance, DonutChart, ExecutiveSummary,
  KpiGrid, QuickActionCenter, RecentActivity, WidgetCard, downloadCSV, useDashboardFilter,
  useDashboardPersonalization, BiInsightsGrid, BI_INSIGHTS_WIDGETS, SavedViewsMenu,
} from "@/design-system/dashboard"
import type {
  ActivityEvent, AlertItem, Insight, KpiDatum, PerformerDatum, QuickAction,
  SummaryHighlight, SummaryMetric,
} from "@/design-system/dashboard"
import { buildDrilldownPath } from "@/lib/dashboard-links"

/* ────────────────────────────────────────────────────────────────────────────
   Types mirroring GET /dashboards/hospital-admin
   ──────────────────────────────────────────────────────────────────────────── */

interface TrendPoint {
  month: string
  revenue?: number
  expenses?: number
  profit?: number
  profit_margin?: number
  count?: number
}

interface DoctorPerf {
  id?: string
  name?: string
  value?: number
}

interface TreatmentPerf {
  name?: string
  value?: number
}

interface Comparison {
  revenue_change?: number
  patient_change?: number
  appointment_change?: number
  case_change?: number
}

interface HospitalAdminStats {
  hospital_name?: string
  today_appointments: number
  total_revenue: number
  monthly_revenue: number
  yearly_revenue: number
  total_patients: number
  total_cases: number
  total_active_cases: number
  total_expenses: number
  net_profit: number
  profit_margin: number
  period_revenue: number
  total_pending_billing: number
  period_patients: number
  period_appointments: number
  period_cases: number
  total_follow_ups: number
  pending_follow_ups: number
  completed_follow_ups: number
  missed_follow_ups: number
  revenue_trend: TrendPoint[]
  patient_growth_trend: TrendPoint[]
  appointment_count_trend: TrendPoint[]
  case_count_trend: TrendPoint[]
  revenue_expense_trend: TrendPoint[]
  profit_trend: TrendPoint[]
  expense_breakdown: Array<{ category: string; amount: number }>
  doctor_performance: DoctorPerf[]
  treatment_performance: TreatmentPerf[]
  today_appointments_list: Array<Record<string, string>>
  pending_actions: {
    follow_ups: number
    billings_count: number
    billings_amount: number
  }
  recent_activity: Array<{ type: string; description: string; date: string }>
  revenue_sources: Array<{ method: string; amount: number }>
  crm_insights: {
    total_leads?: number
    new_leads?: number
    converted_leads?: number
    conversion_rate?: number
    leads_by_source?: Array<{ source: string; count: number }>
  }
  treatment_kpis?: {
    active_treatments: number
    overdue_treatments: number
    completed_today: number
    waiting_patient: number
    waiting_lab: number
    completed_this_month: number
    completion_rate: number
    total_treatments: number
  }
  comparison: Comparison
  appointment_trend?: { label: string; count: number }[]
  appointment_heatmap?: { day: number; hour: number; count: number }[]
  treatment_category_breakdown?: { name: string; count: number; cost?: number }[]
  lead_source_breakdown?: { source: string; count: number }[]
  payment_method_breakdown?: { method: string; amount: number }[]
  gender_distribution?: { gender: string; count: number }[]
  age_group_distribution?: { group: string; count: number }[]
}

interface ConsentStats {
  total?: number
  this_month?: number
  recent?: Array<{ id: string; patient_name: string; consent_type: string; created_at?: string }>
}

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  CONFIRMED: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  CHECKED_IN: "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)]",
  IN_PROGRESS: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  COMPLETED: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  CANCELLED: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
  NO_SHOW: "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]",
  RESCHEDULED: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good Morning"
  if (h < 17) return "Good Afternoon"
  return "Good Evening"
}

/* ──────────────────────────────────────────────────────────────────────────── */

export default function HospitalAdminDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const filter = useDashboardFilter("this_month")
  const biPersonalization = useDashboardPersonalization("hospital-admin-bi", BI_INSIGHTS_WIDGETS)
  const [quickView, setQuickView] = useState<{ type: "doctor"; id: string; name: string } | null>(null)
  const [doctorId, setDoctorId] = useState("")
  const onQuickViewClose = useCallback(() => setQuickView(null), [])

  const override = getHospitalOverride()
  const isReadOnly = user?.role !== "HOSPITAL_ADMIN"
  const activeHospitalId = override ?? user?.hospital_id ?? null

  const dashParams = useMemo(
    () => ({
      ...filter.apiParams,
      ...(doctorId ? { doctor_id: doctorId } : {}),
    }),
    [filter.apiParams, doctorId],
  )

  const {
    data: stats,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["dash", "hospital", user?.id, activeHospitalId, dashParams],
    queryFn: () => dashboardApi.hospitalAdmin(dashParams),
    staleTime: 10000,
    gcTime: 60000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (isError && isReadOnly && override) {
      setHospitalOverride(null)
      navigate("/")
      addToast({
        title: "Hospital context no longer valid",
        description: "You have been returned to your default view.",
        variant: "destructive",
      })
    }
  }, [isError, isReadOnly, override, navigate, addToast])

  const { data: consentStats } = useQuery({
    queryKey: ["consent-form-stats", activeHospitalId, doctorId],
    queryFn: () => consentFormsApi.getStats(activeHospitalId || ""),
    enabled: !!activeHospitalId,
  })

  const { data: doctorsList } = useQuery({
    queryKey: ["doctors-list", activeHospitalId],
    queryFn: () => doctorsApi.list({ page: 1, page_size: 100 }),
    enabled: !!activeHospitalId,
  })

  const unbilledQuery = useUnbilledBilling()

  const onDoctorClick = useCallback((perf?: DoctorPerf) => {
    if (perf?.id) setQuickView({ type: "doctor", id: perf.id, name: perf.name || "" })
  }, [])

  if (!user) return null

  const s = stats as HospitalAdminStats | undefined
  const cmp = s?.comparison ?? {}
  const treatmentKpis = s?.treatment_kpis
  const drill = (entity: Parameters<typeof buildDrilldownPath>[0], opts: { status?: string; billingStatus?: string } = {}) =>
    buildDrilldownPath(entity, filter.period, filter.startDate, filter.endDate, opts)

  const revenueSpark = (s?.revenue_trend ?? []).map((t) => t.revenue ?? 0)
  const patientSpark = (s?.patient_growth_trend ?? []).map((t) => t.count ?? 0)
  const appointmentSpark = (s?.appointment_count_trend ?? []).map((t) => t.count ?? 0)
  const caseSpark = (s?.case_count_trend ?? []).map((t) => t.count ?? 0)

  /* ── Doctor filter (extraFilters in CommandCenter) ───────────────────────── */
  const doctors = (doctorsList?.items || doctorsList || []) as Array<{ id: string; full_name?: string; name?: string }>
  const doctorFilter = (
    <div className="space-y-1">
      <Label htmlFor="hospital-doctor" className="ds-form-label text-[var(--ds-text-tertiary)]">
        Doctor
      </Label>
      <Select value={doctorId || "all"} onValueChange={(v) => setDoctorId(v === "all" ? "" : v)}>
        <SelectTrigger id="hospital-doctor" aria-label="Doctor filter" className="h-9 w-[180px] text-sm">
          <SelectValue placeholder="All Doctors" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Doctors</SelectItem>
          {doctors.map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.full_name || d.name}</SelectItem>
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
      change: cmp.revenue_change ?? null,
      previousLabel: filter.previousLabel,
      icon: IndianRupee,
      tone: "success",
      sparkline: revenueSpark,
      loading: isLoading,
      onClick: () => navigate(drill("billing")),
    },
    {
      id: "new-patients",
      title: "New Patients",
      value: formatIndianNumber(s?.period_patients ?? 0),
      rawValue: s?.period_patients ?? 0,
      change: cmp.patient_change ?? null,
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
      change: cmp.appointment_change ?? null,
      previousLabel: filter.previousLabel,
      icon: CalendarCheck2,
      tone: "info",
      sparkline: appointmentSpark,
      loading: isLoading,
      onClick: () => navigate(drill("appointments")),
    },
    {
      id: "active-cases",
      title: "New Cases",
      value: formatIndianNumber(s?.period_cases ?? 0),
      rawValue: s?.period_cases ?? 0,
      change: cmp.case_change ?? null,
      previousLabel: filter.previousLabel,
      icon: FolderOpen,
      tone: "warning",
      sparkline: caseSpark,
      loading: isLoading,
      onClick: () => navigate(drill("cases")),
    },
  ]

  const financialKpis: KpiDatum[] = [
    {
      id: "net-profit",
      title: "Net Profit",
      value: formatIndianRupees(s?.net_profit ?? 0),
      rawValue: s?.net_profit ?? 0,
      change: null,
      previousLabel: "This period",
      icon: Wallet,
      tone: (s?.net_profit ?? 0) >= 0 ? "success" : "danger",
      loading: isLoading,
      onClick: () => navigate(drill("billing")),
    },
    {
      id: "expenses",
      title: "Expenses",
      value: formatIndianRupees(s?.total_expenses ?? 0),
      rawValue: s?.total_expenses ?? 0,
      change: null,
      previousLabel: "This period",
      positiveIsGood: false,
      icon: FileText,
      tone: "danger",
      loading: isLoading,
    },
    {
      id: "profit-margin",
      title: "Profit Margin",
      value: s?.profit_margin != null ? `${s.profit_margin.toFixed(1)}%` : "0%",
      rawValue: s?.profit_margin ?? 0,
      change: null,
      previousLabel: "This period",
      icon: TrendingUp,
      tone: "primary",
      loading: isLoading,
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

  const treatmentKpiRows: KpiDatum[][] = treatmentKpis
    ? [
        [
          { id: "active-treatments", title: "Active Treatments", value: String(treatmentKpis.active_treatments ?? 0), rawValue: treatmentKpis.active_treatments ?? 0, previousLabel: "In pipeline", icon: Stethoscope, tone: "info" as const, loading: isLoading, onClick: () => navigate("/treatments/workflow") },
          { id: "overdue-treatments", title: "Overdue", value: String(treatmentKpis.overdue_treatments ?? 0), rawValue: treatmentKpis.overdue_treatments ?? 0, previousLabel: "Need attention", positiveIsGood: false, icon: AlertOctagon, tone: (treatmentKpis.overdue_treatments ?? 0) > 0 ? ("danger" as const) : ("success" as const), loading: isLoading, onClick: () => navigate("/treatments/workflow") },
          { id: "waiting-patient", title: "Waiting (Patient)", value: String(treatmentKpis.waiting_patient ?? 0), rawValue: treatmentKpis.waiting_patient ?? 0, previousLabel: "Awaiting patient", icon: PauseCircle, tone: "warning" as const, loading: isLoading, onClick: () => navigate("/treatments") },
          { id: "waiting-lab", title: "Waiting (Lab)", value: String(treatmentKpis.waiting_lab ?? 0), rawValue: treatmentKpis.waiting_lab ?? 0, previousLabel: "Awaiting lab", icon: Timer, tone: "warning" as const, loading: isLoading, onClick: () => navigate("/treatments") },
        ],
        [
          { id: "completed-today", title: "Completed Today", value: String(treatmentKpis.completed_today ?? 0), rawValue: treatmentKpis.completed_today ?? 0, previousLabel: "Today", icon: CheckCircle2, tone: "success" as const, loading: isLoading, onClick: () => navigate("/treatments") },
          { id: "completed-month", title: "Completed (Month)", value: String(treatmentKpis.completed_this_month ?? 0), rawValue: treatmentKpis.completed_this_month ?? 0, previousLabel: "This month", icon: ClipboardCheck, tone: "primary" as const, loading: isLoading, onClick: () => navigate("/treatments") },
          { id: "completion-rate", title: "Completion Rate", value: `${treatmentKpis.completion_rate ?? 0}%`, rawValue: treatmentKpis.completion_rate ?? 0, previousLabel: "All treatments", icon: TrendingUp, tone: "primary" as const, loading: isLoading, onClick: () => navigate("/treatments") },
          { id: "total-treatments", title: "Total Treatments", value: String(treatmentKpis.total_treatments ?? 0), rawValue: treatmentKpis.total_treatments ?? 0, previousLabel: "All-time", icon: FolderOpen, tone: "info" as const, loading: isLoading, onClick: () => navigate("/treatments") },
        ],
      ]
    : []

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
  const revenueChange = cmp.revenue_change ?? 0
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
  if ((s?.pending_follow_ups ?? 0) > 0) {
    alerts.push({
      id: "follow-ups",
      title: `${s!.pending_follow_ups} follow-up(s) due`,
      description: "Patients waiting on follow-up calls this period.",
      severity: "warning",
      onClick: () => navigate("/patients"),
    })
  }
  if ((s?.pending_actions?.billings_count ?? 0) > 0) {
    alerts.push({
      id: "pending-billings",
      title: `${s!.pending_actions.billings_count} billings with outstanding amounts`,
      description: `${formatIndianRupees(s!.pending_actions.billings_amount)} pending collection.`,
      severity: "warning",
      onClick: () => navigate(drill("billing", { billingStatus: "PARTIAL" })),
    })
  }

  /* ── Insights ───────────────────────────────────────────────────────────── */
  const insights: Insight[] = []
  if (revenueChange > 0) {
    insights.push({ id: "rev-up", text: `Revenue grew ${revenueChange.toFixed(1)}% versus the previous period.`, tone: "positive" })
  } else if (revenueChange < 0) {
    insights.push({ id: "rev-down", text: `Revenue declined ${Math.abs(revenueChange).toFixed(1)}% versus the previous period.`, tone: "negative" })
  }
  if ((treatmentKpis?.completed_today ?? 0) > 0) {
    insights.push({ id: "treatments-done", text: `${treatmentKpis!.completed_today} treatment(s) completed today — keep the momentum.`, tone: "positive" })
  }
  if (s?.crm_insights?.conversion_rate && s.crm_insights.conversion_rate > 0) {
    insights.push({ id: "crm", text: `Lead conversion rate is ${s.crm_insights.conversion_rate}% this period.`, tone: "neutral" })
  }

  /* ── Executive summary narrative (rule-based from real data) ─────────────── */
  const summaryMetrics: SummaryMetric[] = [
    { label: "Revenue", value: formatIndianRupees(s?.period_revenue ?? 0), change: cmp.revenue_change ?? null },
    { label: "New patients", value: formatIndianNumber(s?.period_patients ?? 0), change: cmp.patient_change ?? null },
    { label: "Appointments", value: formatIndianNumber(s?.period_appointments ?? 0), change: cmp.appointment_change ?? null },
    { label: "New cases", value: formatIndianNumber(s?.period_cases ?? 0), change: cmp.case_change ?? null },
    { label: "Net profit", value: formatIndianRupees(s?.net_profit ?? 0), change: null },
  ]
  const summaryHighlights: SummaryHighlight[] = []
  const topDoctor = (s?.doctor_performance ?? [])[0]
  if (topDoctor?.name) summaryHighlights.push({ icon: Stethoscope, label: "Top doctor", text: `${topDoctor.name} · ${formatIndianRupees(topDoctor.value ?? 0)}` })
  const topTreatment = (s?.treatment_performance ?? [])[0]
  if (topTreatment?.name) summaryHighlights.push({ icon: FolderKanban, label: "Top treatment", text: `${topTreatment.name} · ${topTreatment.value ?? 0} patients` })
  if ((s?.crm_insights?.conversion_rate ?? 0) > 0) {
    summaryHighlights.push({ icon: Megaphone, label: "Lead conversion", text: `${s!.crm_insights!.conversion_rate}% this period` })
  }
  const summaryCaution =
    (s?.total_pending_billing ?? 0) > 0
      ? `Pending billings of ${formatIndianRupees(s!.total_pending_billing)} need follow-up.`
      : (s?.profit_margin ?? 0) > 0 && (s?.profit_margin ?? 0) < 10
        ? `Profit margin is thin at ${s!.profit_margin.toFixed(1)}% — expenses are eating into revenue.`
        : undefined

  /* ── Leaderboards ────────────────────────────────────────────────────────── */
  const doctorLeaderboard: PerformerDatum[] = (s?.doctor_performance ?? []).map((d) => ({
    id: d.id,
    name: d.name || "Unnamed doctor",
    value: formatIndianRupees(d.value ?? 0),
    subtitle: "Period revenue",
    onClick: () => onDoctorClick(d),
  }))

  const treatmentLeaderboard: PerformerDatum[] = (s?.treatment_performance ?? []).map((t) => ({
    name: t.name || "Unnamed treatment",
    value: `${t.value ?? 0} patients`,
    subtitle: "Most performed",
  }))

  /* ── Activity feed (from endpoint) ───────────────────────────────────────── */
  const activityFeed: ActivityEvent[] = (s?.recent_activity ?? []).map((act, i) => ({
    id: `act-${i}`,
    description: act.description,
    date: act.date,
    tone: act.type === "patient_registered" ? "success" : "primary",
    icon: act.type === "patient_registered" ? UserPlus : CalendarCheck2,
  }))

  /* ── Quick actions ───────────────────────────────────────────────────────── */
  const quickActions: QuickAction[] = [
    { id: "new-patient", label: "New Patient", description: "Register a patient", icon: UserPlus, tone: "accent", onClick: () => navigate("/patients") },
    { id: "book-appointment", label: "Book Appointment", description: "Schedule a visit", icon: CalendarCheck2, tone: "primary", onClick: () => navigate("/appointments") },
    { id: "open-case", label: "Open Case", description: "Start a treatment case", icon: FolderKanban, tone: "success", onClick: () => navigate("/cases") },
    { id: "record-billing", label: "Record Billing", description: "Capture a payment", icon: CircleDollarSign, tone: "warning", onClick: () => navigate("/billing") },
    { id: "manage-leads", label: "Manage Leads", description: "Track incoming leads", icon: Megaphone, tone: "info", onClick: () => navigate("/leads") },
    { id: "treatment-queue", label: "Treatment Queue", description: "Work the treatment board", icon: LayoutList, tone: "primary", onClick: () => navigate("/treatments/workflow") },
  ]

  /* ── Export snapshot ─────────────────────────────────────────────────────── */
  const handleExport = () => {
    const rows = [
      { Metric: "Hospital", Value: s?.hospital_name ?? "" },
      { Metric: "Today's Appointments", Value: s?.today_appointments ?? 0 },
      { Metric: "Total Patients", Value: s?.total_patients ?? 0 },
      { Metric: "Period Revenue", Value: s?.period_revenue ?? 0 },
      { Metric: "Net Profit", Value: s?.net_profit ?? 0 },
      { Metric: "Profit Margin %", Value: s?.profit_margin ?? 0 },
      { Metric: "Expenses", Value: s?.total_expenses ?? 0 },
      { Metric: "Pending Billings", Value: s?.total_pending_billing ?? 0 },
      { Metric: "Pending Follow-ups", Value: s?.pending_follow_ups ?? 0 },
    ]
    downloadCSV(`hospital-overview-${filter.period}`, rows, ["Metric", "Value"])
  }

  const revenueExpenseData = (s?.revenue_expense_trend ?? []).map((t) => ({ month: t.month, revenue: t.revenue ?? 0, expenses: t.expenses ?? 0 }))
  const profitTrendData = (s?.profit_trend ?? []).map((t) => ({ month: t.month, profit: t.profit ?? 0 }))
  const revenueSourcesDonut = (s?.revenue_sources ?? []).map((r) => ({ name: r.method, value: r.amount }))
  const expenseDonut = (s?.expense_breakdown ?? []).map((e) => ({ name: e.category, value: e.amount }))
  const patientTrendData = (s?.patient_growth_trend ?? []).map((t) => ({ month: t.month, count: t.count ?? 0 }))
  const appointmentTrendData = (s?.appointment_count_trend ?? []).map((t) => ({ month: t.month, count: t.count ?? 0 }))
  const caseTrendData = (s?.case_count_trend ?? []).map((t) => ({ month: t.month, count: t.count ?? 0 }))

  const crmInsights = s?.crm_insights
  const pendingActions = s?.pending_actions
  const consent = consentStats as ConsentStats | undefined
  const todayAppts = s?.today_appointments_list ?? []
  const formattedToday = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <DashboardShell>
      <DashboardHeader
        eyebrow={isReadOnly ? `${s?.hospital_name || "This hospital"} · Read-only` : s?.hospital_name || "Hospital Overview"}
        title={`${getGreeting()}, ${user.full_name?.split(" ").slice(0, 2).join(" ") || "User"}`}
        subtitle={formattedToday}
        stats={[
          { label: "Revenue", value: formatIndianRupees(s?.total_revenue ?? 0) },
          { label: "Patients", value: formatIndianNumber(s?.total_patients ?? 0) },
          { label: "Today's Appts", value: formatIndianNumber(s?.today_appointments ?? 0) },
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
            {doctorFilter}
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

      <KpiGrid items={financialKpis} cols={4} />

      {treatmentKpiRows.length > 0 && (
        <DashboardSection title="Treatment Queue" description="Live status of treatment plans across this hospital" icon={LayoutList} defaultOpen>
          <div className="space-y-3">
            <KpiGrid items={treatmentKpiRows[0]} cols={4} />
            <KpiGrid items={treatmentKpiRows[1]} cols={4} />
          </div>
        </DashboardSection>
      )}

      <DashboardSection title="Business Analytics" description={`Financial and growth trends for ${filter.label.toLowerCase()}`} icon={Activity} defaultOpen>
        <div className="grid gap-3 lg:grid-cols-2">
          <DashboardChart
            title="Revenue vs Expenses"
            description="Period revenue against operating expenses"
            data={revenueExpenseData}
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
          <DonutChart
            title="Revenue Sources"
            description="Payments by method"
            data={revenueSourcesDonut}
            loading={isLoading}
            valueFormatter={formatIndianRupees}
          />
          <DonutChart
            title="Expense Breakdown"
            description="Where the period's expenses went"
            data={expenseDonut}
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
          <DashboardChart
            title="Appointments & Cases"
            description="Volume per period bucket"
            data={appointmentTrendData.map((p, i) => ({ month: p.month, Appointments: p.count, Cases: caseTrendData[i]?.count ?? 0 }))}
            xKey="month"
            series={[
              { dataKey: "Appointments", name: "Appointments", color: "var(--ds-chart-5)", type: "line" },
              { dataKey: "Cases", name: "Cases", color: "var(--ds-chart-8)", type: "line" },
            ]}
            loading={isLoading}
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

      <div className="grid gap-3 lg:grid-cols-3">
        <WidgetCard
          title="Today's Appointments"
          description={`${todayAppts.length} scheduled`}
          className="lg:col-span-2"
        >
          {todayAppts.length > 0 ? (
            <ul className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
              {todayAppts.map((appt) => (
                <li
                  key={appt.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-primary-subtle)]">
                      <Clock className="h-4 w-4 text-[var(--ds-primary)]" aria-hidden="true" />
                    </span>
                    <div className="ds-min-w-0">
                      <p className="ds-body truncate text-[var(--ds-text)]">{appt.patient_name}</p>
                      <p className="ds-caption truncate text-[var(--ds-text-secondary)]">
                        {appt.doctor_name} · {appt.time}
                      </p>
                    </div>
                  </div>
                  <span className={cn("ds-caption shrink-0 rounded-full px-2 py-0.5 font-semibold", STATUS_STYLE[appt.status] || STATUS_STYLE.NO_SHOW)}>
                    {appt.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ds-caption py-10 text-center text-[var(--ds-text-tertiary)]">No appointments scheduled for today</p>
          )}
        </WidgetCard>

        <WidgetCard title="Pending Actions" description="Follow-ups and collections needing attention">
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-warning-subtle)] bg-[var(--ds-warning-subtle)] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-warning)] text-[var(--ds-surface)]">
                <Phone className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="ds-min-w-0">
                <p className="ds-caption text-[var(--ds-warning)]">Follow-ups Due</p>
                <p className="ds-metric text-[var(--ds-warning)]">{pendingActions?.follow_ups ?? 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-danger-subtle)] bg-[var(--ds-danger-subtle)] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-danger)] text-[var(--ds-surface)]">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="ds-min-w-0">
                <p className="ds-caption text-[var(--ds-danger)]">Pending Billings</p>
                <p className="ds-metric text-[var(--ds-danger)]">{pendingActions?.billings_count ?? 0}</p>
                {(pendingActions?.billings_amount ?? 0) > 0 && (
                  <p className="ds-caption text-[var(--ds-danger)]">{formatIndianRupees(pendingActions!.billings_amount)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-success-subtle)] bg-[var(--ds-success-subtle)] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-success)] text-[var(--ds-surface)]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="ds-min-w-0">
                <p className="ds-caption text-[var(--ds-success)]">Completed Follow-ups</p>
                <p className="ds-metric text-[var(--ds-success)]">{s?.completed_follow_ups ?? 0}</p>
              </div>
            </div>
          </div>
        </WidgetCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <RecentActivity items={activityFeed} loading={isLoading} />
        <WidgetCard title="CRM Insights" description="Lead pipeline for this hospital">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-primary-subtle)] bg-[var(--ds-primary-subtle)] p-3 text-center">
              <p className="ds-metric text-[var(--ds-primary)]">{crmInsights?.total_leads ?? 0}</p>
              <p className="ds-caption font-medium uppercase tracking-wider text-[var(--ds-primary)]">Total Leads</p>
            </div>
            <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-success-subtle)] bg-[var(--ds-success-subtle)] p-3 text-center">
              <p className="ds-metric text-[var(--ds-success)]">{crmInsights?.conversion_rate ?? 0}%</p>
              <p className="ds-caption font-medium uppercase tracking-wider text-[var(--ds-success)]">Conversion</p>
            </div>
            <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-info-subtle)] bg-[var(--ds-info-subtle)] p-3 text-center">
              <p className="ds-metric text-[var(--ds-info)]">{crmInsights?.new_leads ?? 0}</p>
              <p className="ds-caption font-medium uppercase tracking-wider text-[var(--ds-info)]">New</p>
            </div>
            <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-accent-subtle)] bg-[var(--ds-accent-subtle)] p-3 text-center">
              <p className="ds-metric text-[var(--ds-accent)]">{crmInsights?.converted_leads ?? 0}</p>
              <p className="ds-caption font-medium uppercase tracking-wider text-[var(--ds-accent)]">Converted</p>
            </div>
          </div>
          {(crmInsights?.leads_by_source?.length ?? 0) > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-[var(--ds-border-light)] pt-3">
              <p className="ds-caption mb-2 font-medium uppercase tracking-wider text-[var(--ds-text-tertiary)]">Top Sources</p>
              {crmInsights!.leads_by_source!.map((src, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--ds-text-secondary)]">{src.source.replace(/_/g, " ")}</span>
                  <span className="ds-numeric font-semibold text-[var(--ds-text)]">{src.count}</span>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DepartmentPerformance
          title="Doctor Performance"
          description="Ranked by period revenue"
          items={doctorLeaderboard}
          loading={isLoading}
        />
        <DepartmentPerformance
          title="Top Treatments"
          description="Most performed this period"
          items={treatmentLeaderboard}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <QuickActionCenter items={quickActions} loading={isLoading} />
        <BusinessInsights items={insights} loading={isLoading} />
      </div>

      {consent && (
        <WidgetCard title="Consent Forms" description="Signed consent documents this month">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <p className="ds-body text-[var(--ds-text-secondary)]">
              Total: <span className="font-bold text-[var(--ds-text)]">{consent.total ?? 0}</span>
            </p>
            <p className="ds-body text-[var(--ds-text-secondary)]">
              This month: <span className="font-bold text-[var(--ds-primary)]">{consent.this_month ?? 0}</span>
            </p>
          </div>
          {(consent.recent?.length ?? 0) > 0 && (
            <ul className="space-y-2">
              {consent.recent!.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-[var(--ds-radius-lg)] px-2 py-1.5 text-sm">
                  <span className="font-medium text-[var(--ds-text)]">{r.patient_name}</span>
                  <span className="ds-caption text-[var(--ds-text-secondary)]">
                    {r.consent_type} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
      )}

      {quickView && (
        <QuickViewDrawer open={!!quickView} onClose={onQuickViewClose} type={quickView.type} entityId={quickView.id} entityName={quickView.name} />
      )}
    </DashboardShell>
  )
}
