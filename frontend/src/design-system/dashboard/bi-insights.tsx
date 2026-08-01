 
import * as React from "react"
import { Fragment } from "react"
import { useNavigate } from "react-router-dom"
import {
  CalendarCheck2, CalendarDays, CreditCard, FolderKanban, Megaphone, UserRound, Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"
import type { DrilldownEntity, DrilldownOptions } from "@/lib/dashboard-links"
import { DashboardChart, DonutChart } from "./charts"
import type { ChartPoint } from "./charts"
import { HeatmapChart } from "./enterprise-charts"
import type { HeatmapDatum } from "./enterprise-charts"
import { DashboardWidget } from "./personalization"
import type { DashboardPersonalization } from "./personalization"

/** Default widget order for the shared BI insights grid. */
export const BI_INSIGHTS_WIDGETS = [
  "appointment-trend",
  "appointment-heatmap",
  "treatment-categories",
  "lead-sources",
  "payment-methods",
  "age-groups",
  "gender",
]

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const BI_WIDGET_META: Record<string, { title: string; description: string; icon: LucideIcon; span?: boolean }> = {
  "appointment-trend": { title: "Appointment Volume", description: "Click a point to open those appointments", icon: CalendarCheck2 },
  "appointment-heatmap": { title: "Appointment Heatmap", description: "Volume by weekday and hour — click a cell", icon: CalendarDays, span: true },
  "treatment-categories": { title: "Treatment Categories", description: "Most planned treatments this period", icon: FolderKanban },
  "lead-sources": { title: "Lead Sources", description: "Where enquiries come from", icon: Megaphone },
  "payment-methods": { title: "Payment Methods", description: "How this period's collections are split", icon: CreditCard },
  "age-groups": { title: "Patient Age Groups", description: "New patients by age band", icon: Users },
  "gender": { title: "Patient Gender", description: "New patients by gender", icon: UserRound },
}

export interface BiInsightsStats {
  appointment_trend?: Array<{ label: string; count: number }>
  appointment_heatmap?: HeatmapDatum[]
  treatment_category_breakdown?: Array<{ name: string; count: number; cost?: number }>
  lead_source_breakdown?: Array<{ source: string; count: number }>
  payment_method_breakdown?: Array<{ method: string; amount: number }>
  gender_distribution?: Array<{ gender: string; count: number }>
  age_group_distribution?: Array<{ group: string; count: number }>
}

export interface BiInsightsGridProps {
  personalization: DashboardPersonalization
  stats: BiInsightsStats
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  onDrill?: (entity: DrilldownEntity, opts?: DrilldownOptions) => void
  className?: string
}

/**
 * Shared "Enterprise BI Insights" widget grid. Every widget is a
 * `DashboardWidget`, so pin / move / hide, CSV export, print, fullscreen and
 * record drill-downs work identically on every role dashboard.
 */
export function BiInsightsGrid({
  personalization,
  stats,
  loading,
  error,
  onRetry,
  onDrill,
  className,
}: BiInsightsGridProps) {
  const navigate = useNavigate()

  const appointmentTrendData = (stats.appointment_trend ?? []).map((t) => ({ label: t.label, count: t.count }))
  const heatmapData = stats.appointment_heatmap ?? []
  const treatmentCatData = (stats.treatment_category_breakdown ?? []).map((c) => ({ name: c.name, value: c.count }))
  const leadSourceData = (stats.lead_source_breakdown ?? []).map((l) => ({ name: l.source, value: l.count }))
  const paymentMethodData = (stats.payment_method_breakdown ?? []).map((p) => ({ name: p.method, value: p.amount }))
  const ageGroupData = (stats.age_group_distribution ?? []).map((a) => ({ name: a.group, value: a.count }))
  const genderData = (stats.gender_distribution ?? []).map((g) => ({ name: g.gender, value: g.count }))

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

  const renderWidget = (id: string, index: number): React.ReactNode => {
    const meta = BI_WIDGET_META[id]
    if (!meta) return null
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
      case "appointment-trend": {
        const rows = appointmentTrendData.map((t) => ({ Label: t.label, Appointments: t.count }))
        const content = (
          <DashboardChart
            bare
            data={appointmentTrendData}
            xKey="label"
            series={[{ dataKey: "count", name: "Appointments", color: "var(--ds-chart-4)", type: "bar" }]}
            loading={loading}
            error={error}
            onRetry={onRetry}
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
      case "appointment-heatmap": {
        const rows = heatmapData.map((c) => ({ Day: DAY_LABELS[c.day] ?? String(c.day), Hour: `${c.hour}:00`, Appointments: c.count }))
        const content = (
          <HeatmapChart data={heatmapData} loading={loading} error={error} onRetry={onRetry} onCellClick={() => onDrill?.("appointments")} height={280} />
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
            loading={loading}
            error={error}
            onRetry={onRetry}
            valueFormatter={formatIndianNumber}
            height={260}
            onSliceClick={() => onDrill?.("cases")}
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
            loading={loading}
            error={error}
            onRetry={onRetry}
            valueFormatter={formatIndianNumber}
            height={260}
            onSliceClick={(d) => onDrill?.("leads", { source: d.name })}
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
            loading={loading}
            error={error}
            onRetry={onRetry}
            valueFormatter={formatIndianRupees}
            height={260}
            onSliceClick={() => onDrill?.("billing")}
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
            loading={loading}
            error={error}
            onRetry={onRetry}
            valueFormatter={formatIndianNumber}
            height={280}
            onPointClick={() => onDrill?.("patients")}
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
            loading={loading}
            error={error}
            onRetry={onRetry}
            valueFormatter={formatIndianNumber}
            height={260}
            onSliceClick={() => onDrill?.("patients")}
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
    <div className={cn("grid gap-3 lg:grid-cols-2", className)}>
      {personalization.orderedIds.map((id, index) => (
        <Fragment key={id}>{renderWidget(id, index)}</Fragment>
      ))}
    </div>
  )
}
