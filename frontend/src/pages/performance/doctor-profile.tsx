import { useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import {
  Activity, ArrowLeft, CalendarCheck2, ClipboardCheck, FolderOpen, IndianRupee,
  Star, UserCheck, UserPlus, Users,
} from "lucide-react"
import { doctorPerformanceApi } from "@/services/endpoints"
import type { DoctorPerformanceDetail } from "@/services/endpoints"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"
import { Button, DataTable, StatusBadge, WidgetCard } from "@/design-system"
import {
  CommandCenter, DashboardChart, DashboardHeader, DashboardShell, DonutChart, KpiGrid,
  downloadCSV, useDashboardFilter,
} from "@/design-system/dashboard"
import type { KpiDatum } from "@/design-system/dashboard"

interface RecentAppointment {
  id: string
  appointment_number: string
  patient_name: string
  appointment_date: string
  appointment_time: string
  status: string
}

export default function DoctorPerformanceProfile() {
  const { doctorId = "" } = useParams()
  const navigate = useNavigate()
  const filter = useDashboardFilter("this_month")

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<DoctorPerformanceDetail>({
    queryKey: ["doctor-performance", "detail", doctorId, filter.apiParams],
    queryFn: () => doctorPerformanceApi.detail(doctorId, filter.apiParams),
    staleTime: 15000,
    gcTime: 60000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  const m = data?.metrics

  const kpiRows: KpiDatum[][] = [
    [
      {
        id: "revenue",
        title: "Revenue",
        value: formatIndianRupees(m?.revenue ?? 0),
        rawValue: m?.revenue ?? 0,
        change: null,
        previousLabel: filter.label,
        icon: IndianRupee,
        tone: "success",
        loading: isLoading,
      },
      {
        id: "patients-seen",
        title: "Patients Seen",
        value: formatIndianNumber(m?.patients_seen ?? 0),
        rawValue: m?.patients_seen ?? 0,
        change: null,
        previousLabel: filter.label,
        icon: Users,
        tone: "accent",
        loading: isLoading,
      },
      {
        id: "appointments",
        title: "Appointments",
        value: formatIndianNumber(m?.appointments_total ?? 0),
        rawValue: m?.appointments_total ?? 0,
        change: null,
        previousLabel: `${formatIndianNumber(m?.appointments_completed ?? 0)} completed`,
        icon: CalendarCheck2,
        tone: "info",
        loading: isLoading,
      },
      {
        id: "avg-rating",
        title: "Average Rating",
        value: m?.avg_rating != null ? `${m.avg_rating.toFixed(1)} / 5` : "—",
        rawValue: m?.avg_rating ?? undefined,
        change: null,
        previousLabel: "Patient feedback",
        icon: Star,
        tone: "warning",
        loading: isLoading,
      },
    ],
    [
      {
        id: "attendance-rate",
        title: "Attendance Rate",
        value: `${m?.attendance_rate ?? 0}%`,
        rawValue: m?.attendance_rate ?? 0,
        change: null,
        previousLabel: "Completed vs booked",
        icon: UserCheck,
        tone: "primary",
        loading: isLoading,
      },
      {
        id: "retention-rate",
        title: "Retention Rate",
        value: `${m?.retention_rate ?? 0}%`,
        rawValue: m?.retention_rate ?? 0,
        change: null,
        previousLabel: "Returning patients",
        icon: UserPlus,
        tone: "accent",
        loading: isLoading,
      },
      {
        id: "case-completion",
        title: "Case Completion",
        value: `${m?.case_completion_rate ?? 0}%`,
        rawValue: m?.case_completion_rate ?? 0,
        change: null,
        previousLabel: "Completed vs created",
        icon: ClipboardCheck,
        tone: "success",
        loading: isLoading,
      },
      {
        id: "recall-success",
        title: "Recall Success",
        value: `${m?.recall_success_rate ?? 0}%`,
        rawValue: m?.recall_success_rate ?? 0,
        change: null,
        previousLabel: "Completed vs lost follow-ups",
        icon: Activity,
        tone: "info",
        loading: isLoading,
      },
    ],
  ]

  const snapshot: Array<{ label: string; value: string }> = [
    { label: "Cases created", value: formatIndianNumber(m?.cases_created ?? 0) },
    { label: "Cases completed", value: formatIndianNumber(m?.cases_completed ?? 0) },
    { label: "Active cases", value: formatIndianNumber(m?.active_cases ?? 0) },
    { label: "Treatments planned", value: formatIndianNumber(m?.treatment_plans_created ?? 0) },
    { label: "Treatments completed", value: formatIndianNumber(m?.treatments_completed ?? 0) },
    { label: "Sittings completed", value: formatIndianNumber(m?.sittings_completed ?? 0) },
    { label: "New patients", value: formatIndianNumber(m?.new_patients ?? 0) },
    { label: "Returning patients", value: formatIndianNumber(m?.returning_patients ?? 0) },
    { label: "Avg revenue / patient", value: formatIndianRupees(m?.avg_revenue_per_patient ?? 0) },
    { label: "Avg revenue / appt", value: formatIndianRupees(m?.avg_revenue_per_appointment ?? 0) },
    { label: "Acceptance rate", value: `${m?.treatment_acceptance_rate ?? 0}%` },
    { label: "Treatment completion", value: `${m?.treatment_completion_rate ?? 0}%` },
  ]

  const recentAppointments: RecentAppointment[] = useMemo(
    () => (data?.recent_appointments ?? []) as RecentAppointment[],
    [data],
  )

  const columns = useMemo<ColumnDef<RecentAppointment>[]>(
    () => [
      {
        accessorKey: "appointment_number",
        header: "No.",
        cell: ({ row }) => (
          <span className="ds-numeric text-[var(--ds-text-secondary)]">{row.original.appointment_number}</span>
        ),
      },
      {
        accessorKey: "patient_name",
        header: "Patient",
        cell: ({ row }) => <span className="font-medium text-[var(--ds-text)]">{row.original.patient_name}</span>,
      },
      {
        accessorKey: "appointment_date",
        header: "Date",
        cell: ({ row }) => (
          <span className="ds-numeric text-[var(--ds-text-secondary)]">
            {row.original.appointment_date} · {row.original.appointment_time}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  )

  const handleExport = () => {
    const rows = [
      { Metric: "Revenue", Value: m?.revenue ?? 0 },
      { Metric: "Patients seen", Value: m?.patients_seen ?? 0 },
      { Metric: "Appointments", Value: m?.appointments_total ?? 0 },
      { Metric: "Appointments completed", Value: m?.appointments_completed ?? 0 },
      { Metric: "Attendance rate", Value: m?.attendance_rate ?? 0 },
      { Metric: "Retention rate", Value: m?.retention_rate ?? 0 },
      { Metric: "Case completion rate", Value: m?.case_completion_rate ?? 0 },
      { Metric: "Treatment completion rate", Value: m?.treatment_completion_rate ?? 0 },
      { Metric: "Recall success rate", Value: m?.recall_success_rate ?? 0 },
      { Metric: "Avg rating", Value: m?.avg_rating ?? "" },
    ]
    downloadCSV(`doctor-performance-${data?.name ?? doctorId}-${filter.period}`, rows, ["Metric", "Value"])
  }

  return (
    <DashboardShell>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/performance")} aria-label="Back to performance overview">
          <ArrowLeft className="h-4 w-4" /> Overview
        </Button>
      </div>

      <DashboardHeader
        eyebrow="Doctor Performance Profile"
        title={isLoading && !data ? "Loading doctor..." : (data?.name ?? "Doctor")}
        subtitle={
          data
            ? `${data.designation} · ${data.department}`
            : undefined
        }
        stats={[
          { label: "Revenue", value: formatIndianRupees(m?.revenue ?? 0) },
          { label: "Patients", value: formatIndianNumber(m?.patients_seen ?? 0) },
          { label: "Rating", value: m?.avg_rating != null ? `${m.avg_rating.toFixed(1)} / 5` : "—" },
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
        onRefresh={() => void refetch()}
        refreshing={isFetching}
        onExport={handleExport}
      />

      <KpiGrid items={kpiRows[0]} cols={4} />
      <KpiGrid items={kpiRows[1]} cols={4} />

      <WidgetCard
        title="Clinical Snapshot"
        description={`Performance metrics for ${filter.label.toLowerCase()}`}
        icon={FolderOpen}
      >
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {snapshot.map((s) => (
              <div key={s.label} className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-3 py-3">
                <p className="ds-caption text-[var(--ds-text-tertiary)]">{s.label}</p>
                <p className="ds-body mt-0.5 font-semibold text-[var(--ds-text)]">{s.value}</p>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>

      <div className="grid gap-3 lg:grid-cols-2">
        <DashboardChart
          title="Revenue Trend"
          description="Payments recorded on this doctor's cases (rolling 12 months)"
          data={(data?.revenue_trend ?? []).map((t) => ({ month: t.month, revenue: t.revenue }))}
          xKey="month"
          series={[{ dataKey: "revenue", name: "Revenue", color: "var(--ds-chart-1)", type: "area" }]}
          loading={isLoading}
          valueFormatter={formatIndianRupees}
        />
        <DashboardChart
          title="Appointment Trend"
          description="Appointments booked per month (rolling 12 months)"
          data={(data?.appointment_trend ?? []).map((t) => ({ month: t.month, n: t.n }))}
          xKey="month"
          series={[{ dataKey: "n", name: "Appointments", color: "var(--ds-chart-4)", type: "bar" }]}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DonutChart
          title="Top Treatments"
          description="Most common planned treatments on this doctor's cases"
          data={(data?.treatment_breakdown ?? []).map((t) => ({ name: t.name, value: t.value }))}
          loading={isLoading}
        />
        <WidgetCard
          title="Period Summary"
          description="Scope summary for this doctor"
          icon={Activity}
        >
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {[
                { label: "Revenue", value: formatIndianRupees(data?.summary?.revenue ?? 0) },
                { label: "Patients seen", value: formatIndianNumber(data?.summary?.patients_seen ?? 0) },
                { label: "Appointments", value: formatIndianNumber(data?.summary?.appointments_total ?? 0) },
                { label: "Cases created", value: formatIndianNumber(data?.summary?.cases_created ?? 0) },
                { label: "Sittings completed", value: formatIndianNumber(data?.summary?.sittings_completed ?? 0) },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-3 py-2.5">
                  <p className="ds-body text-[var(--ds-text-secondary)]">{row.label}</p>
                  <p className="ds-body font-semibold text-[var(--ds-text)]">{row.value}</p>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>

      <WidgetCard
        title="Recent Appointments"
        description="Latest five appointments for this doctor"
        icon={CalendarCheck2}
        flush
      >
        <DataTable
          columns={columns}
          data={recentAppointments}
          loading={isLoading}
          emptyTitle="No recent appointments"
          emptyDescription="Appointments will appear here once scheduled."
        />
      </WidgetCard>
    </DashboardShell>
  )
}
