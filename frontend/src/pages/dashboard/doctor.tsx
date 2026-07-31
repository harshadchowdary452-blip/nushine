import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Activity, AlarmClock, BarChart3, CalendarCheck2, CalendarClock, CheckCircle2,
  CircleDollarSign, ClipboardCheck, Clock, FolderKanban, FolderOpen,
  IndianRupee, LayoutList, Timer, TrendingUp, UserPlus, Users, XCircle,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { dashboardApi } from "@/services/endpoints"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"
import { useDashboardActivity } from "@/lib/dashboard-activity"
import {
  AlertCenter, BusinessInsights, CommandCenter, DashboardChart,
  DashboardHeader, DashboardSection, DashboardShell, DepartmentPerformance,
  DonutChart, ExecutiveSummary, KpiGrid, QuickActionCenter, RecentActivity,
  SavedViewsMenu, downloadCSV, useDashboardFilter, useDashboardPersonalization,
  BiInsightsGrid, BI_INSIGHTS_WIDGETS,
} from "@/design-system/dashboard"
import type { AlertItem, Insight, KpiDatum, PerformerDatum, QuickAction, SummaryHighlight, SummaryMetric } from "@/design-system/dashboard"
import { buildDrilldownPath } from "@/lib/dashboard-links"

/* ────────────────────────────────────────────────────────────────────────────
   Types mirroring GET /dashboards/doctor
   ──────────────────────────────────────────────────────────────────────────── */

interface TrendPoint {
  month: string
  revenue?: number
  count?: number
}

interface TreatmentDatum {
  name: string
  value: number
}

interface DoctorStats {
  my_patients?: number
  today_appointments?: number
  active_cases?: number
  cases_completed?: number
  treatment_success_rate?: number
  follow_up_rate?: number
  pending_follow_ups?: number
  upcoming_follow_ups?: number
  completed_follow_ups?: number
  missed_follow_ups?: number
  follow_up_success_rate?: number
  today_capacity_total?: number
  today_appointments_scheduled?: number
  today_capacity_utilization_pct?: number
  period_revenue?: number
  revenue_change?: number
  patients_seen_period?: number
  appointments_period?: number
  completed_appointments_period?: number
  cases_created_period?: number
  revenue_trend?: TrendPoint[]
  case_completion_trend?: TrendPoint[]
  treatment_trend?: TreatmentDatum[]
  appointment_trend?: { label: string; count: number }[]
  appointment_heatmap?: { day: number; hour: number; count: number }[]
  treatment_category_breakdown?: { name: string; count: number; cost?: number }[]
  lead_source_breakdown?: { source: string; count: number }[]
  payment_method_breakdown?: { method: string; amount: number }[]
  gender_distribution?: { gender: string; count: number }[]
  age_group_distribution?: { group: string; count: number }[]
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good Morning"
  if (h < 17) return "Good Afternoon"
  return "Good Evening"
}

/* ──────────────────────────────────────────────────────────────────────────── */

