import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table"
import { Plus, Eye, Edit, Trash2, Users, UserPlus, SlidersHorizontal } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import SearchableSelect from "@/components/ui/searchable-select"
import { patientsApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import QuickExport from "@/components/ui/quick-export"
import { useServerFilters } from "@/hooks/useServerFilters"
import { FilterChips } from "@/components/ui/filter-bar"
import PatientFilterBar from "./filter-bar"
import { PageHeader, EmptyState, LoadingSkeleton, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/design-system"
import type { Patient, PaginatedResponse, User } from "@/types"
import { extractDetail } from "@/types"
import { useAuthStore } from "@/store/authStore"

const DATE_PRESET_KEYS = new Set(["date_preset"])

const genderBadgeVariant: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  MALE: "default", FEMALE: "success", OTHER: "secondary",
}

const SOURCE_OPTIONS = [
  "Walk-In", "Google Search", "Google Maps", "Instagram", "Facebook",
  "WhatsApp", "Website", "Referral - Existing Patient", "Referral - Doctor",
  "Referral - Clinic", "Advertisement", "Banner", "Newspaper", "YouTube",
  "Campaign", "Event", "Lead", "Other",
]

interface PatientForm {
  full_name: string; email: string; phone: string; gender: string; age: string;
  patient_source: string; source_campaign_name: string; source_campaign_id: string;
  source_campaign_date: string; address: string; medical_history: string; abha_id: string;
  height: string; weight: string; bp: string; sugar: string; spo2: string; op_no: string
}

function getEmptyForm(): PatientForm {
  return {
    full_name: "", email: "", phone: "", gender: "", age: "",
    patient_source: "", source_campaign_name: "", source_campaign_id: "",
    source_campaign_date: "", address: "", medical_history: "", abha_id: "",
    height: "", weight: "", bp: "", sugar: "", spo2: "", op_no: "",
  }
}

function stripEmptyFormFields(data: PatientForm): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== "" && value !== undefined) {
      if (key === "height" || key === "weight") cleaned[key] = Number(value)
      else cleaned[key] = value
    }
  }
  return cleaned
}

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>
}

