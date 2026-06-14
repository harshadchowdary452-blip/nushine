import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Plus, Search, Edit, Trash2, Calendar, Building2, IndianRupee, Users, Zap, Droplets, Wifi, Settings, ShoppingBag, Megaphone, Wrench, MoreHorizontal } from "lucide-react"
import { format } from "date-fns"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { expensesApi, hospitalsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/store/authStore"
import type { HospitalMonthlyExpense } from "@/types"

const EXPENSE_CATEGORIES = [
  "Staff Salaries", "Rent", "Electricity", "Water", "Internet",
  "Equipment", "Consumables", "Marketing", "Maintenance", "Miscellaneous",
]

const CATEGORY_ICONS: Record<string, typeof Users> = {
  "Staff Salaries": Users,
  "Rent": Building2,
  "Electricity": Zap,
  "Water": Droplets,
  "Internet": Wifi,
  "Equipment": Settings,
  "Consumables": ShoppingBag,
  "Marketing": Megaphone,
  "Maintenance": Wrench,
  "Miscellaneous": MoreHorizontal,
}

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" },
  { value: 3, label: "March" }, { value: 4, label: "April" },
  { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" },
  { value: 9, label: "September" }, { value: 10, label: "October" },
  { value: 11, label: "November" }, { value: 12, label: "December" },
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

export default function AdminExpenses() {
  const { user } = useAuthStore()
  const role = user?.role
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [search, setSearch] = useState("")
  const [filterMonth, setFilterMonth] = useState<number | undefined>(new Date().getMonth() + 1)
  const [filterYear, setFilterYear] = useState<number | undefined>(currentYear)
  const [filterHospitalId, setFilterHospitalId] = useState<string | undefined>(undefined)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<HospitalMonthlyExpense | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingExpense, setDeletingExpense] = useState<HospitalMonthlyExpense | null>(null)

  const [formData, setFormData] = useState({
    hospital_id: "",
    expense_month: new Date().getMonth() + 1,
    expense_year: currentYear,
    expense_category: "",
    expense_name: "",
    description: "",
    amount: 0,
  })

  const { data: hospitals } = useQuery({
    queryKey: ["hospitals-list"],
    queryFn: () => hospitalsApi.list({ limit: 200 }),
    enabled: role === "SUPER_ADMIN" || role === "GROUP_ADMIN",
  })

  const params: Record<string, unknown> = { limit: 200 }
  if (filterMonth) params.expense_month = filterMonth
  if (filterYear) params.expense_year = filterYear
  if (filterHospitalId) params.hospital_id = filterHospitalId

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", params],
    queryFn: () => expensesApi.list(params),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => expensesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
              addToast({ title: "Expense created", variant: "success" })
      setDialogOpen(false)
      resetForm()
    },
    onError: (err: any) => {
              addToast({ title: "Failed to create expense", description: err?.response?.data?.detail || err.message, variant: "destructive" })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => expensesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
              addToast({ title: "Expense updated", variant: "success" })
      setDialogOpen(false)
      setEditingExpense(null)
      resetForm()
    },
    onError: (err: any) => {
              addToast({ title: "Failed to update expense", description: err?.response?.data?.detail || err.message, variant: "destructive" })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
              addToast({ title: "Expense deleted", variant: "success" })
    },
    onError: (err: any) => {
              addToast({ title: "Failed to delete expense", description: err?.response?.data?.detail || err.message, variant: "destructive" })
    },
  })

  function resetForm() {
    setFormData({
      hospital_id: "",
      expense_month: new Date().getMonth() + 1,
      expense_year: currentYear,
      expense_category: "",
      expense_name: "",
      description: "",
      amount: 0,
    })
  }

  function openCreateDialog() {
    setEditingExpense(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEditDialog(expense: HospitalMonthlyExpense) {
    setEditingExpense(expense)
    setFormData({
      hospital_id: expense.hospital_id,
      expense_month: expense.expense_month,
      expense_year: expense.expense_year,
      expense_category: expense.expense_category,
      expense_name: expense.expense_name,
      description: expense.description || "",
      amount: expense.amount,
    })
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!formData.expense_name.trim() || !formData.expense_category) return
    const data = {
      hospital_id: formData.hospital_id || undefined,
      expense_month: formData.expense_month,
      expense_year: formData.expense_year,
      expense_category: formData.expense_category,
      expense_name: formData.expense_name.trim(),
      description: formData.description.trim() || undefined,
      amount: formData.amount,
    }
    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filteredExpenses = Array.isArray(expenses)
    ? expenses.filter((e: any) =>
        !search || e.expense_name?.toLowerCase().includes(search.toLowerCase()) ||
        e.expense_category?.toLowerCase().includes(search.toLowerCase())
      )
    : []

  const categoryBadgeVariant = (cat: string) => {
    const map: Record<string, string> = {
      "Staff Salaries": "default",
      "Rent": "secondary",
      "Electricity": "warning",
      "Water": "info",
      "Internet": "info",
      "Equipment": "default",
      "Consumables": "secondary",
      "Marketing": "warning",
      "Maintenance": "secondary",
      "Miscellaneous": "outline",
    }
    return map[cat] || "outline"
  }

  const hospitalMap = Array.isArray(hospitals)
    ? Object.fromEntries((hospitals as any[]).map((h: any) => [h.id, h.name]))
    : {}

  return (
    <div className="space-y-6">
      <PageHeader title="Monthly Expenses" description="Track and manage hospital monthly expenses" />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search expenses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={String(filterMonth || "")} onValueChange={(v) => setFilterMonth(v ? Number(v) : undefined)}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="h-4 w-4 mr-1" />
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(filterYear || "")} onValueChange={(v) => setFilterYear(v ? Number(v) : undefined)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(role === "SUPER_ADMIN") && Array.isArray(hospitals) && (
              <Select value={filterHospitalId || "all"} onValueChange={(v) => setFilterHospitalId(v !== "all" ? v : undefined)}>
                <SelectTrigger className="w-[200px]">
                  <Building2 className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Hospital" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitals.map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No expenses found. Click "Add Expense" to create one.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border mobile-card-view">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Month</th>
                    {role === "SUPER_ADMIN" && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Hospital</th>}
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense: any) => (
                    <motion.tr
                      key={expense.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 font-medium" data-label="Name">
                        <div>{expense.expense_name}</div>
                        {expense.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{expense.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3" data-label="Category">
                        <Badge variant={categoryBadgeVariant(expense.expense_category) as any}>
                          {expense.expense_category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium" data-label="Amount">
                        ₹{expense.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" data-label="Month">
                        {MONTHS.find((m) => m.value === expense.expense_month)?.label} {expense.expense_year}
                      </td>
                      {role === "SUPER_ADMIN" && (
                        <td className="px-4 py-3 text-muted-foreground" data-label="Hospital">
                          {hospitalMap[expense.hospital_id] || expense.hospital_id}
                        </td>
                      )}
                      <td className="px-4 py-3" data-label="Actions">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(expense)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setDeletingExpense(expense); setDeleteDialogOpen(true) }}>
                            <Trash2 className="h-4 w-4 text-danger" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>
              {editingExpense ? "Update the expense details below." : "Enter the details for the new expense."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {role === "SUPER_ADMIN" && Array.isArray(hospitals) && (
              <div className="space-y-2 mb-4">
                <Label>Hospital</Label>
                <Select value={formData.hospital_id} onValueChange={(v) => setFormData({ ...formData, hospital_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select hospital" /></SelectTrigger>
                  <SelectContent>
                    {hospitals.map((h: any) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={String(formData.expense_month)} onValueChange={(v) => setFormData({ ...formData, expense_month: Number(v) })}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={String(formData.expense_year)} onValueChange={(v) => setFormData({ ...formData, expense_year: Number(v) })}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <Label>Category *</Label>
              <Select value={formData.expense_category} onValueChange={(v) => setFormData({ ...formData, expense_category: v })}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const Icon = CATEGORY_ICONS[cat]
                    return (
                      <SelectItem key={cat} value={cat}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-gray-400" />
                          {cat}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="relative mt-4">
              <Input
                id="expense-name"
                value={formData.expense_name}
                onChange={(e) => setFormData({ ...formData, expense_name: e.target.value })}
                placeholder=" "
                className="peer h-12 pt-5 pb-1"
              />
              <label
                htmlFor="expense-name"
                className="absolute left-3 top-1 text-[11px] font-medium text-gray-400 transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-1 peer-focus:text-[11px] peer-focus:text-primary"
              >
                Expense Name *
              </label>
            </div>
            <div className="relative mt-4">
              <Textarea
                id="expense-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder=" "
                className="peer min-h-[80px] pt-6 pb-2"
              />
              <label
                htmlFor="expense-desc"
                className="absolute left-3 top-1.5 text-[11px] font-medium text-gray-400 transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-1.5 peer-focus:text-[11px] peer-focus:text-primary"
              >
                Description (optional)
              </label>
            </div>
            <div className="relative mt-4">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none z-10 peer-focus:text-primary" />
              <Input
                id="amount"
                type="number"
                min={1}
                step={0.01}
                value={formData.amount || ""}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                placeholder=" "
                className="peer h-12 pl-9 pt-5 pb-1"
              />
              <label
                htmlFor="amount"
                className="absolute left-9 top-1 text-[11px] font-medium text-gray-400 transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-1 peer-focus:text-[11px] peer-focus:text-primary"
              >
                Amount *
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingExpense(null); resetForm() }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.expense_name || !formData.expense_category || !formData.amount}>
              {editingExpense ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingExpense?.expense_name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingExpense(null) }}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => { if (deletingExpense) deleteMutation.mutate(deletingExpense.id); setDeleteDialogOpen(false); setDeletingExpense(null) }} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
