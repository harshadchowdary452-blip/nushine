import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { Plus, UserCog } from "lucide-react"
import { EnterpriseWorkspace, DataTable } from "@/design-system"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { consultantsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useServerFilters } from "@/hooks/useServerFilters"
import type { Consultant, PaginatedResponse } from "@/types"
import { extractDetail } from "@/types"

interface ConsultantForm {
  full_name: string
  email: string
  phone: string
  specialization: string
  license_number: string
}

function getEmptyConsultantForm(): ConsultantForm {
  return { full_name: "", email: "", phone: "", specialization: "", license_number: "" }
}

export default function ConsultantList() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ConsultantForm>(getEmptyConsultantForm)

  const {
    filters, setFilter, resetFilters, queryParams, queryKey, activeFilters,
    hasActiveFilters, page, setPage, sortField, sortDir, setSort, activeChips,
  } = useServerFilters({ defaultSort: "full_name" })

  const { data, isLoading } = useQuery<PaginatedResponse<Consultant>>({
    queryKey: ["consultants", queryKey, page],
    queryFn: () => consultantsApi.list({ ...queryParams, page, page_size: 10 }),
  })

  const createMutation = useMutation({
    mutationFn: (data: ConsultantForm) =>
      consultantsApi.create(data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultants"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      addToast({
        title: "Success",
        description: "Consultant created successfully",
        variant: "success",
      })
      resetForm()
    },
    onError: (err: unknown) => {
      addToast({
        title: "Error",
        description: extractDetail(err) || "Failed to create consultant",
        variant: "destructive",
      })
    },
  })

  function resetForm() {
    setForm(getEmptyConsultantForm())
    setDialogOpen(false)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) resetForm()
    setDialogOpen(open)
  }

  const consultants: Consultant[] = useMemo(
    () => (data?.items || data || []) as Consultant[],
    [data],
  )

  const totalCount = useMemo(() => {
    if (Array.isArray(data)) return data.length
    return data?.total ?? 0
  }, [data])

  const totalPages = useMemo(() => {
    if (Array.isArray(data)) return 1
    return data?.total_pages || data?.pages || 1
  }, [data])

  function applySavedFilters(saved: Record<string, string>) {
    resetFilters()
    for (const [k, v] of Object.entries(saved)) setFilter(k, v)
  }

  function handleSortingChange(sorting: SortingState) {
    const f = sorting[0]
    setSort(f?.id ?? "", f?.desc ? "desc" : "asc")
  }

  const columns = useMemo<ColumnDef<Consultant>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.getValue("full_name")}</span>,
      },
      {
        accessorKey: "specialization",
        header: "Specialization",
        cell: ({ row }) => row.getValue("specialization") || "—",
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => row.getValue("email") || "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.getValue("phone") || "—",
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "success" : "default"}>
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  return (
    <>
      <EnterpriseWorkspace
        title="Consultants"
        description="Manage consultants"
        headerActions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Add Consultant
          </Button>
        }
        search={{
          value: filters.search || "",
          onChange: (v) => setFilter("search", v),
          placeholder: "Search consultants...",
          ariaLabel: "Search consultants",
        }}
        filters={{
          chips: activeChips,
          activeCount: activeFilters,
          onRemoveChip: (k) => setFilter(k, ""),
          onClearAll: resetFilters,
          savedStorageKey: "consultants-list",
          savedCurrent: filters,
          onApplySaved: applySavedFilters,
        }}
        totalCount={totalCount}
        totalLabel="consultants"
      >
        <DataTable
          key={queryKey}
          columns={columns}
          data={consultants}
          loading={isLoading}
          pagination
          pageSize={10}
          manualPagination
          pageCount={totalPages}
          onPageChange={(pageIndex) => setPage(pageIndex + 1)}
          manualSorting
          initialSorting={sortField ? [{ id: sortField, desc: sortDir === "desc" }] : []}
          onSortingChange={handleSortingChange}
          emptyIcon={UserCog}
          emptyTitle={hasActiveFilters ? "No consultants match your filters" : "No consultants yet"}
          emptyDescription={hasActiveFilters ? "Try adjusting or clearing your filters." : "Add your first consultant to get started."}
          emptyAction={
            hasActiveFilters ? (
              <Button variant="outline" onClick={resetFilters}>Clear Filters</Button>
            ) : (
              <Button onClick={() => setDialogOpen(true)}>
                <UserCog className="h-4 w-4" /> Add Consultant
              </Button>
            )
          }
          mobileCard={(row) => (
            <div className="flex items-center justify-between gap-3">
              <div className="ds-min-w-0">
                <p className="ds-body font-medium text-[var(--ds-text)]">{row.full_name}</p>
                <p className="ds-caption text-[var(--ds-text-secondary)]">
                  {row.specialization || "—"} · {row.email || "—"}
                </p>
              </div>
              <Badge variant={row.is_active ? "success" : "default"} className="shrink-0">
                {row.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          )}
        />
      </EnterpriseWorkspace>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>Add Consultant</DialogTitle>
            <DialogDescription>Register a new consultant.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="specialization">Specialization</Label>
                <Select
                  value={form.specialization}
                  onValueChange={(v) => setForm({ ...form, specialization: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select specialization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORTHODONTICS">Orthodontics</SelectItem>
                    <SelectItem value="ENDODONTICS">Endodontics</SelectItem>
                    <SelectItem value="ORAL_SURGERY">Oral Surgery</SelectItem>
                    <SelectItem value="PERIODONTICS">Periodontics</SelectItem>
                    <SelectItem value="PROSTHODONTICS">Prosthodontics</SelectItem>
                    <SelectItem value="PEDIATRIC">Pediatric Dentistry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="license">License Number</Label>
                <Input
                  id="license"
                  value={form.license_number}
                  onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-[var(--ds-border-light)]">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
