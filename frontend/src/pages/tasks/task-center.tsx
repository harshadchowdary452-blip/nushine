/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus, CheckCircle2, Circle, CalendarClock,
  ListTodo, Trash2, ArrowUpRight, User, UserPlus, Loader2, X,
} from "lucide-react"
import { format, isToday, isBefore } from "date-fns"
import { PageHeader } from "@/design-system"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { tasksApi, usersApi, type TaskItem } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/store/authStore"
import { cn } from "@/lib/utils"
import { entityPath } from "@/lib/entity-links"

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  low: { label: "Low", className: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]" },
  medium: { label: "Medium", className: "bg-blue-100 text-blue-700" },
  high: { label: "High", className: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", className: "bg-red-100 text-red-700" },
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  todo: { label: "To do", className: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]" },
  in_progress: { label: "In progress", className: "bg-blue-100 text-blue-700" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700" },
}

type ViewKey = "today" | "overdue" | "upcoming" | "all"

const VIEW_TABS: { key: ViewKey; label: string }[] = [
  { key: "today", label: "Due Today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
]

function formatDue(due: string): { text: string; tone: "danger" | "warning" | "muted" } {
  const d = new Date(due)
  if (isBefore(d, new Date())) return { text: `Overdue · ${format(d, "MMM d")}`, tone: "danger" }
  if (isToday(d)) return { text: `Today · ${format(d, "h:mm a")}`, tone: "warning" }
  return { text: format(d, "MMM d"), tone: "muted" }
}

interface AssigneeOption {
  id: string
  name: string
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  onAssign,
  assignees,
  busy,
}: {
  task: TaskItem
  onToggle: (t: TaskItem) => void
  onDelete: (t: TaskItem) => void
  onAssign: (t: TaskItem, assigneeId: string | null) => void
  assignees: AssigneeOption[]
  busy: boolean
}) {
  const navigate = useNavigate()
  const done = task.status === "done"
  const priority = PRIORITY_META[task.priority] || PRIORITY_META.medium
  const link = entityPath(task.entity_type, task.entity_id)
  const due = task.due_date ? formatDue(task.due_date) : null

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3.5 transition-all",
        done && "opacity-60",
        task.is_overdue && !done && "border-[var(--ds-danger)]/40"
      )}
    >
      <button
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--ds-border-strong)] text-[var(--ds-text-tertiary)] transition-colors hover:border-[var(--ds-primary)] hover:text-[var(--ds-primary)]"
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-[var(--ds-success)]" /> : <Circle className="h-4 w-4" strokeWidth={1.5} />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("truncate text-sm font-medium text-[var(--ds-text)]", done && "line-through")}>
            {task.title}
          </p>
          <Badge className={priority.className}>{priority.label}</Badge>
          {task.status === "in_progress" && (
            <Badge className={STATUS_META.in_progress.className}>{STATUS_META.in_progress.label}</Badge>
          )}
        </div>
        {task.description && (
          <p className={cn("mt-0.5 text-xs text-[var(--ds-text-secondary)]", done && "line-through")}>
            {task.description}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ds-text-tertiary)]">
          {due && (
            <span className={cn(
              "inline-flex items-center gap-1 font-medium",
              due.tone === "danger" && "text-[var(--ds-danger)]",
              due.tone === "warning" && "text-[var(--ds-warning)]"
            )}>
              <CalendarClock className="h-3 w-3" /> {due.text}
            </span>
          )}
          {assignees.length > 0 ? (
            <Select
              value={task.assignee_id || "unassigned"}
              onValueChange={(v) => onAssign(task, v === "unassigned" ? null : v)}
            >
              <SelectTrigger
                aria-label={`Assign task: ${task.title}`}
                className="h-6 gap-1 rounded-[var(--ds-radius-lg)] border-0 bg-[var(--ds-surface-secondary)] px-2 text-[11px] font-medium text-[var(--ds-text-secondary)] hover:bg-[var(--ds-border)]"
              >
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  <SelectValue placeholder="Unassigned" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            task.assignee_name && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" /> {task.assignee_name}
              </span>
            )
          )}
          {link && (
            <button
              onClick={() => navigate(link)}
              className="inline-flex items-center gap-1 font-medium text-[var(--ds-primary)] hover:underline"
            >
              <ArrowUpRight className="h-3 w-3" />
              Open {task.entity_type?.replace(/_/g, " ")}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(task)}
        disabled={busy}
        aria-label={`Delete task: ${task.title}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] text-[var(--ds-text-tertiary)] opacity-0 transition-all group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--ds-danger-subtle)] hover:text-[var(--ds-danger)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function TaskCenter() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const currentUser = useAuthStore((s) => s.user)
  const [activeView, setActiveView] = useState<ViewKey>("today")
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "todo",
    due_date: "",
    entity_type: "",
    entity_id: "",
    assignee_id: "",
  })

  const { data: usersData } = useQuery({
    queryKey: ["task-assignees"],
    queryFn: () => usersApi.list({ role: "DOCTOR", page_size: 200 }),
  })

  const assignees: AssigneeOption[] = useMemo(() => {
    const raw = Array.isArray(usersData) ? usersData : usersData?.items || []
    return raw.map((u: { id: string; full_name?: string; name?: string; email?: string }) => ({
      id: u.id,
      name: u.full_name || u.name || u.email || "Unnamed",
    }))
  }, [usersData])

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["task-stats"],
    queryFn: () => tasksApi.stats(),
  })

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", activeView, statusFilter, assigneeFilter === "me" ? currentUser?.id : assigneeFilter],
    queryFn: () =>
      tasksApi.list({
        view: activeView,
        status: statusFilter || undefined,
        assignee_id:
          assigneeFilter === "me" ? (currentUser?.id || undefined) : assigneeFilter || undefined,
        limit: 200,
      }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] })
    queryClient.invalidateQueries({ queryKey: ["task-stats"] })
  }

  const toggleMutation = useMutation({
    mutationFn: (t: TaskItem) => tasksApi.setStatus(t.id, t.status === "done" ? "todo" : "done"),
    onSuccess: (updated) => {
      invalidate()
      addToast({
        title: updated.status === "done" ? "Task completed" : "Task reopened",
        variant: "success",
      })
    },
    onError: () => addToast({ title: "Could not update task", variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      invalidate()
      addToast({ title: "Task deleted", variant: "success" })
    },
    onError: () => addToast({ title: "Could not delete task", variant: "destructive" }),
  })

  const assignMutation = useMutation({
    mutationFn: ({ id, assignee_id }: { id: string; assignee_id: string | null }) =>
      tasksApi.setAssignee(id, assignee_id),
    onSuccess: () => {
      invalidate()
      addToast({ title: "Task assigned", variant: "success" })
    },
    onError: () => addToast({ title: "Could not update assignee", variant: "destructive" }),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      tasksApi.create({
        title: data.title,
        description: data.description || undefined,
        priority: data.priority,
        status: data.status,
        due_date: data.due_date ? new Date(data.due_date).toISOString() : undefined,
        entity_type: data.entity_type || undefined,
        entity_id: data.entity_id || undefined,
        assignee_id: data.assignee_id || undefined,
      }),
    onSuccess: () => {
      invalidate()
      setCreateOpen(false)
      setForm({ title: "", description: "", priority: "medium", status: "todo", due_date: "", entity_type: "", entity_id: "", assignee_id: "" })
      addToast({ title: "Task created", variant: "success" })
    },
    onError: (err: any) =>
      addToast({
        title: "Could not create task",
        description: err?.response?.data?.detail || "Please try again",
        variant: "destructive",
      }),
  })

  const visibleTasks = useMemo(() => {
    if (!tasks) return []
    if (!search.trim()) return tasks
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.assignee_name || "").toLowerCase().includes(q)
    )
  }, [tasks, search])

  const counts: Record<ViewKey, number> = {
    today: stats?.due_today ?? 0,
    overdue: stats?.overdue ?? 0,
    upcoming: stats?.upcoming ?? 0,
    all: stats?.open ?? 0,
  }

  if (tasksLoading || statsLoading)
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Center"
        description="Your to-do list, deadline tracking, and quick actions — all in one place"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Task
          </Button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Overdue", value: stats?.overdue ?? 0, tone: "text-[var(--ds-danger)]" },
          { label: "Due Today", value: stats?.due_today ?? 0, tone: "text-[var(--ds-warning)]" },
          { label: "Upcoming", value: stats?.upcoming ?? 0, tone: "text-[var(--ds-info)]" },
          { label: "Completed", value: stats?.completed ?? 0, tone: "text-[var(--ds-success)]" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <p className={cn("text-2xl font-bold", s.tone)}>{s.value}</p>
              <p className="text-xs font-medium text-[var(--ds-text-secondary)]">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as ViewKey)}>
              <TabsList>
                {VIEW_TABS.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
                    {tab.label}
                    <span className="rounded-full bg-[var(--ds-background-subtle)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ds-text-secondary)]">
                      {counts[tab.key]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Filter by assignee">
                  <UserPlus className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" />
                  <SelectValue placeholder="Assigned to anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Anyone</SelectItem>
                  <SelectItem value="me">Assigned to me</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Filter by status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="todo">To do</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="done">Completed</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-56">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter tasks…"
                  aria-label="Filter tasks"
                  className="h-9 pr-8"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Clear filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task list */}
      <div className="space-y-2.5">
        {visibleTasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ds-surface-secondary)]">
                <ListTodo className="h-6 w-6 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-[var(--ds-text)]">Nothing here</p>
              <p className="mt-1 max-w-xs text-xs text-[var(--ds-text-secondary)]">
                {search ? "No tasks match your filter." : `No tasks ${activeView === "all" ? "" : activeView}. Create a task to get started.`}
              </p>
              {!search && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Create a task
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              assignees={assignees}
              busy={toggleMutation.isPending || deleteMutation.isPending}
              onToggle={(t) => toggleMutation.mutate(t)}
              onDelete={(t) => deleteMutation.mutate(t.id)}
              onAssign={(t, id) => assignMutation.mutate({ id: t.id, assignee_id: id })}
            />
          ))
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>Track a to-do item and keep your day organized.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Review treatment plan for patient"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea
                id="task-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional notes…"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger id="task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To do</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-entity">Linked record</Label>
                <Select
                  value={form.entity_type || "none"}
                  onValueChange={(v) => setForm({ ...form, entity_type: v === "none" ? "" : v, entity_id: "" })}
                >
                  <SelectTrigger id="task-entity">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="patient">Patient</SelectItem>
                    <SelectItem value="appointment">Appointment</SelectItem>
                    <SelectItem value="case">Case</SelectItem>
                    <SelectItem value="treatment_plan">Treatment</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.entity_type && (
              <div className="space-y-1.5">
                <Label htmlFor="task-entity-id">Record ID</Label>
                <Input
                  id="task-entity-id"
                  value={form.entity_id}
                  onChange={(e) => setForm({ ...form, entity_id: e.target.value })}
                  placeholder="Paste the record's ID"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select
                value={form.assignee_id || "unassigned"}
                onValueChange={(v) => setForm({ ...form, assignee_id: v === "unassigned" ? "" : v })}
              >
                <SelectTrigger id="task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
