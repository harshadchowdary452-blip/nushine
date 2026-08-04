import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Activity, AlertTriangle, CalendarCheck2, CheckCircle2, ClipboardList, Clock,
  Info, Lightbulb, Mail, Phone, Stethoscope, TrendingUp, User,
} from "lucide-react"
import { ActivityFeed, DrawerSection } from "@/design-system"
import type { DoctorPerformanceInsight, DoctorPerformanceRow } from "@/services/endpoints"
import { doctorPerformanceApi } from "@/services/endpoints"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"

interface DoctorDetailPanelProps {
  doctor: DoctorPerformanceRow
  activeTab: string
  apiParams: Record<string, string | number | undefined>
}

export default function DoctorDetailPanel({ doctor, activeTab, apiParams }: DoctorDetailPanelProps) {
  const params = useMemo(() => apiParams, [apiParams])

  const { data: detail, isLoading } = useQuery({
    queryKey: ["doctor-performance", "detail", doctor.id, params],
    queryFn: () => doctorPerformanceApi.detail(doctor.id, params),
    enabled: !!doctor.id,
  })

  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ["doctor-performance", "insights", doctor.id, params],
    queryFn: () => doctorPerformanceApi.insights(doctor.id, params),
    enabled: !!doctor.id,
  })

  const m = detail?.metrics ?? doctor
  const phone = detail?.phone ?? null

  if (activeTab === "overview") return <OverviewTab doctor={m} phone={phone} loading={isLoading} />
  if (activeTab === "treatments") return <TreatmentsTab doctor={m} loading={isLoading} />
  if (activeTab === "insights") return <InsightsTab insights={insightsData?.insights ?? []} loading={insightsLoading} />
  if (activeTab === "appointments") return <AppointmentsTab appointments={detail?.recent_appointments ?? []} loading={isLoading} />
  return null
}

function MetricTile({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-3 py-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" aria-hidden="true" />
        <p className="ds-caption text-[var(--ds-text-tertiary)]">{label}</p>
      </div>
      <p className="ds-body mt-1 font-semibold text-[var(--ds-text)]">{value}</p>
    </div>
  )
}

function OverviewTab({ doctor, phone, loading }: { doctor: DoctorPerformanceRow; phone: string | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]" />
        ))}
      </div>
    )
  }
  const rates: { label: string; value: string }[] = [
    { label: "Attendance rate", value: `${doctor.attendance_rate}%` },
    { label: "Retention rate", value: `${doctor.retention_rate}%` },
    { label: "Case completion", value: `${doctor.case_completion_rate}%` },
    { label: "Treatment completion", value: `${doctor.treatment_completion_rate}%` },
    { label: "Treatment acceptance", value: `${doctor.treatment_acceptance_rate}%` },
    { label: "Recall success", value: `${doctor.recall_success_rate}%` },
    { label: "No shows", value: formatIndianNumber(doctor.no_shows) },
    { label: "Avg rating", value: doctor.avg_rating != null ? `${doctor.avg_rating.toFixed(1)} / 5` : "—" },
  ]
  return (
    <>
      <DrawerSection title="This Period" description="Key clinical & financial output">
        <div className="grid grid-cols-2 gap-2">
          <MetricTile label="Revenue" value={formatIndianRupees(doctor.revenue)} icon={TrendingUp} />
          <MetricTile label="Patients seen" value={formatIndianNumber(doctor.patients_seen)} icon={User} />
          <MetricTile label="Appointments done" value={formatIndianNumber(doctor.appointments_completed)} icon={CalendarCheck2} />
          <MetricTile label="Cases written" value={formatIndianNumber(doctor.cases_created)} icon={ClipboardList} />
          <MetricTile label="Treatments done" value={formatIndianNumber(doctor.treatments_completed)} icon={Stethoscope} />
          <MetricTile label="Sittings completed" value={formatIndianNumber(doctor.sittings_completed)} icon={Activity} />
        </div>
      </DrawerSection>

      <DrawerSection title="Rates" description="Quality & engagement indicators">
        <div className="grid grid-cols-2 gap-2">
          {rates.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-3 py-2">
              <span className="ds-caption text-[var(--ds-text-tertiary)]">{r.label}</span>
              <span className="ds-body font-semibold text-[var(--ds-text)]">{r.value}</span>
            </div>
          ))}
        </div>
      </DrawerSection>

      <DrawerSection title="Contact">
        <div className="flex flex-col gap-1.5">
          <p className="ds-caption flex items-center gap-2 text-[var(--ds-text-secondary)]">
            <Mail className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" aria-hidden="true" /> {doctor.email || "—"}
          </p>
          <p className="ds-caption flex items-center gap-2 text-[var(--ds-text-secondary)]">
            <Phone className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" aria-hidden="true" /> {phone || "—"}
          </p>
        </div>
      </DrawerSection>
    </>
  )
}

