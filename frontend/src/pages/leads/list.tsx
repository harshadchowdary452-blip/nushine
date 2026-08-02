import { useState, useMemo, useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format } from "date-fns"
import {
  Plus,
  Search,
  Eye,
  Phone,
  MessageSquare,
  Calendar,
  MoreHorizontal,
  Star,
  ArrowUpDown,
  UserCog,
  Columns,
  Trash2,
  Target,
  RefreshCw,
  Clock,
  ChevronLeft,
  ChevronRight,
  Users,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { PageHeader } from "@/design-system"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/toast"
import { leadsApi, usersApi } from "@/services/endpoints"
import DentalEmptyState from "@/components/ui/dental-empty-state"
import QuickExport from "@/components/ui/quick-export"

import type { Lead, LeadSource, LeadStatus } from "@/types"
import { extractDetail } from "@/types"
import { useCreateParam } from "@/lib/use-create-param"

const priorityColors: Record<string, string> = {
  HIGH: "text-red-600 bg-red-50 border-red-200",
  MEDIUM: "text-amber-600 bg-amber-50 border-amber-200",
  LOW: "text-green-600 bg-green-50 border-green-200",
}

const statusColors: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 ring-blue-600/20",
  CONTACTED: "bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)] ring-[var(--ds-accent-600)]",
  INTERESTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  FOLLOW_UP_REQUIRED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  APPOINTMENT_BOOKED: "bg-[var(--ds-primary-50)] text-[var(--ds-primary-700)] ring-[var(--ds-primary-600)]",
  VISITED: "bg-teal-50 text-teal-700 ring-teal-600/20",
  CONVERTED: "bg-green-50 text-green-700 ring-green-600/20",
  LOST: "bg-red-50 text-red-700 ring-red-600/20",
  NOT_INTERESTED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)] ring-[var(--ds-border-light)]/20",
  NO_RESPONSE: "bg-orange-50 text-orange-700 ring-orange-600/20",
}

const sourceOptions: LeadSource[] = [
  "GOOGLE_SEARCH",
  "GOOGLE_MAPS",
  "INSTAGRAM",
  "FACEBOOK",
  "WHATSAPP",
  "WEBSITE",
  "WALK_IN",
  "REFERRAL",
  "DOCTOR_REFERRAL",
  "CLINIC_REFERRAL",
  "CAMPAIGN",
  "ADVERTISEMENT",
  "BANNER",
  "NEWSPAPER",
  "YOUTUBE",
  "EVENT",
  "OTHER",
]

const statusOptions: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "FOLLOW_UP_REQUIRED",
  "APPOINTMENT_BOOKED",
  "VISITED",
  "CONVERTED",
  "LOST",
  "NOT_INTERESTED",
  "NO_RESPONSE",
]

const columnOptions = [
  { key: "lead_name", label: "Lead Name", default: true },
  { key: "contact", label: "Contact", default: true },
  { key: "source", label: "Source", default: true },
  { key: "treatment", label: "Treatment", default: true },
  { key: "priority", label: "Priority", default: true },
  { key: "status", label: "Status", default: true },
  { key: "assigned", label: "Assigned To", default: true },
  { key: "next_follow_up", label: "Next Follow-up", default: true },
  { key: "score", label: "Score", default: false },
  { key: "budget", label: "Budget", default: false },
  { key: "city", label: "City", default: false },
  { key: "created", label: "Created Date", default: false },
  { key: "last_contacted", label: "Last Contacted", default: false },
]

