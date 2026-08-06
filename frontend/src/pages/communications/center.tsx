import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  MessageSquare,
  Mail,
  FileText,
  Bell,
  Users,
  FlaskConical,
  History,
  Download,
  Printer,
  Send,
  Eye,
  SearchX,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Activity,
} from "lucide-react"
import {
  PageContainer,
  PageHeader,
  PageTabs,
  SectionCard,
  MetricCard,
  Button,
  Input,
  Label,
  Textarea,
  Badge,
  StatusBadge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DetailDrawer,
  DrawerSection,
  DrawerStatusPill,
  Timeline,
  SearchBar,
  EmptyState,
  LoadingSkeleton,
  useToast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/design-system"
import { communicationCenterApi } from "@/services/endpoints"
import { useAuthStore } from "@/store/authStore"
import type {
  CommunicationCenterItem,
  CommunicationCenterPage,
  CommunicationStats,
  CommunicationPreview,
  CommunicationResendResult,
  CommunicationCenterActivity,
  CommunicationMeta,
} from "@/types"
import { extractDetail } from "@/types"

const SOURCE_ICON: Record<string, typeof MessageSquare> = {
  WhatsApp: MessageSquare,
  Email: Mail,
  "Consent Forms": FileText,
  Notifications: Bell,
  Leads: Users,
  Laboratory: FlaskConical,
}

const SOURCE_TONE: Record<string, "primary" | "accent" | "success" | "warning" | "danger" | "info"> = {
  WhatsApp: "success",
  Email: "info",
  SMS: "info",
  "Consent Forms": "accent",
  Notifications: "warning",
  Leads: "primary",
  Laboratory: "info",
  Appointments: "primary",
  Automation: "info",
  Billing: "warning",
  CRM: "accent",
  "Invoices / Receipts": "warning",
  Treatments: "primary",
}

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  SMS: "SMS",
  PRINTED_DOCUMENT: "Printed Document",
  DOWNLOADED_DOCUMENT: "Downloaded Document",
  MANUAL: "Manual",
}

function channelIcon(channel: string | null) {
  switch (channel) {
    case "EMAIL":
      return Mail
    case "PRINTED_DOCUMENT":
    case "DOWNLOADED_DOCUMENT":
      return FileText
    case "MANUAL":
      return Bell
    case "SMS":
      return MessageSquare
    default:
      return MessageSquare
  }
}