export default function DoctorDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const filter = useDashboardFilter("this_month")
  const biPersonalization = useDashboardPersonalization("doctor-bi", BI_INSIGHTS_WIDGETS)
  const activity = useDashboardActivity(8)

  const dashParams = useMemo(() => filter.apiParams, [filter.apiParams])

  const {
    data: stats,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["dash", "doctor", user?.id, dashParams],
    queryFn: () => dashboardApi.doctor(dashParams),
    staleTime: 10000,
    gcTime: 60000,
    refetchInterval: 30000,
  })

  if (!user) return null

  const s = stats as DoctorStats | undefined
  const drill = (entity: Parameters<typeof buildDrilldownPath>[0], opts: { status?: string; billingStatus?: string } = {}) =>
    buildDrilldownPath(entity, filter.period, filter.startDate, filter.endDate, opts)

  const revenueSpark = (s?.revenue_trend ?? []).map((t) => t.revenue ?? 0)

  /* ── Primary KPIs (period-aware) ─────────────────────────────────────────── */
  const primaryKpis: KpiDatum[] = [
    {
      id: "period-revenue",
      title: "Period Revenue",
      value: formatIndianRupees(s?.period_revenue ?? 0),
      rawValue: s?.period_revenue ?? 0,
      change: s?.revenue_change ?? null,
      previousLabel: filter.previousLabel,
      icon: IndianRupee,
      tone: "success",
      sparkline: revenueSpark,
      loading: isLoading,
      onClick: () => navigate(drill("billing")),
    },
    {
      id: "patients-seen",
      title: "Patients Seen",
      value: formatIndianNumber(s?.patients_seen_period ?? 0),
      rawValue: s?.patients_seen_period ?? 0,
      change: null,
      previousLabel: filter.label,
      icon: Users,
      tone: "accent",
      loading: isLoading,
      onClick: () => navigate(drill("patients")),
    },
    {
      id: "appointments",
      title: "Appointments",
      value: formatIndianNumber(s?.appointments_period ?? 0),
      rawValue: s?.appointments_period ?? 0,
      change: null,
      previousLabel: filter.label,
      icon: CalendarCheck2,
      tone: "info",
      loading: isLoading,
      onClick: () => navigate(drill("appointments")),
    },
    {
      id: "cases-created",
      title: "Cases Created",
      value: formatIndianNumber(s?.cases_created_period ?? 0),
      rawValue: s?.cases_created_period ?? 0,
      change: null,
      previousLabel: filter.label,
      icon: FolderOpen,
      tone: "warning",
      loading: isLoading,
      onClick: () => navigate(drill("cases")),
    },
  ]

  /* ── Today + case status KPIs ────────────────────────────────────────────── */
  const todayKpis: KpiDatum[] = [
    {
      id: "today-appointments",
      title: "Today's Appointments",
      value: formatIndianNumber(s?.today_appointments ?? 0),
      rawValue: s?.today_appointments ?? 0,
      change: null,
      previousLabel: "Today",
      icon: CalendarClock,
      tone: "info",
      loading: isLoading,
      onClick: () => navigate(drill("appointments")),
    },
    {
      id: "active-cases",
      title: "Active Cases",
      value: formatIndianNumber(s?.active_cases ?? 0),
      rawValue: s?.active_cases ?? 0,
      change: null,
      previousLabel: "In progress",
      icon: FolderKanban,
      tone: "warning",
      loading: isLoading,
      onClick: () => navigate("/cases"),
    },
    {
      id: "cases-completed",
      title: "Cases Completed",
      value: formatIndianNumber(s?.cases_completed ?? 0),
      rawValue: s?.cases_completed ?? 0,
      change: null,
      previousLabel: "All-time",
      icon: ClipboardCheck,
      tone: "success",
      loading: isLoading,
      onClick: () => navigate("/cases"),
    },
    {
      id: "today-capacity",
      title: "Today's Capacity",
      value: `${s?.today_capacity_utilization_pct ?? 0}%`,
      rawValue: s?.today_capacity_utilization_pct ?? 0,
      change: null,
      previousLabel: `${formatIndianNumber(s?.today_appointments_scheduled ?? 0)} of ${formatIndianNumber(s?.today_capacity_total ?? 0)} slots`,
      icon: Timer,
      tone: (s?.today_capacity_utilization_pct ?? 0) >= 90 ? "danger" : "accent",
      loading: isLoading,
      onClick: () => navigate("/appointments"),
    },
  ]

  /* ── Follow-up KPIs ──────────────────────────────────────────────────────── */
  const followUpKpis: KpiDatum[] = [
    {
      id: "upcoming-follow-ups",
      title: "Upcoming Follow-ups",
      value: formatIndianNumber(s?.upcoming_follow_ups ?? 0),
      rawValue: s?.upcoming_follow_ups ?? 0,
      change: null,
      previousLabel: "Due from today",
      icon: AlarmClock,
      tone: "primary",
      loading: isLoading,
      onClick: () => navigate("/patients"),
    },
    {
      id: "completed-follow-ups",
      title: "Completed Follow-ups",
      value: formatIndianNumber(s?.completed_follow_ups ?? 0),
      rawValue: s?.completed_follow_ups ?? 0,
      change: null,
      previousLabel: "All-time",
      icon: CheckCircle2,
      tone: "success",
      loading: isLoading,
      onClick: () => navigate("/patients"),
    },
    {
      id: "missed-follow-ups",
      title: "Missed Follow-ups",
      value: formatIndianNumber(s?.missed_follow_ups ?? 0),
      rawValue: s?.missed_follow_ups ?? 0,
      change: null,
      previousLabel: "Lost",
      positiveIsGood: false,
      icon: XCircle,
      tone: (s?.missed_follow_ups ?? 0) > 0 ? "danger" : "success",
      loading: isLoading,
      onClick: () => navigate("/patients"),
    },
    {
      id: "follow-up-success",
      title: "Follow-up Success",
      value: `${s?.follow_up_success_rate ?? 0}%`,
      rawValue: s?.follow_up_success_rate ?? 0,
      change: null,
      previousLabel: "Completed vs missed",
      icon: TrendingUp,
      tone: "info",
      loading: isLoading,
      onClick: () => navigate("/patients"),
    },
  ]

  /* ── Critical alerts ─────────────────────────────────────────────────────── */
  const revenueChange = s?.revenue_change ?? 0
  const alerts: AlertItem[] = []
  if (revenueChange < 0) {
    alerts.push({
      id: "revenue-drop",
      title: `Revenue down ${Math.abs(revenueChange).toFixed(1)}% vs previous period`,
      description: "Review collections and outstanding billings to close the gap.",
      severity: "critical",
      onClick: () => navigate(drill("billing")),
    })
  }
  if ((s?.missed_follow_ups ?? 0) > 0) {
    alerts.push({
      id: "missed-follow-ups",
      title: `${s!.missed_follow_ups} missed follow-up(s)`,
      description: "Reach out to patients to reschedule lost follow-ups.",
      severity: "warning",
      onClick: () => navigate("/patients"),
    })
  }
  if ((s?.today_capacity_utilization_pct ?? 0) >= 90) {
    alerts.push({
      id: "capacity-full",
      title: `Today's schedule is ${s!.today_capacity_utilization_pct}% full`,
      description: `${formatIndianNumber(s!.today_appointments_scheduled ?? 0)} of ${formatIndianNumber(s!.today_capacity_total ?? 0)} slots booked.`,
      severity: "warning",
      onClick: () => navigate("/appointments"),
    })
  }
  if ((s?.upcoming_follow_ups ?? 0) > 0) {
    alerts.push({
      id: "follow-ups-due",
      title: `${s!.upcoming_follow_ups} follow-up(s) due`,
      description: "Patients waiting on follow-up contact this period.",
      severity: "info",
      onClick: () => navigate("/patients"),
    })
  }

  /* ── Insights ───────────────────────────────────────────────────────────── */
  const insights: Insight[] = []
  if (revenueChange > 0) {
    insights.push({ id: "rev-up", text: `Revenue grew ${revenueChange.toFixed(1)}% versus the previous period.`, tone: "positive" })
  } else if (revenueChange < 0) {
    insights.push({ id: "rev-down", text: `Revenue declined ${Math.abs(revenueChange).toFixed(1)}% versus the previous period.`, tone: "negative" })
  }
  if ((s?.treatment_success_rate ?? 0) > 0) {
    insights.push({ id: "treatment-success", text: `Treatment success rate is ${s!.treatment_success_rate}% across your cases.`, tone: "neutral" })
  }
  if ((s?.appointments_period ?? 0) > 0 && (s?.completed_appointments_period ?? 0) > 0) {
    const completion = Math.round(((s!.completed_appointments_period ?? 0) / (s!.appointments_period ?? 1)) * 100)
    insights.push({
      id: "appt-completion",
      text: `${s!.completed_appointments_period} of ${s!.appointments_period} appointments completed this period (${completion}%).`,
      tone: completion >= 70 ? "positive" : "neutral",
    })
  }

  /* ── Executive summary narrative (rule-based from real data) ─────────────── */
  const summaryMetrics: SummaryMetric[] = [
    { label: "My revenue", value: formatIndianRupees(s?.period_revenue ?? 0), change: revenueChange },
    { label: "Patients seen", value: formatIndianNumber(s?.my_patients ?? 0), change: null },
    { label: "Appointments", value: formatIndianNumber(s?.appointments_period ?? 0), change: null },
    { label: "Cases created", value: formatIndianNumber(s?.cases_created_period ?? 0), change: null },
    { label: "Treatment success", value: `${s?.treatment_success_rate ?? 0}%`, change: null },
  ]
  const summaryHighlights: SummaryHighlight[] = []
  const topTreatment = (s?.treatment_trend ?? [])[0]
  if (topTreatment?.name) summaryHighlights.push({ icon: ClipboardCheck, label: "Top treatment", text: `${topTreatment.name} · ${formatIndianNumber(topTreatment.value ?? 0)} planned` })
  if ((s?.treatment_success_rate ?? 0) > 0) {
    summaryHighlights.push({ icon: TrendingUp, label: "Success rate", text: `${s!.treatment_success_rate}% across your cases` })
  }
  if ((s?.completed_follow_ups ?? 0) > 0) {
    summaryHighlights.push({ icon: CalendarClock, label: "Follow-ups done", text: `${formatIndianNumber(s?.completed_follow_ups ?? 0)} completed this period` })
  }
  const summaryCaution =
    (s?.missed_follow_ups ?? 0) > 0
      ? `${s!.missed_follow_ups} follow-up(s) missed this period — prioritize outreach to protect outcomes.`
      : (s?.treatment_success_rate ?? 0) > 0 && (s?.treatment_success_rate ?? 0) < 70
        ? `Treatment success is at ${s!.treatment_success_rate}% — review recent case outcomes for improvement.`
        : undefined

  /* ── Leaderboard ─────────────────────────────────────────────────────────── */
  const treatmentLeaderboard: PerformerDatum[] = (s?.treatment_trend ?? []).map((t) => ({
    name: t.name || "Unnamed treatment",
    value: formatIndianNumber(t.value ?? 0),
    subtitle: "Planned treatments",
  }))

  /* ── Quick actions ───────────────────────────────────────────────────────── */
  const quickActions: QuickAction[] = [
    { id: "new-patient", label: "New Patient", description: "Register a patient", icon: UserPlus, tone: "accent", onClick: () => navigate("/patients") },
    { id: "book-appointment", label: "Book Appointment", description: "Schedule a visit", icon: CalendarCheck2, tone: "primary", onClick: () => navigate("/appointments") },
    { id: "open-case", label: "Open Case", description: "Start a treatment case", icon: FolderKanban, tone: "success", onClick: () => navigate("/cases") },
    { id: "treatment-queue", label: "Treatment Queue", description: "Work the doctor queue", icon: LayoutList, tone: "info", onClick: () => navigate("/treatments/queue") },
    { id: "record-billing", label: "Record Billing", description: "Capture a payment", icon: CircleDollarSign, tone: "warning", onClick: () => navigate("/billing") },
    { id: "set-availability", label: "Set Availability", description: "Update your schedule", icon: Clock, tone: "primary", onClick: () => navigate("/doctors/availability") },
  ]

  /* ── Export snapshot ─────────────────────────────────────────────────────── */
  const handleExport = () => {
    const rows = [
      { Metric: "My Patients", Value: s?.my_patients ?? 0 },
      { Metric: "Period Revenue", Value: s?.period_revenue ?? 0 },
      { Metric: "Revenue Change %", Value: s?.revenue_change ?? 0 },
      { Metric: "Patients Seen", Value: s?.patients_seen_period ?? 0 },
      { Metric: "Appointments", Value: s?.appointments_period ?? 0 },
      { Metric: "Cases Created", Value: s?.cases_created_period ?? 0 },
      { Metric: "Active Cases", Value: s?.active_cases ?? 0 },
      { Metric: "Cases Completed", Value: s?.cases_completed ?? 0 },
      { Metric: "Today's Appointments", Value: s?.today_appointments ?? 0 },
      { Metric: "Upcoming Follow-ups", Value: s?.upcoming_follow_ups ?? 0 },
      { Metric: "Follow-up Success %", Value: s?.follow_up_success_rate ?? 0 },
      { Metric: "Treatment Success %", Value: s?.treatment_success_rate ?? 0 },
    ]
    downloadCSV(`doctor-overview-${filter.period}`, rows, ["Metric", "Value"])
  }

  const revenueTrendData = (s?.revenue_trend ?? []).map((t) => ({ month: t.month, revenue: t.revenue ?? 0 }))
  const caseTrendData = (s?.case_completion_trend ?? []).map((t) => ({ month: t.month, count: t.count ?? 0 }))
  const treatmentDonut = (s?.treatment_trend ?? []).map((t) => ({ name: t.name, value: t.value ?? 0 }))
  const formattedToday = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <DashboardShell>
      <DashboardHeader
        eyebrow="Doctor Overview"
        title={`${getGreeting()}, Dr. ${user.full_name?.split(" ").slice(0, 2).join(" ") || "User"}`}
        subtitle={formattedToday}
        stats={[
          { label: "My Patients", value: formatIndianNumber(s?.my_patients ?? 0) },
          { label: "Today's Appts", value: formatIndianNumber(s?.today_appointments ?? 0) },
          { label: "Active Cases", value: formatIndianNumber(s?.active_cases ?? 0) },
          { label: "Period Revenue", value: formatIndianRupees(s?.period_revenue ?? 0) },
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
          <SavedViewsMenu
            views={biPersonalization.views}
            onSave={biPersonalization.saveView}
            onLoad={biPersonalization.loadView}
            onDelete={biPersonalization.deleteView}
            onReset={biPersonalization.reset}
            disabled={isLoading}
          />
        }
        onRefresh={() => void refetch()}
        refreshing={isFetching}
        onExport={handleExport}
      />

      <ExecutiveSummary metrics={summaryMetrics} highlights={summaryHighlights} caution={summaryCaution} loading={isLoading} />

      <AlertCenter items={alerts} loading={isLoading} />

      <KpiGrid items={primaryKpis} cols={4} />

      <KpiGrid items={todayKpis} cols={4} />

      <DashboardSection title="Follow-up Performance" description="Patients on your follow-up pipeline" icon={Activity} defaultOpen>
        <KpiGrid items={followUpKpis} cols={4} />
      </DashboardSection>

      <DashboardSection title="Business Analytics" description={`Revenue, cases and treatments for ${filter.label.toLowerCase()}`} icon={Activity} defaultOpen>
        <div className="grid gap-3 lg:grid-cols-2">
          <DashboardChart
            title="Revenue Trend"
            description="Period revenue from your cases"
            data={revenueTrendData}
            xKey="month"
            series={[{ dataKey: "revenue", name: "Revenue", color: "var(--ds-chart-1)", type: "area" }]}
            loading={isLoading}
            valueFormatter={formatIndianRupees}
          />
          <DashboardChart
            title="Case Trend"
            description="New cases opened per period bucket"
            data={caseTrendData}
            xKey="month"
            series={[{ dataKey: "count", name: "Cases", color: "var(--ds-chart-4)", type: "bar" }]}
            loading={isLoading}
          />
          <DonutChart
            title="Top Treatments"
            description="Most planned treatments"
            data={treatmentDonut}
            loading={isLoading}
            className="lg:col-span-2"
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
        <RecentActivity items={activity.items} loading={activity.loading} />
        <DepartmentPerformance
          title="Top Treatments"
          description="Most planned this period"
          items={treatmentLeaderboard}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <QuickActionCenter items={quickActions} loading={isLoading} />
        <BusinessInsights items={insights} loading={isLoading} />
      </div>
    </DashboardShell>
  )
}
