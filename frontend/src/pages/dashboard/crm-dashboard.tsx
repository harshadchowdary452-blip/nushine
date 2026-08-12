import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  AlertOctagon, Activity, Bell, CalendarCheck, CalendarDays, CheckCircle2,
  ChevronRight, Clock, HeartPulse, Hourglass, Mail, MessageCircle,
  MessageSquare, Phone, PhoneMissed, Radio, Send, Target, Timer, TrendingUp,
  UserPlus, Users, Workflow,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatIndianNumber } from "@/lib/currency"
import { buildDrilldownPath, type DrilldownOptions } from "@/lib/dashboard-links"
import { crmApi } from "@/services/endpoints"
import { Badge } from "@/design-system/components/badge"
import { Button } from "@/design-system/components/button"
import {
  DashboardShell, DashboardHeader, CommandCenter, WidgetCard, DashboardSection,
  KpiGrid, type KpiDatum, type KpiTone,
  AlertCenter, type AlertItem, QuickActionCenter, type QuickAction,
  RecentActivity, type ActivityEvent,
  DashboardChart, DonutChart, downloadCSV,
  useDashboardFilter,
} from "@/design-system/dashboard"
import { Skeleton } from "@/design-system/components/skeleton"

/* ────────────────────────────────────────────────────────────────────────────
   Types mirroring the backend `/crm/command-center` contract.
   ──────────────────────────────────────────────────────────────────────────── */

interface CommandCenterKpi {
  key: string
  label: string
  value: number
  change: number | null
  positive_is_good: boolean
  raw: number
  previous: number | null
  suffix?: string
  drilldown?: { entity: string; params: Record<string, string> }
}

interface NamedValue {
  name: string
  key?: string
  value: number
}

interface RecallWellnessItem {
  id: string
  enquiry_type: string
  patient_id: string | null
  name: string
  phone: string | null
  due_date: string | null
  status: string
  priority: string | null
  treatment_name: string | null
  link: string
}

interface CommandCenterData {
  meta: {
    period: string
    date_start: string
    date_end: string
    prev_start: string
    prev_end: string
    generated_at: string
  }
  kpis: CommandCenterKpi[]
  today: {
    date: string
    follow_ups_due_today: number
    overdue_follow_ups: number
    recalls_due: number
    wellness_due: number
    appointment_reminders_due: number
    leads_ready_for_conversion: number
    converted_today: number
    unread_messages: number
    failed_messages: number
    calls_made: number
    missed_calls: number
  }
  lead_analytics: {
    growth_trend: { label: string; leads: number; converted: number }[]
    by_source: NamedValue[]
    by_status: NamedValue[]
    by_priority: NamedValue[]
    funnel: { stage: string; value: number }[]
    ageing_buckets: NamedValue[]
  }
  enquiry_analytics: {
    by_type: NamedValue[]
    by_status: NamedValue[]
    total: number
    open: number
    completed: number
    overdue: number
    trend: { label: string; enquiries: number }[]
  }
  recall_wellness: {
    recalls: { due: number }
    wellness: { due: number }
    appointment_reminders: { due: number }
    list: RecallWellnessItem[]
  }
  communication: {
    by_channel: NamedValue[]
    by_status: NamedValue[]
    calls: { total: number; missed: number }
    trend: { label: string; messages: number }[]
    recent: {
      id: string
      entity: string
      name: string
      channel: string
      message_type: string
      status: string
      created_at: string | null
      link: string | null
    }[]
  }
  conversions: {
    recent: {
      id: string
      name: string
      source: string
      converted_at: string
      link: string
      converted_patient_id: string | null
    }[]
    count: number
  }
  work_queue: {
    id: string
    patient_id: string | null
    patient_name: string
    op_number: string | null
    patient_phone: string | null
    doctor_name: string | null
    follow_up_type: string
    treatment_name: string | null
    due_time: string | null
    status: string
    link: string
  }[]
  activity: { id: string; description: string; date: string | null; type: string; link: string | null }[]
}

/* ────────────────────────────────────────────────────────────────────────────
   KPI presentation metadata
   ──────────────────────────────────────────────────────────────────────────── */

interface KpiMeta {
  icon: React.ElementType
  tone: KpiTone
  format?: (v: number) => string
}

