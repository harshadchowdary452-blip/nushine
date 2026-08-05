import { useMemo, useState, useEffect, Fragment } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus, Download, Printer, FileText, FileSpreadsheet, FileDown,
  Eye, Package, History, ClipboardList, CalendarClock, Building2,
  Loader2, CheckCircle2, X, Pencil, Power, PowerOff, Library, Inbox,
  ChevronDown, ChevronRight, Send, Layers, AlertTriangle, ShieldCheck, RefreshCw,
  Ban, Merge, ClipboardCheck, Save,
} from "lucide-react"
import {
  PageContainer, PageHeader, Button, Input, Label, Textarea,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody,
  StatusBadge, NumericInput, SearchBar,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel,
  useToast, EmptyState, LoadingSkeleton, FullscreenDialog, Separator, Skeleton,
} from "@/design-system"
import { formatIndianRupees } from "@/lib/currency"
import {
  hospitalsApi, inventoryCategoriesApi, inventoryItemsApi, hospitalInventoryApi,
  inventoryTransactionsApi, monthlyOrdersApi, inventoryReportApi,
  pendingInventoryItemsApi,
} from "@/services/endpoints"
import { useAuthStore } from "@/store/authStore"
import { useHospitalStore } from "@/store/hospitalStore"
import type {
  Hospital, HospitalInventory, InventoryCategory, InventoryItem, PaginatedResponse,
  MonthlyOrder, MonthlyOrderStatus,
  PendingInventoryItem, PendingInventoryItemsResponse, PendingInventoryItemUpdate,
  PendingItemRollout, DuplicateCheckResponse,
  MonthlyOrderOverview, ValidationResult, GenerateConsolidatedResponse,
  ConsolidatedOrderResponse, ConsolidatedOrderItem, AuditHistoryResponse,
} from "@/types"
import { extractDetail } from "@/types"

/* ── helpers ─────────────────────────────────────────────────────────── */

function defaultOrderPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function periodOptions(): string[] {
  const now = new Date()
  const out: string[] = []
  for (let i = 0; i < 6; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth() + i, 1)
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`)
  }
  return out
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

function formatNumber(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return v.toLocaleString("en-IN", { maximumFractionDigits: decimals })
}

function formatDate(v: string | null | undefined): string {
  if (!v) return "—"
  try {
    return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return "—"
  }
}

function formatDateTime(v: string | null | undefined): string {
  if (!v) return "—"
  try {
    return new Date(v).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function useHospitalContext() {
  const { user } = useAuthStore()
  const { selectedHospitalId, setSelectedHospitalId } = useHospitalStore()
  const role = user?.role
  const ownHospitalId = user?.hospital_id ?? null

  const lockedHospitalId = role === "HOSPITAL_ADMIN" || role === "DOCTOR" ? ownHospitalId : null
  const effectiveHospitalId = lockedHospitalId ?? selectedHospitalId
  const showSelector = role === "GROUP_ADMIN" || role === "SUPER_ADMIN"

  return {
    role,
    isManager: role === "SUPER_ADMIN" || role === "GROUP_ADMIN" || role === "HOSPITAL_ADMIN",
    isGroupAdmin: role === "GROUP_ADMIN",
    isDoctor: role === "DOCTOR",
    effectiveHospitalId,
    showSelector,
    selectedHospitalId,
    setSelectedHospitalId,
  }
}

/* ── row model ───────────────────────────────────────────────────────── */

interface IndentRow {
  recordId: string
  itemId: string
  itemName: string
  itemCode: string | null
  unit: string
  categoryName: string | null
  subCategoryName: string | null
  quantity: number
}

interface GroupSection {
  categoryName: string
  subs: { subName: string; rows: IndentRow[] }[]
}

function groupRows(rows: IndentRow[]): GroupSection[] {
  const map = new Map<string, Map<string, IndentRow[]>>()
  for (const r of rows) {
    const cat = r.categoryName || "Others"
    const sub = r.subCategoryName || "General"
    if (!map.has(cat)) map.set(cat, new Map())
    const subs = map.get(cat)!
    if (!subs.has(sub)) subs.set(sub, [])
    subs.get(sub)!.push(r)
  }
  const out: GroupSection[] = []
  for (const [cat, subs] of map) {
    const section: GroupSection = { categoryName: cat, subs: [] }
    for (const [sub, srows] of subs) {
      section.subs.push({
        subName: sub,
        rows: [...srows].sort((a, b) => a.itemName.localeCompare(b.itemName)),
      })
    }
    section.subs.sort((a, b) => a.subName.localeCompare(b.subName))
    out.push(section)
  }
  out.sort((a, b) => a.categoryName.localeCompare(b.categoryName))
  return out
}

/* ── Export menu ─────────────────────────────────────────────────────── */

type ExportFormat = "pdf" | "excel" | "csv" | "print"

const FORMAT_ICONS: Record<Exclude<ExportFormat, "print">, typeof FileText> = {
  pdf: FileText,
  excel: FileSpreadsheet,
  csv: FileDown,
}

function ExportMenu({
  hospitalId,
  orderPeriod,
}: {
  hospitalId: string | null
  orderPeriod: string
}) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const runExport = async (reportType: string, format: ExportFormat, label: string) => {
    setBusy(`${reportType}:${format}`)
    try {
      const blob = await inventoryReportApi.get({
        report_type: reportType,
        format: format === "print" ? "pdf" : format,
        ...(hospitalId ? { hospital_id: hospitalId } : {}),
        ...(reportType === "procurement" || reportType === "orders" ? { order_period: orderPeriod } : {}),
      })
      const safe = label.toLowerCase().replace(/\s+/g, "_")
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "_")
      if (format === "print") {
        const url = window.URL.createObjectURL(blob)
        window.open(url, "_blank")
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
      } else {
        downloadBlob(blob, `${safe}_${dateStr}.${format}`)
      }
      addToast({ title: "Export Complete", description: `${label} exported`, variant: "success" })
    } catch (err) {
      addToast({ title: "Export Failed", description: extractDetail(err), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const group = (reportType: string, label: string, format: ExportFormat) => (
    <DropdownMenuItem key={`${reportType}:${format}`} disabled={busy !== null} onSelect={() => runExport(reportType, format, label)}>
      {format === "print" ? (
        <Printer className="h-4 w-4" />
      ) : (
        (() => {
          const Icon = FORMAT_ICONS[format]
          return <Icon className="h-4 w-4" />
        })()
      )}
      {label} · {format === "print" ? "Print" : format.toUpperCase()}
      {busy === `${reportType}:${format}` && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Monthly Indent</DropdownMenuLabel>
        {(["pdf", "excel", "csv"] as ExportFormat[]).map((f) => group("procurement", "Monthly Order", f))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ── Add Other Item dialog ───────────────────────────────────────────── */

function AddOtherItemDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [itemName, setItemName] = useState("")
  const [requiredQty, setRequiredQty] = useState("")
  const [estimatedCost, setEstimatedCost] = useState("")
  const [remarks, setRemarks] = useState("")

  useEffect(() => {
    if (open) {
      setItemName("")
      setRequiredQty("")
      setEstimatedCost("")
      setRemarks("")
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () =>
      pendingInventoryItemsApi.create({
        item_name: itemName.trim(),
        required_quantity: requiredQty ? parseFloat(requiredQty) : undefined,
        estimated_cost: estimatedCost ? parseFloat(estimatedCost) : undefined,
        remarks: remarks.trim() || undefined,
        order_period: defaultOrderPeriod(),
      }),
    onSuccess: async () => {
      addToast({
        title: "Request Submitted",
        description: `"${itemName.trim()}" now appears in your Monthly Indent — status: Pending Master Approval`,
        variant: "success",
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-pending-items"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-pending-count"] }),
      ])
      onOpenChange(false)
    },
    onError: (err) => addToast({ title: "Could not submit request", description: extractDetail(err), variant: "destructive" }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md" aria-describedby="add-other-item-desc">
        <DialogHeader>
          <DialogTitle>Add Other Item</DialogTitle>
          <DialogDescription id="add-other-item-desc">
            Request a material that is not in the master catalogue. It is automatically assigned under{" "}
            <strong>Others</strong> and becomes available inside your current Monthly Indent, marked{" "}
            <strong>Pending Master Approval</strong>.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="other-item-name">Item Name</Label>
            <Input
              id="other-item-name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Custom Mouthwash Brand"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="other-item-qty">Required Quantity</Label>
            <NumericInput
              id="other-item-qty"
              mode="integer"
              min={0}
              value={requiredQty}
              onChange={setRequiredQty}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="other-item-cost">Estimated Cost</Label>
            <NumericInput
              id="other-item-cost"
              mode="currency"
              min={0}
              prefix="₹"
              value={estimatedCost}
              onChange={setEstimatedCost}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="other-item-remarks">Remarks</Label>
            <Textarea
              id="other-item-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Why do you need this item? (shown to your group admin)"
              rows={2}
            />
          </div>
          <p className="ds-caption text-[var(--ds-text-tertiary)]">
            Your group admin reviews requests inside the Inventory page. Once approved, the item is added to the
            master catalogue and you never need to request it again.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={itemName.trim().length === 0}
          >
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Master Catalogue manager dialog (Group Admin) ─────────────────── */

function CatalogueManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [itemSearch, setItemSearch] = useState("")
  const [itemForm, setItemForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newCode, setNewCode] = useState("")
  const [newCategoryId, setNewCategoryId] = useState("")
  const [newUnit, setNewUnit] = useState("PCS")
  const [newPrice, setNewPrice] = useState("0")
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState("0")
  const [editUnit, setEditUnit] = useState("PCS")
  const [categoryForm, setCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")

  const categoriesQuery = useQuery<PaginatedResponse<InventoryCategory>>({
    queryKey: ["inventory-categories"],
    queryFn: () => inventoryCategoriesApi.list({ page_size: 200 }),
    enabled: open,
  })
  const categories = useMemo(() => categoriesQuery.data?.items || [], [categoriesQuery.data])

  const itemsQuery = useQuery<PaginatedResponse<InventoryItem>>({
    queryKey: ["inventory-items"],
    queryFn: () => inventoryItemsApi.list({ page_size: 200 }),
    enabled: open,
  })
  const items = useMemo(() => itemsQuery.data?.items || [], [itemsQuery.data])
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q))
  }, [items, itemSearch])

  useEffect(() => {
    if (open) {
      setItemSearch("")
      setItemForm(false)
      setEditingItemId(null)
      setCategoryForm(false)
      setNewName("")
      setNewCode("")
      setNewCategoryId("")
      setNewUnit("PCS")
      setNewPrice("0")
      setNewCategoryName("")
    }
  }, [open])

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-categories"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-pending-items"] }),
    ])

  const createCategoryMutation = useMutation({
    mutationFn: (categoryName: string) => inventoryCategoriesApi.create({ name: categoryName }),
    onSuccess: async (cat: { id: string; name: string }) => {
      setNewCategoryName("")
      setCategoryForm(false)
      await refresh()
      addToast({ title: "Category Added", description: `"${cat.name}" is ready to use`, variant: "success" })
    },
    onError: (err) => addToast({ title: "Could not add category", description: extractDetail(err), variant: "destructive" }),
  })

  const createItemMutation = useMutation({
    mutationFn: () =>
      inventoryItemsApi.create({
        name: newName.trim(),
        code: newCode.trim(),
        category_id: newCategoryId || undefined,
        unit: newUnit.trim() || "PCS",
        purchase_price: newPrice ? parseFloat(newPrice) : 0,
        average_cost: newPrice ? parseFloat(newPrice) : 0,
        status: "ACTIVE",
      }),
    onSuccess: async (item: { name: string }) => {
      addToast({ title: "Catalogue Item Added", description: `"${item.name}" added to the master catalogue`, variant: "success" })
      setItemForm(false)
      setNewName("")
      setNewCode("")
      setNewCategoryId("")
      setNewUnit("PCS")
      setNewPrice("0")
      await refresh()
    },
    onError: (err) => addToast({ title: "Could not add item", description: extractDetail(err), variant: "destructive" }),
  })

  const updateItemMutation = useMutation({
    mutationFn: (item: InventoryItem) =>
      inventoryItemsApi.update(item.id, {
        unit: editUnit.trim() || item.unit,
        purchase_price: editPrice ? parseFloat(editPrice) : 0,
        average_cost: editPrice ? parseFloat(editPrice) : 0,
      }),
    onSuccess: async () => {
      addToast({ title: "Item Updated", description: "Catalogue item updated", variant: "success" })
      setEditingItemId(null)
      await refresh()
    },
    onError: (err) => addToast({ title: "Could not update item", description: extractDetail(err), variant: "destructive" }),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: (item: InventoryItem) =>
      inventoryItemsApi.update(item.id, { status: item.status === "INACTIVE" ? "ACTIVE" : "INACTIVE" }),
    onSuccess: async (item: { name: string; status: string }) => {
      addToast({
        title: item.status === "INACTIVE" ? "Item Deactivated" : "Item Activated",
        description: `"${item.name}" is now ${item.status === "INACTIVE" ? "inactive" : "active"} in the catalogue`,
        variant: "success",
      })
      await refresh()
    },
    onError: (err) => addToast({ title: "Could not change item status", description: extractDetail(err), variant: "destructive" }),
  })

  const startEdit = (item: InventoryItem) => {
    setEditingItemId(item.id)
    setEditPrice(String(item.purchase_price ?? 0))
    setEditUnit(item.unit || "PCS")
  }

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Master Catalogue"
      description="Shared catalogue for all hospitals in the group. Deactivated items are hidden from new orders."
    >
      <div className="grid h-full gap-6 overflow-y-auto lg:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ds-text)]">Categories</h3>
            {!categoryForm && (
              <Button size="sm" variant="outline" onClick={() => setCategoryForm(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add Category
              </Button>
            )}
          </div>
          {categoryForm && (
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name, e.g. Hygiene"
                autoFocus
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                onClick={() => createCategoryMutation.mutate(newCategoryName.trim())}
              >
                {createCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCategoryForm(false)}>
                Cancel
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {categories.length === 0 && (
              <span className="ds-caption text-[var(--ds-text-tertiary)]">No categories yet.</span>
            )}
            {categories.map((c) => (
              <span
                key={c.id}
                className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-3 py-1 text-sm text-[var(--ds-text)]"
              >
                {c.name}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--ds-text)]">Catalogue Items</h3>
            {!itemForm && (
              <Button size="sm" variant="outline" onClick={() => setItemForm(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            )}
          </div>
          {itemForm && (
            <div className="space-y-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cat-item-name">Item Name</Label>
                  <Input id="cat-item-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Ultrasonic Cleaner" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cat-item-code">Code</Label>
                  <Input id="cat-item-code" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="e.g. CLN-015" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                    <SelectTrigger aria-label="Category">
                      <SelectValue placeholder="Uncategorised" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cat-item-unit">Unit</Label>
                  <Input id="cat-item-unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="PCS" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-item-price">Purchase Price</Label>
                <NumericInput id="cat-item-price" mode="currency" min={0} prefix="₹" value={newPrice} onChange={setNewPrice} placeholder="0" />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setItemForm(false)} disabled={createItemMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => createItemMutation.mutate()}
                  loading={createItemMutation.isPending}
                  disabled={!newName.trim() || !newCode.trim()}
                >
                  Add Item
                </Button>
              </div>
            </div>
          )}
          <div>
            <SearchBar value={itemSearch} onChange={setItemSearch} placeholder="Search catalogue items…" />
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-[var(--ds-border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-[var(--ds-text-tertiary)]">
                      No catalogue items found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium text-[var(--ds-text)]">{item.name}</div>
                        <div className="ds-caption text-[var(--ds-text-tertiary)]">{item.code}</div>
                      </TableCell>
                      <TableCell className="text-[var(--ds-text-secondary)]">{item.category_name || "—"}</TableCell>
                      <TableCell className="ds-numeric text-right">{formatIndianRupees(item.purchase_price ?? 0)}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.status === "INACTIVE" ? "Inactive" : "Active"} />
                      </TableCell>
                      <TableCell className="text-right">
                        {editingItemId === item.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <NumericInput mode="currency" min={0} prefix="₹" value={editPrice} onChange={setEditPrice} className="w-24" aria-label={`Price for ${item.name}`} />
                            <Button size="icon-sm" variant="outline" onClick={() => updateItemMutation.mutate(item)} aria-label="Save">
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button size="icon-sm" variant="ghost" onClick={() => setEditingItemId(null)} aria-label="Cancel">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon-sm" variant="ghost" onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => toggleStatusMutation.mutate(item)}
                              aria-label={item.status === "INACTIVE" ? `Activate ${item.name}` : `Deactivate ${item.name}`}
                            >
                              {item.status === "INACTIVE" ? <Power className="h-4 w-4 text-[var(--ds-primary)]" /> : <PowerOff className="h-4 w-4 text-[var(--ds-text-tertiary)]" />}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </FullscreenDialog>
  )
}

/* ── Pending master approval drawer (Group Admin) ─────────────────── */

function PendingApprovalDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [rollout, setRollout] = useState<PendingItemRollout>("ALL")
  const [notes, setNotes] = useState("")
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ itemName: "", requiredQty: "", estimatedCost: "", remarks: "" })

  const pendingQuery = useQuery<PendingInventoryItemsResponse>({
    queryKey: ["inventory-pending-items"],
    queryFn: () => pendingInventoryItemsApi.list({ page_size: 200 }),
    enabled: open,
  })
  const items = pendingQuery.data?.items || []
  const pending = items.filter((i) => i.status === "PENDING")
  const history = items.filter((i) => i.status !== "PENDING")
  const reviewing = pending.find((i) => i.id === reviewingId) ?? null

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-pending-items"] })
    queryClient.invalidateQueries({ queryKey: ["inventory-pending-count"] })
    queryClient.invalidateQueries({ queryKey: ["inventory-items"] })
    queryClient.invalidateQueries({ queryKey: ["hospital-inventory"] })
  }

  const dupQuery = useQuery<DuplicateCheckResponse>({
    queryKey: ["pending-duplicates", reviewing?.item_name],
    queryFn: () => pendingInventoryItemsApi.duplicates(reviewing!.item_name),
    enabled: open && !!reviewing,
  })
  const candidates = dupQuery.data?.candidates || []
  const exactMatch = candidates.some((c) => c.match_type === "EXACT")

  const startReview = (item: PendingInventoryItem) => {
    setReviewingId(item.id)
    setEditMode(false)
    setRollout("ALL")
    setNotes("")
    setMergeTargetId(null)
    setDraft({
      itemName: item.item_name,
      requiredQty: item.required_quantity ? String(item.required_quantity) : "",
      estimatedCost: item.estimated_cost ? String(item.estimated_cost) : "",
      remarks: item.remarks || "",
    })
  }

  const editMutation = useMutation({
    mutationFn: () => {
      const payload: PendingInventoryItemUpdate = {
        item_name: draft.itemName.trim(),
        ...(draft.requiredQty ? { required_quantity: parseFloat(draft.requiredQty) } : {}),
        ...(draft.estimatedCost ? { estimated_cost: parseFloat(draft.estimatedCost) } : {}),
        ...(draft.remarks.trim() ? { remarks: draft.remarks.trim() } : {}),
      }
      return pendingInventoryItemsApi.update(reviewing!.id, { ...payload })
    },
    onSuccess: async () => {
      addToast({ title: "Request Updated", description: `"${draft.itemName.trim()}" edited`, variant: "success" })
      setEditMode(false)
      await queryClient.invalidateQueries({ queryKey: ["inventory-pending-items"] })
    },
    onError: (err) => addToast({ title: "Could not update request", description: extractDetail(err), variant: "destructive" }),
  })

  const reviewMutation = useMutation({
    mutationFn: (action: "APPROVE" | "REJECT" | "MERGE") =>
      pendingInventoryItemsApi.review(reviewing!.id, {
        action,
        ...(action === "MERGE" && mergeTargetId ? { merge_item_id: mergeTargetId } : {}),
        ...(notes.trim() ? { review_notes: notes.trim() } : {}),
        rollout,
      }),
    onSuccess: async (res: { status: string; rollout?: string }) => {
      addToast({
        title:
          res.status === "MERGED"
            ? "Merged with Existing Item"
            : res.status === "APPROVED"
              ? "Master Catalogue Updated"
              : "Request Rejected",
        description:
          res.status === "REJECTED"
            ? `"${reviewing?.item_name}" rejected`
            : `"${reviewing?.item_name}" ${res.status === "MERGED" ? "merged into the catalogue" : "added to the master catalogue"} · rollout: ${
                res.rollout === "NEW_ONLY" ? "new hospitals only" : "all hospitals"
              }`,
        variant: res.status === "REJECTED" ? "default" : "success",
      })
      await refresh()
      setReviewingId(null)
    },
    onError: (err) => addToast({ title: "Could not review request", description: extractDetail(err), variant: "destructive" }),
  })

  const canReopen = (i: PendingInventoryItem) =>
    i.status === "APPROVED" || i.status === "CONVERTED" || i.status === "MERGED"

  const reopenMutation = useMutation({
    mutationFn: (item: PendingInventoryItem) =>
      hospitalInventoryApi.create({
        hospital_id: item.hospital_id,
        item_id: item.converted_item_id!,
        unit: item.unit,
        quantity: 0,
      }),
    onSuccess: async () => {
      addToast({ title: "Item Added", description: "Linked the approved catalogue item back to the hospital inventory", variant: "success" })
      await queryClient.invalidateQueries({ queryKey: ["inventory-pending-items"] })
    },
    onError: (err) => addToast({ title: "Could not re-add item", description: extractDetail(err), variant: "destructive" }),
  })

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2 pr-8">
            <ClipboardCheck className="h-4 w-4 text-[var(--ds-primary)]" />
            Pending Master Approval · {pending.length}
          </DrawerTitle>
          <div className="ds-caption text-[var(--ds-text-tertiary)]">
            Hospital requests for items outside the master catalogue. Approve, reject, edit or merge — everything happens here.
          </div>
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          {reviewing ? (
            <section className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border)] px-4 py-3">
                <div>
                  <div className="ds-overline text-[var(--ds-text-secondary)]">Reviewing Request</div>
                  <div className="text-sm font-semibold text-[var(--ds-text)]">{reviewing.hospital_name}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setReviewingId(null)} disabled={reviewMutation.isPending || editMutation.isPending}>
                  <X className="h-4 w-4" />
                  All requests
                </Button>
              </div>

              <div className="space-y-4 p-4">
                <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="ds-overline text-[var(--ds-text-secondary)]">Requested Item</span>
                    {!editMode && (
                      <Button size="sm" variant="ghost" onClick={() => setEditMode(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                  {editMode ? (
                    <div className="mt-2 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="review-name">Item Name</Label>
                        <Input id="review-name" value={draft.itemName} onChange={(e) => setDraft((d) => ({ ...d, itemName: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="review-qty">Required Quantity</Label>
                          <NumericInput id="review-qty" mode="integer" min={0} value={draft.requiredQty} onChange={(v) => setDraft((d) => ({ ...d, requiredQty: v }))} placeholder="0" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="review-cost">Estimated Cost</Label>
                          <NumericInput id="review-cost" mode="currency" min={0} prefix="₹" value={draft.estimatedCost} onChange={(v) => setDraft((d) => ({ ...d, estimatedCost: v }))} placeholder="0" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="review-remarks">Remarks</Label>
                        <Textarea id="review-remarks" value={draft.remarks} onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))} rows={2} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditMode(false)} disabled={editMutation.isPending}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => editMutation.mutate()} loading={editMutation.isPending} disabled={!draft.itemName.trim()}>
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <dl className="mt-2 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--ds-text-tertiary)]">Item</dt>
                        <dd className="text-right font-medium text-[var(--ds-text)]">{reviewing.item_name}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--ds-text-tertiary)]">Category</dt>
                        <dd className="text-right text-[var(--ds-text)]">{reviewing.category_name || "Others"}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--ds-text-tertiary)]">Required Qty</dt>
                        <dd className="ds-numeric text-right text-[var(--ds-text)]">{reviewing.required_quantity ? formatNumber(reviewing.required_quantity, 0) : "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--ds-text-tertiary)]">Estimated Cost</dt>
                        <dd className="ds-numeric text-right text-[var(--ds-text)]">{formatIndianRupees(reviewing.estimated_cost)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--ds-text-tertiary)]">Requested By</dt>
                        <dd className="text-right text-[var(--ds-text)]">{reviewing.requested_by_name || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[var(--ds-text-tertiary)]">Requested Date</dt>
                        <dd className="text-right text-[var(--ds-text)]">{formatDate(reviewing.created_at)}</dd>
                      </div>
                      {reviewing.remarks && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-[var(--ds-text-tertiary)]">Remarks</dt>
                          <dd className="max-w-56 text-right text-[var(--ds-text)]">"{reviewing.remarks}"</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--ds-border)]">
                  <div className="flex items-center gap-2 border-b border-[var(--ds-border)] px-3 py-2">
                    <Merge className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
                    <span className="text-sm font-medium text-[var(--ds-text)]">Similar items in Master Catalogue</span>
                    {!dupQuery.isLoading && <span className="ds-caption text-[var(--ds-text-tertiary)]">{candidates.length}</span>}
                  </div>
                  <div className="space-y-2 p-3">
                    {exactMatch && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <p className="ds-caption text-[var(--ds-text-secondary)]">
                          An exact match already exists. Merge with the existing item to keep the catalogue clean.
                        </p>
                      </div>
                    )}
                    {dupQuery.isLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : candidates.length === 0 ? (
                      <p className="ds-caption text-[var(--ds-text-tertiary)]">No similar items found — safe to create a new master item.</p>
                    ) : (
                      candidates.map((c) => {
                        const selected = mergeTargetId === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setMergeTargetId(c.id)}
                            className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                              selected
                                ? "border-[var(--ds-primary)] bg-[var(--ds-primary)]/5"
                                : "border-[var(--ds-border)] hover:border-[var(--ds-text-tertiary)]"
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                selected ? "border-[var(--ds-primary)]" : "border-[var(--ds-border)]"
                              }`}
                            >
                              {selected && <span className="h-2 w-2 rounded-full bg-[var(--ds-primary)]" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[var(--ds-text)]">{c.name}</span>
                                {c.code && <span className="ds-caption text-[var(--ds-text-tertiary)]">{c.code}</span>}
                              </span>
                              <span className="ds-caption text-[var(--ds-text-tertiary)]">
                                {c.category_name || "Others"}
                                {c.sub_category_name ? ` / ${c.sub_category_name}` : ""}
                                {c.match_type === "EXACT" ? " · Exact match" : ` · Similar (${Math.round(c.similarity * 100)}%)`}
                              </span>
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Rollout</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setRollout("ALL")}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        rollout === "ALL" ? "border-[var(--ds-primary)] bg-[var(--ds-primary)]/5" : "border-[var(--ds-border)]"
                      }`}
                    >
                      <div className="text-sm font-medium text-[var(--ds-text)]">Option 1 · All existing hospitals</div>
                      <p className="ds-caption mt-0.5 text-[var(--ds-text-tertiary)]">
                        Add to every hospital in the group immediately. Recommended for common materials.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRollout("NEW_ONLY")}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        rollout === "NEW_ONLY" ? "border-[var(--ds-primary)] bg-[var(--ds-primary)]/5" : "border-[var(--ds-border)]"
                      }`}
                    >
                      <div className="text-sm font-medium text-[var(--ds-text)]">Option 2 · New hospitals only</div>
                      <p className="ds-caption mt-0.5 text-[var(--ds-text-tertiary)]">
                        Existing hospitals unchanged. The requesting hospital still receives the item now.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pending-review-notes">Reason / Notes</Label>
                  <Textarea
                    id="pending-review-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={editMode ? "Optional note to the requesting hospital" : "Required when rejecting — otherwise optional"}
                    rows={2}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={() => reviewMutation.mutate("REJECT")}
                    loading={reviewMutation.isPending && reviewMutation.variables === "REJECT"}
                    disabled={reviewMutation.isPending || !notes.trim()}
                  >
                    <Ban className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => reviewMutation.mutate("MERGE")}
                    loading={reviewMutation.isPending && reviewMutation.variables === "MERGE"}
                    disabled={reviewMutation.isPending || !mergeTargetId}
                  >
                    <Merge className="h-4 w-4" />
                    Merge with Existing Item
                  </Button>
                  <Button
                    className="ml-auto"
                    onClick={() => reviewMutation.mutate("APPROVE")}
                    loading={reviewMutation.isPending && reviewMutation.variables === "APPROVE"}
                    disabled={reviewMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Create New Master Item
                  </Button>
                </div>
              </div>
            </section>
          ) : pending.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--ds-border)] px-4 py-10 text-center text-sm text-[var(--ds-text-tertiary)]">
              No pending requests. Hospital admins can request custom items via Add Other Item.
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--ds-text)]">{i.item_name}</div>
                    <div className="ds-caption text-[var(--ds-text-tertiary)]">
                      {i.hospital_name} · Category: Others
                      {i.required_quantity ? ` · Qty ${formatNumber(i.required_quantity, 0)}` : ""}
                      {" "}· est. {formatIndianRupees(i.estimated_cost)} · {formatDate(i.created_at)}
                    </div>
                    {i.remarks && <div className="ds-caption mt-0.5 text-[var(--ds-text-secondary)]">"{i.remarks}"</div>}
                  </div>
                  <Button size="sm" onClick={() => startReview(i)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Review
                  </Button>
                </div>
              ))}
            </div>
          )}

          {history.length > 0 && (
            <section>
              <h3 className="ds-overline mb-3 text-[var(--ds-text-secondary)]">History · {history.length}</h3>
              <div className="overflow-x-auto rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reviewed</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="font-medium text-[var(--ds-text)]">{i.item_name}</div>
                          <div className="ds-caption text-[var(--ds-text-tertiary)]">
                            {i.category_name || "Others"}
                            {i.review_notes ? ` · ${i.review_notes}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-[var(--ds-text-secondary)]">{i.hospital_name || "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={i.status} />
                        </TableCell>
                        <TableCell className="text-[var(--ds-text-secondary)]">{formatDate(i.reviewed_at)}</TableCell>
                        <TableCell className="text-right">
                          {canReopen(i) && i.converted_item_id ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => reopenMutation.mutate(i)}
                              loading={reopenMutation.isPending}
                              aria-label={`Re-add ${i.item_name}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Re-add
                            </Button>
                          ) : (
                            <span className="ds-caption text-[var(--ds-text-tertiary)]">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

/* ── Order detail dialog ─────────────────────────────────────────────── */

const NEXT_ORDER_ACTION: Record<string, { label: string; to: MonthlyOrderStatus }> = {
  DRAFT: { label: "Submit", to: "SUBMITTED" },
  SUBMITTED: { label: "Mark Reviewed", to: "REVIEWED" },
  REVIEWED: { label: "Approve", to: "APPROVED" },
  APPROVED: { label: "Mark Ordered", to: "ORDERED" },
  ORDERED: { label: "Complete", to: "COMPLETED" },
}

function OrderDetailDialog({
  open,
  onOpenChange,
  orderId,
  isGroupAdmin,
  canEdit,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string | null
  isGroupAdmin: boolean
  canEdit: boolean
  onChanged: () => void
}) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()

  const orderQuery = useQuery<MonthlyOrder>({
    queryKey: ["inventory-order-detail", orderId],
    queryFn: () => monthlyOrdersApi.get(orderId!),
    enabled: open && !!orderId,
  })
  const order = orderQuery.data
  const nextAction = order ? NEXT_ORDER_ACTION[order.status] ?? null : null
  const canAdvance = !!nextAction && (isGroupAdmin ? nextAction.to !== "SUBMITTED" : nextAction.to === "SUBMITTED")
  const editable = !!order && canEdit && !isGroupAdmin && (order.status === "DRAFT" || order.status === "SUBMITTED")

  const transitionMutation = useMutation({
    mutationFn: () => monthlyOrdersApi.transition(orderId!, { to_status: nextAction!.to }),
    onSuccess: async () => {
      addToast({
        title: "Order Updated",
        description: `Order marked as ${nextAction!.label.toLowerCase()} (${nextAction!.to})`,
        variant: "success",
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-detail", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["monthly-orders-list"] }),
      ])
      onChanged()
    },
    onError: (err) => addToast({ title: "Could not update order", description: extractDetail(err), variant: "destructive" }),
  })

  const [editDraft, setEditDraft] = useState<Record<string, { qty: string; cost: string; remarks: string }>>({})
  useEffect(() => {
    if (!order) return
    const d: Record<string, { qty: string; cost: string; remarks: string }> = {}
    for (const it of order.items) {
      d[it.item_id] = {
        qty: String(it.required_quantity),
        cost: String(it.estimated_cost),
        remarks: it.remarks ?? "",
      }
    }
    setEditDraft(d)
  }, [order])

  const setDraftField = (itemId: string, field: "qty" | "cost" | "remarks", v: string) => {
    setEditDraft((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { qty: "", cost: "", remarks: "" }), [field]: v } }))
  }

  const updateMutation = useMutation({
    mutationFn: () => {
      const items = (order?.items || []).map((it) => {
        const d = editDraft[it.item_id]
        return {
          item_id: it.item_id,
          required_quantity: d ? parseFloat(d.qty) || 0 : it.required_quantity,
          estimated_cost: d ? parseFloat(d.cost) || 0 : it.estimated_cost,
          remarks: d?.remarks ?? it.remarks,
        }
      })
      return monthlyOrdersApi.update(orderId!, { items })
    },
    onSuccess: async () => {
      addToast({ title: "Order Updated", description: "Indent changes saved", variant: "success" })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-detail", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["monthly-orders-list"] }),
      ])
      onChanged()
    },
    onError: (err) => addToast({ title: "Could not update order", description: extractDetail(err), variant: "destructive" }),
  })

  const total = useMemo(() => {
    if (!order) return 0
    if (editable) {
      return (order.items || []).reduce((sum, it) => {
        const d = editDraft[it.item_id]
        const c = d ? parseFloat(d.cost) : NaN
        return sum + (Number.isFinite(c) ? c : it.estimated_cost || 0)
      }, 0)
    }
    return order.items.reduce((sum, i) => sum + (i.estimated_cost || 0), 0)
  }, [order, editable, editDraft])

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Monthly Order — ${order?.hospital_name || "Hospital"}`}
      description={
        order
          ? `${order.order_period} · Submitted ${formatDate(order.submitted_date)}${
              order.reviewed_date ? ` · Reviewed ${formatDate(order.reviewed_date)}` : ""
            }${editable ? " · Editable" : ""}`
          : "Loading order…"
      }
      footer={
        <>
          <div className="flex flex-1 items-center justify-end gap-6 pr-2">
            <div className="text-right">
              <div className="ds-caption text-[var(--ds-text-tertiary)]">Status</div>
              <div>{order ? <StatusBadge status={order.status} /> : "—"}</div>
            </div>
            <div className="text-right">
              <div className="ds-caption text-[var(--ds-text-tertiary)]">Estimated Cost</div>
              <div className="ds-page-subtitle ds-numeric">{formatIndianRupees(total)}</div>
            </div>
          </div>
          {canAdvance && (
            <Button onClick={() => transitionMutation.mutate()} loading={transitionMutation.isPending}>
              {nextAction!.label}
            </Button>
          )}
          {editable && (
            <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </>
      }
    >
      {orderQuery.isLoading ? (
        <LoadingSkeleton rows={6} variant="table" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Name</TableHead>
              <TableHead className="text-right">Remaining Stock</TableHead>
              <TableHead className="text-right">Required Quantity</TableHead>
              <TableHead className="text-right">Est. Cost</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(order?.items || []).map((item) => {
              const draft = editDraft[item.item_id]
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium text-[var(--ds-text)]">{item.item_name || item.item_id}</div>
                    {item.unit && <div className="ds-caption text-[var(--ds-text-tertiary)]">Unit: {item.unit}</div>}
                  </TableCell>
                  <TableCell className="ds-numeric text-right">{formatNumber(item.current_stock, 0)}</TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <NumericInput
                        mode="integer"
                        min={0}
                        value={draft?.qty ?? ""}
                        onChange={(v) => setDraftField(item.item_id, "qty", v)}
                        className="w-24 text-right"
                        aria-label={`Required quantity for ${item.item_name}`}
                      />
                    ) : (
                      <span className="ds-numeric font-medium text-[var(--ds-text)]">{formatNumber(item.required_quantity, 0)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <NumericInput
                        mode="currency"
                        min={0}
                        prefix="₹"
                        value={draft?.cost ?? ""}
                        onChange={(v) => setDraftField(item.item_id, "cost", v)}
                        className="w-28 text-right"
                        aria-label={`Estimated cost for ${item.item_name}`}
                      />
                    ) : (
                      <span className="ds-numeric">{formatIndianRupees(item.estimated_cost)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        value={draft?.remarks ?? ""}
                        onChange={(e) => setDraftField(item.item_id, "remarks", e.target.value)}
                        placeholder="Optional"
                        className="h-8 w-full min-w-40"
                        aria-label={`Remarks for ${item.item_name}`}
                      />
                    ) : (
                      <span className="text-[var(--ds-text-secondary)]">{item.remarks || "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {order && order.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-[var(--ds-text-tertiary)]">
                  No items on this order.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </FullscreenDialog>
  )
}

/* ── Orders list dialog ──────────────────────────────────────────────── */

function OrdersDialog({
  open,
  onOpenChange,
  hospitalId,
  onViewOrder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hospitalId: string | null
  onViewOrder: (orderId: string) => void
}) {
  const ordersQuery = useQuery<PaginatedResponse<MonthlyOrder>>({
    queryKey: ["inventory-orders", hospitalId],
    queryFn: () => monthlyOrdersApi.list({ hospital_id: hospitalId || undefined, page_size: 50 }),
    enabled: open,
  })
  const orders = ordersQuery.data?.items || []

  return (
    <FullscreenDialog open={open} onOpenChange={onOpenChange} title="Monthly Orders">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hospital</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right">Est. Cost</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordersQuery.isLoading ? (
            <TableRow>
              <TableCell colSpan={7}>
                <Skeleton className="h-8 w-full" />
              </TableCell>
            </TableRow>
          ) : orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-[var(--ds-text-tertiary)]">
                No monthly orders yet.
              </TableCell>
            </TableRow>
          ) : (
            orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-[var(--ds-text-secondary)]">{o.hospital_name || "—"}</TableCell>
                <TableCell className="ds-numeric text-[var(--ds-text)]">{o.order_period}</TableCell>
                <TableCell>
                  <StatusBadge status={o.status} />
                </TableCell>
                <TableCell className="ds-numeric text-right">{o.items.length}</TableCell>
                <TableCell className="ds-numeric text-right">{formatIndianRupees(o.estimated_cost_total)}</TableCell>
                <TableCell className="text-[var(--ds-text-secondary)]">{formatDate(o.submitted_date)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onViewOrder(o.id)}>
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </FullscreenDialog>
  )
}

/* ── Item detail drawer ──────────────────────────────────────────────── */

function ItemDetailDrawer({
  row,
  hospitalId,
  qty,
  cost,
  remarks,
  open,
  onOpenChange,
}: {
  row: IndentRow | null
  hospitalId: string | null
  qty: string
  cost: string
  remarks: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const transactionsQuery = useQuery({
    queryKey: ["inventory-detail-txns", hospitalId, row?.itemId],
    queryFn: () => inventoryTransactionsApi.list({ hospital_id: hospitalId, item_id: row!.itemId, page_size: 8 }),
    enabled: open && !!hospitalId && !!row,
  })
  const ordersQuery = useQuery<PaginatedResponse<MonthlyOrder>>({
    queryKey: ["inventory-orders", hospitalId],
    queryFn: () => monthlyOrdersApi.list({ hospital_id: hospitalId || undefined, page_size: 50 }),
    enabled: open && !!hospitalId,
  })

  const transactions = (transactionsQuery.data as { items?: Array<{ id: string; transaction_type: string; quantity: number; current_balance: number; transaction_date: string }> } | undefined)?.items || []
  const previousIndents = useMemo(() => {
    const out: { period: string; status: string; required: number; cost: number }[] = []
    for (const order of ordersQuery.data?.items || []) {
      for (const item of order.items) {
        if (item.item_id === row?.itemId) {
          out.push({
            period: order.order_period,
            status: order.status,
            required: item.required_quantity,
            cost: item.estimated_cost,
          })
        }
      }
    }
    out.sort((a, b) => b.period.localeCompare(a.period))
    return out
  }, [ordersQuery.data, row?.itemId])

  const parsedQty = qty ? parseFloat(qty) : 0
  const parsedCost = cost ? parseFloat(cost) : 0

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2 pr-8">
            <Package className="h-4 w-4 text-[var(--ds-primary)]" />
            {row?.itemName}
          </DrawerTitle>
          <div className="flex flex-wrap items-center gap-2">
            {row?.categoryName && (
              <span className="ds-caption text-[var(--ds-text-tertiary)]">
                {row.categoryName}{row.subCategoryName ? ` / ${row.subCategoryName}` : ""}
              </span>
            )}
          </div>
        </DrawerHeader>

        <DrawerBody className="space-y-6">
          <section>
            <h3 className="ds-overline mb-2 text-[var(--ds-text-secondary)]">Basic Information</h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-text-tertiary)]">Unit</dt>
                <dd className="text-[var(--ds-text)]">{row?.unit || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-text-tertiary)]">Category</dt>
                <dd className="text-[var(--ds-text)]">{row?.categoryName || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-text-tertiary)]">Sub Category</dt>
                <dd className="text-[var(--ds-text)]">{row?.subCategoryName || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-text-tertiary)]">Remaining Stock</dt>
                <dd className="ds-numeric text-[var(--ds-text)]">
                  {formatNumber(row?.quantity ?? 0, 0)} {row?.unit}
                </dd>
              </div>
            </dl>
          </section>

          <Separator />

          <section>
            <h3 className="ds-overline mb-2 text-[var(--ds-text-secondary)]">Current Month Entry</h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-text-tertiary)]">Required Quantity</dt>
                <dd className="ds-numeric text-[var(--ds-text)]">
                  {parsedQty > 0 ? `${formatNumber(parsedQty, 0)} ${row?.unit || ""}` : "Not set"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-text-tertiary)]">Estimated Cost</dt>
                <dd className="ds-numeric text-[var(--ds-text)]">
                  {parsedCost > 0 ? formatIndianRupees(parsedCost) : "Not set"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ds-text-tertiary)]">Remarks</dt>
                <dd className="text-right text-[var(--ds-text)]">{remarks || "—"}</dd>
              </div>
            </dl>
          </section>

          <Separator />

          <section>
            <h3 className="ds-overline mb-2 flex items-center gap-1.5 text-[var(--ds-text-secondary)]">
              <History className="h-3.5 w-3.5" />
              Previous Indents
            </h3>
            {previousIndents.length === 0 ? (
              <p className="ds-caption text-[var(--ds-text-tertiary)]">No previous indents for this item.</p>
            ) : (
              <div className="space-y-2">
                {previousIndents.map((p, i) => (
                  <div key={`${p.period}-${i}`} className="flex items-center justify-between rounded-lg border border-[var(--ds-border)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                      <span className="ds-caption text-[var(--ds-text-secondary)]">{p.period}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <span className="ds-numeric ds-caption text-[var(--ds-text)]">
                      {formatNumber(p.required, 0)} · {formatIndianRupees(p.cost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section>
            <h3 className="ds-overline mb-2 flex items-center gap-1.5 text-[var(--ds-text-secondary)]">
              <History className="h-3.5 w-3.5" />
              Stock History
            </h3>
            {transactions.length === 0 ? (
              <p className="ds-caption text-[var(--ds-text-tertiary)]">No stock updates recorded.</p>
            ) : (
              <div className="space-y-2">
                {transactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-[var(--ds-border)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={t.transaction_type} />
                      <span className="ds-caption text-[var(--ds-text-tertiary)]">{formatDate(t.transaction_date)}</span>
                    </div>
                    <span className="ds-numeric ds-caption text-[var(--ds-text)]">
                      {formatNumber(t.quantity, 0)} → {formatNumber(t.current_balance, 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

/* ── Indent table ────────────────────────────────────────────────────── */

type DisplayNode =
  | { kind: "category"; key: string; name: string; count: number }
  | { kind: "sub"; key: string; name: string; count: number }
  | { kind: "item"; row: IndentRow }

function IndentTable({
  rows,
  collapsed,
  onToggle,
  qty,
  cost,
  remarks,
  stock,
  stockSaving,
  onQtyChange,
  onCostChange,
  onRemarksChange,
  onStockChange,
  onStockBlur,
  onView,
  readOnly,
  editable,
  total,
}: {
  rows: IndentRow[]
  collapsed: Set<string>
  onToggle: (key: string) => void
  qty: Record<string, string>
  cost: Record<string, string>
  remarks: Record<string, string>
  stock: Record<string, string>
  stockSaving: Record<string, boolean>
  onQtyChange: (itemId: string, v: string) => void
  onCostChange: (itemId: string, v: string) => void
  onRemarksChange: (itemId: string, v: string) => void
  onStockChange: (recordId: string, v: string) => void
  onStockBlur: (row: IndentRow) => void
  onView: (row: IndentRow) => void
  readOnly: boolean
  editable: boolean
  total: number
}) {
  const sections = useMemo(() => groupRows(rows), [rows])

  const nodes = useMemo(() => {
    const out: DisplayNode[] = []
    for (const section of sections) {
      const catKey = `c:${section.categoryName}`
      const catCount = section.subs.reduce((n, s) => n + s.rows.length, 0)
      out.push({ kind: "category", key: catKey, name: section.categoryName, count: catCount })
      if (collapsed.has(catKey)) continue
      for (const sub of section.subs) {
        const subKey = `s:${section.categoryName}::${sub.subName}`
        out.push({ kind: "sub", key: subKey, name: sub.subName, count: sub.rows.length })
        if (collapsed.has(subKey)) continue
        for (const row of sub.rows) out.push({ kind: "item", row })
      }
    }
    return out
  }, [sections, collapsed])

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item Name</TableHead>
            <TableHead className="text-right">Remaining Stock</TableHead>
            <TableHead className="text-right">Required Quantity</TableHead>
            <TableHead className="text-right">Estimated Cost</TableHead>
            <TableHead>Remarks</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.map((node) => {
            if (node.kind === "category") {
              const open = !collapsed.has(node.key)
              return (
                <TableRow key={node.key} className="cursor-pointer bg-[var(--ds-surface-secondary)]" onClick={() => onToggle(node.key)}>
                  <TableCell colSpan={6} className="py-2.5">
                    <button type="button" className="flex w-full items-center gap-2 text-left">
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" />
                      )}
                      <span className="text-sm font-semibold text-[var(--ds-text)]">{node.name}</span>
                      <span className="ds-caption text-[var(--ds-text-tertiary)]">{node.count} item{node.count === 1 ? "" : "s"}</span>
                    </button>
                  </TableCell>
                </TableRow>
              )
            }
            if (node.kind === "sub") {
              const open = !collapsed.has(node.key)
              return (
                <TableRow key={node.key} className="cursor-pointer bg-[var(--ds-surface-muted)]/60" onClick={() => onToggle(node.key)}>
                  <TableCell colSpan={6} className="py-2">
                    <button type="button" className="flex w-full items-center gap-2 pl-4 text-left">
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" />
                      )}
                      <span className="text-sm font-medium text-[var(--ds-text-secondary)]">{node.name}</span>
                      <span className="ds-caption text-[var(--ds-text-tertiary)]">{node.count} item{node.count === 1 ? "" : "s"}</span>
                    </button>
                  </TableCell>
                </TableRow>
              )
            }

            const row = node.row
            const stockVal = stock[row.recordId] ?? String(row.quantity)
            const isSaving = !!stockSaving[row.recordId]
            return (
              <TableRow key={row.itemId}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" />
                    <div className="font-medium text-[var(--ds-text)]">{row.itemName}</div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <NumericInput
                      mode="integer"
                      min={0}
                      value={stockVal}
                      onChange={(v) => onStockChange(row.recordId, v)}
                      onBlur={() => onStockBlur(row)}
                      disabled={!editable || readOnly}
                      className="w-24 text-right"
                      aria-label={`Remaining stock for ${row.itemName}`}
                    />
                    {isSaving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--ds-text-tertiary)]" />}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <NumericInput
                    mode="integer"
                    min={0}
                    value={qty[row.itemId] ?? ""}
                    onChange={(v) => onQtyChange(row.itemId, v)}
                    disabled={!editable || readOnly}
                    className="w-24 text-right"
                    aria-label={`Required quantity for ${row.itemName}`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <NumericInput
                    mode="currency"
                    min={0}
                    prefix="₹"
                    value={cost[row.itemId] ?? ""}
                    onChange={(v) => onCostChange(row.itemId, v)}
                    disabled={!editable || readOnly}
                    className="w-32 text-right"
                    aria-label={`Estimated cost for ${row.itemName}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={remarks[row.itemId] ?? ""}
                    onChange={(e) => onRemarksChange(row.itemId, e.target.value)}
                    disabled={!editable || readOnly}
                    placeholder="Optional"
                    className="h-8 w-full min-w-40"
                    aria-label={`Remarks for ${row.itemName}`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon-sm" variant="ghost" onClick={() => onView(row)} aria-label={`View details for ${row.itemName}`}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {rows.length > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-4 py-3">
          <div className="ds-caption text-[var(--ds-text-tertiary)]">
            {rows.length} item{rows.length === 1 ? "" : "s"} · {qtyCount()} with quantity
          </div>
          <div className="text-right">
            <div className="ds-caption text-[var(--ds-text-tertiary)]">Estimated Cost Total</div>
            <div className="ds-page-subtitle ds-numeric text-[var(--ds-text)]">{formatIndianRupees(total)}</div>
          </div>
        </div>
      )}
    </div>
  )

  function qtyCount() {
    let n = 0
    for (const k of Object.keys(qty)) {
      const v = parseFloat(qty[k])
      if (Number.isFinite(v) && v > 0) n++
    }
    return n
  }
}

