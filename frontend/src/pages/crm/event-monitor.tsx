import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  Timer,
  Loader2,
  RotateCcw,
  CalendarDays,
  Server,
  Database,
  ArrowUpDown,
} from "lucide-react"
import { crmEventsApi } from "@/services/endpoints"
import { PageHeader } from "@/design-system"
import KpiCard from "@/components/ui/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SearchFilterBar } from "@/components/crm/search-filter-bar"
import { MetricCard } from "@/components/crm/metric-card"
import { useToast } from "@/components/ui/toast"
import { showErrorToast } from "@/utils/showErrorToast"
import type { ApiError } from "@/types"
import { PAGE_CONTAINER_VARIANTS, formatLabel } from "@/components/crm/index"

interface EventRecord {
  id: string
  event_id: string
  event_type: string
  source_module: string
  entity_type: string
  status: string
  hospital_name?: string
  hospital_id?: string
  payload?: Record<string, unknown>
  error_message?: string
  retry_count?: number
  created_at: string
  processed_at?: string
}

interface EventStatistics {
  total_today: number
  pending: number
  completed: number
  failed: number
  avg_processing_time_ms: number
  retry_queue: number
}

interface EventsListResponse {
  items: EventRecord[]
  total: number
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  PROCESSING: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-700",
  RETRYING: "bg-amber-50 text-amber-700",
  SKIPPED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
}

const statusDotColors: Record<string, string> = {
  PENDING: "bg-yellow-400",
  PROCESSING: "bg-blue-400",
  COMPLETED: "bg-green-400",
  FAILED: "bg-red-400",
  RETRYING: "bg-amber-400",
  SKIPPED: "bg-[var(--ds-text-tertiary)]",
}

const EVENT_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "RETRYING", "SKIPPED"]

const SOURCE_MODULES = [
  "APPOINTMENT",
  "PATIENT",
  "CASE",
  "TREATMENT",
  "BILLING",
  "WHATSAPP",
  "LEAD",
  "ENQUIRY",
  "FOLLOW_UP",
]