const KPI_META: Record<string, KpiMeta> = {
  new_leads: { icon: UserPlus, tone: "primary" },
  open_leads: { icon: Users, tone: "info" },
  leads_ready_for_conversion: { icon: Target, tone: "success" },
  converted_leads: { icon: CheckCircle2, tone: "success" },
  conversion_rate: { icon: TrendingUp, tone: "success", format: (v) => `${v}%` },
  pending_follow_ups: { icon: Clock, tone: "accent" },
  overdue_follow_ups: { icon: AlertOctagon, tone: "danger" },
  recalls_due: { icon: Bell, tone: "warning" },
  wellness_due: { icon: HeartPulse, tone: "success" },
  appointment_reminders_due: { icon: CalendarCheck, tone: "info" },
  avg_response_hours: { icon: Timer, tone: "warning", format: (v) => `${v}h` },
  avg_lead_age: { icon: Hourglass, tone: "warning", format: (v) => `${v}d` },
  whatsapp_sent: { icon: MessageCircle, tone: "info" },
  communication_success_rate: { icon: Send, tone: "success", format: (v) => `${v}%` },
  unread_messages: { icon: Mail, tone: "warning" },
  failed_messages: { icon: AlertOctagon, tone: "danger" },
  calls_made: { icon: Phone, tone: "primary" },
  missed_calls: { icon: PhoneMissed, tone: "danger" },
}

const CHART_COLORS = [
  "var(--ds-chart-5)",
  "var(--ds-chart-4)",
  "var(--ds-chart-6)",
  "var(--ds-chart-8)",
  "var(--ds-chart-10)",
  "var(--ds-chart-13)",
  "var(--ds-chart-11)",
  "var(--ds-chart-12)",
]

const FU_TYPE_COLORS: Record<string, string> = {
  "1_DAY_FOLLOW_UP": "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  "7_DAY_FOLLOW_UP": "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)]",
  "6_MONTH_RECALL": "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  "12_MONTH_RECALL": "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  CUSTOM_FOLLOW_UP: "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]",
  ENQUIRY: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
  MANUAL: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
}

const RW_TYPE_COLORS: Record<string, string> = {
  RECALL: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  TREATMENT_WELLNESS: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  CASE_WELLNESS: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  APPOINTMENT_REMINDER: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  MISSED_APPOINTMENT: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  CONTACTED: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  INTERESTED: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  APPOINTMENT_BOOKED: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
  COMPLETED: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  NO_RESPONSE: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  LOST: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
  SCHEDULED: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  OPEN: "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)]",
  FAILED: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
}

function fuTypeLabel(type: string): string {
  const map: Record<string, string> = {
    "1_DAY_FOLLOW_UP": "1-Day FU",
    "7_DAY_FOLLOW_UP": "7-Day FU",
    "6_MONTH_RECALL": "6-Month Recall",
    "12_MONTH_RECALL": "12-Month Recall",
    CUSTOM_FOLLOW_UP: "Custom FU",
    ENQUIRY: "Enquiry",
    MANUAL: "Manual",
  }
  return map[type] ?? type.replace(/_/g, " ")
}

