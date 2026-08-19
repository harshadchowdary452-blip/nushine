import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Plus, Search, Edit, Trash2, Activity, Tag, Clock, IndianRupee } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { treatmentTypesApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import DentalEmptyState from "@/components/ui/dental-empty-state"
import { showErrorToast } from "@/utils/showErrorToast"

interface TreatmentType {
  id: string
  hospital_id: string | null
  treatment_category_id: string | null
  name: string
  description: string | null
  estimated_duration: number | null
  default_cost: number | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

interface TypeForm {
  name: string
  description: string
  estimated_duration: string
  default_cost: string
}

function getEmptyForm(): TypeForm {
  return { name: "", description: "", estimated_duration: "", default_cost: "" }
}

export default function TreatmentTypesPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TreatmentType | null>(null)
  const [deleting, setDeleting] = useState<TreatmentType | null>(null)
  const [form, setForm] = useState<TypeForm>(getEmptyForm)

  const { data: typesData, isLoading: typesLoading } = useQuery({
    queryKey: ["treatment-types-admin"],
    queryFn: () => treatmentTypesApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: (data: TypeForm) => {
      const payload: Record<string, unknown> = { name: data.name }
      if (data.description) payload.description = data.description
      if (data.estimated_duration) payload.estimated_duration = parseInt(data.estimated_duration)
      if (data.default_cost) payload.default_cost = parseFloat(data.default_cost)
      return treatmentTypesApi.create(payload as Parameters<typeof treatmentTypesApi.create>[0])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-types-admin"] })
      addToast({ title: "Success", description: "Treatment type created successfully", variant: "success" })
      closeDialog()
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; payload: TypeForm }) => {
      const payload: Record<string, unknown> = { name: data.payload.name }
      if (data.payload.description !== undefined) payload.description = data.payload.description
      if (data.payload.estimated_duration !== undefined) payload.estimated_duration = data.payload.estimated_duration ? parseInt(data.payload.estimated_duration) : null
      if (data.payload.default_cost !== undefined) payload.default_cost = data.payload.default_cost ? parseFloat(data.payload.default_cost) : null
      return treatmentTypesApi.update(data.id, payload as Parameters<typeof treatmentTypesApi.update>[1])
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-types-admin"] })
      addToast({ title: "Success", description: "Treatment type updated successfully", variant: "success" })
      closeDialog()
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => treatmentTypesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-types-admin"] })
      addToast({ title: "Success", description: "Treatment type deleted successfully", variant: "success" })
      setDeleteDialogOpen(false)
      setDeleting(null)
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const seedMutation = useMutation({
    mutationFn: () => treatmentTypesApi.seed(),
    onSuccess: (data: { seeded: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["treatment-types-admin"] })
      addToast({
        title: "Success",
        description: data.seeded?.length ? `Seeded ${data.seeded.length} treatment types` : "All default types already exist",
        variant: "success",
      })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const types: TreatmentType[] = (typesData || []).filter((t: TreatmentType) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? t.is_active : !t.is_active)
    return matchesSearch && matchesStatus
  })

  function openCreateDialog() {
    setEditing(null)
    setForm(getEmptyForm())
    setDialogOpen(true)
  }

  function openEditDialog(tt: TreatmentType) {
    setEditing(tt)
    setForm({
      name: tt.name,
      description: tt.description || "",
      estimated_duration: tt.estimated_duration?.toString() || "",
      default_cost: tt.default_cost?.toString() || "",
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditing(null)
    setForm(getEmptyForm())
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: form })
    } else {
      createMutation.mutate(form)
    }
  }

  function confirmDelete(tt: TreatmentType) {
    setDeleting(tt)
    setDeleteDialogOpen(true)
  }

  function handleDelete() {
    if (deleting) deleteMutation.mutate(deleting.id)
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Treatment Types</h3>
          <p className="text-sm text-muted-foreground">Manage available treatment types for your hospital.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <Tag className="h-4 w-4" /> {seedMutation.isPending ? "Seeding..." : "Seed Defaults"}
          </Button>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4" /> Add Type
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search treatment types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              {["all", "active", "inactive"].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {typesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : types.length === 0 ? (
            <DentalEmptyState
              icon={Activity}
              title="No treatment types"
              description="Add treatment types or seed the defaults to get started."
              action={
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                    <Tag className="h-4 w-4" /> Seed Defaults
                  </Button>
                  <Button onClick={openCreateDialog}><Plus className="h-4 w-4" /> Add Type</Button>
                </div>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-md border mobile-card-view">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Duration (min)</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cost</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((tt) => (
                    <motion.tr
                      key={tt.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 font-medium" data-label="Name">{tt.name}</td>
                      <td className="px-4 py-3" data-label="Duration">
                        {tt.estimated_duration != null ? (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {tt.estimated_duration} min</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3" data-label="Cost">
                        {tt.default_cost != null ? (
                          <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" /> {tt.default_cost.toLocaleString()}</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" data-label="Description">
                        {tt.description || "—"}
                      </td>
                      <td className="px-4 py-3" data-label="Status">
                        <Badge variant={tt.is_active ? "success" : "secondary"}>
                          {tt.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3" data-label="Actions">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(tt)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => confirmDelete(tt)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); setDialogOpen(open) }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <DialogTitle>{editing ? "Edit Treatment Type" : "Add Treatment Type"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the treatment type details." : "Fill in the details to add a new treatment type."}
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid gap-2">
                <Label htmlFor="tt-name">Name <span className="text-red-500">*</span></Label>
                <Input
                  id="tt-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Root Canal Treatment"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="tt-duration">Duration (minutes)</Label>
                  <NumericInput
                    id="tt-duration"
                    mode="integer"
                    min={0}
                    value={form.estimated_duration}
                    onChange={(v) => setForm({ ...form, estimated_duration: v })}
                    placeholder="e.g. 30"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tt-cost">Default Cost</Label>
                  <NumericInput
                    id="tt-cost"
                    mode="decimal"
                    min={0}
                    value={form.default_cost}
                    onChange={(v) => setForm({ ...form, default_cost: v })}
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tt-desc">Description</Label>
                <Input
                  id="tt-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of this treatment type"
                />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Treatment Type</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleting?.name}"? This will deactivate the type — existing cases using it won't be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
