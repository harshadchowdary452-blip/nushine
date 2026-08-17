import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Eye, ChevronLeft, ChevronRight, Search, Filter, X,
  User, Building2, Mail, Phone, Calendar, Clock, MessageSquare,
  CheckCircle2, ArrowRight, CircleDot, Ban,
} from "lucide-react"
import api from "@/services/api"

interface DemoRequest {
  id: string
  full_name: string
  organization: string
  email: string
  phone: string | null
  role: string | null
  num_hospitals: string | null
  num_doctors: string | null
  message: string | null
  preferred_date: string | null
  preferred_time: string | null
  status: string
  notes: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

interface DemoListResponse {
  items: DemoRequest[]
  total: number
  page: number
  page_size: number
}

const STATUS_OPTIONS = [
  { value: "NEW", label: "New", color: "bg-blue-50 text-blue-600" },
  { value: "CONTACTED", label: "Contacted", color: "bg-amber-50 text-amber-600" },
  { value: "DEMO_SCHEDULED", label: "Demo Scheduled", color: "bg-purple-50 text-purple-600" },
  { value: "COMPLETED", label: "Completed", color: "bg-emerald-50 text-emerald-600" },
  { value: "CONVERTED", label: "Converted", color: "bg-green-50 text-green-700" },
  { value: "CLOSED", label: "Closed", color: "bg-gray-100 text-gray-500" },
]

function getStatusColor(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color || "bg-gray-100 text-gray-500"
}

function getStatusLabel(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status
}

export default function SuperAdminDemoRequests() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState("")
  const [search, setSearch] = useState("")
  const [selectedDemo, setSelectedDemo] = useState<DemoRequest | null>(null)
  const [editNotes, setEditNotes] = useState("")

