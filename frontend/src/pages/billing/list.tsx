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
import { Plus, Search, Eye, Trash2, Receipt, DollarSign, CreditCard, AlertCircle, Download, History } from "lucide-react"
import { format } from "date-fns"
import PageHeader from "@/components/layout/page-header"
import KpiCard from "@/components/layout/kpi-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
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
import { billingApi, casesApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { formatIndianRupees } from "@/lib/currency"
import type { Billing, Case, PaginatedResponse } from "@/types"
import { useAuthStore } from "@/store/authStore"

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`;
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning"> = {
  PAID: "success",
  PARTIAL: "warning",
  PENDING: "default",
  OVERDUE: "destructive",
}

interface InvoiceForm {
  case_id: string
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
  return { case_id: "", total_amount: null, paid_amount: null, payment_method: "", notes: "", discount_type: "PERCENTAGE", discount_percent: 0, discount_amount: 0, discount_reason: "" }
}

export default function BillingList() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingBilling, setDeletingBilling] = useState<Billing | null>(null)
  const [form, setForm] = useState<InvoiceForm>(getEmptyInvoiceForm)
  const [historyBilling, setHistoryBilling] = useState<Billing | null>(null)
  const { data: transactions } = useQuery({
    queryKey: ["billing", historyBilling?.id, "transactions"],
    queryFn: () => billingApi.getTransactions(historyBilling!.id),
    enabled: !!historyBilling,
  })

  const { data, isLoading } = useQuery<PaginatedResponse<Billing>>({
    queryKey: ["billings"],
    queryFn: () => billingApi.list({ page_size: 100 }),
  })

  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const { data: casesData } = useQuery<PaginatedResponse<Case>>({
    queryKey: ["cases", "dropdown"],
    queryFn: () => casesApi.list({ page_size: 200, hospital_id: currentUser?.hospital_id || undefined }),
  })

  const billings: Billing[] = useMemo(
    () => {
      if (Array.isArray(data)) return data
      return data?.items || []
    },
    [data]
  )

  const cases: Case[] = useMemo(
    () => {
      if (Array.isArray(casesData)) return casesData
      return casesData?.items || []
    },
    [casesData]
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
      addToast({ title: "Success", description: "Invoice deleted successfully", variant: "success" })
      setDeleteDialogOpen(false)
      setDeletingBilling(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || "Failed to delete invoice"
      addToast({ title: "Error", description: msg, variant: "destructive" })
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
      addToast({ title: "Success", description: "Invoice created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create invoice", variant: "destructive" })
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const total = form.total_amount ?? 0
    if (total <= 0) {
      addToast({ title: "Validation Error", description: "Total amount must be greater than 0", variant: "destructive" })
      return
    }
    const cleaned = { ...form, total_amount: total, paid_amount: form.paid_amount ?? 0 }
    createMutation.mutate(cleaned)
  }

  const downloadPdf = async (id: string) => {
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
  }

  function resetForm() {
    setForm(getEmptyInvoiceForm())
    setDialogOpen(false)
  }

  function openDialog() {
    setForm(getEmptyInvoiceForm())
    setDialogOpen(true)
  }

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
            <Button variant="ghost" size="icon" onClick={() => setHistoryBilling(row.original)} title="Payment History">
              <History className="h-4 w-4" />
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
    []
  )

  const table = useReactTable({
    data: billings,
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
      <PageHeader title="Billing" description="Manage invoices and payments">
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          title="Total Revenue"
          value={formatIndianRupees(kpis.total)}
          icon={DollarSign}
          description="All time revenue"
        />
        <KpiCard
          title="Paid Amount"
          value={formatIndianRupees(kpis.paid)}
          icon={CreditCard}
          description="Total collected"
        />
        <KpiCard
          title="Pending Amount"
          value={formatIndianRupees(kpis.pending)}
          icon={AlertCircle}
          description="Outstanding payments"
        />
      </div>

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
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : billings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <Receipt className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No invoices yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first invoice.
              </p>
              <Button className="mt-4" onClick={openDialog}>
                <Plus className="h-4 w-4" /> New Invoice
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
                        className="border-b transition-colors hover:bg-muted/50"
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
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>
              Create a new invoice for a patient.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="case">Case</Label>
                <Select
                  value={form.case_id}
                  onValueChange={(v) => setForm({ ...form, case_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select case" />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.chief_complaint} — {c.patient_name || c.patient?.full_name || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="total">Total Amount</Label>
                  <Input
                    id="total"
                    type="number"
                    placeholder="0"
                    required
                    value={form.total_amount ?? ""}
                    onChange={(e) => setForm({ ...form, total_amount: e.target.value ? Number(e.target.value) : null })}
                  />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paid">Paid Amount</Label>
                  <Input
                    id="paid"
                    type="number"
                    placeholder="0"
                    value={form.paid_amount ?? ""}
                    onChange={(e) => setForm({ ...form, paid_amount: e.target.value ? Number(e.target.value) : null })}
                  />
              </div>
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
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="0"
                      value={form.discount_percent || ""}
                      onChange={(e) => {
                        const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                        const gross = form.total_amount ?? 0
                        const amt = Math.round(gross * pct / 100 * 100) / 100
                        setForm({ ...form, discount_percent: pct, discount_amount: amt })
                      }}
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label>Discount Amount (Rs.)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={form.discount_amount || ""}
                      onChange={(e) => {
                        const gross = form.total_amount ?? 0
                        const amt = Math.min(gross, Math.max(0, Number(e.target.value) || 0))
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
                {form.discount_amount > 0 && (form.total_amount ?? 0) > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Net after discount: <span className="font-semibold text-green-600">{formatIndianRupees(Math.max(0, (form.total_amount ?? 0) - form.discount_amount))}</span>
                  </p>
                )}
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
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyBilling} onOpenChange={(o) => { if (!o) setHistoryBilling(null) }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Payment History — #{historyBilling?.id.slice(0, 8)}</DialogTitle>
            <DialogDescription>
              {historyBilling?.patient_name} · {formatIndianRupees(historyBilling?.total_amount ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-3 py-4">
            {!transactions || transactions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No payment transactions recorded yet.</p>
            ) : (
              transactions.map((txn: any) => (
                <div key={txn.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-semibold text-green-700">{formatIndianRupees(txn.amount)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {txn.payment_method || "—"}
                      {txn.notes ? ` · ${txn.notes}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(txn.created_at), "MMM dd, yyyy h:mm a")}
                  </p>
                </div>
              ))
            )}
          </div>
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
