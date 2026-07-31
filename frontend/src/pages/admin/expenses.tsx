import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Calendar,
  Building2,
  IndianRupee,
  Users,
  Zap,
  Droplets,
  Wifi,
  Settings,
  ShoppingBag,
  Megaphone,
  Wrench,
  MoreHorizontal,
  List,
  ChevronLeft,
  ChevronRight,
  Clock,
  TrendingUp,
  Wallet,
  DollarSign,
} from "lucide-react"
import { format } from "date-fns"
import { PageHeader } from "@/design-system"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { expensesApi, hospitalsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/store/authStore"
import type { HospitalMonthlyExpense, Hospital, ApiError } from "@/types"
import { extractDetail } from "@/types"

const EXPENSE_CATEGORIES = [
  "Staff Salaries",
  "Rent",
  "Electricity",
  "Water",
  "Internet",
  "Equipment",
  "Consumables",
  "Marketing",
  "Maintenance",
  "Miscellaneous",
]

const CATEGORY_ICONS: Record<string, typeof Users> = {
  "Staff Salaries": Users,
  Rent: Building2,
  Electricity: Zap,
  Water: Droplets,
  Internet: Wifi,
  Equipment: Settings,
  Consumables: ShoppingBag,
  Marketing: Megaphone,
  Maintenance: Wrench,
  Miscellaneous: MoreHorizontal,
}

const EXPENSE_FILTERS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
]

const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Cheque", "UPI", "Other"]

const currentYear = new Date().getFullYear()
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

