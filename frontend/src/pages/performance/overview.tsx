import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import {
  Activity, BarChart3, CalendarCheck2, ClipboardCheck, IndianRupee, Star,
  TrendingUp, UserCheck, UserPlus, Users,
} from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { doctorPerformanceApi, groupsApi } from "@/services/endpoints"
import type { DoctorPerformanceOverview, DoctorPerformanceRow } from "@/services/endpoints"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"
import { DataTable, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, WidgetCard } from "@/design-system"
import {
  CommandCenter, DashboardHeader, DashboardShell, DepartmentPerformance, KpiGrid,
  downloadCSV, useDashboardFilter,
} from "@/design-system/dashboard"
import type { KpiDatum, PerformerDatum } from "@/design-system/dashboard"

export default function DoctorPerformanceOverview() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const filter = useDashboardFilter("this_month")
  const [groupId, setGroupId] = useState("")

  const isSuperAdmin = user?.role === "SUPER_ADMIN"
  const isDoctor = user?.role === "DOCTOR"

  const { data: adminGroups } = useQuery({
    queryKey: ["admin-groups", "list"],
    queryFn: () => groupsApi.list({ page_size: 100 }),
    enabled: isSuperAdmin,
    staleTime: 120000,
  })

  const apiParams = useMemo(
    () => ({
      ...filter.apiParams,
      ...(isSuperAdmin && groupId ? { group_id: groupId } : {}),
    }),
    [filter.apiParams, isSuperAdmin, groupId],
  )

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<DoctorPerformanceOverview>({
    queryKey: ["doctor-performance", "overview", user?.id, apiParams],
    queryFn: () => doctorPerformanceApi.overview(apiParams),
    staleTime: 15000,
    gcTime: 60000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  const s = data?.summary
  const deltas = data?.deltas
  const doctors: DoctorPerformanceRow[] = data?.doctors ?? []

  const openProfile = (doctorId: string) => navigate(`/performance/${doctorId}`)

  const kpiRows: KpiDatum[][] = [
    [
      {
        id: "revenue",
        title: "Revenue",
        value: formatIndianRupees(s?.revenue ?? 0),
        rawValue: s?.revenue ?? 0,
        change: deltas?.revenue_pct ?? null,
        previousLabel: filter.previousLabel,
        icon: IndianRupee,
        tone: "success",
        loading: isLoading,
      },
      {
        id: "patients-seen",
        title: "Patients Seen",
        value: formatIndianNumber(s?.patients_seen ?? 0),
        rawValue: s?.patients_seen ?? 0,
        change: deltas?.patients_pct ?? null,
        previousLabel: filter.previousLabel,
        icon: Users,
        tone: "accent",
        loading: isLoading,
      },
      {
        id: "appointments-completed",
        title: "Appointments Completed",
        value: formatIndianNumber(s?.appointments_completed ?? 0),
        rawValue: s?.appointments_completed ?? 0,
        change: deltas?.appointments_pct ?? null,
        previousLabel: filter.previousLabel,
        icon: CalendarCheck2,
        tone: "info",
        loading: isLoading,
      },
      {
        id: "avg-rating",
        title: "Average Rating",
        value: s?.avg_rating != null ? `${s.avg_rating.toFixed(1)} / 5` : "—",
        rawValue: s?.avg_rating ?? undefined,
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
        value: `${s?.attendance_rate ?? 0}%`,
        rawValue: s?.attendance_rate ?? 0,
        change: null,
        previousLabel: "Completed vs booked",
        icon: UserCheck,
        tone: "primary",
        loading: isLoading,
      },
      {
        id: "retention-rate",
        title: "Retention Rate",
        value: `${s?.retention_rate ?? 0}%`,
        rawValue: s?.retention_rate ?? 0,
        change: null,
        previousLabel: "Returning patients",
        icon: UserPlus,
        tone: "accent",
        loading: isLoading,
      },
      {
        id: "case-completion",
        title: "Case Completion",
        value: `${s?.case_completion_rate ?? 0}%`,
        rawValue: s?.case_completion_rate ?? 0,
        change: null,
        previousLabel: "Completed vs created",
        icon: ClipboardCheck,
        tone: "success",
        loading: isLoading,
      },
      {
        id: "treatment-completion",
        title: "Treatment Completion",
        value: `${s?.treatment_completion_rate ?? 0}%`,
        rawValue: s?.treatment_completion_rate ?? 0,
        change: null,
        previousLabel: "Completed vs planned",
        icon: Activity,
        tone: "info",
        loading: isLoading,
      },
    ],
  ]

  const leaderboard: PerformerDatum[] = doctors.slice(0, 6).map((d) => ({
    id: d.id,
    name: d.name,
    value: formatIndianRupees(d.revenue),
    subtitle: `${formatIndianNumber(d.treatments_completed)} treatments · ${formatIndianNumber(d.cases_created)} cases written`,
    onClick: () => openProfile(d.id),
  }))

  const columns = useMemo<ColumnDef<DoctorPerformanceRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Doctor",
        cell: ({ row }) => (
          <div className="ds-min-w-0">
            <p className="ds-body font-medium text-[var(--ds-text)]">{row.original.name}</p>
            <p className="ds-caption text-[var(--ds-text-tertiary)]">
              {row.original.designation} · {row.original.department}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "hospital_name",
        header: "Hospital",
        cell: ({ row }) => row.original.hospital_name || "—",
      },
      {
        accessorKey: "revenue",
        header: "Revenue",
        cell: ({ row }) => (
          <span className="ds-numeric font-medium text-[var(--ds-text)]">
            {formatIndianRupees(row.original.revenue)}
          </span>
        ),
      },
      {
        accessorKey: "patients_seen",
        header: "Patients",
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.patients_seen)}</span>
        ),
      },
      {
        accessorKey: "appointments_completed",
        header: "Appts",
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.appointments_completed)}</span>
        ),
      },
      {
        accessorKey: "cases_created",
        header: "Cases Written",
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.cases_created)}</span>
        ),
      },
      {
        accessorKey: "treatments_completed",
        header: "Treatments Done",
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.treatments_completed)}</span>
        ),
      },
      {
        accessorKey: "sittings_completed",
        header: "Sittings",
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.sittings_completed)}</span>
        ),
      },
      {
        accessorKey: "attendance_rate",
        header: "Attendance",
        cell: ({ row }) => `${row.original.attendance_rate}%`,
      },
      {
        accessorKey: "retention_rate",
        header: "Retention",
        cell: ({ row }) => `${row.original.retention_rate}%`,
      },
      {
        accessorKey: "avg_rating",
        header: "Rating",
        cell: ({ row }) =>
          row.original.avg_rating != null ? `${row.original.avg_rating.toFixed(1)}★` : "—",
      },
    ],
    [],
  )

  const handleExport = () => {
    const rows = doctors.map((d) => ({
      Doctor: d.name,
      Designation: d.designation,
      Department: d.department,
      Hospital: d.hospital_name || "",
      Revenue: d.revenue,
      PatientsSeen: d.patients_seen,
      CasesWritten: d.cases_created,
      TreatmentsDone: d.treatments_completed,
      SittingsCompleted: d.sittings_completed,
      AppointmentsCompleted: d.appointments_completed,
      AttendanceRate: d.attendance_rate,
      RetentionRate: d.retention_rate,
      AvgRating: d.avg_rating ?? "",
    }))
    downloadCSV(`doctor-performance-${filter.period}`, rows, Object.keys(rows[0] ?? {}))
  }

  const groupFilter = isSuperAdmin ? (
    <div className="space-y-1">
      <Label htmlFor="perf-group" className="ds-form-label text-[var(--ds-text-tertiary)]">
        Group
      </Label>
      <Select value={groupId || "all"} onValueChange={(v) => setGroupId(v === "all" ? "" : v)}>
        <SelectTrigger id="perf-group" aria-label="Group filter" className="h-9 w-[180px] text-sm">
          <SelectValue placeholder="All Groups" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Groups</SelectItem>
          {(Array.isArray(adminGroups) ? adminGroups : []).map((g: { id: string; name: string }) => (
            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : undefined

  return (
    <DashboardShell>
      <DashboardHeader
        eyebrow="Enterprise Analytics"
        title={isDoctor ? "My Performance" : "Doctor Performance & Clinical Productivity"}
        subtitle={
          isDoctor
            ? "Your clinical productivity, revenue and patient outcomes"
            : `${filter.rangeSummary} · ${formatIndianNumber(s?.doctors ?? 0)} doctor(s) in scope`
        }
        stats={[
          { label: "Revenue", value: formatIndianRupees(s?.revenue ?? 0) },
          { label: "Patients", value: formatIndianNumber(s?.patients_seen ?? 0) },
          { label: "Avg Rating", value: s?.avg_rating != null ? `${s.avg_rating.toFixed(1)} / 5` : "—" },
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
        extraFilters={groupFilter}
        onRefresh={() => void refetch()}
        refreshing={isFetching}
        onExport={handleExport}
      />

      <KpiGrid items={kpiRows[0]} cols={4} />
      <KpiGrid items={kpiRows[1]} cols={4} />

      <div className="grid gap-3 lg:grid-cols-3">
        <DepartmentPerformance
          title={isDoctor ? "My Ranking" : "Top Doctors"}
          description="Ranked by revenue for this period"
          items={leaderboard}
          loading={isLoading}
          className="lg:col-span-1"
        />
        <WidgetCard
          title="Scope Snapshot"
          description={`Aggregated across ${formatIndianNumber(s?.doctors ?? 0)} doctor(s)`}
          icon={BarChart3}
          className="lg:col-span-2"
        >
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[
                { label: "Cases created", value: formatIndianNumber(s?.cases_created ?? 0) },
                { label: "Cases completed", value: formatIndianNumber(s?.cases_completed ?? 0) },
                { label: "Active cases", value: formatIndianNumber(s?.active_cases ?? 0) },
                { label: "Treatments planned", value: formatIndianNumber(s?.treatment_plans_created ?? 0) },
                { label: "Treatments completed", value: formatIndianNumber(s?.treatments_completed ?? 0) },
                { label: "Sittings completed", value: formatIndianNumber(s?.sittings_completed ?? 0) },
                { label: "New patients", value: formatIndianNumber(s?.new_patients ?? 0) },
                { label: "Returning patients", value: formatIndianNumber(s?.returning_patients ?? 0) },
                { label: "Avg revenue / patient", value: formatIndianRupees(s?.avg_revenue_per_patient ?? 0) },
                { label: "Recall success", value: `${s?.recall_success_rate ?? 0}%` },
                { label: "Acceptance rate", value: `${s?.treatment_acceptance_rate ?? 0}%` },
                { label: "Avg revenue / appt", value: formatIndianRupees(s?.avg_revenue_per_appointment ?? 0) },
              ].map((m) => (
                <div key={m.label} className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-3 py-3">
                  <p className="ds-caption text-[var(--ds-text-tertiary)]">{m.label}</p>
                  <p className="ds-body mt-0.5 font-semibold text-[var(--ds-text)]">{m.value}</p>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>

      <WidgetCard
        title="Doctor Leaderboard"
        description={`${formatIndianNumber(doctors.length)} doctor(s) · click a row to open the profile`}
        icon={TrendingUp}
        flush
      >
        <DataTable
          columns={columns}
          data={doctors}
          loading={isLoading}
          emptyTitle="No performance data yet"
          emptyDescription="Performance metrics appear once appointments and cases are recorded."
          onRowClick={(row) => openProfile(row.id)}
        />
      </WidgetCard>
    </DashboardShell>
  )
}
