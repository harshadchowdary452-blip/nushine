import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { Activity, CalendarCheck2, Sparkles, Stethoscope, UserCog } from "lucide-react"
import { useAuthStore } from "@/store/authStore"
import { doctorPerformanceApi, groupsApi } from "@/services/endpoints"
import type { DoctorPerformanceOverview, DoctorPerformanceRow } from "@/services/endpoints"
import { formatIndianNumber, formatIndianRupees } from "@/lib/currency"
import { useServerFilters } from "@/hooks/useServerFilters"
import { Avatar, AvatarFallback, Button, DataTable, EnterpriseWorkspace, QuickExport, StatusBadge } from "@/design-system"
import { DrawerStatusPill } from "@/design-system"
import type { DetailDrawerTab } from "@/design-system"
import PerformanceFilterBar from "./filter-bar"
import DoctorDetailPanel from "./doctor-drawer"

const PAGE_SIZE = 25

const DOCTOR_DRAWER_TABS: DetailDrawerTab[] = [
  { key: "overview", label: "Overview", icon: Activity },
  { key: "treatments", label: "Treatments", icon: Stethoscope },
  { key: "insights", label: "Insights", icon: Sparkles },
  { key: "appointments", label: "Appointments", icon: CalendarCheck2 },
]

export default function DoctorPerformanceOverview() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const isSuperAdmin = user?.role === "SUPER_ADMIN"
  const isDoctor = user?.role === "DOCTOR"

  const {
    filters, setFilter, resetFilters, queryKey, activeChips, activeFilters,
    page, setPage, sortField, sortDir, setSort,
  } = useServerFilters({ defaultSort: "revenue", defaultSortDir: "desc" })

  const { data: adminGroups } = useQuery({
    queryKey: ["admin-groups", "list"],
    queryFn: () => groupsApi.list({ page_size: 100 }),
    enabled: isSuperAdmin,
    staleTime: 120000,
  })

  const period = filters.period || "this_month"

  const apiParams = useMemo<Record<string, string | number | undefined>>(
    () => {
      const params: Record<string, string | number | undefined> = {
        period,
        sort_by: sortField || "revenue",
        sort_order: sortDir,
        page,
        page_size: PAGE_SIZE,
      }
      if (period === "custom" && filters.start_date) params.start_date = filters.start_date
      if (period === "custom" && filters.end_date) params.end_date = filters.end_date
      if (filters.department) params.department = filters.department
      if (filters.group_id) params.group_id = filters.group_id
      if (filters.search) params.search = filters.search
      return params
    },
    [period, filters, sortField, sortDir, page],
  )

  const { data, isLoading } = useQuery<DoctorPerformanceOverview>({
    queryKey: ["doctor-performance", "overview", user?.id, queryKey, page, sortField, sortDir],
    queryFn: () => doctorPerformanceApi.overview(apiParams),
    staleTime: 15000,
    gcTime: 60000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  const doctors: DoctorPerformanceRow[] = data?.doctors ?? []

  const [quickViewId, setQuickViewId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const quickViewDoctor = doctors.find((d) => d.id === quickViewId) ?? null

  const columns = useMemo<ColumnDef<DoctorPerformanceRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Doctor",
        enableSorting: true,
        cell: ({ row }) => {
          const initials = (row.original.name || "?")
            .split(" ")
            .map((p) => p[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase()
          return (
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="ds-min-w-0">
                <p className="ds-body font-medium text-[var(--ds-text)]">{row.original.name}</p>
                <p className="ds-caption text-[var(--ds-text-tertiary)]">
                  {row.original.designation} · {row.original.department}
                </p>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "is_active",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.is_active ? "ACTIVE" : "INACTIVE"}
            showDot
          />
        ),
      },
      {
        accessorKey: "revenue",
        header: "Revenue",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="ds-numeric font-medium text-[var(--ds-text)]">
            {formatIndianRupees(row.original.revenue)}
          </span>
        ),
      },
      {
        accessorKey: "patients_seen",
        header: "Patients",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.patients_seen)}</span>
        ),
      },
      {
        accessorKey: "appointments_completed",
        header: "Appointments",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.appointments_completed)}</span>
        ),
      },
      {
        accessorKey: "cases_created",
        header: "Cases",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.cases_created)}</span>
        ),
      },
      {
        accessorKey: "treatments_completed",
        header: "Treatments",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.treatments_completed)}</span>
        ),
      },
      {
        accessorKey: "attendance_rate",
        header: "Attendance",
        enableSorting: true,
        cell: ({ row }) => `${row.original.attendance_rate}%`,
      },
      {
        accessorKey: "no_shows",
        header: "No-Shows",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianNumber(row.original.no_shows)}</span>
        ),
      },
      {
        accessorKey: "outstanding_amount",
        header: "Outstanding",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="ds-numeric">{formatIndianRupees(row.original.outstanding_amount)}</span>
        ),
      },
      {
        accessorKey: "avg_rating",
        header: "Rating",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.avg_rating != null ? `${row.original.avg_rating.toFixed(1)}★` : "—",
      },
    ],
    [],
  )

  function handleSortingChange(sorting: SortingState) {
    const f = sorting[0]
    setSort(f?.id ?? "", f?.desc ? "desc" : "asc")
  }

  function applySavedFilters(saved: Record<string, string>) {
    resetFilters()
    for (const [k, v] of Object.entries(saved)) setFilter(k, v)
  }

  const quickView = quickViewDoctor
    ? {
        open: true,
        onClose: () => setQuickViewId(null),
        title: quickViewDoctor.name,
        subtitle: `${quickViewDoctor.designation} · ${quickViewDoctor.department}`,
        eyebrow: "Doctor Profile",
        statusPill: (
          <DrawerStatusPill tone={quickViewDoctor.is_active ? "success" : "neutral"}>
            {quickViewDoctor.is_active ? "Active" : "Inactive"}
          </DrawerStatusPill>
        ),
        tabs: DOCTOR_DRAWER_TABS,
        activeTab,
        onTabChange: setActiveTab,
        openLabel: "Open full profile",
        onOpenFull: () => {
          navigate(`/performance/${quickViewDoctor.id}`)
          setQuickViewId(null)
        },
        children: (
          <DoctorDetailPanel
            doctor={quickViewDoctor}
            activeTab={activeTab}
            apiParams={apiParams}
          />
        ),
      }
    : undefined

  return (
    <EnterpriseWorkspace
      title={isDoctor ? "My Performance" : "Doctor Performance & Clinical Productivity"}
      description={`${period} · ${formatIndianNumber(data?.total_doctors ?? 0)} doctor(s) in scope`}
      eyebrow="Enterprise Analytics"
      search={{
        value: filters.search || "",
        onChange: (v) => setFilter("search", v),
        placeholder: "Search doctors…",
        ariaLabel: "Search doctors",
      }}
      filters={{
        fields: (
          <PerformanceFilterBar
            filters={filters}
            setFilter={setFilter}
            resetFilters={resetFilters}
            activeCount={activeFilters}
            departments={data?.departments ?? []}
            adminGroups={Array.isArray(adminGroups) ? (adminGroups as { id: string; name: string }[]) : []}
          />
        ),
        chips: activeChips,
        activeCount: activeFilters,
        onRemoveChip: (k) => setFilter(k, ""),
        onClearAll: resetFilters,
        savedStorageKey: "doctor-performance-list",
        savedCurrent: filters,
        onApplySaved: applySavedFilters,
      }}
      toolbarActions={
        <QuickExport
          module="doctor-performance"
          label="doctor-performance"
          period={period}
          startDate={filters.start_date}
          endDate={filters.end_date}
        />
      }
      totalCount={data?.total_doctors}
      totalLabel="doctor(s)"
      quickView={quickView}
    >
      <DataTable
        key={queryKey}
        columns={columns}
        data={doctors}
        loading={isLoading}
        manualSorting
        initialSorting={sortField ? [{ id: sortField, desc: sortDir === "desc" }] : []}
        onSortingChange={handleSortingChange}
        manualPagination
        pagination
        pageSize={PAGE_SIZE}
        pageCount={data ? Math.max(1, Math.ceil((data.total_doctors ?? 0) / PAGE_SIZE)) : 1}
        onPageChange={(pageIndex) => setPage(pageIndex + 1)}
        onRowClick={(row) => {
          setActiveTab("overview")
          setQuickViewId(row.id)
        }}
        emptyIcon={isDoctor ? Activity : UserCog}
        emptyTitle={activeFilters > 0 ? "No doctors match your filters" : "No performance data yet"}
        emptyDescription={
          activeFilters > 0
            ? "Try adjusting or clearing the active filters."
            : "Performance metrics appear once appointments and cases are recorded."
        }
        emptyAction={
          activeFilters > 0 ? (
            <Button variant="outline" onClick={resetFilters}>Clear Filters</Button>
          ) : undefined
        }
        mobileCard={(row) => (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="ds-min-w-0">
              <p className="ds-body font-medium text-[var(--ds-text)]">{row.name}</p>
              <p className="ds-caption text-[var(--ds-text-tertiary)]">
                {formatIndianRupees(row.revenue)} · {formatIndianNumber(row.treatments_completed)} treatments
              </p>
            </div>
            <Stethoscope className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" aria-hidden="true" />
          </div>
        )}
      />
    </EnterpriseWorkspace>
  )
}