export default function PatientList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const {
    filters, setFilter, resetFilters, queryKey, activeFilters, hasActiveFilters,
    page, setPage, sortField, sortDir, toggleSort, activeChips,
  } = useServerFilters({ defaultSort: "created_at", defaultSortDir: "desc" })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<PatientForm>(getEmptyForm)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const currentUser = useAuthStore((s) => s.user)

  const { data, isLoading } = useQuery<PaginatedResponse<Patient>>({
    queryKey: ["patients", "search", queryKey, page],
    queryFn: () => {
      const params: Record<string, string | number> = {
        page, page_size: 10,
        sort_by: sortField, sort_order: sortDir,
      }
      for (const [k, v] of Object.entries(filters)) {
        if (v !== "" && v !== undefined && !DATE_PRESET_KEYS.has(k)) params[k] = v
      }
      return patientsApi.searchAdvanced(params)
    },
    placeholderData: (prev) => prev,
  })

  const { data: doctorsData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["doctors", "filter-dropdown"],
    queryFn: () => doctorsApi.list({ page_size: 200, admin_group_id: currentUser?.admin_group_id || undefined }),
  })

  const doctors: User[] = useMemo(() => {
    if (!doctorsData) return []
    if (Array.isArray(doctorsData)) return doctorsData
    return doctorsData?.items || []
  }, [doctorsData])

  const patients: Patient[] = useMemo(() => {
    if (Array.isArray(data)) return data
    return data?.items || []
  }, [data])

  const totalCount = useMemo(() => {
    if (Array.isArray(data)) return data.length
    return data?.total || 0
  }, [data])

  const totalPages = useMemo(() => {
    if (Array.isArray(data)) return 1
    return data?.total_pages || data?.pages || 1
  }, [data])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => patientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Success", description: "Patient deleted successfully", variant: "success" })
      setDeleteDialogOpen(false); setDeletingPatient(null)
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" })
    },
  })

  function confirmDelete(patient: Patient) { setDeletingPatient(patient); setDeleteDialogOpen(true) }
  function handleDelete() { if (deletingPatient) deleteMutation.mutate(deletingPatient.id) }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => patientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Success", description: "Patient created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" })
    },
  })

  function resetForm() { setForm(getEmptyForm()); setDialogOpen(false) }
  function openDialog() { setForm(getEmptyForm()); setDialogOpen(true) }
  function handleDialogOpenChange(open: boolean) { if (!open) resetForm(); setDialogOpen(open) }

  const columns = useMemo<ColumnDef<Patient>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: () => (
          <button onClick={() => toggleSort("full_name")} className="flex items-center gap-1 hover:text-foreground">
            Name {sortField === "full_name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
        ),
        cell: ({ row }) => <span className="font-medium">{row.getValue("full_name")}</span>,
      },
      {
        accessorKey: "gender",
        header: "Gender",
        cell: ({ row }) => {
          const gender = row.getValue("gender") as string
          return gender ? <Badge variant={genderBadgeVariant[gender] || "secondary"}>{gender}</Badge> : <span className="text-muted-foreground">—</span>
        },
      },
      {
        accessorKey: "status",
        header: () => (
          <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-foreground">
            Status {sortField === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
        ),
        cell: ({ row }) => {
          const status = row.getValue("status") as string
          return status ? <StatusBadge status={status} /> : <span className="text-muted-foreground">—</span>
        },
      },
      {
        accessorKey: "age",
        header: "Age",
        cell: ({ row }) => row.getValue("age") ?? "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.getValue("phone") ?? "—",
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => row.getValue("email") ?? "—",
      },
      {
        accessorKey: "created_at",
        header: () => (
          <button onClick={() => toggleSort("created_at")} className="flex items-center gap-1 hover:text-foreground">
            Created {sortField === "created_at" ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
        ),
        cell: ({ row }) => {
          const val = row.getValue("created_at") as string
          return val ? format(new Date(val), "MMM dd, yyyy") : "—"
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/patients/${row.original.id}`)}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); confirmDelete(row.original) }}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        ),
      },
    ],
    [navigate, sortField, sortDir, toggleSort]
  )

  const table = useReactTable({
    data: patients,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.patient_source) {
      addToast({ title: "Validation Error", description: "Please select how the patient heard about us", variant: "destructive" })
      return
    }
    createMutation.mutate(stripEmptyFormFields(form))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Patients" description="Manage patient records"
        actions={<>
          {currentUser?.role !== "DOCTOR" && (
            <Button onClick={openDialog}><Plus className="h-4 w-4" /> Add Patient</Button>
          )}
          <QuickExport module="patients" label="patients" />
        </>}
      />

      <Card>
        <CardContent className="p-6">
          {/* Mobile filter trigger */}
          <div className="lg:hidden mb-4">
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filters {activeFilters > 0 && `(${activeFilters})`}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] sm:w-[360px] p-0">
                <SheetHeader className="p-4 pb-2 border-b">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="p-4 overflow-y-auto h-[calc(100%-60px)]">
                  <PatientFilterBar
                    filters={filters} setFilter={setFilter} resetFilters={resetFilters}
                    activeCount={activeFilters} doctors={doctors}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop filter bar */}
          <div className="hidden lg:block mb-4">
            <PatientFilterBar
              filters={filters} setFilter={setFilter} resetFilters={resetFilters}
              activeCount={activeFilters} doctors={doctors}
            />
          </div>

          {/* Active filter chips */}
          <div className="mb-4">
            <FilterChips chips={activeChips} onRemove={(k) => setFilter(k, "")} onClearAll={resetFilters} />
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {totalCount} patient{totalCount !== 1 ? "s" : ""} found
            </p>
          </div>

          {isLoading ? (
            <LoadingSkeleton rows={5} />
          ) : patients.length === 0 ? (
            <EmptyState
              icon={Users}
              title={hasActiveFilters ? "No patients match your filters" : "No patients yet"}
              description={hasActiveFilters ? "Try adjusting or clearing your filters." : "Begin your patient journey by registering the first patient in your dental practice."}
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={resetFilters}>Clear Filters</Button>
                ) : currentUser?.role !== "DOCTOR" ? (
                  <Button onClick={openDialog}><UserPlus className="h-4 w-4" /> Add Patient</Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="mobile-card-view">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => (
                          <TableHead key={header.id}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/patients/${row.original.id}`)}>
                        {row.getVisibleCells().map((cell) => {
                          const header = cell.column.columnDef.header
                          const label = typeof header === "string" ? header : cell.column.id
                          return (
                            <TableCell key={cell.id} data-label={label}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} ({totalCount} total)
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>Add Patient</DialogTitle>
            <DialogDescription>Fill in the details to register a new patient.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="gender">Gender</Label>
                  <select id="gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="age">Age</Label>
                  <NumericInput id="age" mode="integer" min={0} max={150} value={form.age} onChange={(v) => setForm({ ...form, age: v })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="source">How Did You Hear About Us?</Label>
                <SearchableSelect value={form.patient_source} onValueChange={(v) => setForm({ ...form, patient_source: v })}
                  options={SOURCE_OPTIONS} placeholder="Search or select source..." />
              </div>
              {form.patient_source === "Campaign" && (
                <div className="grid grid-cols-3 gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="grid gap-1">
                    <Label htmlFor="campaign_name" className="text-xs">Campaign Name</Label>
                    <Input id="campaign_name" className="h-8 text-xs" placeholder="Campaign name"
                      value={form.source_campaign_name} onChange={(e) => setForm({ ...form, source_campaign_name: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="campaign_id" className="text-xs">Campaign ID</Label>
                    <Input id="campaign_id" className="h-8 text-xs" placeholder="Campaign ID"
                      value={form.source_campaign_id} onChange={(e) => setForm({ ...form, source_campaign_id: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="campaign_date" className="text-xs">Campaign Date</Label>
                    <Input id="campaign_date" type="date" className="h-8 text-xs"
                      value={form.source_campaign_date} onChange={(e) => setForm({ ...form, source_campaign_date: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="op_no">OP No.</Label>
                  <Input id="op_no" value={form.op_no} onChange={(e) => setForm({ ...form, op_no: e.target.value })} placeholder="e.g. OP-2024-001" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="abha_id">ABHA ID</Label>
                  <Input id="abha_id" value={form.abha_id} onChange={(e) => setForm({ ...form, abha_id: e.target.value })} placeholder="14-digit ABHA number" maxLength={20} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="medical_history">Medical History</Label>
                <Textarea id="medical_history" value={form.medical_history} onChange={(e) => setForm({ ...form, medical_history: e.target.value })} placeholder="Past medical history, allergies, medications..." />
              </div>
              <div className="border-t pt-4 mt-2">
                <p className="text-xs font-semibold text-muted-foreground mb-3">Vitals</p>
                <div className="grid grid-cols-5 gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="height" className="text-xs">Height (cm)</Label>
                    <NumericInput id="height" mode="decimal" decimalPlaces={1} suffix="cm" className="h-8 text-xs" value={form.height} onChange={(v) => setForm({ ...form, height: v })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="weight" className="text-xs">Weight (kg)</Label>
                    <NumericInput id="weight" mode="decimal" decimalPlaces={1} suffix="kg" className="h-8 text-xs" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="bp" className="text-xs">BP</Label>
                    <Input id="bp" className="h-8 text-xs" placeholder="120/80" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="sugar" className="text-xs">Sugar</Label>
                    <Input id="sugar" className="h-8 text-xs" placeholder="mg/dL" value={form.sugar} onChange={(e) => setForm({ ...form, sugar: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="spo2" className="text-xs">SpO2 (%)</Label>
                    <NumericInput id="spo2" mode="decimal" decimalPlaces={1} suffix="%" className="h-8 text-xs" placeholder="98" value={form.spo2} onChange={(v) => setForm({ ...form, spo2: v })} />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Patient</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deletingPatient?.full_name}"? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
