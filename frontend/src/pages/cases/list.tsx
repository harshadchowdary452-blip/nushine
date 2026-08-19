import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import {
  Search, Plus, ArrowUpDown, Loader2, Eye, Trash2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FolderOpen
} from "lucide-react"
import { format } from "date-fns"
import { casesApi, doctorsApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import CaseReportForm from "@/components/cases/CaseReportForm"
import { PageHeader, EmptyState, StatusBadge } from "@/design-system"
import type { Case } from "@/types"
import { showErrorToast } from "@/utils/showErrorToast"
import { useCreateParam } from "@/lib/use-create-param"

interface CaseDoctor {
  id: string
  full_name?: string
  name?: string
  username?: string
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
]

export default function CaseReportsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [searchParams] = useSearchParams()

  const statusFromUrl = searchParams.get("status") || ""
  const dateFromFromUrl = searchParams.get("date_from") || ""
  const dateToFromUrl = searchParams.get("date_to") || ""

  const [page, setPage] = useState(0)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState(statusFromUrl)
  const [doctorFilter, setDoctorFilter] = useState("")
  const [dateFrom, setDateFrom] = useState(dateFromFromUrl)
  const [dateTo, setDateTo] = useState(dateToFromUrl)
  const [sortBy, setSortBy] = useState("created_at")
  const [sortDesc, setSortDesc] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  useCreateParam(() => setCreateOpen(true))

  const { data: resp, isFetching } = useQuery({
    queryKey: ["case-history-list", page, pageSize, search, statusFilter, doctorFilter, dateFrom, dateTo, sortBy, sortDesc],
    queryFn: () => casesApi.list({
      skip: page * pageSize,
      limit: pageSize,
      search: search || undefined,
      status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
      doctor_id: doctorFilter && doctorFilter.trim() ? doctorFilter : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort_by: sortBy,
      sort_desc: sortDesc,
    }),
  })
  const cases: Case[] = Array.isArray(resp) ? resp : resp?.items ?? []
  const totalCount = Array.isArray(resp) ? resp.length : resp?.total ?? 0

  const { data: doctors } = useQuery({
    queryKey: ["doctors-for-filter"],
    queryFn: () => doctorsApi.list({ limit: 200 }).then((r: unknown) => {
      const result = r as Record<string, unknown>
      if (Array.isArray(r)) return r as CaseDoctor[]
      if (result?.users && Array.isArray(result.users)) return result.users as CaseDoctor[]
      if (result?.data && Array.isArray(result.data)) return result.data as CaseDoctor[]
      return []
    }),
  })
  const doctorsList: CaseDoctor[] = Array.isArray(doctors) ? doctors : []

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const isLastPage = page >= totalPages - 1

  const deleteMutation = useMutation({
    mutationFn: (id: string) => casesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-history-list"] })
      addToast({ title: "Case Report deleted", variant: "success" })
    },
    onError: (err: unknown) => showErrorToast(err, addToast),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Case Reports" description="Manage patient case reports"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Case Report
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient name or OP no..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                className="pl-8 h-9 text-sm" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0) }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={doctorFilter} onValueChange={(v) => { setDoctorFilter(v); setPage(0) }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Doctors" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Doctors</SelectItem>
                {doctorsList.map((d: CaseDoctor) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name || d.name || d.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="h-9 text-sm" placeholder="From date" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="h-9 text-sm" placeholder="To date" />
          </div>
        </CardContent>
      </Card>

      {/* Sort controls */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span>Sort by:</span>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Created</SelectItem>
            <SelectItem value="updated_at">Last Updated</SelectItem>
            <SelectItem value="patient_name">Patient Name</SelectItem>
            <SelectItem value="doctor">Doctor</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSortDesc(!sortDesc)}>
          {sortDesc ? "Newest First" : "Oldest First"}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isFetching ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : cases.length === 0 ? (
            <EmptyState icon={FolderOpen} title="No case histories found" />
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case #</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>OP No</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Chief Complaint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/cases/${c.id}`)}>
                      <TableCell className="font-mono text-xs">{c.case_number || c.id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{c.patient_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.patient?.op_no || "—"}</TableCell>
                      <TableCell className="text-xs">{c.doctor_name || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{c.chief_complaint}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7" asChild>
                            <Link to={`/cases/${c.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-red-500"
                            onClick={(e) => { e.stopPropagation(); if (confirm("Delete this case report?")) deleteMutation.mutate(c.id) }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{totalCount} case(s)</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(0)}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm px-2">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={isLastPage} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={isLastPage} onClick={() => setPage(totalPages - 1)}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader><DialogTitle>New Case Report</DialogTitle></DialogHeader>
          <DialogBody>
            <CaseReportForm
              mode="create"
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload) => {
                await casesApi.create(payload)
                addToast({ title: "Case report created", variant: "success" })
                setCreateOpen(false)
                queryClient.invalidateQueries({ queryKey: ["case-history-list"] })
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
