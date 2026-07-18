import { useState, useMemo } from "react"
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
import { Plus, Search, Eye, Edit, UserCog } from "lucide-react"
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
import { consultantsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
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
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ConsultantForm>(getEmptyConsultantForm)

  const { data, isLoading } = useQuery<PaginatedResponse<Consultant>>({
    queryKey: ["consultants", { search: globalFilter }],
    queryFn: () => consultantsApi.list({ search: globalFilter, page_size: 100 }),
  })

  const createMutation = useMutation({
    mutationFn: (data: ConsultantForm) => consultantsApi.create(data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultants"] })
      queryClient.invalidateQueries({ queryKey: ["dash"] })
      addToast({ title: "Success", description: "Consultant created successfully", variant: "success" })
      resetForm()
    },
    onError: (err: unknown) => {
      addToast({ title: "Error", description: extractDetail(err) || "Failed to create consultant", variant: "destructive" })
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
    [data]
  )

  const columns = useMemo<ColumnDef<Consultant>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("full_name")}</span>
        ),
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
          <Badge variant={row.original.is_active ? "success" : "secondary"}>
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: () => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: consultants,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Consultants" description="Manage consultants">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Add Consultant
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search consultants..."
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
          ) : consultants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <UserCog className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No consultants yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first consultant to get started.
              </p>
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <UserCog className="h-4 w-4" /> Add Consultant
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
            <DialogTitle>Add Consultant</DialogTitle>
            <DialogDescription>
              Register a new consultant.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
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
    </div>
  )
}