  const { data, isLoading } = useQuery<DemoListResponse>({
    queryKey: ["demo-requests", page, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: "20" })
      if (statusFilter) params.set("status", statusFilter)
      if (search) params.set("search", search)
      const res = await api.get(`/demo-requests?${params}`)
      return res.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; status?: string; notes?: string }) => {
      const res = await api.patch(`/demo-requests/${id}`, payload)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-requests"] })
      if (selectedDemo) {
        queryClient.invalidateQueries({ queryKey: ["demo-requests", selectedDemo.id] })
      }
    },
  })

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--ds-text)]">Demo Requests</h1>
        <p className="text-xs text-[var(--ds-text-secondary)] mt-1">Manage incoming demo requests from the public website.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-placeholder)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name, organization, or email..."
            className="w-full pl-9 pr-4 py-2 bg-[var(--ds-background)] border border-[var(--ds-border)] rounded-lg text-sm text-[var(--ds-text)] placeholder-[var(--ds-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus-ring)]/20 focus:border-[var(--ds-focus-ring)]"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-placeholder)]" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="pl-9 pr-8 py-2 bg-[var(--ds-background)] border border-[var(--ds-border)] rounded-lg text-sm text-[var(--ds-text)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus-ring)]/20 focus:border-[var(--ds-focus-ring)] appearance-none"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="spinner" />
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CircleDot className="h-10 w-10 text-[var(--ds-text-disabled)] mb-3" />
            <p className="text-sm font-medium text-[var(--ds-text-secondary)]">No demo requests found</p>
            <p className="text-xs text-[var(--ds-text-tertiary)] mt-1">Demo requests from the public website will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ds-border)] bg-[var(--ds-background-subtle)]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ds-text-secondary)]">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ds-text-secondary)] hidden sm:table-cell">Organization</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ds-text-secondary)] hidden md:table-cell">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ds-text-secondary)]">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--ds-text-secondary)] hidden lg:table-cell">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--ds-text-secondary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((demo) => (
                  <tr key={demo.id} className="border-b border-[var(--ds-border-light)] hover:bg-[var(--ds-surface-hover)] transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-[var(--ds-text)]">{demo.full_name}</p>
                        <p className="text-xs text-[var(--ds-text-tertiary)]">{demo.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-[var(--ds-text)]">{demo.organization}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-[var(--ds-text-secondary)]">{demo.role || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusColor(demo.status)}`}>
                        {getStatusLabel(demo.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-xs text-[var(--ds-text-tertiary)]">
                        {new Date(demo.created_at).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setSelectedDemo(demo); setEditNotes(demo.notes || "") }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ds-primary)] hover:text-[var(--ds-primary-hover)] px-2 py-1 rounded-md hover:bg-[var(--ds-primary-subtle)] transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.total > data.page_size && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--ds-border-light)]">
            <p className="text-xs text-[var(--ds-text-tertiary)]">
              Showing {((page - 1) * data.page_size) + 1}–{Math.min(page * data.page_size, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded-md hover:bg-[var(--ds-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="h-4 w-4 text-[var(--ds-text-secondary)]" />
              </button>
              <span className="text-xs font-medium text-[var(--ds-text-secondary)] px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1.5 rounded-md hover:bg-[var(--ds-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="h-4 w-4 text-[var(--ds-text-secondary)]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedDemo && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--ds-background-overlay)]" onClick={() => setSelectedDemo(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 bg-[var(--ds-surface)] rounded-2xl shadow-[var(--ds-shadow-dialog)] w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--ds-border)]">
              <h2 className="text-base font-bold text-[var(--ds-text)]">Demo Request Details</h2>
              <button onClick={() => setSelectedDemo(null)} className="p-1.5 rounded-lg hover:bg-[var(--ds-surface-hover)]">
                <X className="h-4 w-4 text-[var(--ds-text-secondary)]" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: User, label: "Name", value: selectedDemo.full_name },
                  { icon: Building2, label: "Organization", value: selectedDemo.organization },
                  { icon: Mail, label: "Email", value: selectedDemo.email },
                  { icon: Phone, label: "Phone", value: selectedDemo.phone || "Not provided" },
                  { icon: CircleDot, label: "Role", value: selectedDemo.role || "Not specified" },
                  { icon: Building2, label: "Hospitals", value: selectedDemo.num_hospitals || "Not specified" },
                  { icon: User, label: "Doctors", value: selectedDemo.num_doctors || "Not specified" },
                  { icon: Calendar, label: "Preferred Date", value: selectedDemo.preferred_date || "Not specified" },
                  { icon: Clock, label: "Preferred Time", value: selectedDemo.preferred_time || "Not specified" },
                ].map((field) => (
                  <div key={field.label} className="flex items-start gap-2">
                    <field.icon className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-[var(--ds-text-tertiary)]">{field.label}</p>
                      <p className="text-xs font-medium text-[var(--ds-text)]">{field.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Message */}
              {selectedDemo.message && (
                <div className="bg-[var(--ds-background)] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                    <p className="text-[10px] font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wide">Requirements</p>
                  </div>
                  <p className="text-xs text-[var(--ds-text)] leading-relaxed">{selectedDemo.message}</p>
                </div>
              )}

              {/* Status update */}
              <div>
                <p className="text-[10px] font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wide mb-2">Update Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => updateMutation.mutate({ id: selectedDemo.id, status: s.value })}
                      disabled={selectedDemo.status === s.value}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${selectedDemo.status === s.value ? s.color + " ring-2 ring-offset-1 ring-current/20" : "bg-[var(--ds-background)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)]"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <p className="text-[10px] font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wide mb-2">Notes</p>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Add internal notes about this demo request..."
                  className="w-full px-3 py-2 bg-[var(--ds-background)] border border-[var(--ds-border)] rounded-lg text-xs text-[var(--ds-text)] placeholder-[var(--ds-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus-ring)]/20 focus:border-[var(--ds-focus-ring)] resize-none"
                />
                <button
                  onClick={() => updateMutation.mutate({ id: selectedDemo.id, notes: editNotes })}
                  disabled={editNotes === (selectedDemo.notes || "")}
                  className="mt-2 text-xs font-medium text-[var(--ds-primary)] hover:text-[var(--ds-primary-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Save Notes
                </button>
              </div>

              {/* Timestamps */}
              <div className="flex gap-4 text-[10px] text-[var(--ds-text-tertiary)] pt-2 border-t border-[var(--ds-border-light)]">
                <span>Submitted: {new Date(selectedDemo.created_at).toLocaleString()}</span>
                <span>Updated: {new Date(selectedDemo.updated_at).toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