function TreatmentsTab({ doctor, loading }: { doctor: DoctorPerformanceRow; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]" />
        ))}
      </div>
    )
  }
  const analytics = doctor.treatment_analytics ?? []
  const breakdown = doctor.treatment_breakdown ?? []
  return (
    <>
      <DrawerSection
        title="Treatment Analytics"
        description={`${analytics.length} treatment type(s) performed this period`}
      >
        {analytics.length === 0 ? (
          <p className="ds-body py-6 text-center text-[var(--ds-text-tertiary)]">No treatments recorded this period.</p>
        ) : (
          <div className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)]">
            <table className="ds-table w-full text-sm">
              <thead>
                <tr className="bg-[var(--ds-surface-secondary)]">
                  <th className="ds-caption px-3 py-2 text-left text-[var(--ds-text-tertiary)]">Treatment</th>
                  <th className="ds-caption px-3 py-2 text-right text-[var(--ds-text-tertiary)]">Count</th>
                  <th className="ds-caption px-3 py-2 text-right text-[var(--ds-text-tertiary)]">Done</th>
                  <th className="ds-caption px-3 py-2 text-right text-[var(--ds-text-tertiary)]">Complete</th>
                  <th className="ds-caption px-3 py-2 text-right text-[var(--ds-text-tertiary)]">Cost</th>
                  <th className="ds-caption px-3 py-2 text-right text-[var(--ds-text-tertiary)]">Paid</th>
                </tr>
              </thead>
              <tbody>
                {analytics.slice(0, 12).map((t) => (
                  <tr key={t.name} className="border-t border-[var(--ds-border)]">
                    <td className="ds-body px-3 py-2 text-[var(--ds-text)]">{t.name}</td>
                    <td className="ds-numeric ds-caption px-3 py-2 text-right text-[var(--ds-text-secondary)]">{formatIndianNumber(t.count)}</td>
                    <td className="ds-numeric ds-caption px-3 py-2 text-right text-[var(--ds-text-secondary)]">{formatIndianNumber(t.completed)}</td>
                    <td className="ds-numeric ds-caption px-3 py-2 text-right text-[var(--ds-text-secondary)]">{t.completion_rate}%</td>
                    <td className="ds-numeric ds-caption px-3 py-2 text-right text-[var(--ds-text-secondary)]">{formatIndianRupees(t.total_cost)}</td>
                    <td className="ds-numeric ds-caption px-3 py-2 text-right text-[var(--ds-text-secondary)]">{formatIndianRupees(t.total_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DrawerSection>

      {breakdown.length > 0 && (
        <DrawerSection title="Treatment Type Mix" description="Distribution across the period">
          <div className="flex flex-wrap gap-1.5">
            {breakdown.map((t) => (
              <span key={t.name} className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-2.5 py-1">
                <span className="ds-caption text-[var(--ds-text-secondary)]">{t.name}</span>
                <span className="ds-numeric ds-caption font-semibold text-[var(--ds-text)]">{formatIndianNumber(t.value)}</span>
              </span>
            ))}
          </div>
        </DrawerSection>
      )}
    </>
  )
}

const INSIGHT_ICON = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  neutral: Lightbulb,
}

const INSIGHT_TONE = {
  positive: "border-[var(--ds-success)]/40 bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  warning: "border-[var(--ds-warning)]/40 bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  info: "border-[var(--ds-info)]/40 bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  neutral: "border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]",
}

function InsightsTab({ insights, loading }: { insights: DoctorPerformanceInsight[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]" />
        ))}
      </div>
    )
  }
  if (insights.length === 0) {
    return <p className="ds-body py-8 text-center text-[var(--ds-text-tertiary)]">No insights available for this period.</p>
  }
  return (
    <DrawerSection title="AI Performance Insights" description="Generated from clinical and financial data">
      <ul className="flex flex-col gap-2">
        {insights.map((ins, i) => {
          const Icon = INSIGHT_ICON[ins.type] ?? Lightbulb
          return (
            <li
              key={`${ins.type}-${i}`}
              className={cn(
                "flex items-start gap-3 rounded-[var(--ds-radius-lg)] border px-3.5 py-3",
                INSIGHT_TONE[ins.type] ?? INSIGHT_TONE.neutral
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="ds-body text-[var(--ds-text)]">{ins.text}</p>
            </li>
          )
        })}
      </ul>
    </DrawerSection>
  )
}

function AppointmentsTab({ appointments, loading }: { appointments: { id: string; appointment_number: string; patient_name: string; appointment_date: string; appointment_time: string; status: string }[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]" />
        ))}
      </div>
    )
  }
  const items = appointments.map((a) => ({
    id: a.id,
    title: a.patient_name,
    meta: `${a.appointment_date} · ${a.appointment_time} · ${a.status} · ${a.appointment_number}`,
    icon: Clock,
    tone: (a.status === "COMPLETED" ? "success" : a.status === "CANCELLED" ? "danger" : "info") as "success" | "danger" | "info",
  }))
  return (
    <DrawerSection title="Recent Appointments" description="Latest bookings for this doctor">
      <ActivityFeed items={items} emptyTitle="No appointments this period" />
    </DrawerSection>
  )
}