function formatDateTime(v: string | null | undefined): string {
  if (!v) return "—"
  try {
    return new Date(v).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
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

function useRole() {
  const { user } = useAuthStore()
  const role = user?.role ?? "DOCTOR"
  return {
    role,
    canView: role !== "DOCTOR",
    canManage: role === "GROUP_ADMIN" || role === "HOSPITAL_ADMIN",
    canExport: role === "SUPER_ADMIN" || role === "GROUP_ADMIN",
  }
}

function useCommunicationMeta() {
  return useQuery({
    queryKey: ["communication-center", "meta"],
    queryFn: () => communicationCenterApi.meta() as Promise<CommunicationMeta>,
    staleTime: 5 * 60 * 1000,
  })
}

function SourceBadge({ source }: { source: string }) {
  const Icon = SOURCE_ICON[source] || Activity
  return (
    <Badge variant={SOURCE_TONE[source] || "default"} className="gap-1.5 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {source}
    </Badge>
  )
}

function channelBadge(channel: string | null) {
  const Icon = channelIcon(channel)
  const tone = channel === "EMAIL" || channel === "SMS" ? "info" : channel === "MANUAL" ? "default" : "success"
  return (
    <Badge variant={tone as "info" | "default" | "success"} className="gap-1.5 whitespace-nowrap">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {CHANNEL_LABEL[channel || ""] || channel || "—"}
    </Badge>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-min-w-0">
      <dt className="ds-caption text-[var(--ds-text-tertiary)]">{label}</dt>
      <dd className="ds-body ds-truncate mt-0.5 font-medium text-[var(--ds-text)]">{value}</dd>
    </div>
  )
}

/* ── Detail drawer ─────────────────────────────────────────────────────── */

interface DrawerProps {
  item: CommunicationCenterItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onResend: (item: CommunicationCenterItem) => void
  onDownload: (item: CommunicationCenterItem, print: boolean) => void
  canManage: boolean
}

function CommunicationDrawer({ item, open, onOpenChange, onResend, onDownload, canManage }: DrawerProps) {
  const preview = useQuery({
    queryKey: ["communication-center", "preview", item?.source_module, item?.source_id],
    queryFn: () =>
      communicationCenterApi.preview(item!.source_module, item!.source_id) as Promise<CommunicationPreview>,
    enabled: !!item && item.can_resend && open,
  })

  const auditItems = (item?.audit ?? []).map((a) => ({
    id: a.id,
    title: (a.action || "ACTIVITY").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: a.details || undefined,
    date: formatDateTime(a.created_at),
    actor: a.created_by_name || a.created_by || undefined,
    status: a.action || undefined,
    tone: (a.action === "RESEND" ? "info" : a.action === "EXPORT" ? "accent" : "neutral") as
      | "info"
      | "accent"
      | "neutral",
    icon: a.action === "RESEND" ? Send : a.action === "DOWNLOAD" || a.action === "PRINT" ? Download : Activity,
  }))

  return (
    <DetailDrawer
      open={open}
      onClose={() => onOpenChange(false)}
      title={item?.patient_name || item?.lead_name || "Communication"}
      subtitle={item?.subject || item?.communication_type || "Outbound communication"}
      eyebrow={item?.source_module || "Communication"}
      widthClassName="w-full max-w-2xl"
      actions={
        item && (
          <>
            {item.can_download && (
              <>
                <Button size="icon-sm" variant="outline" onClick={() => onDownload(item, false)} aria-label="Download">
                  <Download className="h-4 w-4" />
                </Button>
                <Button size="icon-sm" variant="outline" onClick={() => onDownload(item, true)} aria-label="Print">
                  <Printer className="h-4 w-4" />
                </Button>
              </>
            )}
            {item.can_resend && canManage && (
              <Button size="sm" onClick={() => onResend(item)}>
                <Send className="h-4 w-4" />
                Resend
              </Button>
            )}
          </>
        )
      }
    >
      {item && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status || "PENDING"} />
            {item.delivery_status && <DrawerStatusPill tone="info">{item.delivery_status}</DrawerStatusPill>}
            <DrawerStatusPill tone="neutral">{item.hospital_name || "Hospital"}</DrawerStatusPill>
            {item.sent_via && <DrawerStatusPill tone="primary">{item.sent_via}</DrawerStatusPill>}
          </div>

          <DrawerSection title="Recipient">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Patient" value={item.patient_name || "—"} />
              <Field label="OP Number" value={item.op_number || "—"} />
              <Field label="Phone" value={item.phone || "—"} />
              {item.lead_name && <Field label="Lead" value={item.lead_name} />}
              <Field label="Doctor" value={item.doctor_name || "—"} />
              <Field label="Hospital" value={item.hospital_name || "—"} />
            </div>
          </DrawerSection>

          <DrawerSection title="Communication">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {channelBadge(item.channel)}
              <Badge variant="outline">{item.communication_type || "—"}</Badge>
              {item.template_name && <Badge variant="outline">{item.template_name}</Badge>}
            </div>
            <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Sent By" value={item.sent_by_name || "—"} />
              <Field label="Sent At" value={formatDateTime(item.sent_at)} />
              <Field label="Delivered At" value={formatDateTime(item.delivered_at)} />
              <Field label="Status" value={item.status || "—"} />
              <Field label="Delivery Status" value={item.delivery_status || "—"} />
              <Field label="Provider Response" value={item.provider_response || "—"} />
            </dl>
            {item.message && (
              <p className="ds-secondary-text whitespace-pre-wrap rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2.5 text-[var(--ds-text-secondary)]">
                {item.message}
              </p>
            )}
          </DrawerSection>

          {item.can_resend && (
            <DrawerSection
              title="Smart Preview"
              description="Template variables resolved against the patient record before resending"
            >
              {preview.isLoading ? (
                <LoadingSkeleton rows={2} variant="list" />
              ) : preview.isError ? (
                <p className="ds-caption text-[var(--ds-text-tertiary)]">Preview unavailable.</p>
              ) : preview.data ? (
                <div className="ds-stack">
                  <div className="ds-stack-sm rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] p-3">
                    <p className="ds-caption text-[var(--ds-text-tertiary)]">Recipient</p>
                    <p className="ds-body font-medium text-[var(--ds-text)]">{preview.data.recipient || "—"}</p>
                  </div>
                  <div className="ds-stack-sm rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] p-3">
                    <p className="ds-caption text-[var(--ds-text-tertiary)]">Rendered message</p>
                    <p className="ds-secondary-text whitespace-pre-wrap text-[var(--ds-text-secondary)]">
                      {preview.data.rendered || "—"}
                    </p>
                  </div>
                  {preview.data.unresolved.length > 0 && (
                    <p className="ds-caption rounded-[var(--ds-radius-xl)] bg-[var(--ds-warning-subtle)] px-3 py-2 text-[var(--ds-warning)]">
                      Unresolved: {preview.data.unresolved.join(", ")} — resolve these before resending.
                    </p>
                  )}
                </div>
              ) : null}
            </DrawerSection>
          )}

          <DrawerSection title="Audit Trail" description="Resends, downloads and exports logged for this record">
            <Timeline items={auditItems} emptyTitle="No audit activity yet" emptyDescription="Actions on this record will appear here." />
          </DrawerSection>
        </>
      )}
    </DetailDrawer>
  )
}