export default function AdminExpenses() {
  const { user } = useAuthStore()
  const role = user?.role
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<string>("this_month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [filterHospitalId, setFilterHospitalId] = useState<string | undefined>(undefined)
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [calYear, setCalYear] = useState(currentYear)
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<HospitalMonthlyExpense | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingExpense, setDeletingExpense] = useState<HospitalMonthlyExpense | null>(null)

  const [formData, setFormData] = useState({
    hospital_id: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    expense_category: "",
    expense_name: "",
    description: "",
    amount: 0,
    payment_method: "",
    vendor: "",
    invoice_number: "",
    notes: "",
  })

  const { data: hospitals } = useQuery({
    queryKey: ["hospitals-list"],
    queryFn: () => hospitalsApi.list({ limit: 200 }),
    enabled: role === "SUPER_ADMIN" || role === "GROUP_ADMIN",
  })

  const params: Record<string, unknown> = { limit: 200 }
  if (activeFilter === "custom" && customStart && customEnd) {
    params.filter = "custom"
    params.start_date = customStart
    params.end_date = customEnd
  } else if (activeFilter) {
    params.filter = activeFilter
  }
  if (filterHospitalId) params.hospital_id = filterHospitalId

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", params],
    queryFn: () => expensesApi.list(params),
  })

  const { data: analytics } = useQuery({
    queryKey: ["expenses-analytics"],
    queryFn: () => expensesApi.analytics(),
  })

  const { data: calendarData } = useQuery({
    queryKey: ["expenses-calendar", calMonth, calYear],
    queryFn: () => expensesApi.calendar({ month: calMonth, year: calYear }),
    enabled: viewMode === "calendar",
  })

  const calDayQuery = useQuery({
    queryKey: ["expenses-calendar-day", selectedCalDate],
    queryFn: () => expensesApi.calendarDay(selectedCalDate!),
    enabled: !!selectedCalDate,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => expensesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["expenses-analytics"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["expenses-calendar"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Expense created", variant: "success" })
      setDialogOpen(false)
      resetForm()
    },
    onError: (err: ApiError) => {
      addToast({
        title: "Failed to create expense",
        description: extractDetail(err) || err.message,
        variant: "destructive",
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      expensesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["expenses-analytics"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["expenses-calendar"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Expense updated", variant: "success" })
      setDialogOpen(false)
      setEditingExpense(null)
      resetForm()
    },
    onError: (err: ApiError) => {
      addToast({
        title: "Failed to update expense",
        description: extractDetail(err) || err.message,
        variant: "destructive",
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["expenses-analytics"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["expenses-calendar"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Expense deleted", variant: "success" })
    },
    onError: (err: ApiError) => {
      addToast({
        title: "Failed to delete expense",
        description: extractDetail(err) || err.message,
        variant: "destructive",
      })
    },
  })

  function resetForm() {
    setFormData({
      hospital_id: "",
      expense_date: format(new Date(), "yyyy-MM-dd"),
      expense_category: "",
      expense_name: "",
      description: "",
      amount: 0,
      payment_method: "",
      vendor: "",
      invoice_number: "",
      notes: "",
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
      expense_date: expense.expense_date,
      expense_category: expense.expense_category,
      expense_name: expense.expense_name,
      description: expense.description || "",
      amount: expense.amount,
      payment_method: expense.payment_method || "",
      vendor: expense.vendor || "",
      invoice_number: expense.invoice_number || "",
      notes: expense.notes || "",
    })
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!formData.expense_name.trim() || !formData.expense_category) return
    const data: Record<string, unknown> = {
      hospital_id: formData.hospital_id || undefined,
      expense_date: formData.expense_date,
      expense_category: formData.expense_category,
      expense_name: formData.expense_name.trim(),
      description: formData.description.trim() || undefined,
      amount: formData.amount,
    }
    if (formData.payment_method) data.payment_method = formData.payment_method
    if (formData.vendor.trim()) data.vendor = formData.vendor.trim()
    if (formData.invoice_number.trim()) data.invoice_number = formData.invoice_number.trim()
    if (formData.notes.trim()) data.notes = formData.notes.trim()
    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const filteredExpenses = Array.isArray(expenses)
    ? expenses.filter(
        (e: HospitalMonthlyExpense) =>
          !search ||
          e.expense_name?.toLowerCase().includes(search.toLowerCase()) ||
          e.expense_category?.toLowerCase().includes(search.toLowerCase()) ||
          e.vendor?.toLowerCase().includes(search.toLowerCase()),
      )
    : []

  const categoryBadgeVariant = (
    cat: string,
  ): "default" | "secondary" | "warning" | "info" | "outline" => {
    const map: Record<string, "default" | "secondary" | "warning" | "info" | "outline"> = {
      "Staff Salaries": "default",
      Rent: "secondary",
      Electricity: "warning",
      Water: "info",
      Internet: "info",
      Equipment: "default",
      Consumables: "secondary",
      Marketing: "warning",
      Maintenance: "secondary",
      Miscellaneous: "outline",
    }
    return map[cat] || "outline"
  }

  const hospitalMap = Array.isArray(hospitals)
    ? Object.fromEntries(hospitals.map((h: Hospital) => [h.id, h.name]))
    : {}

  // ── Calendar helpers ──
  function daysInMonth(m: number, y: number) {
    return new Date(y, m, 0).getDate()
  }
  function firstDayOfMonth(m: number, y: number) {
    return new Date(y, m - 1, 1).getDay()
  }
  const calDaysCount = daysInMonth(calMonth, calYear)
  const calFirstDow = firstDayOfMonth(calMonth, calYear)
  const calMap: Record<string, { count: number; total: number }> = {}
  if (Array.isArray(calendarData)) {
    for (const d of calendarData) {
      calMap[d.date] = d
    }
  }

  function handleCalDateClick(dateStr: string) {
    setSelectedCalDate(dateStr)
  }

  function handleCloseCalDay() {
    setSelectedCalDate(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" description="Track and manage hospital expenses" />

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="text-lg font-bold">
                ₹{(analytics?.today_total || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This Week</p>
              <p className="text-lg font-bold">
                ₹{(analytics?.this_week_total || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Wallet className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="text-lg font-bold">
                ₹{(analytics?.this_month_total || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--ds-accent-100)]">
              <DollarSign className="h-5 w-5 text-[var(--ds-accent-600)]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Year to Date</p>
              <p className="text-lg font-bold">
                ₹{(analytics?.year_to_date_total || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      {analytics?.category_breakdown && analytics.category_breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Expense by Category</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              {analytics.category_breakdown
                .slice(0, 5)
                .map((cat: { category: string; amount: number }) => {
                  const pct =
                    analytics.total_expenses > 0 ? (cat.amount / analytics.total_expenses) * 100 : 0
                  const Icon = CATEGORY_ICONS[cat.category] || MoreHorizontal
                  return (
                    <div key={cat.category} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm">
                          <span className="truncate">{cat.category}</span>
                          <span className="font-medium">₹{cat.amount.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full mt-1">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters & Tabs */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {EXPENSE_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  variant={activeFilter === f.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "calendar" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("calendar")}
              >
                <Calendar className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {activeFilter === "custom" && (
            <div className="flex gap-2 items-center">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-[180px]"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-[180px]"
              />
            </div>
          )}

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
            {(role === "SUPER_ADMIN" || role === "GROUP_ADMIN") && Array.isArray(hospitals) && (
              <Select
                value={filterHospitalId || "all"}
                onValueChange={(v) => setFilterHospitalId(v !== "all" ? v : undefined)}
              >
                <SelectTrigger className="w-[200px]">
                  <Building2 className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Hospital" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hospitals</SelectItem>
                  {hospitals.map((h: Hospital) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
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

      {/* List View */}
      {viewMode === "list" && (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
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
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Payment
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Vendor
                      </th>
                      {(role === "SUPER_ADMIN" || role === "GROUP_ADMIN") && (
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Hospital
                        </th>
                      )}
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense: HospitalMonthlyExpense) => (
                      <motion.tr
                        key={expense.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b transition-colors hover:bg-muted/50"
                      >
                        <td className="px-4 py-3 text-muted-foreground" data-label="Date">
                          {expense.expense_date
                            ? format(new Date(expense.expense_date), "dd MMM yyyy")
                            : ""}
                        </td>
                        <td className="px-4 py-3 font-medium" data-label="Name">
                          <div>{expense.expense_name}</div>
                          {expense.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {expense.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3" data-label="Category">
                          <Badge variant={categoryBadgeVariant(expense.expense_category)}>
                            {expense.expense_category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium" data-label="Amount">
                          ₹{expense.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-label="Payment">
                          {expense.payment_method || "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-label="Vendor">
                          {expense.vendor || "-"}
                        </td>
                        {(role === "SUPER_ADMIN" || role === "GROUP_ADMIN") && (
                          <td className="px-4 py-3 text-muted-foreground" data-label="Hospital">
                            {hospitalMap[expense.hospital_id] || expense.hospital_id}
                          </td>
                        )}
                        <td className="px-4 py-3" data-label="Actions">
                          <div className="flex items-center gap-1">
                            {role !== "HOSPITAL_ADMIN" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDialog(expense)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setDeletingExpense(expense)
                                    setDeleteDialogOpen(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-danger" />
                                </Button>
                              </>
                            )}
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
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (calMonth === 1) {
                    setCalMonth(12)
                    setCalYear(calYear - 1)
                  } else {
                    setCalMonth(calMonth - 1)
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium">
                {MONTHS_SHORT[calMonth - 1]} {calYear}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (calMonth === 12) {
                    setCalMonth(1)
                    setCalYear(calYear + 1)
                  } else {
                    setCalMonth(calMonth + 1)
                  }
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: calFirstDow }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: calDaysCount }).map((_, i) => {
                const day = i + 1
                const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                const calEntry = calMap[dateStr]
                const isToday = dateStr === format(new Date(), "yyyy-MM-dd")
                const isSelected = selectedCalDate === dateStr
                return (
                  <div
                    key={day}
                    onClick={() => handleCalDateClick(dateStr)}
                    className={`relative p-2 rounded-lg text-center cursor-pointer transition-colors hover:bg-muted/50 ${isToday ? "ring-2 ring-primary" : ""} ${isSelected ? "bg-primary/10" : ""}`}
                  >
                    <div className="text-sm">{day}</div>
                    {calEntry && (
                      <div className="text-[10px] font-medium text-primary truncate">
                        ₹{calEntry.total.toLocaleString("en-IN")}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Selected date detail */}
            {selectedCalDate && (
              <div className="mt-4 border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">
                    {format(new Date(selectedCalDate), "dd MMM yyyy")}
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleCloseCalDay}>
                    Close
                  </Button>
                </div>
                {calDayQuery.isLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : calDayQuery.data &&
                  Array.isArray(calDayQuery.data) &&
                  calDayQuery.data.length > 0 ? (
                  <div className="space-y-2">
                    {(calDayQuery.data as HospitalMonthlyExpense[]).map((exp) => (
                      <div
                        key={exp.id}
                        className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded"
                      >
                        <div>
                          <span className="font-medium">{exp.expense_name}</span>
                          <span className="text-muted-foreground ml-2">{exp.expense_category}</span>
                        </div>
                        <span className="font-mono font-medium">
                          ₹{exp.amount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No expenses on this date.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>
              {editingExpense
                ? "Update the expense details below."
                : "Enter the details for the new expense."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {(role === "SUPER_ADMIN" || role === "GROUP_ADMIN") && Array.isArray(hospitals) && (
              <div className="space-y-2 mb-4">
                <Label>Hospital</Label>
                <Select
                  value={formData.hospital_id}
                  onValueChange={(v) => setFormData({ ...formData, hospital_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hospital" />
                  </SelectTrigger>
                  <SelectContent>
                    {hospitals.map((h: Hospital) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2 mb-4">
              <Label>Expense Date *</Label>
              <Input
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                className="h-12"
              />
              {formData.expense_date && (
                <p className="text-xs text-muted-foreground">
                  Month: {format(new Date(formData.expense_date + "T00:00:00"), "MMMM")} | Year:{" "}
                  {format(new Date(formData.expense_date + "T00:00:00"), "yyyy")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={formData.expense_category}
                onValueChange={(v) => setFormData({ ...formData, expense_category: v })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const Icon = CATEGORY_ICONS[cat]
                    return (
                      <SelectItem key={cat} value={cat}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
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
                className="absolute left-3 top-1 text-[11px] font-medium text-[var(--ds-text-tertiary)] transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-[var(--ds-input-placeholder)] peer-focus:top-1 peer-focus:text-[11px] peer-focus:text-primary"
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
                className="absolute left-3 top-1.5 text-[11px] font-medium text-[var(--ds-text-tertiary)] transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-[var(--ds-input-placeholder)] peer-focus:top-1.5 peer-focus:text-[11px] peer-focus:text-primary"
              >
                Description (optional)
              </label>
            </div>
            <div className="relative mt-4">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-tertiary)] pointer-events-none z-10 peer-focus:text-primary" />
              <NumericInput
                id="amount"
                mode="currency"
                prefix="₹"
                value={formData.amount || ""}
                onChange={(v) => setFormData({ ...formData, amount: parseFloat(v) || 0 })}
                placeholder=" "
                className="peer h-12 pl-9 pt-5 pb-1"
              />
              <label
                htmlFor="amount"
                className="absolute left-9 top-1 text-[11px] font-medium text-[var(--ds-text-tertiary)] transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-[var(--ds-input-placeholder)] peer-focus:top-1 peer-focus:text-[11px] peer-focus:text-primary"
              >
                Amount *
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(v) => setFormData({ ...formData, payment_method: v })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((pm) => (
                      <SelectItem key={pm} value={pm}>
                        {pm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Input
                  id="vendor"
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  placeholder=" "
                  className="peer h-12 pt-5 pb-1"
                />
                <label
                  htmlFor="vendor"
                  className="absolute left-3 top-1 text-[11px] font-medium text-[var(--ds-text-tertiary)] transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-[var(--ds-input-placeholder)] peer-focus:top-1 peer-focus:text-[11px] peer-focus:text-primary"
                >
                  Vendor (optional)
                </label>
              </div>
            </div>
            <div className="relative mt-4">
              <Input
                id="invoice-number"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                placeholder=" "
                className="peer h-12 pt-5 pb-1"
              />
              <label
                htmlFor="invoice-number"
                className="absolute left-3 top-1 text-[11px] font-medium text-[var(--ds-text-tertiary)] transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-[var(--ds-input-placeholder)] peer-focus:top-1 peer-focus:text-[11px] peer-focus:text-primary"
              >
                Invoice/Bill Number (optional)
              </label>
            </div>
            <div className="relative mt-4">
              <Textarea
                id="expense-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder=" "
                className="peer min-h-[80px] pt-6 pb-2"
              />
              <label
                htmlFor="expense-notes"
                className="absolute left-3 top-1.5 text-[11px] font-medium text-[var(--ds-text-tertiary)] transition-all pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-placeholder-shown:text-[var(--ds-input-placeholder)] peer-focus:top-1.5 peer-focus:text-[11px] peer-focus:text-primary"
              >
                Notes (optional)
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                setEditingExpense(null)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.expense_name || !formData.expense_category || !formData.amount}
            >
              {editingExpense ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingExpense?.expense_name}"? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeletingExpense(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deletingExpense) deleteMutation.mutate(deletingExpense.id)
                setDeleteDialogOpen(false)
                setDeletingExpense(null)
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