function enquiryTypeLabel(type: string): string {
  const map: Record<string, string> = {
    RECALL: "Recall",
    TREATMENT_WELLNESS: "Treatment Wellness",
    CASE_WELLNESS: "Case Wellness",
    APPOINTMENT_REMINDER: "Appointment Reminder",
    MISSED_APPOINTMENT: "Missed Appointment",
    LEAD_FOLLOW_UP: "Lead Follow-Up",
    ENQUIRY: "Enquiry",
    FOLLOW_UP: "Follow-Up",
  }
  return map[type] ?? type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function enquiryTypeIcon(type: string) {
  switch (type) {
    case "RECALL":
      return <Bell className="h-4 w-4" aria-hidden="true" />
    case "TREATMENT_WELLNESS":
    case "CASE_WELLNESS":
      return <HeartPulse className="h-4 w-4" aria-hidden="true" />
    case "APPOINTMENT_REMINDER":
      return <CalendarCheck className="h-4 w-4" aria-hidden="true" />
    default:
      return <Clock className="h-4 w-4" aria-hidden="true" />
  }
}

function statusBadgeClass(status: string): string {
  return STATUS_COLORS[status] ?? "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]"
}

function formatCount(v: number | undefined | null): string {
  return formatIndianNumber(Number(v ?? 0))
}

/* ────────────────────────────────────────────────────────────────────────────
   Small stat pill used inside today / comm / enquiry panels.
   ──────────────────────────────────────────────────────────────────────────── */

function StatPill({
  label, value, tone = "primary", icon: Icon, onClick,
}: {
  label: string
  value: string
  tone?: KpiTone
  icon?: React.ElementType
  onClick?: () => void
}) {
  const toneText: Record<KpiTone, string> = {
    primary: "text-[var(--ds-primary)]",
    accent: "text-[var(--ds-accent)]",
    success: "text-[var(--ds-success)]",
    warning: "text-[var(--ds-warning)]",
    danger: "text-[var(--ds-danger)]",
    info: "text-[var(--ds-info)]",
  }
  const toneSoft: Record<KpiTone, string> = {
    primary: "bg-[var(--ds-primary-subtle)]",
    accent: "bg-[var(--ds-accent-subtle)]",
    success: "bg-[var(--ds-success-subtle)]",
    warning: "bg-[var(--ds-warning-subtle)]",
    danger: "bg-[var(--ds-danger-subtle)]",
    info: "bg-[var(--ds-info-subtle)]",
  }
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={cn(
        "rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3",
        onClick && "ds-focus-ring cursor-pointer transition-colors hover:bg-[var(--ds-surface-hover)]"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="ds-caption text-[var(--ds-text-secondary)]">{label}</p>
        {Icon && (
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-[var(--ds-radius-md)]", toneSoft[tone], toneText[tone])}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={cn("ds-metric mt-1 text-[var(--ds-text)]", toneText[tone])}>{value}</p>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Lead funnel — horizontal staged bar (New → Contacted → Interested → Booked → Converted).
   ──────────────────────────────────────────────────────────────────────────── */

function FunnelBar({ funnel }: { funnel: { stage: string; value: number }[] }) {
  const total = Math.max(funnel.reduce((s, f) => s + f.value, 0), 1)
  const colors = [
    "var(--ds-primary)",
    "var(--ds-info)",
    "var(--ds-success)",
    "var(--ds-warning)",
    "var(--ds-chart-5)",
  ]
  return (
    <div className="space-y-2">
      {funnel.map((f, i) => {
        const pct = Math.round((f.value / total) * 100)
        return (
          <div key={f.stage} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs font-medium text-[var(--ds-text-secondary)]">{f.stage}</span>
            <div className="relative h-4 flex-1 overflow-hidden rounded-[var(--ds-radius-lg)] bg-[var(--ds-background-subtle)]">
              <div
                className="h-full rounded-[var(--ds-radius-lg)] transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-bold text-[var(--ds-text)]">{formatCount(f.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Recent communication row
   ──────────────────────────────────────────────────────────────────────────── */

function RecentCommList({ items }: { items: CommandCenterData["communication"]["recent"] }) {
  if (items.length === 0) {
    return <p className="ds-caption py-8 text-center text-[var(--ds-text-tertiary)]">No communications for this period.</p>
  }
  return (
    <ul className="space-y-1.5" aria-label="Recent communications">
      {items.map((m) => {
        const channelIcon = m.channel === "EMAIL" ? Mail : m.channel === "SMS" ? MessageSquare : MessageCircle
        const Icon = channelIcon
        const failed = m.status === "FAILED"
        const delivered = m.status === "DELIVERED" || m.status === "READ"
        return (
          <li key={m.id}>
            <a
              href={m.link ?? undefined}
              onClick={m.link ? undefined : (e) => e.preventDefault()}
              className={cn(
                "flex items-center gap-3 rounded-[var(--ds-radius-lg)] px-2 py-2 transition-colors",
                m.link && "ds-focus-ring hover:bg-[var(--ds-surface-hover)]"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)]",
                  failed
                    ? "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]"
                    : delivered
                      ? "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]"
                      : "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="ds-min-w-0 flex-1">
                <span className="ds-body block truncate text-[var(--ds-text)]">{m.name}</span>
                <span className="ds-caption block truncate text-[var(--ds-text-secondary)]">
                  {m.message_type.replace(/_/g, " ").toLowerCase()}
                </span>
              </span>
              <Badge className={cn("shrink-0", statusBadgeClass(m.status))}>{m.status}</Badge>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   CRM COMMAND CENTER — leads, follow-ups, recalls, wellness & communications.
   ──────────────────────────────────────────────────────────────────────────── */

export default function CrmDashboardPage() {
  const navigate = useNavigate()
  const filter = useDashboardFilter("this_month")
  const { period, startDate, endDate, apiParams, label, previousLabel, rangeSummary, isCustom } = filter

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<CommandCenterData>({
    queryKey: ["crm-command-center", apiParams],
    queryFn: () => crmApi.commandCenter(apiParams),
    staleTime: 20000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })

  const kpiByKey = useMemo(() => {
    const map: Record<string, CommandCenterKpi> = {}
    for (const k of data?.kpis ?? []) map[k.key] = k
    return map
  }, [data])

  const today = data?.today
  const leadAnalytics = data?.lead_analytics
  const enquiryAnalytics = data?.enquiry_analytics
  const recallWellness = data?.recall_wellness
  const communication = data?.communication
  const conversions = data?.conversions
  const workQueue = useMemo(() => data?.work_queue ?? [], [data])
  const activity = useMemo(() => data?.activity ?? [], [data])

  /* ── Drill-down builders ────────────────────────────────────────────────── */
  const leadsPath = (opts: DrilldownOptions = {}) =>
    buildDrilldownPath("leads", period, startDate, endDate, opts)

  const enquiryPath = (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params)
    const s = qs.toString()
    return `/crm/enquiry-calendar${s ? `?${s}` : ""}`
  }

  const drill = (key: string) => {
    const d = kpiByKey[key]?.drilldown
    const p = d?.params ?? {}
    switch (d?.entity) {
      case "enquiry-calendar":
        navigate(enquiryPath(p.overdue ? { overdue: "1", ...(p.type ? { type: p.type } : {}) } : p.type ? { type: p.type } : {}))
        break
      case "whatsapp":
        navigate("/whatsapp")
        break
      case "leads":
      default: {
        const opts: DrilldownOptions = {}
        if (p.status) opts.status = p.status
        if (p.source) opts.source = p.source
        navigate(leadsPath(opts))
      }
    }
  }

  const kpiItems: KpiDatum[] = useMemo(
    () =>
      (data?.kpis ?? []).map((k) => {
        const meta = KPI_META[k.key] ?? { icon: Activity, tone: "info" as KpiTone }
        const format = meta.format ?? formatCount
        return {
          id: k.key,
          title: k.label,
          value: format(k.value),
          rawValue: k.value,
          change: k.change,
          positiveIsGood: k.positive_is_good,
          previousLabel: previousLabel,
          icon: meta.icon,
          tone: meta.tone,
          hint: k.previous !== null ? `Previous ${previousLabel}: ${format(k.previous)}` : undefined,
          onClick: () => drill(k.key),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, previousLabel, period],
  )

  /* ── Alerts ─────────────────────────────────────────────────────────────── */
  const alerts: AlertItem[] = useMemo(() => {
    const list: AlertItem[] = []
    const overdueK = kpiByKey["overdue_follow_ups"]
    if (overdueK && overdueK.value > 0) {
      list.push({
        id: "overdue",
        title: `${formatCount(overdueK.value)} follow-ups overdue`,
        description: "Patients are waiting for a call-back. Clear the overdue queue to protect retention.",
        severity: "critical",
        onClick: () => navigate(enquiryPath({ overdue: "1" })),
      })
    }
    const failedK = kpiByKey["failed_messages"]
    if (failedK && failedK.value > 0) {
      list.push({
        id: "comm-failed",
        title: `${formatCount(failedK.value)} messages failed to deliver`,
        description: "Check the WhatsApp provider status and retry failed sends.",
        severity: "warning",
        onClick: () => navigate("/whatsapp"),
      })
    }
    const missedK = kpiByKey["missed_calls"]
    if (missedK && missedK.value > 0) {
      list.push({
        id: "missed-calls",
        title: `${formatCount(missedK.value)} calls unanswered`,
        description: "No-answer and busy callbacks from this period still need a follow-up.",
        severity: "warning",
        onClick: () => navigate(leadsPath()),
      })
    }
    const recallsK = kpiByKey["recalls_due"]
    if (recallsK && recallsK.value > 0) {
      list.push({
        id: "recalls",
        title: `${formatCount(recallsK.value)} recalls due`,
        description: "Returning patients are due for a recall check-in in this period.",
        severity: "info",
        onClick: () => navigate(enquiryPath({ type: "RECALL" })),
      })
    }
    const wellnessK = kpiByKey["wellness_due"]
    if (wellnessK && wellnessK.value > 0) {
      list.push({
        id: "wellness",
        title: `${formatCount(wellnessK.value)} wellness check-ins due`,
        description: "Treatment and case wellness follow-ups are pending for this period.",
        severity: "info",
        onClick: () => navigate(enquiryPath({ type: "WELLNESS" })),
      })
    }
    const stale = leadAnalytics?.ageing_buckets?.find((b) => b.name === "30+d")
    if (stale && stale.value > 0) {
      list.push({
        id: "stale-leads",
        title: `${formatCount(stale.value)} leads older than 30 days`,
        description: "Stale leads cool quickly — re-engage or close them to keep the pipeline honest.",
        severity: "info",
        onClick: () => navigate(leadsPath()),
      })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kpiByKey, period, startDate, endDate])

  /* ── Quick actions ──────────────────────────────────────────────────────── */
  const quickActions: QuickAction[] = [
    { id: "add-lead", label: "Add Lead", description: "Capture a new prospect", icon: UserPlus, tone: "primary", onClick: () => navigate("/leads?action=create") },
    { id: "calendar", label: "Enquiry Calendar", description: "Today's work queue", icon: CalendarDays, tone: "accent", onClick: () => navigate("/crm/enquiry-calendar") },
    { id: "recalls", label: "Recalls & Wellness", description: "Overdue check-ins", icon: HeartPulse, tone: "warning", onClick: () => navigate(enquiryPath({})) },
    { id: "whatsapp", label: "Send WhatsApp", description: "Direct or broadcast", icon: Send, tone: "success", onClick: () => navigate("/whatsapp") },
    { id: "templates", label: "Templates", description: "Approved message library", icon: MessageSquare, tone: "info", onClick: () => navigate("/whatsapp/templates") },
    { id: "settings", label: "CRM Settings", description: "Rules & workflow settings", icon: Workflow, tone: "danger", onClick: () => navigate("/crm/settings") },
  ]

  /* ── Activity feed ──────────────────────────────────────────────────────── */
  const activityEvents: ActivityEvent[] = useMemo(
    () =>
      activity.slice(0, 12).map((a) => {
        const link = a.link
        return {
          id: a.id,
          description: a.description,
          date: a.date ?? undefined,
          icon: a.type === "conversion" ? CheckCircle2 : a.type === "follow_up" ? Clock : MessageCircle,
          tone: a.type === "conversion" ? "success" : a.type === "follow_up" ? "warning" : "info",
          onClick: link ? () => navigate(link) : undefined,
        }
      }),
    [activity, navigate],
  )

  /* ── Export ─────────────────────────────────────────────────────────────── */
  const handleExport = () => {
    if (!data) return
    const rows = workQueue.map((w) => ({
      Patient: w.patient_name,
      "OP Number": w.op_number ?? "",
      Phone: w.patient_phone ?? "",
      "Follow-Up": fuTypeLabel(w.follow_up_type),
      Doctor: w.doctor_name ?? "",
      "Due Time": w.due_time ?? "",
      Status: w.status,
    }))
    downloadCSV(`crm-command-center-work-queue-${period}`, rows, [
      "Patient", "OP Number", "Phone", "Follow-Up", "Doctor", "Due Time", "Status",
    ])
  }

  const todayDateLabel = today?.date
    ? new Date(`${today.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
    : "Today"

  if (isError && !data) {
    return (
      <DashboardShell>
        <div className="rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-10 text-center">
          <AlertOctagon className="mx-auto h-8 w-8 text-[var(--ds-danger)]" aria-hidden="true" />
          <h2 className="ds-card-title mt-3 text-[var(--ds-text)]">Could not load the CRM Command Center</h2>
          <p className="ds-caption mx-auto mt-1 max-w-md text-[var(--ds-text-secondary)]">
            We could not reach the analytics service. Check your connection and try again.
          </p>
          <Button className="mt-4" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <DashboardHeader
        className="gradient-hero-crm"
        eyebrow="Customer Relationship Management"
        title="CRM Command Center"
        subtitle={`Lead pipeline, follow-ups, recalls, wellness & communications · ${rangeSummary}`}
        stats={[
          { label: "New Leads", value: formatCount(kpiByKey["new_leads"]?.value) },
          { label: "Conversions", value: formatCount(kpiByKey["converted_leads"]?.value), positive: true },
          { label: "Conversion Rate", value: `${kpiByKey["conversion_rate"]?.value ?? 0}%` },
          { label: "Follow-ups Due", value: formatCount(kpiByKey["pending_follow_ups"]?.value) },
        ]}
      />

      {/* ── COMMAND CENTER (global period filter) ─────────────────────────── */}
      <CommandCenter
        period={period}
        onPeriodChange={filter.setPeriod}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={filter.setStartDate}
        onEndDateChange={filter.setEndDate}
        rangeSummary={rangeSummary}
        onRefresh={() => void refetch()}
        refreshing={isFetching}
        onExport={handleExport}
      />

      {/* ── QUICK ACTIONS ─────────────────────────────────────────────────── */}
      <QuickActionCenter
        items={quickActions}
        loading={isLoading}
        title="Command Center Actions"
        description="One-tap shortcuts to the most frequent CRM workflows"
      />

      {/* ── ALERTS ────────────────────────────────────────────────────────── */}
      <AlertCenter items={alerts} loading={isLoading} title="Priority Alerts" description="Exceptions that need attention in this period" />

      {/* ── KPI GRID ──────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-[var(--ds-card-radius)]" />
          ))}
        </div>
      ) : (
        <KpiGrid items={kpiItems} cols={4} />
      )}

      {/* ══════════════════════════════════════════════════════════════════
         TODAY'S COMMAND CENTER — what needs attention right now
         ══════════════════════════════════════════════════════════════════ */}
      <DashboardSection
        title="Today's Command Center"
        description={`${todayDateLabel} — what needs attention right now`}
        icon={CalendarDays}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/crm/enquiry-calendar")}>
            Open calendar <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatPill label="Follow-ups Due Today" value={formatCount(today?.follow_ups_due_today)} icon={Clock} tone="accent" onClick={() => navigate(enquiryPath({}))} />
          <StatPill label="Overdue Follow-ups" value={formatCount(today?.overdue_follow_ups)} icon={AlertOctagon} tone="danger" onClick={() => navigate(enquiryPath({ overdue: "1" }))} />
          <StatPill label="Recalls Due" value={formatCount(today?.recalls_due)} icon={Bell} tone="warning" onClick={() => navigate(enquiryPath({ type: "RECALL" }))} />
          <StatPill label="Wellness Check-ins" value={formatCount(today?.wellness_due)} icon={HeartPulse} tone="success" onClick={() => navigate(enquiryPath({ type: "WELLNESS" }))} />
          <StatPill label="Appt Reminders" value={formatCount(today?.appointment_reminders_due)} icon={CalendarCheck} tone="info" onClick={() => navigate(enquiryPath({ type: "APPOINTMENT_REMINDER" }))} />
          <StatPill label="Leads Ready" value={formatCount(today?.leads_ready_for_conversion)} icon={Target} tone="success" onClick={() => navigate(leadsPath())} />
          <StatPill label="Converted Today" value={formatCount(today?.converted_today)} icon={CheckCircle2} tone="primary" onClick={() => navigate(leadsPath({ status: "CONVERTED" }))} />
          <StatPill label="Unread Messages" value={formatCount(today?.unread_messages)} icon={Mail} tone="warning" onClick={() => navigate("/whatsapp")} />
          <StatPill label="Failed Messages" value={formatCount(today?.failed_messages)} icon={AlertOctagon} tone="danger" onClick={() => navigate("/whatsapp")} />
          <StatPill label="Calls · Missed" value={`${formatCount(today?.calls_made)} · ${formatCount(today?.missed_calls)}`} icon={PhoneMissed} tone="info" onClick={() => navigate(leadsPath())} />
        </div>
      </DashboardSection>

      {/* ══════════════════════════════════════════════════════════════════
         SECTION 1: LEAD ACQUISITION & PIPELINE ANALYTICS
         ══════════════════════════════════════════════════════════════════ */}
      <DashboardSection
        title="Lead Acquisition & Pipeline"
        description={`Where ${label.toLowerCase()} leads come from and how they progress through the funnel`}
        icon={Target}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(leadsPath())}>
            Open leads list <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <DashboardChart
            className="lg:col-span-2"
            data={leadAnalytics?.growth_trend ?? []}
            xKey="label"
            title="Lead Growth Trend"
            description="New leads and conversions per bucket in the period"
            loading={isLoading}
            height={260}
            series={[
              { dataKey: "leads", name: "Leads", color: "var(--ds-chart-5)", type: "bar" },
              { dataKey: "converted", name: "Converted", color: "var(--ds-success)", type: "line" },
            ]}
            onPointClick={() => navigate(leadsPath())}
          />
          <DonutChart
            data={leadAnalytics?.by_source ?? []}
            title="Leads by Source"
            description="Acquisition channel split"
            loading={isLoading}
            colors={CHART_COLORS}
            height={260}
            onSliceClick={(d) => navigate(leadsPath({ source: (d as NamedValue).key }))}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <DonutChart
            data={leadAnalytics?.by_status ?? []}
            title="Leads by Status"
            description="Current pipeline stage distribution"
            loading={isLoading}
            colors={CHART_COLORS}
            height={240}
            onSliceClick={(d) => navigate(leadsPath({ status: (d as NamedValue).key }))}
          />
          <DonutChart
            data={leadAnalytics?.by_priority ?? []}
            title="Leads by Priority"
            description="How many need urgent attention"
            loading={isLoading}
            colors={CHART_COLORS}
            height={240}
            onSliceClick={() => navigate(leadsPath())}
          />
          <DonutChart
            data={leadAnalytics?.ageing_buckets ?? []}
            title="Lead Ageing"
            description="Open leads by age in pipeline"
            loading={isLoading}
            colors={CHART_COLORS}
            height={240}
            onSliceClick={() => navigate(leadsPath())}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <WidgetCard title="Conversion Funnel" description="Leads created in the period that advanced through each stage">
            {isLoading ? <Skeleton className="h-40 w-full" /> : <FunnelBar funnel={leadAnalytics?.funnel ?? []} />}
          </WidgetCard>
          <WidgetCard title="Pipeline Health" description="Rate-based summaries of the current period">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatPill label="Contacted" value={formatCount(leadAnalytics?.funnel?.[1]?.value)} icon={Phone} tone="info" onClick={() => navigate(leadsPath())} />
              <StatPill label="Interested" value={formatCount(leadAnalytics?.funnel?.[2]?.value)} icon={Target} tone="success" onClick={() => navigate(leadsPath())} />
              <StatPill label="Booked Appt" value={formatCount(leadAnalytics?.funnel?.[3]?.value)} icon={CalendarDays} tone="warning" onClick={() => navigate(leadsPath())} />
              <StatPill label="Converted" value={formatCount(leadAnalytics?.funnel?.[4]?.value)} icon={CheckCircle2} tone="primary" onClick={() => navigate(leadsPath({ status: "CONVERTED" }))} />
            </div>
          </WidgetCard>
        </div>
      </DashboardSection>

      {/* ══════════════════════════════════════════════════════════════════
         SECTION 2: COMMUNICATION COMMAND CENTER
         ══════════════════════════════════════════════════════════════════ */}
      <DashboardSection
        title="Communication Command Center"
        description="Outreach volume, delivery health and the latest messages"
        icon={MessageSquare}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/whatsapp")}>
            Open WhatsApp <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatPill label="Messages Sent" value={formatCount(communication?.by_status.find((s) => s.name === "Sent")?.value)} icon={Send} tone="info" onClick={() => navigate("/whatsapp")} />
          <StatPill label="Delivered" value={formatCount(communication?.by_status.find((s) => s.name === "Delivered")?.value)} icon={MessageCircle} tone="success" onClick={() => navigate("/whatsapp")} />
          <StatPill label="Failed" value={formatCount(communication?.by_status.find((s) => s.name === "Failed")?.value)} icon={AlertOctagon} tone="danger" onClick={() => navigate("/whatsapp")} />
          <StatPill label="Calls · Missed" value={`${formatCount(communication?.calls.total)} · ${formatCount(communication?.calls.missed)}`} icon={PhoneMissed} tone="warning" onClick={() => navigate(leadsPath())} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <DonutChart
            data={communication?.by_channel ?? []}
            title="Messages by Channel"
            description="WhatsApp, email and SMS split"
            loading={isLoading}
            colors={CHART_COLORS}
            height={240}
            onSliceClick={() => navigate("/whatsapp")}
          />
          <DonutChart
            data={communication?.by_status ?? []}
            title="Delivery Health"
            description="Status distribution across channels"
            loading={isLoading}
            colors={CHART_COLORS}
            height={240}
            onSliceClick={() => navigate("/whatsapp")}
          />
          <WidgetCard title="Communication Volume" description="Messages per day in the period">
            <DashboardChart
              bare
              data={communication?.trend ?? []}
              xKey="label"
              loading={isLoading}
              height={220}
              series={[{ dataKey: "messages", name: "Messages", color: "var(--ds-chart-5)", type: "area" }]}
              onPointClick={() => navigate("/whatsapp")}
            />
          </WidgetCard>
        </div>

        <WidgetCard className="mt-4" title="Recent Communications" description="Latest outbound messages and their delivery state" flush>
          <div className="p-[var(--ds-card-padding)]">
            <RecentCommList items={communication?.recent ?? []} />
          </div>
        </WidgetCard>
      </DashboardSection>

      {/* ══════════════════════════════════════════════════════════════════
         SECTION 3: RECALLS, WELLNESS & APPOINTMENT REMINDERS
         ══════════════════════════════════════════════════════════════════ */}
      <DashboardSection
        title="Recalls, Wellness & Reminders"
        description={`Scheduled check-ins, recalls and appointment reminders due in ${label.toLowerCase()}`}
        icon={HeartPulse}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/crm/enquiry-calendar")}>
            Open enquiry calendar <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatPill label="Recalls Due" value={formatCount(recallWellness?.recalls.due)} icon={Bell} tone="warning" onClick={() => navigate(enquiryPath({ type: "RECALL" }))} />
          <StatPill label="Wellness" value={formatCount(recallWellness?.wellness.due)} icon={HeartPulse} tone="success" onClick={() => navigate(enquiryPath({ type: "WELLNESS" }))} />
          <StatPill label="Appt Reminders" value={formatCount(recallWellness?.appointment_reminders.due)} icon={CalendarCheck} tone="info" onClick={() => navigate(enquiryPath({ type: "APPOINTMENT_REMINDER" }))} />
          <StatPill label="Open Enquiries" value={formatCount(enquiryAnalytics?.open)} icon={Clock} tone="accent" onClick={() => navigate(enquiryPath({}))} />
          <StatPill label="Completed" value={formatCount(enquiryAnalytics?.completed)} icon={CheckCircle2} tone="primary" onClick={() => navigate(enquiryPath({}))} />
          <StatPill label="Overdue" value={formatCount(enquiryAnalytics?.overdue)} icon={AlertOctagon} tone="danger" onClick={() => navigate(enquiryPath({ overdue: "1" }))} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <DonutChart
            data={enquiryAnalytics?.by_type ?? []}
            title="Enquiries by Type"
            description="Recalls, wellness and reminders split"
            loading={isLoading}
            colors={CHART_COLORS}
            height={240}
            onSliceClick={(d) => navigate(enquiryPath({ type: (d as NamedValue).key ?? "" }))}
          />
          <DonutChart
            data={enquiryAnalytics?.by_status ?? []}
            title="Enquiry Status"
            description="Open, completed and terminal states"
            loading={isLoading}
            colors={CHART_COLORS}
            height={240}
            onSliceClick={() => navigate(enquiryPath({}))}
          />
          <WidgetCard title="Enquiry Volume" description="Scheduled enquiries per day in the period">
            <DashboardChart
              bare
              data={enquiryAnalytics?.trend ?? []}
              xKey="label"
              loading={isLoading}
              height={220}
              series={[{ dataKey: "enquiries", name: "Enquiries", color: "var(--ds-chart-5)", type: "area" }]}
              onPointClick={() => navigate(enquiryPath({}))}
            />
          </WidgetCard>
        </div>

        <WidgetCard className="mt-4" title="Actionable Recalls & Check-ins" description="Highest-priority items due through the period" flush>
          <div className="p-[var(--ds-card-padding)]">
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (recallWellness?.list ?? []).length === 0 ? (
              <p className="ds-caption py-8 text-center text-[var(--ds-text-tertiary)]">
                No recalls, wellness check-ins or reminders due in this period.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(recallWellness?.list ?? []).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigate(item.link)}
                      className="ds-focus-ring flex w-full items-center gap-3 rounded-[var(--ds-radius-lg)] px-2 py-2 text-left transition-colors hover:bg-[var(--ds-surface-hover)]"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)]",
                          RW_TYPE_COLORS[item.enquiry_type] ?? "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]"
                        )}
                      >
                        {enquiryTypeIcon(item.enquiry_type)}
                      </span>
                      <span className="ds-min-w-0 flex-1">
                        <span className="ds-body block truncate text-[var(--ds-text)]">{item.name}</span>
                        <span className="ds-caption block truncate text-[var(--ds-text-secondary)]">
                          {enquiryTypeLabel(item.enquiry_type)}
                          {item.treatment_name ? ` · ${item.treatment_name}` : ""}
                          {item.priority ? ` · ${item.priority.replace(/_/g, " ")}` : ""}
                        </span>
                      </span>
                      <span className="ds-caption shrink-0 text-[var(--ds-text-tertiary)]">
                        {item.due_date ? new Date(item.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </WidgetCard>
      </DashboardSection>

      {/* ══════════════════════════════════════════════════════════════════
         SECTION 4: RECENT CONVERSIONS + TODAY'S WORK QUEUE
         ══════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard
          title="Recent Conversions"
          description={`Leads converted in ${label.toLowerCase()}`}
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate(leadsPath({ status: "CONVERTED" }))}>
              View all <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          }
        >
          {(conversions?.recent ?? []).length === 0 ? (
            <p className="ds-caption py-8 text-center text-[var(--ds-text-tertiary)]">No conversions in this period.</p>
          ) : (
            <ul className="space-y-1.5">
              {(conversions?.recent ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate(c.link)}
                    className="ds-focus-ring flex w-full items-center gap-3 rounded-[var(--ds-radius-lg)] px-2 py-2 text-left transition-colors hover:bg-[var(--ds-surface-hover)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-success-subtle)] text-[var(--ds-success)]">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="ds-min-w-0 flex-1">
                      <span className="ds-body block truncate text-[var(--ds-text)]">{c.name}</span>
                      <span className="ds-caption block text-[var(--ds-text-secondary)]">{c.source.replace(/_/g, " ").toLowerCase()}</span>
                    </span>
                    <span className="ds-caption shrink-0 text-[var(--ds-text-tertiary)]">
                      {c.converted_at ? new Date(c.converted_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard
          title="Today's Work Queue"
          description="Follow-ups due today that need action"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate("/crm/enquiry-calendar")}>
              View all <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          }
        >
          {workQueue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-[var(--ds-success)]" aria-hidden="true" />
              <p className="ds-caption text-[var(--ds-text-tertiary)]">All caught up — no pending follow-ups today.</p>
            </div>
          ) : (
            <ul className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
              {workQueue.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(item.link)}
                    className="ds-focus-ring flex w-full items-center gap-3 rounded-[var(--ds-radius-lg)] px-2 py-2 text-left transition-colors hover:bg-[var(--ds-surface-hover)]"
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)]", FU_TYPE_COLORS[item.follow_up_type] ?? "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]")}>
                      <Clock className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="ds-min-w-0 flex-1">
                      <span className="ds-body block truncate text-[var(--ds-text)]">{item.patient_name}</span>
                      <span className="ds-caption block truncate text-[var(--ds-text-secondary)]">
                        {fuTypeLabel(item.follow_up_type)}
                        {item.doctor_name ? ` · ${item.doctor_name}` : ""}
                      </span>
                    </span>
                    <span className="ds-caption shrink-0 text-[var(--ds-text-tertiary)]">{item.due_time ?? "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
         SECTION 5: RECENT ACTIVITY
         ══════════════════════════════════════════════════════════════════ */}
      <RecentActivity
        items={activityEvents}
        loading={isLoading}
        title="CRM Activity"
        description="Latest communications, conversions and follow-ups across the practice"
      />

      {/* ── REAL-TIME SYNC FOOTER ─────────────────────────────────────────── */}
      <p className="ds-caption flex items-center gap-1.5 text-[var(--ds-text-tertiary)]">
        <Radio className="h-3.5 w-3.5 text-[var(--ds-success)]" aria-hidden="true" />
        Auto-refreshes every 30 seconds
        {dataUpdatedAt ? ` · last updated ${new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        {isCustom ? ` · ${rangeSummary}` : ` · ${label}`}
      </p>
    </DashboardShell>
  )
}