/* ── Group consolidated view (Group Admin / Super Admin) ──────────── */

const STATUS_ORDER: MonthlyOrderStatus[] = ["DRAFT", "SUBMITTED", "REVIEWED", "APPROVED", "ORDERED", "COMPLETED"]

function GroupConsolidatedView({
  period,
  onOpenAudit,
}: {
  period: string
  onOpenAudit: () => void
}) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState("all")
  const [hospitalSearch, setHospitalSearch] = useState("")
  const [itemSearch, setItemSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [generated, setGenerated] = useState<GenerateConsolidatedResponse | null>(null)
  const [exportBusy, setExportBusy] = useState(false)

  useEffect(() => {
    setGenerated(null)
    setCollapsed(new Set())
    setStatusFilter("all")
    setHospitalSearch("")
    setItemSearch("")
  }, [period])

  const overviewQuery = useQuery<MonthlyOrderOverview>({
    queryKey: ["inventory-overview", period],
    queryFn: () => monthlyOrdersApi.overview({ order_period: period }),
  })
  const overview = overviewQuery.data

  const validateQuery = useQuery<ValidationResult>({
    queryKey: ["inventory-validate", period],
    queryFn: () => monthlyOrdersApi.validate({ order_period: period }),
  })
  const validation = validateQuery.data

  const consolidatedQuery = useQuery<ConsolidatedOrderResponse>({
    queryKey: ["inventory-consolidated", period],
    queryFn: () => monthlyOrdersApi.consolidated({ order_period: period }),
    enabled: !!overview && overview.orders_submitted > 0,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-overview", period] })
    queryClient.invalidateQueries({ queryKey: ["inventory-validate", period] })
    queryClient.invalidateQueries({ queryKey: ["inventory-consolidated", period] })
  }

  const generateMutation = useMutation({
    mutationFn: () => monthlyOrdersApi.generate({ order_period: period }),
    onSuccess: async (data: GenerateConsolidatedResponse) => {
      setGenerated(data)
      if (data.validated && data.consolidated) {
        addToast({
          title: "Consolidated Indent Generated",
          description: `${data.consolidated.items.length} items · ${formatIndianRupees(data.consolidated.grand_total_cost)} estimated for ${period}`,
          variant: "success",
        })
      } else {
        addToast({
          title: "Cannot Generate Yet",
          description: `${data.validation.errors.length} validation issue(s) must be resolved first`,
          variant: "destructive",
        })
      }
      queryClient.invalidateQueries({ queryKey: ["inventory-audit"] })
    },
    onError: (err) => addToast({ title: "Generate Failed", description: extractDetail(err), variant: "destructive" }),
  })

  const exportConsolidated = async (format: "pdf" | "excel" | "csv") => {
    setExportBusy(true)
    try {
      const blob = await inventoryReportApi.get({
        report_type: "consolidated",
        format,
        order_period: period,
      })
      downloadBlob(blob, `consolidated_order_${period}.${format}`)
      addToast({ title: "Export Complete", description: "Group consolidated order exported", variant: "success" })
    } catch (err) {
      addToast({ title: "Export Failed", description: extractDetail(err), variant: "destructive" })
    } finally {
      setExportBusy(false)
    }
  }

  const hospitalRows = useMemo(() => {
    const rows = overview?.hospitals || []
    const q = hospitalSearch.trim().toLowerCase()
    const filtered = q ? rows.filter((h) => (h.hospital_name || "").toLowerCase().includes(q)) : rows
    if (statusFilter === "all") return filtered
    return filtered.filter((h) => h.status === statusFilter)
  }, [overview, statusFilter, hospitalSearch])

  const displayConsolidated = generated?.consolidated ?? consolidatedQuery.data

  const matrixItems = useMemo(() => {
    if (!displayConsolidated) return []
    const q = itemSearch.trim().toLowerCase()
    if (!q) return displayConsolidated.items
    return displayConsolidated.items.filter(
      (i) =>
        (i.item_name || "").toLowerCase().includes(q) ||
        (i.item_code || "").toLowerCase().includes(q) ||
        (i.category_name || "").toLowerCase().includes(q) ||
        (i.sub_category_name || "").toLowerCase().includes(q),
    )
  }, [displayConsolidated, itemSearch])

  const sortedHospitals = useMemo(
    () => [...(displayConsolidated?.hospitals || [])].sort((a, b) => a.hospital_name.localeCompare(b.hospital_name)),
    [displayConsolidated],
  )

  const matrixSections = useMemo(() => {
    const map = new Map<string, Map<string, ConsolidatedOrderItem[]>>()
    for (const item of matrixItems) {
      const cat = item.category_name || "Others"
      const sub = item.sub_category_name || "General"
      if (!map.has(cat)) map.set(cat, new Map())
      const subs = map.get(cat)!
      if (!subs.has(sub)) subs.set(sub, [])
      subs.get(sub)!.push(item)
    }
    const out: { categoryName: string; subs: { subName: string; items: ConsolidatedOrderItem[] }[] }[] = []
    for (const [cat, subs] of map) {
      const section = { categoryName: cat, subs: [] as { subName: string; items: ConsolidatedOrderItem[] }[] }
      for (const [sub, sItems] of subs) {
        section.subs.push({ subName: sub, items: [...sItems].sort((a, b) => a.item_name.localeCompare(b.item_name)) })
      }
      section.subs.sort((a, b) => a.subName.localeCompare(b.subName))
      out.push(section)
    }
    out.sort((a, b) => a.categoryName.localeCompare(b.categoryName))
    return out
  }, [matrixItems])

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const submittedCount = overview?.orders_submitted ?? 0
  const totalHospitals = overview?.orders_total ?? 0
  const matrixColSpan = 2 + sortedHospitals.length * 2

  return (
    <div className="space-y-6">
      {/* Toolbar — submission status chips + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ds-caption text-[var(--ds-text-tertiary)]">Submission Status</span>
          <StatusBadge status={submittedCount === totalHospitals && totalHospitals > 0 ? "APPROVED" : "SUBMITTED"} />
          <span className="ds-caption text-[var(--ds-text-secondary)]">
            {submittedCount}/{totalHospitals} hospitals submitted
          </span>
          {STATUS_ORDER.map((s) => {
            const count = overview?.status_counts[s] ?? 0
            if (count === 0) return null
            return (
              <span key={s} className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-2.5 py-0.5 text-xs text-[var(--ds-text-secondary)]">
                {s} · {count}
              </span>
            )
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" loading={exportBusy}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Consolidated Monthly Indent</DropdownMenuLabel>
              {(["pdf", "excel", "csv"] as const).map((f) => (
                <DropdownMenuItem key={f} disabled={exportBusy} onSelect={() => exportConsolidated(f)}>
                  {(() => {
                    const Icon = FORMAT_ICONS[f]
                    return <Icon className="h-4 w-4" />
                  })()}
                  {f.toUpperCase()}
                  {exportBusy && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={onOpenAudit}>
            <History className="h-4 w-4" />
            Audit &amp; History
          </Button>
          <Button size="sm" onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>
            <Send className="h-4 w-4" />
            Generate Consolidated Monthly Indent
          </Button>
        </div>
      </div>

      {/* Validation panel */}
      {(overviewQuery.isLoading || validateQuery.isLoading) ? (
        <LoadingSkeleton rows={2} variant="card" />
      ) : validation ? (
        validation.is_valid ? (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-primary)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--ds-text)]">
                Pre-Export Validation Passed
              </div>
              <div className="ds-caption text-[var(--ds-text-tertiary)]">
                All {validation.hospitals_checked} hospital submissions are valid. You can generate the consolidated monthly indent.
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <span className="text-sm font-medium text-[var(--ds-text)]">
                Pre-Export Validation Failed · {validation.errors.length} error{validation.errors.length === 1 ? "" : "s"}
                {validation.warnings.length > 0 ? ` · ${validation.warnings.length} warning${validation.warnings.length === 1 ? "" : "s"}` : ""}
              </span>
              <Button size="sm" variant="ghost" onClick={refresh} className="ml-auto">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
            {validation.errors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {validation.errors.map((e, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-[var(--ds-text-secondary)]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {validation.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-[var(--ds-border)] pt-2">
                {validation.warnings.map((e, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-[var(--ds-text-tertiary)]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      ) : null}

      {/* Submission status table */}
      <section className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
            <h3 className="text-sm font-semibold text-[var(--ds-text)]">Monthly Submission Status — {period}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar value={hospitalSearch} onChange={setHospitalSearch} placeholder="Search hospital…" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="overview-status" aria-label="Filter by status" className="h-9 w-44 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hospital</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted By</TableHead>
                <TableHead>Submitted Date</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overviewQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : hospitalRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-[var(--ds-text-tertiary)]">
                    No submissions{statusFilter !== "all" ? ` with status ${statusFilter}` : ""} found for {period}.
                  </TableCell>
                </TableRow>
              ) : (
                hospitalRows.map((h) => (
                  <TableRow key={h.hospital_id}>
                    <TableCell className="font-medium text-[var(--ds-text)]">{h.hospital_name}</TableCell>
                    <TableCell>
                      {h.status ? <StatusBadge status={h.status} /> : <span className="ds-caption text-[var(--ds-text-tertiary)]">Not submitted</span>}
                    </TableCell>
                    <TableCell className="text-[var(--ds-text-secondary)]">{h.submitted_by_name || "—"}</TableCell>
                    <TableCell className="text-[var(--ds-text-secondary)]">{formatDate(h.submitted_date)}</TableCell>
                    <TableCell className="text-[var(--ds-text-secondary)]">{formatDateTime(h.last_updated)}</TableCell>
                    <TableCell className="max-w-56 text-[var(--ds-text-secondary)]">{h.remarks || "—"}</TableCell>
                    <TableCell className="ds-numeric text-right">{h.has_order ? h.items_requested : "—"}</TableCell>
                    <TableCell className="ds-numeric text-right">{h.has_order ? formatIndianRupees(h.estimated_cost) : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {overview && (
          <div className="flex items-center justify-between border-t border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-4 py-3">
            <div className="ds-caption text-[var(--ds-text-tertiary)]">
              {overview.orders_submitted} of {overview.orders_total} hospitals submitted · {overview.total_items} items
            </div>
            <div className="text-right">
              <div className="ds-caption text-[var(--ds-text-tertiary)]">Group Estimated Cost</div>
              <div className="ds-page-subtitle ds-numeric text-[var(--ds-text)]">{formatIndianRupees(overview.estimated_cost_total)}</div>
            </div>
          </div>
        )}
      </section>

      {/* Consolidated matrix */}
      <section className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
            <h3 className="text-sm font-semibold text-[var(--ds-text)]">Consolidated Order — {period}</h3>
            {displayConsolidated && (
              <span className="ds-caption text-[var(--ds-text-tertiary)]">
                {displayConsolidated.items.length} items · computed live from hospital submissions
              </span>
            )}
          </div>
          <div className="w-full max-w-sm">
            <SearchBar value={itemSearch} onChange={setItemSearch} placeholder="Search item, category or sub category…" />
          </div>
        </div>
        {displayConsolidated && displayConsolidated.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-44">Item</TableHead>
                    {sortedHospitals.map((h) => (
                      <TableHead key={h.hospital_id} className="min-w-28 px-2 text-center">
                        {h.hospital_name}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total Required</TableHead>
                    <TableHead className="text-right">Total Est. Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="border-t border-[var(--ds-border)]" />
                    {sortedHospitals.map((h) => (
                      <TableHead key={h.hospital_id} className="border-t border-[var(--ds-border)] px-2 py-1 text-center text-[10px] text-[var(--ds-text-tertiary)]">
                        Remaining / Required
                      </TableHead>
                    ))}
                    <TableHead className="border-t border-[var(--ds-border)]" />
                    <TableHead className="border-t border-[var(--ds-border)]" />
                    <TableHead className="border-t border-[var(--ds-border)]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixSections.map((section) => {
                    const catKey = `c:${section.categoryName}`
                    const catOpen = !collapsed.has(catKey)
                    const catCount = section.subs.reduce((n, s) => n + s.items.length, 0)
                    return (
                      <Fragment key={catKey}>
                        <TableRow className="cursor-pointer bg-[var(--ds-surface-secondary)]" onClick={() => toggleCollapsed(catKey)}>
                          <TableCell colSpan={matrixColSpan} className="py-2.5">
                            <button type="button" className="flex w-full items-center gap-2 text-left">
                              {catOpen ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" />
                              )}
                              <span className="text-sm font-semibold text-[var(--ds-text)]">{section.categoryName}</span>
                              <span className="ds-caption text-[var(--ds-text-tertiary)]">{catCount} item{catCount === 1 ? "" : "s"}</span>
                            </button>
                          </TableCell>
                        </TableRow>
                        {catOpen && section.subs.map((sub) => {
                          const subKey = `s:${section.categoryName}::${sub.subName}`
                          const subOpen = !collapsed.has(subKey)
                          return (
                            <Fragment key={subKey}>
                              <TableRow className="cursor-pointer bg-[var(--ds-surface-muted)]/60" onClick={() => toggleCollapsed(subKey)}>
                                <TableCell colSpan={matrixColSpan} className="py-2">
                                  <button type="button" className="flex w-full items-center gap-2 pl-4 text-left">
                                    {subOpen ? (
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" />
                                    )}
                                    <span className="text-sm font-medium text-[var(--ds-text-secondary)]">{sub.subName}</span>
                                    <span className="ds-caption text-[var(--ds-text-tertiary)]">{sub.items.length} item{sub.items.length === 1 ? "" : "s"}</span>
                                  </button>
                                </TableCell>
                              </TableRow>
                              {subOpen && sub.items.map((item) => {
                                const submittedHere = sortedHospitals.filter((h) => item.hospitals[h.hospital_id]?.status && item.hospitals[h.hospital_id].status !== "DRAFT").length
                                const allSubmitted = submittedHere === sortedHospitals.length
                                return (
                                  <TableRow key={item.item_id}>
                                    <TableCell>
                                      <div className="font-medium text-[var(--ds-text)]">{item.item_name}</div>
                                      <div className="ds-caption text-[var(--ds-text-tertiary)]">{item.unit ? `Unit: ${item.unit}` : ""}</div>
                                    </TableCell>
                                    {sortedHospitals.map((h) => {
                                      const cell = item.hospitals[h.hospital_id]
                                      return (
                                        <TableCell key={h.hospital_id} className="px-2 text-center">
                                          {cell ? (
                                            <div className="flex flex-col items-center">
                                              <span className="ds-caption text-[var(--ds-text-tertiary)]">{formatNumber(cell.current_stock, 0)}</span>
                                              <span className="ds-numeric text-sm font-medium text-[var(--ds-text)]">{formatNumber(cell.required_quantity, 0)}</span>
                                            </div>
                                          ) : (
                                            <span className="ds-caption text-[var(--ds-text-tertiary)]">—</span>
                                          )}
                                        </TableCell>
                                      )
                                    })}
                                    <TableCell className="ds-numeric text-right font-medium text-[var(--ds-text)]">{formatNumber(item.total_quantity, 0)}</TableCell>
                                    <TableCell className="ds-numeric text-right">{formatIndianRupees(item.estimated_cost)}</TableCell>
                                    <TableCell>
                                      {allSubmitted ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-primary)]">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          All submitted
                                        </span>
                                      ) : (
                                        <span className="ds-caption text-[var(--ds-text-tertiary)]">{submittedHere}/{sortedHospitals.length} submitted</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </Fragment>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-4 py-3">
              <div className="ds-caption text-[var(--ds-text-tertiary)]">
                Generated {displayConsolidated.generated_at ? formatDateTime(displayConsolidated.generated_at) : "live"}
              </div>
              <div className="flex gap-8">
                <div className="text-right">
                  <div className="ds-caption text-[var(--ds-text-tertiary)]">Grand Total Required</div>
                  <div className="ds-page-subtitle ds-numeric text-[var(--ds-text)]">{formatNumber(displayConsolidated.grand_total_quantity, 0)}</div>
                </div>
                <div className="text-right">
                  <div className="ds-caption text-[var(--ds-text-tertiary)]">Grand Total Est. Cost</div>
                  <div className="ds-page-subtitle ds-numeric text-[var(--ds-text)]">{formatIndianRupees(displayConsolidated.grand_total_cost)}</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="px-4 py-10">
            <EmptyState
              icon={ClipboardList}
              title="No submissions to consolidate"
              description={
                overview?.orders_submitted
                  ? `None of the submitted indents produced line items for ${period}.`
                  : `Hospitals have not submitted monthly indents for ${period} yet.`
              }
            />
          </div>
        )}
      </section>
    </div>
  )
}

/* ── Audit & history dialog ────────────────────────────────────────── */

function AuditDialog({
  open,
  onOpenChange,
  period,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  period: string
}) {
  const pageSize = 50
  const [page, setPage] = useState(1)

  const auditQuery = useQuery<AuditHistoryResponse>({
    queryKey: ["inventory-audit", period, page],
    queryFn: () => monthlyOrdersApi.audit({ page, page_size: pageSize, order_period: period }),
    enabled: open,
  })
  const data = auditQuery.data
  const entries = data?.items || []

  useEffect(() => {
    if (open) setPage(1)
  }, [open])

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Audit & History"
      description={`Group workflow trail${period ? ` for ${period}` : ""} — created, modified, submitted, reviewed, approved and other-item activity.`}
      footer={
        <>
          <div className="flex flex-1 items-center gap-4 pr-2 text-sm text-[var(--ds-text-tertiary)]">
            {data ? `${data.total} record${data.total === 1 ? "" : "s"}` : "—"}
            {auditQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="ghost"
            disabled={!!data && page * pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Hospital</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="min-w-36">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {auditQuery.isLoading ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Skeleton className="h-8 w-full" />
              </TableCell>
            </TableRow>
          ) : entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-[var(--ds-text-tertiary)]">
                No audit records found.
              </TableCell>
            </TableRow>
          ) : (
            entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <div className="font-medium text-[var(--ds-text)]">{e.action}</div>
                  {e.details && <div className="ds-caption text-[var(--ds-text-tertiary)]">{e.details}</div>}
                </TableCell>
                <TableCell className="ds-caption text-[var(--ds-text-secondary)]">{e.entity_type}</TableCell>
                <TableCell className="text-[var(--ds-text-secondary)]">{e.hospital_name || "—"}</TableCell>
                <TableCell className="text-[var(--ds-text-secondary)]">{e.user_name || "—"}</TableCell>
                <TableCell className="text-[var(--ds-text-secondary)]">{formatDateTime(e.created_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </FullscreenDialog>
  )
}

/* ── Hospital other-items section (Hospital Admin / Doctor) ────────── */

function HospitalPendingSection({ hospitalId, orderPeriod }: { hospitalId: string; orderPeriod: string }) {
  const pendingQuery = useQuery<PendingInventoryItemsResponse>({
    queryKey: ["inventory-pending-items", hospitalId, orderPeriod],
    queryFn: () => pendingInventoryItemsApi.list({ hospital_id: hospitalId, order_period: orderPeriod, page_size: 100 }),
  })
  const items = pendingQuery.data?.items || []
  const anyPending = items.some((i) => i.status === "PENDING")

  return (
    <section className="mt-6 rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
          <h3 className="text-sm font-semibold text-[var(--ds-text)]">Other Items — Pending Master Approval</h3>
          {anyPending && <StatusBadge status="PENDING" />}
        </div>
        <span className="ds-caption text-[var(--ds-text-tertiary)]">{orderPeriod}</span>
      </div>
      {pendingQuery.isLoading ? (
        <div className="p-4">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--ds-text-tertiary)]">
          No other-item requests for {orderPeriod}. Use “Add Other Item” to request materials missing from the catalogue.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Required Qty</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead>Remarks / Reason</TableHead>
                <TableHead>Reviewed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium text-[var(--ds-text)]">{i.item_name}</div>
                    <div className="ds-caption text-[var(--ds-text-tertiary)]">
                      Category: Others · Requested {formatDate(i.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={i.status} />
                  </TableCell>
                  <TableCell className="ds-numeric text-right">{i.required_quantity ? formatNumber(i.required_quantity, 0) : "—"}</TableCell>
                  <TableCell className="ds-numeric text-right">{formatIndianRupees(i.estimated_cost)}</TableCell>
                  <TableCell className="max-w-56 text-[var(--ds-text-secondary)]">
                    {i.status === "REJECTED" ? (i.review_notes || "Rejected by group admin") : i.remarks || "—"}
                  </TableCell>
                  <TableCell className="text-[var(--ds-text-secondary)]">
                    {i.reviewed_at ? (
                      <>
                        {formatDate(i.reviewed_at)}
                        {i.reviewed_by_name && (
                          <div className="ds-caption text-[var(--ds-text-tertiary)]">by {i.reviewed_by_name}</div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function InventoryPage() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const ctx = useHospitalContext()

  const [search, setSearch] = useState("")
  const [period, setPeriod] = useState(defaultOrderPeriod())
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<IndentRow | null>(null)
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({})
  const [costDraft, setCostDraft] = useState<Record<string, string>>({})
  const [remarksDraft, setRemarksDraft] = useState<Record<string, string>>({})
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({})
  const [stockSaving, setStockSaving] = useState<Record<string, boolean>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const hospitalsQuery = useQuery<Hospital[]>({
    queryKey: ["inventory-hospitals"],
    queryFn: () => hospitalsApi.list(),
    enabled: ctx.showSelector,
  })
  const hospitals = useMemo(() => hospitalsQuery.data || [], [hospitalsQuery.data])

  const pendingCountQuery = useQuery<PendingInventoryItemsResponse>({
    queryKey: ["inventory-pending-count"],
    queryFn: () => pendingInventoryItemsApi.list({ page_size: 1, status: "PENDING" }),
    enabled: ctx.isGroupAdmin,
    refetchInterval: 30_000,
  })
  const pendingCount = pendingCountQuery.data?.total ?? 0

  const hospitalName = useMemo(() => {
    if (!ctx.effectiveHospitalId) return ""
    const h = hospitals.find((x) => x.id === ctx.effectiveHospitalId)
    if (h?.name) return h.name
    return ctx.role === "HOSPITAL_ADMIN" || ctx.role === "DOCTOR" ? (useAuthStore.getState().user?.hospital_name || "") : ""
  }, [ctx.effectiveHospitalId, ctx.role, hospitals])

  const stockQuery = useQuery<PaginatedResponse<HospitalInventory>>({
    queryKey: ["hospital-inventory", ctx.effectiveHospitalId],
    queryFn: async () => {
      const pageSize = 200
      const first = await hospitalInventoryApi.list({
        hospital_id: ctx.effectiveHospitalId,
        page_size: pageSize,
      })
      const totalPages = first.pages || Math.ceil(first.total / pageSize) || 1
      if (totalPages <= 1) return first
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          hospitalInventoryApi.list({
            hospital_id: ctx.effectiveHospitalId,
            page: i + 2,
            page_size: pageSize,
          }),
        ),
      )
      return {
        ...first,
        items: [...first.items, ...rest.flatMap((r) => r.items)],
        pages: totalPages,
      }
    },
    enabled: !!ctx.effectiveHospitalId,
  })

  const orderQuery = useQuery<PaginatedResponse<MonthlyOrder>>({
    queryKey: ["monthly-orders-list", ctx.effectiveHospitalId, period],
    queryFn: () =>
      monthlyOrdersApi.list({ hospital_id: ctx.effectiveHospitalId, order_period: period, page_size: 1 }),
    enabled: !!ctx.effectiveHospitalId,
  })

  const existingOrder = orderQuery.data?.items?.[0] ?? null
  const readOnly = !!existingOrder && existingOrder.status !== "DRAFT"

  const allHospitalsMode = ctx.showSelector && !ctx.effectiveHospitalId

  const allRows: IndentRow[] = useMemo(() => {
    const stock = stockQuery.data?.items || []
    return stock.map((r) => ({
      recordId: r.id,
      itemId: r.item_id,
      itemName: r.item_name || r.item_id,
      itemCode: r.item_code,
      unit: r.unit || "",
      categoryName: r.category_name,
      subCategoryName: r.sub_category_name,
      quantity: r.quantity ?? 0,
    }))
  }, [stockQuery.data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter((r) => r.itemName.toLowerCase().includes(q) || (r.itemCode || "").toLowerCase().includes(q))
  }, [allRows, search])

  const draftTarget = detailTarget
  const detailQty = draftTarget ? (qtyDraft[draftTarget.itemId] ?? "") : ""
  const detailCost = draftTarget ? (costDraft[draftTarget.itemId] ?? "") : ""
  const detailRemarks = draftTarget ? (remarksDraft[draftTarget.itemId] ?? "") : ""

  useEffect(() => {
    setQtyDraft({})
    setCostDraft({})
    setRemarksDraft({})
    setStockDraft({})
    setCollapsed(new Set())
  }, [ctx.effectiveHospitalId, period])

  useEffect(() => {
    if (!existingOrder) {
      setQtyDraft({})
      setCostDraft({})
      setRemarksDraft({})
      return
    }
    if (existingOrder.status !== "DRAFT") return
    const q: Record<string, string> = {}
    const c: Record<string, string> = {}
    const r: Record<string, string> = {}
    for (const it of existingOrder.items) {
      if (it.required_quantity > 0) q[it.item_id] = String(it.required_quantity)
      if (it.estimated_cost) c[it.item_id] = String(it.estimated_cost)
      if (it.remarks) r[it.item_id] = it.remarks
    }
    setQtyDraft(q)
    setCostDraft(c)
    setRemarksDraft(r)
  }, [existingOrder])

  const totalEstimate = useMemo(() => {
    let sum = 0
    for (const row of rows) {
      const q = parseFloat(qtyDraft[row.itemId] ?? "0")
      const c = parseFloat(costDraft[row.itemId] ?? "0")
      if (Number.isFinite(q) && q > 0 && Number.isFinite(c)) sum += c
    }
    return sum
  }, [rows, qtyDraft, costDraft])

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const saveStockMutation = useMutation({
    mutationFn: async ({ recordId, itemId, previous, target }: { recordId: string; itemId: string; previous: number; target: number }) => {
      await hospitalInventoryApi.update(recordId, { quantity: target })
      await inventoryTransactionsApi.create({
        hospital_id: ctx.effectiveHospitalId,
        item_id: itemId,
        transaction_type: "MANUAL_ADJUSTMENT",
        previous_balance: previous,
        quantity: target,
        current_balance: target,
        reason: "Manual remaining stock update",
      })
    },
    onMutate: ({ recordId }) => {
      setStockSaving((prev) => ({ ...prev, [recordId]: true }))
    },
    onSuccess: async (_data, vars) => {
      addToast({ title: "Stock Updated", description: "Remaining stock updated", variant: "success" })
      setStockDraft((prev) => {
        const next = { ...prev }
        delete next[vars.recordId]
        return next
      })
      setStockSaving((prev) => ({ ...prev, [vars.recordId]: false }))
      await queryClient.invalidateQueries({ queryKey: ["hospital-inventory", ctx.effectiveHospitalId] })
      await queryClient.invalidateQueries({ queryKey: ["inventory-detail-txns"] })
    },
    onError: (err, vars) => {
      setStockSaving((prev) => ({ ...prev, [vars.recordId]: false }))
      addToast({ title: "Could not update stock", description: extractDetail(err), variant: "destructive" })
    },
  })

  const handleStockBlur = (row: IndentRow) => {
    const raw = stockDraft[row.recordId]
    if (raw === undefined || raw.trim() === "") return
    const target = parseFloat(raw)
    if (!Number.isFinite(target) || target < 0) return
    if (Math.abs(target - row.quantity) < 0.001) {
      setStockDraft((prev) => {
        const next = { ...prev }
        delete next[row.recordId]
        return next
      })
      return
    }
    if (!ctx.isManager || readOnly) return
    saveStockMutation.mutate({ recordId: row.recordId, itemId: row.itemId, previous: row.quantity, target })
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!ctx.effectiveHospitalId) throw new Error("Select a hospital first")
      const lines = rows
        .map((row) => {
          const q = parseFloat(qtyDraft[row.itemId] ?? "0")
          const c = parseFloat(costDraft[row.itemId] ?? "0")
          const remarksText = (remarksDraft[row.itemId] ?? "").trim()
          return {
            item_id: row.itemId,
            required_quantity: Number.isFinite(q) && q > 0 ? q : 0,
            ...(Number.isFinite(c) && c > 0 ? { estimated_cost: c } : {}),
            ...(remarksText ? { remarks: remarksText } : {}),
          }
        })
        .filter((l) => l.required_quantity > 0)
      if (lines.length === 0) {
        throw new Error("Enter at least one required quantity above zero")
      }
      return monthlyOrdersApi.submit({
        hospital_id: ctx.effectiveHospitalId,
        order_period: period,
        items: lines,
      })
    },
    onSuccess: async (order) => {
      addToast({
        title: "Indent Submitted",
        description: `Monthly indent for ${period} submitted for review`,
        variant: "success",
      })
      await queryClient.invalidateQueries({ queryKey: ["monthly-orders-list", ctx.effectiveHospitalId, period] })
      await queryClient.invalidateQueries({ queryKey: ["inventory-orders", ctx.effectiveHospitalId] })
      if (order?.id) setOrderDetailId(order.id)
    },
    onError: (err) => {
      const detail = err instanceof Error ? err.message : extractDetail(err)
      if (detail.includes("already exists")) {
        addToast({ title: "Order Already Submitted", description: "This hospital and period already have a submitted indent", variant: "destructive" })
      } else {
        addToast({ title: "Indent Failed", description: detail, variant: "destructive" })
      }
    },
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["hospital-inventory", ctx.effectiveHospitalId] })
    queryClient.invalidateQueries({ queryKey: ["monthly-orders-list", ctx.effectiveHospitalId, period] })
    queryClient.invalidateQueries({ queryKey: ["inventory-orders", ctx.effectiveHospitalId] })
  }

  const isLoading = !!ctx.effectiveHospitalId && stockQuery.isLoading

  const headerActions = (
    <>
      {ctx.showSelector && (
        <Select
          value={ctx.selectedHospitalId ?? "all"}
          onValueChange={(v) => ctx.setSelectedHospitalId(v === "all" ? null : v)}
        >
          <SelectTrigger id="inventory-hospital" aria-label="Hospital" className="h-9 w-[190px] text-sm">
            <Building2 className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
            <SelectValue placeholder="Select hospital" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hospitals</SelectItem>
            {hospitals.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="w-44">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger id="inventory-period" aria-label="Order period" className="h-9 text-sm">
            <CalendarClock className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions().map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!allHospitalsMode && <ExportMenu hospitalId={ctx.effectiveHospitalId} orderPeriod={period} />}
      {ctx.isManager && (
        <Button onClick={() => setOrdersOpen(true)} disabled={!ctx.effectiveHospitalId} variant="outline">
          <ClipboardList className="h-4 w-4" />
          Orders
        </Button>
      )}
      {ctx.isGroupAdmin && (
        <Button variant="outline" onClick={() => setPendingOpen(true)}>
          <Inbox className="h-4 w-4" />
          Pending Master Approval
          {pendingCount > 0 && (
            <span className="ml-1 rounded-full bg-[var(--ds-primary)] px-2 py-0.5 text-xs font-semibold text-white">
              {pendingCount}
            </span>
          )}
        </Button>
      )}
      {ctx.isGroupAdmin && (
        <Button variant="outline" onClick={() => setCatalogueOpen(true)}>
          <Library className="h-4 w-4" />
          Manage Catalogue
        </Button>
      )}
      {ctx.isManager && (
        <Button onClick={() => setAddItemOpen(true)} disabled={!ctx.effectiveHospitalId}>
          <Plus className="h-4 w-4" />
          Add Other Item
        </Button>
      )}
      {ctx.isManager && (
        <Button
          onClick={() => submitMutation.mutate()}
          loading={submitMutation.isPending}
          disabled={!ctx.effectiveHospitalId || readOnly || submitDisabled()}
        >
          <Send className="h-4 w-4" />
          Submit Monthly Indent
        </Button>
      )}
    </>
  )

  function submitDisabled() {
    for (const row of rows) {
      const q = parseFloat(qtyDraft[row.itemId] ?? "0")
      if (Number.isFinite(q) && q > 0) return false
    }
    return true
  }

  const pageTitle = ctx.isGroupAdmin ? "Inventory — Group" : "Monthly Indent"

  return (
    <PageContainer density="tight">
      <PageHeader
        title={pageTitle}
        description={hospitalName ? `${hospitalName} · ${period}` : "Enterprise Power. Consumer Simplicity."}
        actions={headerActions}
      />

      <div className="mb-4 max-w-md">
        <SearchBar value={search} onChange={setSearch} placeholder="Search inventory…" />
      </div>

      {readOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ds-primary)]" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--ds-text)]">
              Monthly indent for {period} has been submitted
            </div>
            <div className="ds-caption text-[var(--ds-text-tertiary)]">
              Status: {existingOrder?.status}. Waiting for group admin review.
            </div>
          </div>
          {existingOrder && (
            <Button size="sm" variant="outline" onClick={() => setOrderDetailId(existingOrder.id)}>
              <Eye className="h-3.5 w-3.5" />
              View Order
            </Button>
          )}
        </div>
      )}

      {allHospitalsMode && (
        <GroupConsolidatedView period={period} onOpenAudit={() => setAuditOpen(true)} />
      )}

      {ctx.effectiveHospitalId && isLoading && <LoadingSkeleton rows={8} variant="table" />}

      {ctx.effectiveHospitalId && !isLoading && rows.length === 0 && (
        <EmptyState
          icon={Package}
          title={search ? "No items match your search" : "No items in inventory"}
          description={
            search
              ? "Try a different search term."
              : "Stock has not been set up for this hospital yet."
          }
          action={
            ctx.isManager && !search ? (
              <Button onClick={() => setAddItemOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Other Item
              </Button>
            ) : undefined
          }
        />
      )}

      {ctx.effectiveHospitalId && !isLoading && rows.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
            <span className="ds-caption text-[var(--ds-text-secondary)]">
              {allRows.length} stocked items grouped by category
            </span>
            {readOnly && <span className="ds-caption text-[var(--ds-text-tertiary)]">· Read-only after submission</span>}
          </div>
          <IndentTable
            rows={rows}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            qty={qtyDraft}
            cost={costDraft}
            remarks={remarksDraft}
            stock={stockDraft}
            stockSaving={stockSaving}
            onQtyChange={(itemId, v) => setQtyDraft((prev) => ({ ...prev, [itemId]: v }))}
            onCostChange={(itemId, v) => setCostDraft((prev) => ({ ...prev, [itemId]: v }))}
            onRemarksChange={(itemId, v) => setRemarksDraft((prev) => ({ ...prev, [itemId]: v }))}
            onStockChange={(recordId, v) => setStockDraft((prev) => ({ ...prev, [recordId]: v }))}
            onStockBlur={handleStockBlur}
            onView={(row) => setDetailTarget(row)}
            readOnly={readOnly}
            editable={ctx.isManager}
            total={totalEstimate}
          />
        </>
      )}

      {ctx.effectiveHospitalId && !allHospitalsMode && (
        <HospitalPendingSection hospitalId={ctx.effectiveHospitalId} orderPeriod={period} />
      )}

      <AddOtherItemDialog open={addItemOpen} onOpenChange={setAddItemOpen} />

      <CatalogueManagerDialog open={catalogueOpen} onOpenChange={setCatalogueOpen} />

      <PendingApprovalDrawer open={pendingOpen} onOpenChange={setPendingOpen} />

      <AuditDialog open={auditOpen} onOpenChange={setAuditOpen} period={period} />

      <OrdersDialog
        open={ordersOpen}
        onOpenChange={setOrdersOpen}
        hospitalId={ctx.effectiveHospitalId}
        onViewOrder={(orderId) => {
          setOrdersOpen(false)
          setOrderDetailId(orderId)
        }}
      />

      <OrderDetailDialog
        open={!!orderDetailId}
        onOpenChange={(o) => {
          if (!o) setOrderDetailId(null)
        }}
        orderId={orderDetailId}
        isGroupAdmin={ctx.isGroupAdmin}
        canEdit={ctx.isManager}
        onChanged={refresh}
      />

      <ItemDetailDrawer
        row={detailTarget}
        hospitalId={ctx.effectiveHospitalId}
        qty={detailQty}
        cost={detailCost}
        remarks={detailRemarks}
        open={!!detailTarget}
        onOpenChange={(o) => {
          if (!o) setDetailTarget(null)
        }}
      />
    </PageContainer>
  )
}
