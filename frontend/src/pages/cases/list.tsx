import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { motion } from "framer-motion"
import { Plus, Search, Eye, Trash2, FolderOpen, FilePlus, User as UserIcon, FileText } from "lucide-react"
import { format } from "date-fns"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
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
import { casesApi, patientsApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import type { Case, Patient, User, PaginatedResponse } from "@/types"
import { useAuthStore } from "@/store/authStore"

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`;
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  NEW: "default",
  DIAGNOSIS_PENDING: "warning",
  TREATMENT_PLANNED: "secondary",
  IN_PROGRESS: "secondary",
  FOLLOW_UP: "outline",
  COMPLETED: "success",
  CANCELLED: "destructive",
}

interface ClinicalFindingForm {
  finding_type: string
  tooth_number: string
  notes: string
}

const FINDING_TYPES = [
  "Stains", "Calculus", "Decay", "Missing Tooth", "Mobility",
  "Fracture", "Impaction", "Attrition", "Abrasion", "Sensitivity",
  "Gingivitis", "Periodontitis", "Restoration", "Crown", "Bridge",
  "Implant", "Other",
]

function getEmptyFinding(): ClinicalFindingForm {
  return { finding_type: "", tooth_number: "", notes: "" }
}

interface CaseForm {
  patient_id: string
  doctor_id: string
  chief_complaint: string
  diagnosis: string
  initial_treatment_plan: string
  notes: string
  findings: ClinicalFindingForm[]
}

function getEmptyCaseForm(): CaseForm {
  return {
    patient_id: "", doctor_id: "", chief_complaint: "", diagnosis: "",
    initial_treatment_plan: "", notes: "", findings: [],
  }
}

export default function CaseList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingCase, setDeletingCase] = useState<Case | null>(null)
  const [form, setForm] = useState<CaseForm>(getEmptyCaseForm)

  const { data, isLoading } = useQuery<PaginatedResponse<Case>>({
    queryKey: ["cases", { search: globalFilter }],
    queryFn: () => casesApi.list({ search: globalFilter, page_size: 100 }),
  })

  const currentUser = useAuthStore((s) => s.user)
  const { data: patientsData } = useQuery<PaginatedResponse<Patient>>({
    queryKey: ["patients", "dropdown"],
    queryFn: () => patientsApi.list({ page_size: 200, hospital_id: currentUser?.hospital_id || undefined }),
  })

  const { data: doctorsData } = useQuery<PaginatedResponse<User>>({
    queryKey: ["doctors", "cases-dropdown"],
    queryFn: () => doctorsApi.list({ page_size: 200, admin_group_id: currentUser?.admin_group_id || undefined }),
  })

  const patients: Patient[] = useMemo(
    () => {
      if (Array.isArray(patientsData)) return patientsData
      return patientsData?.items || []
    },
    [patientsData]
  )

  const doctors: User[] = useMemo(
    () => {
      if (Array.isArray(doctorsData)) return doctorsData
      return doctorsData?.items || []
    },
    [doctorsData]
  )

  const selectedPatient = useMemo(() => {
    if (!form.patient_id) return null
    return patients.find((p) => p.id === form.patient_id) || null
  }, [form.patient_id, patients])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => casesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Case deleted successfully", variant: "success" })
      setDeleteDialogOpen(false)
      setDeletingCase(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to delete case"
      addToast({ title: "Error", description: msg, variant: "destructive" })
    },
  })

  function confirmDelete(caseItem: Case) {
    setDeletingCase(caseItem)
    setDeleteDialogOpen(true)
  }

  function handleDelete() {
    if (deletingCase) {
      deleteMutation.mutate(deletingCase.id)
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => casesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Case created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create case", variant: "destructive" })
    },
  })

  function resetForm() {
    setForm(getEmptyCaseForm())
    setDialogOpen(false)
  }

  function openDialog() {
    setForm(getEmptyCaseForm())
    setDialogOpen(true)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) resetForm()
    setDialogOpen(open)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(form)) {
      if (value !== "" && value !== undefined) {
        cleaned[key] = value
      }
    }
    createMutation.mutate(cleaned)
  }

  const cases = useMemo(() => {
    if (!data) return []
    let items = Array.isArray(data) ? data : (data.items || [])
    if (statusFilter !== "all") {
      items = items.filter((c: Case) => c.status === statusFilter)
    }
    return items
  }, [data, statusFilter])

  const columns = useMemo<ColumnDef<Case>[]>(
    () => [
      {
        accessorKey: "patient_name",
        header: "Patient",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.patient_name || "—"}
          </span>
        ),
      },
      {
        accessorKey: "doctor_name",
        header: "Doctor",
        cell: ({ row }) => row.original.doctor_name || "—",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "created_at",
        header: "Created At",
        cell: ({ row }) =>
          format(new Date(row.original.created_at), "MMM dd, yyyy"),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/cases/${row.original.id}`)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); confirmDelete(row.original) }}>
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        ),
      },
    ],
    [navigate]
  )

  const table = useReactTable({
    data: cases,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Cases" description="Manage patient cases">
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4" /> Add Case
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search cases..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {["all", "NEW", "DIAGNOSIS_PENDING", "TREATMENT_PLANNED", "IN_PROGRESS", "FOLLOW_UP", "COMPLETED", "CANCELLED"].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all" ? "All" : s.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <FolderOpen className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No cases yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No cases have been created yet.
              </p>
              <Button className="mt-4" onClick={openDialog}>
                <FilePlus className="h-4 w-4" /> Add Case
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border mobile-card-view">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b bg-muted/50">
                        {hg.headers.map((header) => (
                          <th
                            key={header.id}
                            className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <div className="flex items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {{
                                asc: " ↑",
                                desc: " ↓",
                              }[header.column.getIsSorted() as string] ?? null}
                            </div>
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/cases/${row.original.id}`)}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const header = cell.column.columnDef.header
                          const label = typeof header === "string" ? header : cell.column.id
                          return (
                            <td key={cell.id} className="px-4 py-3" data-label={label}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          )
                        })}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Create New Case</DialogTitle>
            <DialogDescription>Fill in the details below to create a new patient case.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <DialogBody>
              {/* Patient Information */}
              <div className="space-y-3 mb-6">
                <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Patient Information
                </h4>
                <div className="grid gap-2">
                  <Label>Patient</Label>
                  <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })} required>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedPatient && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-primary-light/50 border border-primary/10 p-3 flex items-center gap-3"
                  >
                    <Avatar className="h-10 w-10 ring-2 ring-primary-light">
                      <AvatarFallback className="bg-primary text-white text-xs font-bold">
                        {getInitials(selectedPatient.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-[#F8FAFC]">{selectedPatient.full_name}</p>
                      <p className="text-xs text-gray-500 dark:text-[#94A3B8]">
                        {[selectedPatient.age && `${selectedPatient.age} yrs`, selectedPatient.gender, selectedPatient.phone].filter(Boolean).join(" | ")}
                      </p>
                    </div>
                    <StatusBadge status={selectedPatient.status} />
                  </motion.div>
                )}
              </div>

              {/* Clinical Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Clinical Details
                </h4>
                <div className="grid gap-2">
                  <Label>Doctor (optional)</Label>
                  <Select value={form.doctor_id} onValueChange={(v) => setForm({ ...form, doctor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Chief Complaint</Label>
                  <Textarea
                    value={form.chief_complaint}
                    onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })}
                    placeholder="Describe the patient's primary complaint..."
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Clinical Findings</Label>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setForm({ ...form, findings: [...form.findings, getEmptyFinding()] })}>
                      + Add Finding
                    </Button>
                  </div>
                  {form.findings.length === 0 && (
                    <p className="text-xs text-muted-foreground">No findings added yet.</p>
                  )}
                  {form.findings.map((finding, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Finding {i + 1}</span>
                        <Button type="button" variant="ghost" size="icon-sm"
                          onClick={() => setForm({
                            ...form,
                            findings: form.findings.filter((_, j) => j !== i),
                          })}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs">Finding Type</Label>
                          <Select value={finding.finding_type}
                            onValueChange={(v) => {
                              const updated = [...form.findings]
                              updated[i] = { ...updated[i], finding_type: v }
                              setForm({ ...form, findings: updated })
                            }}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {FINDING_TYPES.map((ft) => (
                                <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Tooth #</Label>
                          <Input value={finding.tooth_number}
                            onChange={(e) => {
                              const updated = [...form.findings]
                              updated[i] = { ...updated[i], tooth_number: e.target.value }
                              setForm({ ...form, findings: updated })
                            }}
                            placeholder="e.g. 16, 46" />
                        </div>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Notes</Label>
                        <Input value={finding.notes}
                            onChange={(e) => {
                              const updated = [...form.findings]
                              updated[i] = { ...updated[i], notes: e.target.value }
                              setForm({ ...form, findings: updated })
                            }}
                            placeholder="e.g. Deep proximal decay" />
                        </div>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Label>Diagnosis</Label>
                  <Textarea
                    value={form.diagnosis}
                    onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
                    placeholder="Enter initial diagnosis..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Initial Treatment Plan</Label>
                  <Textarea
                    value={form.initial_treatment_plan}
                    onChange={(e) => setForm({ ...form, initial_treatment_plan: e.target.value })}
                    placeholder={`Scaling & Root Planing\nRCT on Tooth 46\nComposite Filling on Tooth 16\nExtraction of Tooth 28`}
                    rows={4}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Additional notes or observations..."
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Case"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Case</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this case? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