function PayloadModal({
  payload,
  event,
}: {
  payload: Record<string, unknown>
  event: EventRecord
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Eye className="h-3.5 w-3.5 mr-1" /> View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            Event Payload
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-xs overflow-auto flex-1">
          <div className="grid grid-cols-2 gap-2 text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Event ID:</span> {event.event_id}
            </div>
            <div>
              <span className="font-medium text-foreground">Type:</span>{" "}
              {formatLabel(event.event_type)}
            </div>
            <div>
              <span className="font-medium text-foreground">Source:</span>{" "}
              {formatLabel(event.source_module)}
            </div>
            <div>
              <span className="font-medium text-foreground">Entity:</span>{" "}
              {formatLabel(event.entity_type)}
            </div>
          </div>
          <pre className="bg-[var(--ds-neutral-950)] text-green-400 rounded-lg p-4 overflow-auto text-xs leading-relaxed">
            <code>{JSON.stringify(payload, null, 2)}</code>
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function EventMonitor() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")

  const { data: statistics, isLoading: statsLoading } = useQuery<EventStatistics>({
    queryKey: ["crm-events-statistics"],
    queryFn: () => crmEventsApi.statistics(),
  })

  const queryParams: Record<string, unknown> = {}
  if (search) queryParams.search = search
  if (statusFilter !== "all") queryParams.status = statusFilter
  if (sourceFilter !== "all") queryParams.source_module = sourceFilter

  const { data: eventsData, isLoading: eventsLoading } = useQuery<EventsListResponse>({
    queryKey: ["crm-events", queryParams],
    queryFn: () => crmEventsApi.list(queryParams),
  })

  const retryMutation = useMutation({
    mutationFn: (eventId: string) => crmEventsApi.retry(eventId),
    onSuccess: () => {
      addToast({ title: "Event queued for retry" })
      queryClient.invalidateQueries({ queryKey: ["crm-events"] })
      queryClient.invalidateQueries({ queryKey: ["crm-events-statistics"] })
    },
    onError: (err: ApiError) => {
      showErrorToast(err, addToast)
    },
  })

  const replayMutation = useMutation({
    mutationFn: (eventId: string) => crmEventsApi.replay(eventId),
    onSuccess: () => {
      addToast({ title: "Event replayed successfully" })
      queryClient.invalidateQueries({ queryKey: ["crm-events"] })
      queryClient.invalidateQueries({ queryKey: ["crm-events-statistics"] })
    },
    onError: (err: ApiError) => {
      showErrorToast(err, addToast)
    },
  })

  const s = statistics || {
    total_today: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    avg_processing_time_ms: 0,
    retry_queue: 0,
  }
  const events = eventsData?.items || []

  const truncatedId = useCallback((id: string) => {
    return id.length > 12 ? id.slice(0, 12) + "..." : id
  }, [])

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[130px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-6"
      variants={PAGE_CONTAINER_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      <PageHeader
        title="Event Monitor"
        description="Track, retry, and replay CRM automation events"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={CalendarDays}
          title="Today's Events"
          value={s.total_today}
          color="text-blue-600"
          delay={0}
        />
        <KpiCard
          icon={Clock}
          title="Pending"
          value={s.pending}
          color="text-amber-600"
          delay={0.05}
        />
        <KpiCard
          icon={CheckCircle2}
          title="Completed"
          value={s.completed}
          color="text-green-600"
          delay={0.1}
        />
        <KpiCard
          icon={AlertTriangle}
          title="Failed"
          value={s.failed}
          color="text-red-600"
          delay={0.15}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          title="Avg Processing Time"
          value={`${s.avg_processing_time_ms}ms`}
          subtitle="Across all events today"
          icon={<Timer className="h-5 w-5 text-muted-foreground" />}
        />
        <MetricCard
          title="Retry Queue"
          value={s.retry_queue}
          subtitle="Events waiting for retry"
          icon={<RefreshCw className="h-5 w-5 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Events
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by event type, source, entity..."
            filters={[
              {
                key: "status",
                label: "Status",
                options: EVENT_STATUSES.map((s) => ({ label: formatLabel(s), value: s })),
                value: statusFilter,
                onChange: setStatusFilter,
              },
              {
                key: "source",
                label: "Source Module",
                options: SOURCE_MODULES.map((s) => ({ label: formatLabel(s), value: s })),
                value: sourceFilter,
                onChange: setSourceFilter,
              },
            ]}
          />

          {eventsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No events found
            </div>
          ) : (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">
                      <span className="flex items-center gap-1">
                        <ArrowUpDown className="h-3 w-3" /> Event ID
                      </span>
                    </TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev) => {
                    const dotColor = statusDotColors[ev.status] || "bg-[var(--ds-text-tertiary)]"
                    return (
                      <TableRow key={ev.id}>
                        <TableCell className="font-mono text-xs" title={ev.event_id}>
                          {truncatedId(ev.event_id)}
                        </TableCell>
                        <TableCell className="text-xs">{formatLabel(ev.event_type)}</TableCell>
                        <TableCell className="text-xs">{formatLabel(ev.source_module)}</TableCell>
                        <TableCell className="text-xs">{formatLabel(ev.entity_type)}</TableCell>
                        <TableCell>
                          <Badge
                            className={`text-[10px] font-medium ${statusColors[ev.status] || "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]"}`}
                          >
                            <span
                              className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor} mr-1.5`}
                            />
                            {formatLabel(ev.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ev.hospital_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(ev.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {ev.processed_at ? new Date(ev.processed_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {ev.payload && <PayloadModal payload={ev.payload} event={ev} />}
                            {ev.status === "FAILED" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                                disabled={retryMutation.isPending}
                                onClick={() => retryMutation.mutate(ev.id)}
                              >
                                {retryMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                )}
                                Retry
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={replayMutation.isPending}
                              onClick={() => replayMutation.mutate(ev.id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Replay
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