export default function LeadList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const statusFromUrl = searchParams.get("status") || ""
  const sourceFromUrl = searchParams.get("source") || ""
  const dateFromFromUrl = searchParams.get("date_from") || ""
  const dateToFromUrl = searchParams.get("date_to") || ""

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState(statusFromUrl)
  const [sourceFilter, setSourceFilter] = useState(sourceFromUrl)
  const [dateFrom, setDateFrom] = useState(dateFromFromUrl)
  const [dateTo, setDateTo] = useState(dateToFromUrl)

  const updateParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }
  const [sortField, setSortField] = useState<string>("created_at")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [visibleColumns, setVisibleColumns] = useState(
    columnOptions.filter((c) => c.default).map((c) => c.key),
  )
  const [showColumnChooser, setShowColumnChooser] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  useCreateParam(() => setCreateOpen(true))

  const [leadName, setLeadName] = useState("")
  const [mobile, setMobile] = useState("")
  const [alternateMobile, setAlternateMobile] = useState("")
  const [email, setEmail] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("")
  const [city, setCity] = useState("")
  const [source, setSource] = useState("OTHER")
  const [interestedTreatment, setInterestedTreatment] = useState("")
  const [budget, setBudget] = useState("")
  const [preferredVisitDate, setPreferredVisitDate] = useState("")
  const [notes, setNotes] = useState("")

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", statusFilter, sourceFilter, dateFrom, dateTo, page, pageSize],
    queryFn: () =>
      leadsApi.list({
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: pageSize,
      }),
  })

  const { data: analytics } = useQuery({
    queryKey: ["lead-analytics-summary"],
    queryFn: () => leadsApi.analytics(),
    staleTime: 30000,
  })

  const { data: usersData } = useQuery({
    queryKey: ["users-list-for-leads"],
    queryFn: async (): Promise<Array<{ id: string; full_name?: string; name?: string; username?: string }>> => {
      const pageSize = 200
      const all: Array<{ id: string; full_name?: string; name?: string; username?: string }> = []
      for (let page = 1; page <= 20; page++) {
        const batch = await usersApi.list({ page, page_size: pageSize })
        const items = (Array.isArray(batch) ? batch : (batch as { items?: Array<{ id: string; full_name?: string; name?: string; username?: string }> } | null)?.items || [])
        all.push(...items)
        if (items.length < pageSize) break
      }
      return all
    },
    staleTime: 60000,
  })

  const userMap = useMemo(() => {
    const users = usersData || []
    const map: Record<string, string> = {}
    for (const u of users) {
      map[u.id] = u.full_name || u.name || u.username || u.id.slice(0, 8)
    }
    return map
  }, [usersData])

  const leadsList: Lead[] = useMemo(() => {
    const items: Lead[] = Array.isArray(leads) ? leads : leads?.items || []
    return items
  }, [leads])

  const totalLeads = useMemo(() => {
    if (Array.isArray(leads)) return leads.length
    return ((leads as Record<string, unknown>)?.total as number) || 0
  }, [leads])

  const filtered = useMemo(() => {
    let result = leadsList
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (l) =>
          l.lead_name.toLowerCase().includes(q) ||
          l.mobile.includes(q) ||
          (l.email && l.email.toLowerCase().includes(q)) ||
          (l.city && l.city.toLowerCase().includes(q)) ||
          (l.interested_treatment && l.interested_treatment.toLowerCase().includes(q)) ||
          (l.source && l.source.toLowerCase().includes(q)),
      )
    }
    result.sort((a, b) => {
      let cmp = 0
      if (sortField === "lead_name") cmp = a.lead_name.localeCompare(b.lead_name)
      else if (sortField === "created_at")
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      else if (sortField === "lead_score") cmp = (a.lead_score ?? 0) - (b.lead_score ?? 0)
      else if (sortField === "next_follow_up_date")
        cmp = (a.next_follow_up_date || "").localeCompare(b.next_follow_up_date || "")
      else if (sortField === "budget") cmp = (a.budget ?? 0) - (b.budget ?? 0)
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDir === "desc" ? -cmp : cmp
    })
    return result
  }, [leadsList, search, sortField, sortDir])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => leadsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      queryClient.invalidateQueries({ queryKey: ["lead-analytics"] })
      queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
      addToast({ title: "Lead Created", variant: "success" })
      setCreateOpen(false)
      resetForm()
    },
    onError: () =>
      addToast({ title: "Error", description: "Failed to create lead", variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leadsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      queryClient.invalidateQueries({ queryKey: ["lead-analytics"] })
      queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
      addToast({ title: "Lead deleted", variant: "success" })
      setDeleteOpen(false)
      setLeadToDelete(null)
    },
    onError: () =>
      addToast({ title: "Error", description: "Failed to delete lead", variant: "destructive" }),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => leadsApi.delete(id)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      queryClient.invalidateQueries({ queryKey: ["lead-analytics"] })
      queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
      addToast({ title: `${selectedLeads.size} leads deleted`, variant: "success" })
      setBulkDeleteOpen(false)
      setSelectedLeads(new Set())
      setSelectAll(false)
    },
    onError: () =>
      addToast({
        title: "Error",
        description: "Failed to delete some leads",
        variant: "destructive",
      }),
  })

  function resetForm() {
    setLeadName("")
    setMobile("")
    setAlternateMobile("")
    setEmail("")
    setAge("")
    setGender("")
    setCity("")
    setSource("OTHER")
    setInterestedTreatment("")
    setBudget("")
    setPreferredVisitDate("")
    setNotes("")
  }

  function handleCreate() {
    if (!leadName.trim() || !mobile.trim()) {
      addToast({
        title: "Validation",
        description: "Name and mobile are required",
        variant: "destructive",
      })
      return
    }
    createMutation.mutate({
      lead_name: leadName,
      mobile,
      alternate_mobile: alternateMobile || undefined,
      email: email || undefined,
      age: age ? parseInt(age) : undefined,
      gender: gender || undefined,
      city: city || undefined,
      source,
      interested_treatment: interestedTreatment || undefined,
      budget: budget ? parseFloat(budget) : undefined,
      preferred_visit_date: preferredVisitDate || undefined,
      notes: notes || undefined,
    })
  }

  const toggleSort = useCallback(
    (field: string) => {
      if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      else {
        setSortField(field)
        setSortDir("desc")
      }
    },
    [sortField],
  )

  function toggleSelectAll() {
    if (selectAll) {
      setSelectedLeads(new Set())
      setSelectAll(false)
    } else {
      setSelectedLeads(new Set(filtered.map((l) => l.id)))
      setSelectAll(true)
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedLeads)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedLeads(next)
    setSelectAll(next.size === filtered.length && filtered.length > 0)
  }

  const handleCall = useCallback((lead: Lead) => {
    if (lead.mobile) {
      window.location.href = `tel:${lead.mobile}`
    }
  }, [])

  const handleWhatsApp = useCallback((lead: Lead) => {
    if (lead.mobile) {
      const phone = lead.mobile.replace(/[^0-9]/g, "")
      const hospitalName = lead.hospital_name || "our dental clinic"
      const msg =
        `Hello ${lead.lead_name},\n\n` +
        `Thank you for contacting ${hospitalName}.\n\n` +
        `We appreciate your interest in our dental services. Our team has received your enquiry regarding **${lead.interested_treatment || "dental treatment"}**.\n\n` +
        `One of our patient care executives will contact you shortly to understand your requirements and assist you in planning your visit.\n\n` +
        `We look forward to welcoming you to ${hospitalName} and providing you with the highest standard of dental care.\n\n` +
        `Warm Regards,\n${hospitalName}\nPatient Care Team`
      const encodedMsg = encodeURIComponent(msg)
      leadsApi
        .addCommunication(lead.id, {
          channel: "WHATSAPP",
          message: msg,
          template_name: "GREETING",
        })
        .catch((err: unknown) => addToast({ title: "Could not log greeting", description: extractDetail(err), variant: "destructive" }))
        .finally(() => {
          window.open(`https://wa.me/${phone}?text=${encodedMsg}`, "_blank")
        })
    }
  }, [addToast])

  const SortHeader = useCallback(
    ({ field, children }: { field: string; children: React.ReactNode }) => (
      <th
        className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider cursor-pointer select-none hover:text-[var(--ds-text-secondary)] transition-colors"
        onClick={() => toggleSort(field)}
      >
        <div className="flex items-center gap-1">
          {children}
          <ArrowUpDown
            className={`h-3 w-3 ${sortField === field ? "text-[var(--ds-primary)]" : "text-[var(--ds-text-tertiary)]"}`}
          />
        </div>
      </th>
    ),
    [sortField, toggleSort],
  )

  const stats = (analytics as Record<string, unknown>) || {}

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <PageHeader
        title="Lead Management"
        description={`${filtered.length} leads${search ? " found" : ""}`}
        actions={
          <>
            <QuickExport module="leads" label="Export" />
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Lead
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 gap-2">
        {[
          { label: "Total", key: "total", color: "text-blue-600", bg: "bg-blue-50" },
          { label: "New", key: "NEW", color: "text-blue-600", bg: "bg-blue-50" },
          {
            label: "Interested",
            key: "INTERESTED",
            color: "text-emerald-600",
            bg: "bg-emerald-50",
          },
          {
            label: "Follow-ups",
            key: "FOLLOW_UP_REQUIRED",
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          { label: "Converted", key: "CONVERTED", color: "text-green-600", bg: "bg-green-50" },
          { label: "Lost", key: "LOST", color: "text-red-600", bg: "bg-red-50" },
        ].map((s) => {
          const val =
            s.key === "total"
              ? ((stats.total as number) ?? 0)
              : (((stats.by_status as Record<string, number>) || {})[s.key] ?? 0)
          return (
            <button
              key={s.key}
              onClick={() => {
                if (s.key !== "total") {
                  setStatusFilter(s.key)
                  setSearchParams(s.key === statusFromUrl ? {} : { status: s.key })
                }
              }}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${
                statusFilter === s.key
                  ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                  : "border-[var(--ds-border-light)] hover:border-[var(--ds-border)] hover:bg-[var(--ds-surface-hover)]"
              }`}
            >
              <span className={`text-lg font-bold ${s.color}`}>{val}</span>
              <span className="text-[10px] text-[var(--ds-text-secondary)] mt-0.5">{s.label}</span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--ds-text-tertiary)]" />
              <Input
                placeholder="Search name, phone, email, treatment..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-2.5 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v === "all" ? "" : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sourceFilter}
              onValueChange={(v) => {
                setSourceFilter(v === "all" ? "" : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sourceOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> More
            </Button>
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setShowColumnChooser(!showColumnChooser)}
              >
                <Columns className="h-3.5 w-3.5 mr-1" /> Columns
              </Button>
              {showColumnChooser && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-lg shadow-lg z-[var(--ds-z-dropdown)] p-2">
                  <p className="text-xs font-medium text-[var(--ds-text-secondary)] px-2 py-1">Toggle Columns</p>
                  {columnOptions.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--ds-surface-hover)] rounded cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col.key)}
                        onChange={() => {
                          setVisibleColumns((prev) =>
                            prev.includes(col.key)
                              ? prev.filter((k) => k !== col.key)
                              : [...prev, col.key],
                          )
                        }}
                        className="rounded border-[var(--ds-border-strong)]"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedLeads.size > 0 && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-[var(--ds-border)]">
                <span className="text-xs text-[var(--ds-text-secondary)]">{selectedLeads.size} selected</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-red-600"
                  onClick={() => {
                    setBulkDeleteOpen(true)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--ds-border-light)]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ds-text-secondary)]">Treatment:</span>
                <Input placeholder="Filter by treatment" className="h-8 w-48 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ds-text-secondary)]">Priority:</span>
                <Select>
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ds-text-secondary)]">Date Range:</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    updateParam("date_from", e.target.value)
                  }}
                  className="h-8 w-36 text-sm"
                  aria-label="Date from"
                />
                <span className="text-xs text-[var(--ds-text-tertiary)]">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    updateParam("date_to", e.target.value)
                  }}
                  className="h-8 w-36 text-sm"
                  aria-label="Date to"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setShowFilters(false)
                }}
              >
                <X className="h-3 w-3 mr-1" /> Close
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          <div className="flex items-center gap-4 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <DentalEmptyState
          icon={Users}
          title={
            search || statusFilter || sourceFilter ? "No leads match your filters" : "No leads yet"
          }
          description={
            search
              ? "Try a different search term"
              : "Add your first lead to start tracking inquiries"
          }
          action={
            !search && !statusFilter && !sourceFilter && !dateFrom && !dateTo ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Lead
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-xl border border-[var(--ds-border)] overflow-hidden bg-[var(--ds-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--ds-background-subtle)] border-b border-[var(--ds-border)]">
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={toggleSelectAll}
                      className="rounded border-[var(--ds-border-strong)]"
                    />
                  </th>
                  {visibleColumns.includes("lead_name") && (
                    <SortHeader field="lead_name">Lead Name</SortHeader>
                  )}
                  {visibleColumns.includes("contact") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      Contact
                    </th>
                  )}
                  {visibleColumns.includes("source") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      Source
                    </th>
                  )}
                  {visibleColumns.includes("treatment") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      Treatment
                    </th>
                  )}
                  {visibleColumns.includes("priority") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      Priority
                    </th>
                  )}
                  {visibleColumns.includes("next_follow_up") && (
                    <SortHeader field="next_follow_up_date">Follow-up</SortHeader>
                  )}
                  {visibleColumns.includes("score") && (
                    <SortHeader field="lead_score">Score</SortHeader>
                  )}
                  {visibleColumns.includes("budget") && (
                    <SortHeader field="budget">Budget</SortHeader>
                  )}
                  {visibleColumns.includes("city") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      City
                    </th>
                  )}
                  {visibleColumns.includes("status") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      Status
                    </th>
                  )}
                  {visibleColumns.includes("assigned") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      Assigned
                    </th>
                  )}
                  {visibleColumns.includes("created") && (
                    <SortHeader field="created_at">Created</SortHeader>
                  )}
                  {visibleColumns.includes("last_contacted") && (
                    <th className="text-left px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider">
                      Last Contact
                    </th>
                  )}
                  <th className="text-right px-3 py-3 font-medium text-[var(--ds-text-secondary)] text-xs uppercase tracking-wider w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ds-border-light)]">
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`hover:bg-[var(--ds-background-subtle)]/70 transition-colors cursor-pointer ${
                      selectedLeads.has(lead.id) ? "bg-blue-50/40" : ""
                    }`}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded border-[var(--ds-border-strong)]"
                      />
                    </td>
                    {visibleColumns.includes("lead_name") && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <Users className="h-4 w-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-medium text-[var(--ds-text)] truncate max-w-[180px]">
                              {lead.lead_name}
                            </p>
                            <p className="text-[11px] text-[var(--ds-text-tertiary)] font-mono">
                              #{lead.id.slice(-6).toUpperCase()}
                            </p>
                          </div>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes("contact") && (
                      <td className="px-3 py-3">
                        <p className="text-[var(--ds-text-secondary)] text-[13px]">{lead.mobile}</p>
                        {lead.email && (
                          <p className="text-[11px] text-[var(--ds-text-tertiary)] truncate max-w-[150px]">
                            {lead.email}
                          </p>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes("source") && (
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="text-[11px]">
                          {lead.source?.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    )}
                    {visibleColumns.includes("treatment") && (
                      <td className="px-3 py-3">
                        <span className="text-[13px] text-[var(--ds-text-secondary)]">
                          {lead.interested_treatment || "—"}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes("priority") && (
                      <td className="px-3 py-3">
                        {lead.priority && (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${priorityColors[lead.priority] || priorityColors.MEDIUM}`}
                          >
                            <Star
                              className="h-2.5 w-2.5"
                              fill={lead.priority === "HIGH" ? "currentColor" : "none"}
                            />
                            {lead.priority}
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes("next_follow_up") && (
                      <td className="px-3 py-3">
                        {lead.next_follow_up_date ? (
                          <div className="flex items-center gap-1 text-[12px]">
                            <Clock className="h-3 w-3 text-[var(--ds-text-tertiary)]" />
                            <span
                              className={
                                new Date(lead.next_follow_up_date) < new Date()
                                  ? "text-red-600 font-medium"
                                  : "text-[var(--ds-text-secondary)]"
                              }
                            >
                              {format(new Date(lead.next_follow_up_date), "dd MMM")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-[var(--ds-text-tertiary)]">—</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes("score") && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 bg-[var(--ds-surface-secondary)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(lead.lead_score ?? 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-medium text-[var(--ds-text-secondary)]">
                            {lead.lead_score ?? 0}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes("budget") && (
                      <td className="px-3 py-3 text-[13px] text-[var(--ds-text-secondary)]">
                        {lead.budget ? `₹${lead.budget.toLocaleString()}` : "—"}
                      </td>
                    )}
                    {visibleColumns.includes("city") && (
                      <td className="px-3 py-3 text-[13px] text-[var(--ds-text-secondary)]">{lead.city || "—"}</td>
                    )}
                    {visibleColumns.includes("status") && (
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusColors[lead.status] || statusColors.NEW}`}
                        >
                          {lead.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    )}
                    {visibleColumns.includes("assigned") && (
                      <td className="px-3 py-3">
                        {lead.assigned_staff_id || lead.assigned_doctor_id ? (
                          <div className="flex items-center gap-1 text-[12px] text-[var(--ds-text-secondary)]">
                            <UserCog className="h-3 w-3 text-[var(--ds-text-tertiary)]" />
                            <span className="truncate max-w-[100px]">
                              {lead.assigned_doctor_id
                                ? userMap[lead.assigned_doctor_id] ||
                                  lead.assigned_doctor_id.slice(0, 8)
                                : lead.assigned_staff_id
                                  ? userMap[lead.assigned_staff_id] ||
                                    lead.assigned_staff_id.slice(0, 8)
                                  : "—"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-[var(--ds-text-tertiary)]">—</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.includes("created") && (
                      <td className="px-3 py-3 text-[12px] text-[var(--ds-text-secondary)]">
                        {format(new Date(lead.created_at), "dd MMM yy")}
                      </td>
                    )}
                    {visibleColumns.includes("last_contacted") && (
                      <td className="px-3 py-3 text-[12px] text-[var(--ds-text-secondary)]">
                        {lead.last_contacted_at
                          ? format(new Date(lead.last_contacted_at), "dd MMM")
                          : "—"}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-52 bg-[var(--ds-surface)] shadow-lg border-[var(--ds-border)]"
                        >
                          <DropdownMenuItem
                            onClick={() => navigate(`/leads/${lead.id}`)}
                            className="cursor-pointer"
                          >
                            <Eye className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[var(--ds-background-subtle)]" />
                          <DropdownMenuItem
                            onClick={() => handleCall(lead)}
                            className="cursor-pointer"
                          >
                            <Phone className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> Call
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleWhatsApp(lead)}
                            className="cursor-pointer"
                          >
                            <MessageSquare className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[var(--ds-background-subtle)]" />
                          <DropdownMenuItem
                            onClick={() => navigate(`/leads/${lead.id}`)}
                            className="cursor-pointer"
                          >
                            <Calendar className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> Schedule Follow-up
                          </DropdownMenuItem>
                          {lead.status !== "CONVERTED" &&
                            lead.status !== "LOST" &&
                            lead.status !== "NOT_INTERESTED" &&
                            lead.status !== "NO_RESPONSE" && (
                              <DropdownMenuItem
                                onClick={() => navigate(`/leads/${lead.id}`)}
                                className="cursor-pointer"
                              >
                                <Target className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> Convert to
                                Patient
                              </DropdownMenuItem>
                            )}
                          <DropdownMenuSeparator className="bg-[var(--ds-background-subtle)]" />
                          <DropdownMenuItem
                            className="text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50"
                            onClick={() => {
                              setLeadToDelete(lead.id)
                              setDeleteOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2.5" /> Delete Lead
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--ds-border)] bg-[var(--ds-background-subtle)]/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ds-text-secondary)]">
                Showing {filtered.length} of {totalLeads} leads
              </span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(parseInt(v))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-7 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-[var(--ds-text-secondary)] px-2">Page {page}</span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page * pageSize >= totalLeads}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-5 border-b border-[var(--ds-border-light)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle>Create New Lead</DialogTitle>
                <DialogDescription>
                  Enter lead details to start tracking a new patient inquiry
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4 space-y-6 flex-1">
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-0.5 w-5 bg-blue-500 rounded-full" />
                <h4 className="text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wider">
                  Basic Information
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                    Lead Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="Full name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Age</Label>
                  <NumericInput
                    mode="integer"
                    min={0}
                    max={150}
                    value={age}
                    onChange={(v) => setAge(v)}
                    placeholder="Age"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Gender</Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">City</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                    Source <span className="text-red-500">*</span>
                  </Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-0.5 w-5 bg-[var(--ds-accent-500)] rounded-full" />
                <h4 className="text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wider">
                  Contact Information
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">
                    Mobile <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="Phone number"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Alternate Mobile</Label>
                  <Input
                    value={alternateMobile}
                    onChange={(e) => setAlternateMobile(e.target.value)}
                    placeholder="Alt phone"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Email</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className="mt-1"
                  />
                </div>
              </div>
            </section>
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-0.5 w-5 bg-emerald-500 rounded-full" />
                <h4 className="text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wider">
                  Lead Details
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Interested Treatment</Label>
                  <Input
                    value={interestedTreatment}
                    onChange={(e) => setInterestedTreatment(e.target.value)}
                    placeholder="e.g. Root Canal Treatment"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Budget</Label>
                  <NumericInput
                    mode="currency"
                    prefix="₹"
                    value={budget}
                    onChange={(v) => setBudget(v)}
                    placeholder="Amount"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Preferred Visit Date</Label>
                  <Input
                    type="date"
                    value={preferredVisitDate}
                    onChange={(e) => setPreferredVisitDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-[var(--ds-text-secondary)]">Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
            </section>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-[var(--ds-border-light)] shrink-0 bg-[var(--ds-surface)]">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1.5" /> Create Lead
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lead? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => leadToDelete && deleteMutation.mutate(leadToDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLeads.size} Leads</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedLeads.size} selected leads? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedLeads))}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedLeads.size} Leads`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