/* ── Resend dialog ─────────────────────────────────────────────────────── */

function ResendDialog({
  item,
  preview,
  open,
  onOpenChange,
  onDone,
}: {
  item: CommunicationCenterItem | null
  preview: CommunicationPreview | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (result: CommunicationResendResult) => void
}) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState("")

  const mutation = useMutation({
    mutationFn: () =>
      communicationCenterApi.resend(item!.source_module, item!.source_id, { message }) as Promise<CommunicationResendResult>,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["communication-center"] })
      addToast({ title: result.success ? "Message sent" : "Send failed", description: `Status: ${result.status}`, variant: result.success ? "success" : "destructive" })
      onOpenChange(false)
      onDone(result)
    },
    onError: (err) => {
      addToast({ title: "Resend failed", description: extractDetail(err), variant: "destructive" })
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resend communication</DialogTitle>
          <DialogDescription>
            Sends to {preview?.recipient || item?.phone || "the recipient"} over {CHANNEL_LABEL[item?.channel || ""] || item?.channel || "WhatsApp"}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="ds-stack">
          <div className="ds-stack-sm">
            <Label htmlFor="resend-message">Message</Label>
            <Textarea
              id="resend-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder={preview?.rendered || "Enter the message to send"}
            />
          </div>
          {preview?.unresolved.length ? (
            <p className="ds-caption text-[var(--ds-warning)]">Unresolved variables: {preview.unresolved.join(", ")}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} loading={mutation.isPending}>
            <Send className="h-4 w-4" />
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Pagination ────────────────────────────────────────────────────────── */

function PaginationBar({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3">
      <p className="ds-caption text-[var(--ds-text-secondary)]">
        {total} {total === 1 ? "record" : "records"}
      </p>
      <div className="ds-cluster ds-cluster-sm">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="ds-caption ds-numeric px-1 text-[var(--ds-text-secondary)]">
          Page {page} of {Math.max(pages, 1)}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages || pages === 0} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function CommunicationCenterPage() {
  const { canManage, canExport } = useRole()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const meta = useCommunicationMeta()

  const [activeTab, setActiveTab] = useState("communications")
  const [search, setSearch] = useState("")
  const [sourceModule, setSourceModule] = useState("")
  const [channel, setChannel] = useState("")
  const [status, setStatus] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<CommunicationCenterItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [resendItem, setResendItem] = useState<CommunicationCenterItem | null>(null)
  const [resendPreview, setResendPreview] = useState<CommunicationPreview | null>(null)

  const filterParams = useMemo(() => {
    const params: Record<string, string | number> = { page, page_size: 20, sort_by: "created_at", sort_dir: "desc" }
    if (search) params.search = search
    if (sourceModule) params.source_module = sourceModule
    if (channel) params.channel = channel
    if (status) params.status = status
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    return params
  }, [search, sourceModule, channel, status, dateFrom, dateTo, page])

  const list = useQuery({
    queryKey: ["communication-center", "communications", filterParams],
    queryFn: () => communicationCenterApi.list(filterParams) as Promise<CommunicationCenterPage>,
  })

  const stats = useQuery({
    queryKey: ["communication-center", "stats", filterParams],
    queryFn: () => communicationCenterApi.stats(filterParams) as Promise<CommunicationStats>,
  })

  const activities = useQuery({
    queryKey: ["communication-center", "activities", page],
    queryFn: () =>
      communicationCenterApi.activities({ page, page_size: 25 }) as Promise<{ items: CommunicationCenterActivity[]; total: number; page: number; pages: number }>,
  })

  const downloadMutation = useMutation({
    mutationFn: ({ sourceModule: sm, sourceId, print }: { sourceModule: string; sourceId: string; print: boolean }) =>
      communicationCenterApi.download(sm, sourceId, print),
    onSuccess: (blob, vars) => {
      const ext = blob.type.includes("pdf") ? "pdf" : "bin"
      const url = window.URL.createObjectURL(blob)
      if (vars.print) {
        window.open(url, "_blank")
      } else {
        downloadBlob(blob, `communication-${vars.sourceId}.${ext}`)
      }
      queryClient.invalidateQueries({ queryKey: ["communication-center"] })
      addToast({ title: vars.print ? "Printing" : "Download complete", variant: "success" })
    },
    onError: (err) => {
      addToast({ title: "Download failed", description: extractDetail(err), variant: "destructive" })
    },
  })

  const exportMutation = useMutation({
    mutationFn: (format: "csv" | "excel" | "pdf" | "zip") => communicationCenterApi.exportBlob({ ...filterParams, format }),
    onSuccess: (blob, format) => {
      downloadBlob(blob, `communications-export.${format === "excel" ? "xlsx" : format}`)
      queryClient.invalidateQueries({ queryKey: ["communication-center"] })
      addToast({ title: "Export complete", description: `Downloaded ${format.toUpperCase()} export`, variant: "success" })
    },
    onError: (err) => {
      addToast({ title: "Export failed", description: extractDetail(err), variant: "destructive" })
    },
  })

  const openDetail = (item: CommunicationCenterItem) => {
    setSelected(item)
    setDrawerOpen(true)
  }

  const handleResend = async (item: CommunicationCenterItem) => {
    try {
      const preview = await communicationCenterApi.preview(item.source_module, item.source_id) as CommunicationPreview
      setResendPreview(preview)
      setResendItem(item)
    } catch {
      setResendPreview(null)
      setResendItem(item)
    }
  }

  const resetFilters = () => {
    setSearch("")
    setSourceModule("")
    setChannel("")
    setStatus("")
    setDateFrom("")
    setDateTo("")
    setPage(1)
  }

  const hasFilters = !!(search || sourceModule || channel || status || dateFrom || dateTo)

  const statsData = stats.data
  const metrics = [
    { title: "Total", value: statsData?.total ?? 0, icon: Activity },
    { title: "Today", value: statsData?.today ?? 0, icon: RefreshCw },
    { title: "This Week", value: statsData?.this_week ?? 0, icon: History },
  ]

  const tabItems = [
    { key: "communications", label: "Communications", icon: MessageSquare },
    { key: "activities", label: "Activity Log", icon: History },
  ]

  return (
    <PageContainer>
      <PageHeader
        title="Communication Center"
        description="Every outbound message across WhatsApp, email, SMS, consent documents, notifications and laboratory updates — one read-only timeline."
        eyebrow="Audit · Resend · Export"
        actions={
          canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportMutation.mutate("csv")}>
                  <ClipboardList className="h-4 w-4" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportMutation.mutate("excel")}>
                  <ClipboardList className="h-4 w-4" /> Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportMutation.mutate("pdf")}>
                  <FileText className="h-4 w-4" /> Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportMutation.mutate("zip")}>
                  <Download className="h-4 w-4" /> Export as ZIP
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <PageTabs tabs={tabItems} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "communications" ? (
        <div className="ds-stack">
          {stats.isLoading ? (
            <LoadingSkeleton variant="metrics" rows={3} />
          ) : (
            <div className="ds-auto-metrics">
              {metrics.map((m) => (
                <MetricCard key={m.title} title={m.title} value={m.value} icon={m.icon} />
              ))}
            </div>
          )}

          <SectionCard
            title="Communications"
            description="Filter across all sources"
            flush
            actions={
              hasFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <SearchX className="h-4 w-4" />
                  Clear filters
                </Button>
              )
            }
          >
            <div className="grid gap-3 px-[var(--ds-card-padding)] pb-[var(--ds-spacing-3)] md:grid-cols-12">
              <div className="md:col-span-3">
                <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search patient, phone, message…" />
              </div>
              <div className="md:col-span-3">
                <Select value={sourceModule} onValueChange={(v) => { setSourceModule(v); setPage(1) }}>
                  <SelectTrigger aria-label="Source module">
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All sources</SelectItem>
                    {(meta.data?.sources ?? []).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Select value={channel} onValueChange={(v) => { setChannel(v); setPage(1) }}>
                  <SelectTrigger aria-label="Channel">
                    <SelectValue placeholder="All channels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All channels</SelectItem>
                    {(meta.data?.channels ?? []).map((c) => (
                      <SelectItem key={c} value={c}>{CHANNEL_LABEL[c] || c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
                  <SelectTrigger aria-label="Status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All statuses</SelectItem>
                    {(meta.data?.statuses ?? []).map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="ds-cluster ds-cluster-sm md:col-span-2">
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} aria-label="From date" className="h-9" />
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} aria-label="To date" className="h-9" />
              </div>
            </div>

            {list.isLoading ? (
              <LoadingSkeleton variant="table" rows={5} className="px-[var(--ds-card-padding)] pb-[var(--ds-card-padding)]" />
            ) : list.isError ? (
              <EmptyState
                icon={SearchX}
                title="Couldn't load communications"
                description="Something went wrong while loading this data. Please try again."
                className="px-[var(--ds-card-padding)]"
              />
            ) : (list.data?.items?.length ?? 0) === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No communications found"
                description={hasFilters ? "Try adjusting or clearing the filters to see more records." : "Outbound communications will appear here across all sources."}
                className="px-[var(--ds-card-padding)]"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient / Lead</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Subject / Message</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(list.data?.items ?? []).map((item) => (
                      <TableRow key={`${item.source_module}-${item.source_id}`}>
                        <TableCell>
                          <div className="ds-min-w-0">
                            <p className="ds-body truncate font-medium text-[var(--ds-text)]">
                              {item.patient_name || item.lead_name || "—"}
                            </p>
                            <p className="ds-caption text-[var(--ds-text-tertiary)]">
                              {item.op_number || item.phone || item.hospital_name || ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <SourceBadge source={item.source_module} />
                        </TableCell>
                        <TableCell>
                          <div className="ds-min-w-0 max-w-[320px]">
                            <p className="ds-body ds-truncate font-medium text-[var(--ds-text)]">
                              {item.subject || item.communication_type || "Message"}
                            </p>
                            <p className="ds-caption ds-truncate text-[var(--ds-text-tertiary)]">
                              {item.message_preview || item.message || ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{channelBadge(item.channel)}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.status || "PENDING"} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-[var(--ds-text-secondary)]">
                          {formatDateTime(item.sent_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="ds-cluster ds-cluster-sm justify-end">
                            <Button size="icon-sm" variant="ghost" onClick={() => openDetail(item)} aria-label="View details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {item.can_download && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => downloadMutation.mutate({ sourceModule: item.source_module, sourceId: item.source_id, print: false })}
                                aria-label="Download"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {item.can_resend && canManage && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => handleResend(item)}
                                aria-label="Resend"
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <PaginationBar page={page} pages={list.data?.pages ?? 0} total={list.data?.total ?? 0} onPage={setPage} />
          </SectionCard>
        </div>
      ) : (
        <SectionCard title="Activity Log" description="Every resend, download, print and export across the center" flush>
          {activities.isLoading ? (
            <LoadingSkeleton variant="table" rows={6} className="px-[var(--ds-card-padding)] pb-[var(--ds-card-padding)]" />
          ) : (activities.data?.items?.length ?? 0) === 0 ? (
            <EmptyState icon={History} title="No activity yet" description="Actions on communications will be logged here." className="px-[var(--ds-card-padding)]" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(activities.data?.items ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-[var(--ds-text-secondary)]">{formatDateTime(a.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={a.action === "EXPORT" ? "accent" : a.action === "RESEND" ? "info" : a.action === "DOWNLOAD" || a.action === "PRINT" ? "primary" : "default"}>
                          {(a.action || "ACTIVITY").replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{a.source_module}</TableCell>
                      <TableCell>
                        <p className="ds-body ds-truncate max-w-[360px] text-[var(--ds-text-secondary)]">{a.details || "—"}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[var(--ds-text-secondary)]">{a.created_by_name || a.created_by || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <PaginationBar page={page} pages={activities.data?.pages ?? 0} total={activities.data?.total ?? 0} onPage={setPage} />
        </SectionCard>
      )}

      <CommunicationDrawer
        item={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onResend={handleResend}
        onDownload={(item, print) => downloadMutation.mutate({ sourceModule: item.source_module, sourceId: item.source_id, print })}
        canManage={canManage}
      />

      <ResendDialog
        item={resendItem}
        preview={resendPreview}
        open={!!resendItem}
        onOpenChange={(o) => { if (!o) setResendItem(null) }}
        onDone={(result) => {
          if (result.deep_link) window.open(result.deep_link, "_blank")
        }}
      />
    </PageContainer>
  )
}
