import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
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
  type ColumnFiltersState,
} from "@tanstack/react-table"
import { Plus, Search, Eye, Trash2, Receipt, DollarSign, CreditCard, AlertCircle, Download, User, ChevronLeft, ChevronRight, Phone, Hash, Calendar, CheckCircle2 } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { billingApi, patientsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import QuickExport from "@/components/ui/quick-export"
import { formatIndianRupees } from "@/lib/currency"
import { PageHeader, EmptyState, LoadingSkeleton, MetricCard, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/design-system"
import type { Billing, BillingPatientSearchResult, BillingSearchCase, CaseBillable, Patient, PaginatedResponse } from "@/types"
import { extractDetail } from "@/types"
import { useAuthStore } from "@/store/authStore"
import { useCreateParam } from "@/lib/use-create-param"

interface InvoiceItem {
  key: string
  treatment_plan_id?: string
  treatment_sitting_id?: string
  description: string
  quantity: number
  unit_price: number
}

interface InvoiceForm {
  [key: string]: unknown
  case_id: string
  patient_id: string
  items: InvoiceItem[]
  total_amount: number | null
  paid_amount: number | null
  payment_method: string
  notes: string
  discount_type: string
  discount_percent: number
  discount_amount: number
  discount_reason: string
}

function getEmptyInvoiceForm(): InvoiceForm {
  return { case_id: "", patient_id: "", items: [], total_amount: null, paid_amount: null, payment_method: "", notes: "", discount_type: "PERCENTAGE", discount_percent: 0, discount_amount: 0, discount_reason: "" }
}

interface UnbilledOutstanding {
  case_id: string
  case_number?: string | null
  patient_id: string | null
  patient_name: string | null
  op_no?: string | null
  hospital_name?: string | null
  doctor_name?: string | null
  treatment_names: string[]
  outstanding_balance: number
  payment_status?: string | null
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function BillingList() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [searchParams] = useSearchParams()
  const paymentStatusFromUrl = searchParams.get("payment_status") || ""
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    paymentStatusFromUrl ? [{ id: "payment_status", value: paymentStatusFromUrl }] : [],
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingBilling, setDeletingBilling] = useState<Billing | null>(null)
  const [form, setForm] = useState<InvoiceForm>(getEmptyInvoiceForm)
  const [wizardStep, setWizardStep] = useState<"patient" | "case" | "treatments">("patient")
  const [patientQuery, setPatientQuery] = useState("")
  const [patientResults, setPatientResults] = useState<BillingPatientSearchResult[]>([])
  const [recentPatients, setRecentPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<BillingPatientSearchResult | null>(null)
  const [selectedCase, setSelectedCase] = useState<BillingSearchCase | null>(null)
  const [pendingStartBilling, setPendingStartBilling] = useState<BillingPatientSearchResult | null>(null)
  const [caseBillable, setCaseBillable] = useState<CaseBillable | null>(null)
  const [searching, setSearching] = useState(false)
  const [caseLoading, setCaseLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useCreateParam(() => openDialog())

  const { data: unbilledData } = useQuery<{ items: UnbilledOutstanding[] }>({
    queryKey: ["billings-unbilled"],
    queryFn: () => billingApi.unbilled({ page_size: 100 }),
  })
  const unbilled: UnbilledOutstanding[] = unbilledData?.items || []

  const { data, isLoading } = useQuery<PaginatedResponse<Billing>>({
    queryKey: ["billings"],
    queryFn: () => billingApi.list({ page_size: 100 }),
  })

  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)

  const billings: Billing[] = useMemo(
    () => {
      if (Array.isArray(data)) return data
      return data?.items || []
    },
    [data]
  )

  const kpis = useMemo(() => {
    const total = billings.reduce((s, b) => s + b.total_amount, 0)
    const paid = billings.reduce((s, b) => s + b.paid_amount, 0)
    const pending = billings.reduce((s, b) => s + b.pending_amount, 0)
    return { total, paid, pending }
  }, [billings])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => billingApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billings"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "all" })
      addToast({ title: "Success", description: "Invoice deleted successfully", variant: "success" })
      setDeleteDialogOpen(false)
      setDeletingBilling(null)
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err) || "Failed to delete invoice", variant: "destructive" })
    },
  })

  function confirmDelete(billing: Billing) {
    setDeletingBilling(billing)
    setDeleteDialogOpen(true)
  }

  function handleDelete() {
    if (deletingBilling) {
      deleteMutation.mutate(deletingBilling.id)
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: InvoiceForm) => billingApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billings"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "all" })
      addToast({ title: "Success", description: "Invoice created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err) || "Failed to create invoice", variant: "destructive" })
    },
  })

  const grossTotal = useMemo(
    () => form.items.reduce((s, it) => s + (it.quantity || 1) * (it.unit_price || 0), 0),
    [form.items],
  )
  const netTotal = useMemo(() => {
    if (form.items.length > 0) {
      const discountAmt = form.discount_type === "FIXED"
        ? Math.min(form.discount_amount || 0, grossTotal)
        : grossTotal * ((form.discount_percent || 0) / 100)
      return Math.max(0, grossTotal - discountAmt)
    }
    return Math.max(0, (form.total_amount ?? 0) - (form.discount_amount ?? 0))
  }, [form.items, form.discount_type, form.discount_percent, form.discount_amount, grossTotal, form.total_amount])

  const loadRecentPatients = useCallback(async () => {
    try {
      const data = await patientsApi.list({ page_size: 5, hospital_id: currentUser?.hospital_id || undefined })
      const items = Array.isArray(data) ? data : (data as PaginatedResponse<Patient>).items || []
      setRecentPatients(items)
    } catch {
      setRecentPatients([])
    }
  }, [currentUser?.hospital_id])

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setPatientResults([])
      setActiveIndex(-1)
      loadRecentPatients()
      return
    }
    setSearching(true)
    try {
      const res = await billingApi.searchPatients({ q: q.trim(), limit: 8 })
      setPatientResults(res?.items || [])
      setActiveIndex(-1)
    } catch {
      setPatientResults([])
    } finally {
      setSearching(false)
    }
  }, [loadRecentPatients])

  useEffect(() => {
    if (dialogOpen) {
      setWizardStep("patient")
      setPatientQuery("")
      setSelectedPatient(null)
      setSelectedCase(null)
      setCaseBillable(null)
      setForm(getEmptyInvoiceForm())
      loadRecentPatients()
      setTimeout(() => searchInputRef.current?.focus(), 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(patientQuery)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [patientQuery, runSearch])

  useEffect(() => {
    if (!selectedCase) return
    setCaseLoading(true)
    setCaseBillable(null)
    billingApi
      .getCaseBillable(selectedCase.id)
      .then((res) => setCaseBillable(res as CaseBillable))
      .catch(() => setCaseBillable(null))
      .finally(() => setCaseLoading(false))
  }, [selectedCase])

  function selectPatient(patient: BillingPatientSearchResult) {
    setSelectedPatient(patient)
    setSelectedCase(null)
    setCaseBillable(null)
    setForm((f) => ({ ...f, patient_id: patient.id, case_id: "" }))
    const active = patient.active_cases || []
    if (active.length === 1) {
      setSelectedCase(active[0])
      setForm((f) => ({ ...f, case_id: active[0].id }))
      setWizardStep("treatments")
    } else if (active.length > 1) {
      setWizardStep("case")
    } else {
      setWizardStep("case")
    }
  }

  function selectCase(c: BillingSearchCase) {
    setSelectedCase(c)
    setForm((f) => ({ ...f, case_id: c.id }))
    setWizardStep("treatments")
  }

  function addItem(it: InvoiceItem) {
    setForm((f) => {
      const exists = f.items.some((x) => x.key === it.key)
      if (exists) return f
      return { ...f, items: [...f.items, it] }
    })
  }

  function removeItem(key: string) {
    setForm((f) => ({ ...f, items: f.items.filter((x) => x.key !== key) }))
  }

  function updateItemQty(key: string, quantity: number) {
    setForm((f) => ({
      ...f,
      items: f.items.map((x) => (x.key === key ? { ...x, quantity: Math.max(1, quantity) } : x)),
    }))
  }

  function handlePatientKeyDown(e: React.KeyboardEvent) {
    const list = patientResults.length > 0 ? patientResults : recentPatients
    if (list.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, list.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const idx = activeIndex === -1 ? 0 : activeIndex
      const chosen = list[idx]
      if (chosen) {
        if (patientResults.length > 0) {
          selectPatient(chosen as BillingPatientSearchResult)
        } else {
          // Recent patient from the generic list: resolve billing options on the fly
          resolveRecent(chosen as Patient)
        }
      }
    }
  }

  async function resolveRecent(p: Patient) {
    try {
      const res = await billingApi.searchPatients({ q: p.op_no || p.phone || p.full_name, limit: 5 })
      const match = (res?.items || []).find((x: BillingPatientSearchResult) => x.id === p.id) || (res?.items || [])[0]
      if (match) {
        selectPatient(match)
      } else {
        addToast({ title: "Info", description: "No active case found for this patient", variant: "default" })
      }
    } catch {
      addToast({ title: "Error", description: "Could not load patient", variant: "destructive" })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCase) {
      addToast({ title: "Validation Error", description: "Please select a case", variant: "destructive" })
      return
    }
    const payload: Record<string, unknown> = {
      case_id: selectedCase.id,
      patient_id: selectedPatient?.id,
      discount_type: form.discount_type,
      discount_percent: form.discount_percent,
      discount_amount: form.discount_amount,
      discount_reason: form.discount_reason || undefined,
      paid_amount: form.paid_amount ?? 0,
      payment_method: form.payment_method || undefined,
      notes: form.notes || undefined,
    }
    if (form.items.length > 0) {
      payload.items = form.items.map((it) => ({
        treatment_plan_id: it.treatment_plan_id || undefined,
        treatment_sitting_id: it.treatment_sitting_id || undefined,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
      }))
    } else {
      const total = form.total_amount ?? 0
      if (total <= 0) {
        addToast({ title: "Validation Error", description: "Select a treatment or enter a total amount", variant: "destructive" })
        return
      }
      payload.total_amount = total
    }
    createMutation.mutate(payload as InvoiceForm)
  }

  const downloadPdf = useCallback(async (id: string) => {
    try {
      const blob = await billingApi.getPdf(id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `invoice_${id.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      addToast({ title: "Error", description: "Failed to download PDF", variant: "destructive" })
    }
  }, [addToast])

  function resetForm() {
    setForm(getEmptyInvoiceForm())
    setSelectedPatient(null)
    setSelectedCase(null)
    setCaseBillable(null)
    setWizardStep("patient")
    setDialogOpen(false)
  }

  function openDialog() {
    setForm(getEmptyInvoiceForm())
    setDialogOpen(true)
  }

  function startBillingFor(u: UnbilledOutstanding) {
    if (!u.patient_id || !u.patient_name) return
    const billingCase: BillingSearchCase = {
      id: u.case_id,
      case_number: u.case_number,
      chief_complaint: "",
      doctor_name: u.doctor_name,
      status: "COMPLETED",
      outstanding_balance: u.outstanding_balance,
      payment_status: u.payment_status,
    }
    const patient: BillingPatientSearchResult = {
      id: u.patient_id,
      full_name: u.patient_name,
      op_no: u.op_no,
      financial_summary: {
        total_billed: 0,
        total_paid: 0,
        outstanding_balance: u.outstanding_balance,
        payment_status: u.payment_status || "UNPAID",
      },
      active_cases: [billingCase],
    }
    setPendingStartBilling(patient)
    setDialogOpen(true)
  }

  useEffect(() => {
    if (dialogOpen && pendingStartBilling) {
      selectPatient(pendingStartBilling)
      setPendingStartBilling(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, pendingStartBilling])

  function handleDialogOpenChange(open: boolean) {
    if (!open) resetForm()
    setDialogOpen(open)
  }

  const columns = useMemo<ColumnDef<Billing>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Invoice #",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            #{row.original.id.slice(0, 8)}
          </span>
        ),
      },
      {
        accessorKey: "patient_name",
        header: "Patient",
        cell: ({ row }) => row.original.patient_name || "—",
      },
      {
        accessorKey: "case_chief_complaint",
        header: "Case",
        cell: ({ row }) => {
          const complaint = row.original.case_chief_complaint
          return complaint ? (
            <span className="max-w-[120px] truncate block">{complaint}</span>
          ) : (
            "—"
          )
        },
      },
      {
        accessorKey: "total_amount",
        header: "Total",
        cell: ({ row }) => (
            <span className="font-medium">
            {formatIndianRupees(row.original.total_amount)}
          </span>
        ),
      },
      {
        accessorKey: "paid_amount",
        header: "Paid",
        cell: ({ row }) => (
            <span className="text-green-600">
            {formatIndianRupees(row.original.paid_amount)}
          </span>
        ),
      },
      {
        accessorKey: "pending_amount",
        header: "Pending",
        cell: ({ row }) => (
            <span className="text-amber-600">
            {formatIndianRupees(row.original.pending_amount)}
          </span>
        ),
      },
      {
        accessorKey: "payment_status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.payment_status} />,
      },
      {
        accessorKey: "created_at",
        header: "Date",
        cell: ({ row }) =>
          format(new Date(row.original.created_at), "MMM dd, yyyy"),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/billing/${row.original.id}`)} title="View Invoice">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => downloadPdf(row.original.id)} title="Download PDF">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => confirmDelete(row.original)} title="Delete Invoice">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        ),
      },
    ],
    [navigate, downloadPdf]
  )

  const table = useReactTable({
    data: billings,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Manage invoices and payments"
        actions={<>
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
          <QuickExport module="billings" label="billings" />
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Total Revenue" value={formatIndianRupees(kpis.total)} icon={DollarSign} />
        <MetricCard title="Paid Amount" value={formatIndianRupees(kpis.paid)} icon={CreditCard} />
        <MetricCard title="Pending Amount" value={formatIndianRupees(kpis.pending)} icon={AlertCircle} />
      </div>

      {unbilled.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-600" />
              Completed Treatments Not Invoiced ({unbilled.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {unbilled.map((u) => (
                <div key={u.case_id} className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{u.patient_name}</span>
                      {u.case_number && (
                        <span className="text-xs text-muted-foreground">{u.case_number}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {u.treatment_names.join(", ") || "Completed treatment"}
                      {u.doctor_name ? ` • Dr. ${u.doctor_name}` : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">
                    {formatIndianRupees(u.outstanding_balance)}
                  </div>
                  <Button size="sm" onClick={() => startBillingFor(u)}>
                    <Receipt className="h-3.5 w-3.5 mr-1.5" /> Start Billing
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <LoadingSkeleton rows={5} />
          ) : billings.length === 0 ? (
            <EmptyState icon={Receipt} title="No invoices yet" description="Create your first invoice."
              action={<Button onClick={openDialog}><Plus className="h-4 w-4" /> New Invoice</Button>}
            />
          ) : (
            <>
              <div className="mobile-card-view">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => (
                          <TableHead key={header.id} onClick={header.column.getToggleSortingHandler()}>
                            <div className="flex items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {{
                                asc: " ↑",
                                desc: " ↓",
                              }[header.column.getIsSorted() as string] ?? null}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
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
        <DialogContent className="sm:max-w-[720px] max-h-[92vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>
              {wizardStep === "patient" && "Search the patient by OP number, name or mobile"}
              {wizardStep === "case" && "Select the case to invoice"}
              {wizardStep === "treatments" && "Pick treatments and record payment"}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pt-4 shrink-0">
            <div className="flex items-center gap-1 text-xs">
              {(["patient", "case", "treatments"] as const).map((s, i) => {
                const order = ["patient", "case", "treatments"]
                const active = wizardStep === s
                const done = order.indexOf(wizardStep) > i
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => (done || wizardStep === "patient" ? setWizardStep(s) : undefined)}
                    className="flex items-center gap-1.5 group"
                    disabled={!done && wizardStep !== "patient" && wizardStep !== s}
                  >
                    <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold ${active ? "bg-primary text-primary-foreground" : done ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                      {done ? "✓" : i + 1}
                    </span>
                    <span className={`capitalize ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {s === "treatments" ? "Treatments" : s}
                    </span>
                    {i < 2 && <span className="mx-1 h-px w-5 bg-border" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
            {wizardStep === "patient" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={patientQuery}
                    onChange={(e) => setPatientQuery(e.target.value)}
                    onKeyDown={handlePatientKeyDown}
                    placeholder="Search by OP number, name or mobile..."
                    className="pl-10"
                  />
                </div>
                {searching ? (
                  <LoadingSkeleton rows={3} />
                ) : patientQuery.trim() ? (
                  patientResults.length === 0 ? (
                    <EmptyState icon={User} title="No patients found" description="Try a different OP number, name or mobile number." />
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {patientResults.map((p, i) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => selectPatient(p)}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors ${activeIndex === i ? "bg-muted/60" : ""}`}
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <User className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-sm">
                                <Highlight text={p.full_name} query={patientQuery} />
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                {p.op_no && (
                                  <span className="inline-flex items-center gap-1">
                                    <Hash className="h-3 w-3" /> <Highlight text={p.op_no} query={patientQuery} />
                                  </span>
                                )}
                                {p.phone && (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> <Highlight text={p.phone} query={patientQuery} />
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block text-sm">
                                <span className={`font-semibold ${(p.financial_summary?.outstanding_balance || 0) > 0 ? "text-amber-600" : "text-green-600"}`}>
                                  {formatIndianRupees(p.financial_summary?.outstanding_balance || 0)}
                                </span>
                                <span className="text-[10px] text-muted-foreground"> outstanding</span>
                              </span>
                              <span className="mt-1 block text-[10px] text-muted-foreground">
                                {(p.active_cases || []).length} active case{(p.active_cases || []).length === 1 ? "" : "s"}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Recent patients</p>
                    {recentPatients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recent patients found.</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {recentPatients.map((p, i) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => resolveRecent(p)}
                              onMouseEnter={() => setActiveIndex(i)}
                              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors ${activeIndex === i ? "bg-muted/60" : ""}`}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <User className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium text-sm truncate">{p.full_name}</span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                                  {p.op_no && (
                                    <span className="inline-flex items-center gap-1">
                                      <Hash className="h-3 w-3" /> {p.op_no}
                                    </span>
                                  )}
                                  {p.phone && (
                                    <span className="inline-flex items-center gap-1">
                                      <Phone className="h-3 w-3" /> {p.phone}
                                    </span>
                                  )}
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">Use ↑/↓ to navigate and Enter to select.</p>
              </div>
            )}

            {wizardStep === "case" && selectedPatient && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4 bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{selectedPatient.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedPatient.op_no && <span className="inline-flex items-center gap-1 mr-3"><Hash className="h-3 w-3" /> {selectedPatient.op_no}</span>}
                        {selectedPatient.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedPatient.phone}</span>}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${(selectedPatient.financial_summary?.outstanding_balance || 0) > 0 ? "text-amber-600" : "text-green-600"}`}>
                      Outstanding: {formatIndianRupees(selectedPatient.financial_summary?.outstanding_balance || 0)}
                    </span>
                  </div>
                </div>

                {(selectedPatient.active_cases || []).length === 0 ? (
                  <EmptyState icon={AlertCircle} title="No active cases" description="Every invoice must belong to a case. Create an active case for this patient first." />
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {(selectedPatient.active_cases || []).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectCase(c)}
                          className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-muted/50 transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="block font-medium text-sm truncate">{c.chief_complaint}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              {c.case_number && <span>Case: {c.case_number}</span>}
                              {c.doctor_name && <span>Dr. {c.doctor_name}</span>}
                              {c.created_at && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> {format(new Date(c.created_at), "MMM dd, yyyy")}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="shrink-0 flex items-center gap-2">
                            <StatusBadge status={c.status} />
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {wizardStep === "treatments" && (
              <div className="space-y-5">
                {caseLoading && <LoadingSkeleton rows={4} />}
                {!caseLoading && !caseBillable && (
                  <EmptyState icon={AlertCircle} title="Could not load treatments" description="Refresh and try again." />
                )}
                {!caseLoading && caseBillable && (
                  <>
                    <div className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{selectedPatient?.full_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{caseBillable.case.chief_complaint}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {caseBillable.case.case_number && <span className="mr-3">Case: {caseBillable.case.case_number}</span>}
                            {caseBillable.case.doctor_name && <span>Dr. {caseBillable.case.doctor_name}</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={caseBillable.case.payment_status || "NO_BILLING"} />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Outstanding: <span className={`font-semibold ${(caseBillable.case.outstanding_balance || 0) > 0 ? "text-amber-600" : "text-green-600"}`}>{formatIndianRupees(caseBillable.case.outstanding_balance || 0)}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {caseBillable.treatment_plans.length === 0 && (
                      <p className="text-sm text-muted-foreground">No active treatments found for this case. Enter a manual total below.</p>
                    )}

                    <div className="space-y-3">
                      {caseBillable.treatment_plans.map((plan) => {
                        const planSelected = form.items.some((it) => it.key === plan.id)
                        return (
                          <div key={plan.id} className="rounded-lg border border-border overflow-hidden">
                            <button
                              type="button"
                              onClick={() =>
                                planSelected
                                  ? removeItem(plan.id)
                                  : addItem({ key: plan.id, treatment_plan_id: plan.id, description: plan.treatment_name, quantity: 1, unit_price: plan.cost })
                              }
                              className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${planSelected ? "bg-primary/5" : ""}`}
                            >
                              <span className="flex items-center gap-3 min-w-0">
                                <CheckCircle2 className={`h-4 w-4 shrink-0 ${planSelected ? "text-primary" : "text-muted-foreground"}`} />
                                <span className="min-w-0">
                                  <span className="block font-medium text-sm truncate">{plan.treatment_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    Paid {formatIndianRupees(plan.paid_amount)} · Balance {formatIndianRupees(plan.pending_amount)}
                                  </span>
                                </span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                <StatusBadge status={plan.status} />
                                <span className="text-sm font-semibold">{formatIndianRupees(plan.cost)}</span>
                              </span>
                            </button>
                            {(plan.sittings || []).length > 0 && (
                              <ul className="border-t border-border divide-y divide-border">
                                {plan.sittings.map((s) => {
                                  const key = `sit-${s.id}`
                                  const selected = form.items.some((it) => it.key === key)
                                  const invoiced = s.invoice_status === "INVOICED"
                                  const defaultCharge = s.charge ?? (plan.cost > 0 && plan.total_sittings > 0 ? Math.round((plan.cost / plan.total_sittings) * 100) / 100 : plan.cost)
                                  return (
                                    <li key={s.id}>
                                      <button
                                        type="button"
                                        disabled={invoiced}
                                        onClick={() =>
                                          selected
                                            ? removeItem(key)
                                            : addItem({
                                                key,
                                                treatment_plan_id: plan.id,
                                                treatment_sitting_id: s.id,
                                                description: `${plan.treatment_name} — Visit #${s.sitting_number}`,
                                                quantity: 1,
                                                unit_price: defaultCharge,
                                              })
                                        }
                                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${selected ? "bg-primary/5" : ""} ${invoiced ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50"}`}
                                      >
                                        <span className="flex items-center gap-3 min-w-0">
                                          <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary" : invoiced ? "border-muted bg-muted" : "border-border"}`}>
                                            {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
                                          </span>
                                          <span className="min-w-0">
                                            <span className="block text-sm truncate">Visit #{s.sitting_number}{s.sitting_date ? ` · ${format(new Date(s.sitting_date), "MMM dd, yyyy")}` : ""}</span>
                                            <span className="text-[11px] text-muted-foreground">
                                              {invoiced ? `Invoiced · Paid ${formatIndianRupees(s.paid_amount)}` : "Not invoiced"}
                                            </span>
                                          </span>
                                        </span>
                                        <span className="text-sm font-medium shrink-0">{formatIndianRupees(defaultCharge)}</span>
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {form.items.length > 0 && (
                      <div className="rounded-lg border border-border divide-y divide-border">
                        <p className="px-4 py-2 text-xs font-medium text-muted-foreground">Selected items</p>
                        {form.items.map((it) => (
                          <div key={it.key} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">{it.description}</span>
                              <span className="text-[11px] text-muted-foreground">{formatIndianRupees(it.unit_price)} each</span>
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              <NumericInput
                                mode="integer"
                                min={1}
                                value={it.quantity}
                                onChange={(v) => updateItemQty(it.key, Number(v) || 1)}
                                className="w-16 h-8 text-sm"
                              />
                              <span className="text-sm font-semibold w-20 text-right">{formatIndianRupees(it.quantity * it.unit_price)}</span>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(it.key)} title="Remove">
                                <Trash2 className="h-4 w-4 text-danger" />
                              </Button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {form.items.length === 0 && (
                      <div className="grid gap-2">
                        <Label htmlFor="total">Total Amount (manual)</Label>
                        <NumericInput
                          id="total"
                          mode="currency"
                          prefix="₹"
                          placeholder="0"
                          value={form.total_amount ?? ""}
                          onChange={(v) => setForm({ ...form, total_amount: v ? Number(v) : null })}
                        />
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <Label className="mb-2 block text-sm font-medium">Discount</Label>
                      <div className="flex gap-2 mb-3">
                        <Button
                          type="button"
                          variant={form.discount_type === "PERCENTAGE" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setForm({ ...form, discount_type: "PERCENTAGE", discount_percent: 0, discount_amount: 0 })}
                        >
                          Percentage (%)
                        </Button>
                        <Button
                          type="button"
                          variant={form.discount_type === "FIXED" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setForm({ ...form, discount_type: "FIXED", discount_percent: 0, discount_amount: 0 })}
                        >
                          Fixed (Rs.)
                        </Button>
                      </div>
                      {form.discount_type === "PERCENTAGE" ? (
                        <div className="grid gap-2">
                          <Label>Discount %</Label>
                          <NumericInput
                            mode="percentage"
                            suffix="%"
                            min={0}
                            max={100}
                            step="0.1"
                            placeholder="0"
                            value={form.discount_percent || ""}
                            onChange={(v) => {
                              const pct = Math.min(100, Math.max(0, Number(v) || 0))
                              const gross = grossTotal > 0 ? grossTotal : form.total_amount ?? 0
                              const amt = Math.round(gross * pct / 100 * 100) / 100
                              setForm({ ...form, discount_percent: pct, discount_amount: amt })
                            }}
                          />
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Label>Discount Amount (Rs.)</Label>
                          <NumericInput
                            mode="currency"
                            prefix="₹"
                            min={0}
                            step="1"
                            placeholder="0"
                            value={form.discount_amount || ""}
                            onChange={(v) => {
                              const gross = grossTotal > 0 ? grossTotal : form.total_amount ?? 0
                              const amt = Math.min(gross, Math.max(0, Number(v) || 0))
                              const pct = gross > 0 ? Math.round(amt / gross * 100 * 100) / 100 : 0
                              setForm({ ...form, discount_amount: amt, discount_percent: pct })
                            }}
                          />
                        </div>
                      )}
                      <div className="grid gap-2 mt-3">
                        <Label>Discount Reason (optional)</Label>
                        <Input
                          value={form.discount_reason}
                          onChange={(e) => setForm({ ...form, discount_reason: e.target.value })}
                          placeholder="e.g. New patient offer"
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="paid">Paid Amount</Label>
                      <NumericInput
                        id="paid"
                        mode="currency"
                        prefix="₹"
                        placeholder="0"
                        value={form.paid_amount ?? ""}
                        onChange={(v) => setForm({ ...form, paid_amount: v ? Number(v) : null })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="method">Payment Method</Label>
                      <Select
                        value={form.payment_method}
                        onValueChange={(v) => setForm({ ...form, payment_method: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CARD">Card</SelectItem>
                          <SelectItem value="INSURANCE">Insurance</SelectItem>
                          <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      />
                    </div>

                    <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gross total</span>
                        <span>{formatIndianRupees(grossTotal > 0 ? grossTotal : (form.total_amount ?? 0))}</span>
                      </div>
                      {form.discount_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Discount</span>
                          <span className="text-green-600">- {formatIndianRupees(form.discount_amount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-semibold border-t border-border pt-1.5">
                        <span>Net total</span>
                        <span>{formatIndianRupees(netTotal)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-[var(--ds-border-light)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              {wizardStep === "case" && (
                <Button type="button" variant="ghost" onClick={() => setWizardStep("patient")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              )}
              {wizardStep === "treatments" && (
                <Button type="button" variant="ghost" onClick={() => setWizardStep("case")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              )}
            </div>
            {wizardStep === "patient" && selectedPatient && (selectedPatient.active_cases || []).length === 1 && (
              <Button type="button" variant="ghost" onClick={() => setWizardStep("treatments")}>
                Skip to treatments <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {wizardStep === "treatments" && !caseLoading && caseBillable && (
              <Button type="button" onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Create Invoice"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
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
