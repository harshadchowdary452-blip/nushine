import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Plus, Eye, Edit3, Trash2, FileText, Search, IndianRupee, Clock } from "lucide-react"
import { format } from "date-fns"
import PageHeader from "@/components/layout/page-header"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { treatmentApi, casesApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import type { TreatmentPlan, Case } from "@/types"
import { useAuthStore } from "@/store/authStore"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase().replace(/_/g, "_")}`;
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>;
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const color = value >= 100 ? "bg-success" : value >= 50 ? "bg-primary" : value >= 25 ? "bg-warning" : "bg-danger";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 w-full max-w-[80px] rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

interface TreatmentForm {
  case_id: string
  treatment_name: string
  description: string
  cost: number | null
  total_sittings: number | null
  start_date: string
  expected_completion_date: string
  notes: string
}

function getEmptyTreatmentForm(): TreatmentForm {
  return { case_id: "", treatment_name: "", description: "", cost: null, total_sittings: 1, start_date: "", expected_completion_date: "", notes: "" }
}

export default function TreatmentList() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deletingPlan, setDeletingPlan] = useState<TreatmentPlan | null>(null)
  const [editingPlan, setEditingPlan] = useState<TreatmentPlan | null>(null)
  const [search, setSearch] = useState("")
  const [form, setForm] = useState<TreatmentForm>(getEmptyTreatmentForm)

  const { data, isLoading } = useQuery({
    queryKey: ["treatment-plans"],
    queryFn: () => treatmentApi.list({ page_size: 100 }),
  })

  const currentUser = useAuthStore((s) => s.user)
  const { data: casesData } = useQuery({
    queryKey: ["cases", "dropdown"],
    queryFn: () => casesApi.list({ page_size: 200, hospital_id: currentUser?.hospital_id || undefined }),
  })

  const cases: Case[] = useMemo(() => {
    if (Array.isArray(casesData)) return casesData
    return casesData?.items || []
  }, [casesData])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => treatmentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      addToast({ title: "Success", description: "Treatment plan deleted", variant: "success" })
      setDeleteDialogOpen(false)
      setDeletingPlan(null)
    },
    onError: () => {
      addToast({ title: "Error", description: "Failed to delete treatment plan", variant: "destructive" })
    },
  })

  function confirmDelete(plan: TreatmentPlan) {
    setDeletingPlan(plan)
    setDeleteDialogOpen(true)
  }

  function handleDelete() {
    if (deletingPlan) deleteMutation.mutate(deletingPlan.id)
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => treatmentApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      addToast({ title: "Success", description: "Treatment plan created", variant: "success" })
      resetForm()
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create", variant: "destructive" })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => treatmentApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      addToast({ title: "Success", description: "Treatment plan updated", variant: "success" })
      setEditDialogOpen(false)
      setEditingPlan(null)
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to update", variant: "destructive" })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => treatmentApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] })
      addToast({ title: "Success", description: "Status updated", variant: "success" })
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to update status", variant: "destructive" })
    },
  })

  function resetForm() {
    setForm(getEmptyTreatmentForm())
    setDialogOpen(false)
  }

  function openCreateDialog() {
    setForm(getEmptyTreatmentForm())
    setDialogOpen(true)
  }

  function openEditDialog(plan: TreatmentPlan) {
    setEditingPlan(plan)
    setForm({
      case_id: plan.case_id,
      treatment_name: plan.treatment_name,
      description: plan.description || "",
      cost: plan.cost,
      total_sittings: plan.total_sittings,
      start_date: plan.start_date || "",
      expected_completion_date: plan.expected_completion_date || "",
      notes: plan.notes || "",
    })
    setEditDialogOpen(true)
  }

  const plans: TreatmentPlan[] = useMemo(() => {
    let items: TreatmentPlan[] = []
    if (Array.isArray(data)) items = data
    else items = data?.items || []
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(p =>
      p.treatment_name?.toLowerCase().includes(q) ||
      p.patient_name?.toLowerCase().includes(q) ||
      p.case_number?.toLowerCase().includes(q) ||
      p.status?.toLowerCase().includes(q)
    )
  }, [data, search])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(form)) {
      if (value === null || value === "" || value === undefined) continue
      cleaned[key] = value
    }
    if (cleaned.cost === undefined) cleaned.cost = 0
    createMutation.mutate(cleaned)
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPlan) return
    const cleaned: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(form)) {
      if (value === null || value === "" || value === undefined) continue
      cleaned[key] = value
    }
    updateMutation.mutate({ id: editingPlan.id, data: cleaned })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Treatment Plans" description="Manage treatment plans">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[200px] pl-8 h-9 text-sm"
            />
          </div>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4" /> New Plan
          </Button>
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <FileText className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No treatment plans yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first treatment plan.</p>
          <Button className="mt-4" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" /> New Plan
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Treatment #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Case</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Doctor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sittings</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expected End</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-b border-border last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{plan.treatment_number || plan.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <Link to={`/treatments/${plan.id}`} className="font-medium text-text-primary hover:text-primary transition-colors">
                        {plan.treatment_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{plan.patient_name || "—"}</td>
                    <td className="px-4 py-3">
                      <Link to={`/cases/${plan.case_id}`} className="text-xs font-mono text-primary hover:underline">
                        {plan.case_number || plan.case_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{plan.doctor_name || "—"}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={plan.status}
                        onValueChange={(v) => statusMutation.mutate({ id: plan.id, status: v })}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs border-0 p-0">
                          <SelectValue>
                            <StatusBadge status={plan.status} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PLANNED">Planned</SelectItem>
                          <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                          <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                          <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-muted-foreground">
                        {plan.completed_sittings}/{plan.total_sittings}
                      </span>
                      <ProgressBar value={plan.progress} className="mt-1 justify-center" />
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatIndianRupees(plan.cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={cn("text-xs font-medium", plan.pending_amount > 0 ? "text-danger" : "text-success")}>
                        {formatIndianRupees(plan.pending_amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {plan.start_date ? format(new Date(plan.start_date), "dd MMM yy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {plan.expected_completion_date ? format(new Date(plan.expected_completion_date), "dd MMM yy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/treatments/${plan.id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(plan)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmDelete(plan)}>
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {plans.map((plan) => (
              <Link key={plan.id} to={`/treatments/${plan.id}`}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{plan.treatment_name}</p>
                          <p className="text-xs text-muted-foreground">{plan.treatment_number || plan.id.slice(0, 8)}</p>
                        </div>
                        <StatusBadge status={plan.status} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{plan.patient_name || "—"}</span>
                        <span>{formatIndianRupees(plan.cost)}</span>
                      </div>
                      <ProgressBar value={plan.progress} />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{plan.completed_sittings}/{plan.total_sittings} sittings</span>
                        <span className={cn("font-medium", plan.pending_amount > 0 ? "text-danger" : "text-success")}>
                          Pending: {formatIndianRupees(plan.pending_amount)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
            ))}
          </div>
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o) }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>New Treatment Plan</DialogTitle>
            <DialogDescription>Create a new treatment plan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="case">Case</Label>
                <Select value={form.case_id} onValueChange={(v) => setForm({ ...form, case_id: v })} required>
                  <SelectTrigger><SelectValue placeholder="Select case" /></SelectTrigger>
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
                <Label htmlFor="name">Treatment Name</Label>
                <Input id="name" value={form.treatment_name} onChange={(e) => setForm({ ...form, treatment_name: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cost">Cost</Label>
                  <Input id="cost" type="number" value={form.cost ?? ""} onChange={(e) => setForm({ ...form, cost: e.target.value ? Number(e.target.value) : null })} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sittings">Total Sittings</Label>
                  <Input id="sittings" type="number" min={1} value={form.total_sittings ?? 1} onChange={(e) => setForm({ ...form, total_sittings: e.target.value ? Number(e.target.value) : 1 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input id="start_date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end_date">Expected Completion</Label>
                  <Input id="end_date" type="date" value={form.expected_completion_date} onChange={(e) => setForm({ ...form, expected_completion_date: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-border">
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(o) => { if (!o) { setEditDialogOpen(false); setEditingPlan(null) }; setEditDialogOpen(o) }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>Edit Treatment Plan</DialogTitle>
            <DialogDescription>Update treatment plan details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Treatment Name</Label>
                <Input id="edit-name" value={form.treatment_name} onChange={(e) => setForm({ ...form, treatment_name: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input id="edit-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-cost">Cost</Label>
                  <Input id="edit-cost" type="number" value={form.cost ?? ""} onChange={(e) => setForm({ ...form, cost: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-sittings">Total Sittings</Label>
                  <Input id="edit-sittings" type="number" min={1} value={form.total_sittings ?? 1} onChange={(e) => setForm({ ...form, total_sittings: e.target.value ? Number(e.target.value) : 1 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-start">Start Date</Label>
                  <Input id="edit-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-end">Expected Completion</Label>
                  <Input id="edit-end" type="date" value={form.expected_completion_date} onChange={(e) => setForm({ ...form, expected_completion_date: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Input id="edit-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-border">
              <Button type="button" variant="outline" onClick={() => { setEditDialogOpen(false); setEditingPlan(null) }}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Treatment Plan</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deletingPlan?.treatment_name}"? This action cannot be undone.</DialogDescription>
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