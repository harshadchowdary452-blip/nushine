import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Loader2,
  Edit3,
  Trash2,
  Zap,
  Search,
  Filter,
  ToggleLeft,
  ToggleRight,
} from "lucide-react"
import { crmV2Api } from "@/services/endpoints"
import { PageHeader } from "@/design-system"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { showErrorToast } from "@/utils/showErrorToast"
import type { ApiError } from "@/types"

interface AutomationRule {
  id: string
  name: string
  trigger_event: string
  procedure: string | null
  delay_days: number
  channel: string
  priority: string
  assigned_role: string | null
  message_template: string | null
  repeat_count: number
  max_attempts: number
  stop_conditions: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const TRIGGER_EVENTS = [
  "PATIENT_REGISTERED",
  "APPOINTMENT_COMPLETED",
  "APPOINTMENT_MISSED",
  "TREATMENT_STARTED",
  "VISIT_COMPLETED",
  "TREATMENT_COMPLETED",
  "BILL_GENERATED",
  "PAYMENT_OVERDUE",
  "PATIENT_INACTIVE",
  "PATIENT_BIRTHDAY",
  "MANUAL",
]

const CHANNELS = ["WHATSAPP", "SMS", "EMAIL", "PHONE", "TASK", "NOTIFICATION"]
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"]
const ROLES = ["RECEPTION", "DOCTOR", "CRM_EXECUTIVE", "HOSPITAL_ADMIN"]

const channelColors: Record<string, string> = {
  WHATSAPP: "bg-green-50 text-green-600",
  SMS: "bg-blue-50 text-blue-600",
  EMAIL: "bg-[var(--ds-accent-50)] text-[var(--ds-accent-600)]",
  PHONE: "bg-amber-50 text-amber-600",
  TASK: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  NOTIFICATION: "bg-[var(--ds-primary-50)] text-[var(--ds-primary-600)]",
}

const priorityColors: Record<string, string> = {
  HIGH: "bg-red-50 text-red-600",
  MEDIUM: "bg-yellow-50 text-yellow-600",
  LOW: "bg-green-50 text-green-600",
}

const formatLabel = (s: string) =>
  s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())

export default function AutomationRules() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterTrigger, setFilterTrigger] = useState("")
  const [filterProcedure, setFilterProcedure] = useState("")

  const [name, setName] = useState("")
  const [triggerEvent, setTriggerEvent] = useState("MANUAL")
  const [procedure, setProcedure] = useState("")
  const [delayDays, setDelayDays] = useState("")
  const [channel, setChannel] = useState("WHATSAPP")
  const [priority, setPriority] = useState("MEDIUM")
  const [assignedRole, setAssignedRole] = useState("")
  const [messageTemplate, setMessageTemplate] = useState("")
  const [repeatCount, setRepeatCount] = useState("1")
  const [maxAttempts, setMaxAttempts] = useState("3")
  const [stopConditions, setStopConditions] = useState("")
  const [isActive, setIsActive] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ["crm-automation-rules", filterTrigger, filterProcedure],
    queryFn: () =>
      crmV2Api.rules.list({
        ...(filterTrigger && filterTrigger !== " " ? { trigger_event: filterTrigger } : {}),
        ...(filterProcedure && filterProcedure !== " " ? { procedure: filterProcedure } : {}),
      }),
  })
  const items: AutomationRule[] = Array.isArray(data) ? data : data?.items || []

  const filtered = items.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.procedure?.toLowerCase().includes(search.toLowerCase()),
  )

  const reset = () => {
    setName("")
    setTriggerEvent("MANUAL")
    setProcedure("")
    setDelayDays("")
    setChannel("WHATSAPP")
    setPriority("MEDIUM")
    setAssignedRole("")
    setMessageTemplate("")
    setRepeatCount("1")
    setMaxAttempts("3")
    setStopConditions("")
    setIsActive(true)
    setEditId(null)
  }

  const openEdit = (r: AutomationRule) => {
    setEditId(r.id)
    setName(r.name)
    setTriggerEvent(r.trigger_event)
    setProcedure(r.procedure || "")
    setDelayDays(String(r.delay_days ?? ""))
    setChannel(r.channel)
    setPriority(r.priority)
    setAssignedRole(r.assigned_role || "")
    setMessageTemplate(r.message_template || "")
    setRepeatCount(String(r.repeat_count ?? 1))
    setMaxAttempts(String(r.max_attempts ?? 3))
    setStopConditions(r.stop_conditions || "")
    setIsActive(r.is_active)
    setOpen(true)
  }

  const buildPayload = () => {
    let parsedStop: string[] | null = null
    if (stopConditions.trim()) {
      try {
        parsedStop = JSON.parse(stopConditions)
      } catch {
        parsedStop = [stopConditions]
      }
    }
    return {
      name,
      trigger_event: triggerEvent,
      procedure: procedure || null,
      delay_days: delayDays ? parseInt(delayDays) : 0,
      channel,
      priority,
      assigned_role: assignedRole || null,
      message_template: messageTemplate || null,
      repeat_count: repeatCount ? parseInt(repeatCount) : 1,
      max_attempts: maxAttempts ? parseInt(maxAttempts) : 3,
      stop_conditions: parsedStop,
      is_active: isActive,
    }
  }

  const createMutation = useMutation({
    mutationFn: () => crmV2Api.rules.create(buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules"] })
      addToast({ title: "Rule created", variant: "success" })
      setOpen(false)
      reset()
    },
    onError: (err: ApiError) =>
      showErrorToast(err, addToast),
  })

  const updateMutation = useMutation({
    mutationFn: () => crmV2Api.rules.update(editId!, buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules"] })
      addToast({ title: "Rule updated", variant: "success" })
      setOpen(false)
      reset()
    },
    onError: (err: ApiError) =>
      showErrorToast(err, addToast),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crmV2Api.rules.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules"] })
      addToast({ title: "Deleted", variant: "success" })
    },
    onError: (err: ApiError) =>
      showErrorToast(err, addToast),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => crmV2Api.rules.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules"] })
    },
  })

  const handleSave = () => {
    if (!name) return
    if (editId) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation Rules"
        description="Configure automated follow-up rules triggered by patient events"
        actions={
          <Button
            onClick={() => {
              reset()
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New Rule
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Rules
              <Badge className="ml-1">{items.length}</Badge>
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-tertiary)]" />
                <Input
                  placeholder="Search rules..."
                  className="pl-9 w-56"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterTrigger} onValueChange={setFilterTrigger}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Triggers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">All Triggers</SelectItem>
                  {TRIGGER_EVENTS.map((te) => (
                    <SelectItem key={te} value={te}>
                      {formatLabel(te)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterProcedure} onValueChange={setFilterProcedure}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Procedures" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">All Procedures</SelectItem>
                  {[...new Set(items.map((r) => r.procedure).filter(Boolean))].map((p) => (
                    <SelectItem key={p!} value={p!}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Zap className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>No automation rules found. Click "New Rule" to create one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-[var(--ds-surface-hover)] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{r.name}</span>
                      <Badge className={`text-[10px] ${channelColors[r.channel] || ""}`}>
                        {r.channel}
                      </Badge>
                      <Badge className={`text-[10px] ${priorityColors[r.priority] || ""}`}>
                        {r.priority}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {formatLabel(r.trigger_event)}
                      </Badge>
                      {r.is_active ? (
                        <Badge className="text-[10px] bg-green-50 text-green-700">Active</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {r.procedure && <span>Procedure: {r.procedure}</span>}
                      <span>Delay: {r.delay_days}d</span>
                      {r.assigned_role && <span>Role: {formatLabel(r.assigned_role)}</span>}
                      <span>Repeat: {r.repeat_count}x</span>
                      <span>Max: {r.max_attempts}</span>
                    </div>
                    {r.message_template && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {r.message_template}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggleMutation.mutate(r.id)}
                    >
                      {r.is_active ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-[var(--ds-text-tertiary)]" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}>
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-600"
                      onClick={() => {
                        if (confirm("Delete this rule?")) deleteMutation.mutate(r.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset()
          setOpen(v)
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Rule" : "Create Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Missed Appointment Follow-Up"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trigger Event</Label>
                <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_EVENTS.map((te) => (
                      <SelectItem key={te} value={te}>
                        {formatLabel(te)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Procedure (optional)</Label>
                <Input
                  value={procedure}
                  onChange={(e) => setProcedure(e.target.value)}
                  placeholder="Leave empty for all"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delay Days</Label>
                <NumericInput
                  value={delayDays}
                  onChange={setDelayDays}
                  mode="integer"
                  min={0}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((ch) => (
                      <SelectItem key={ch} value={ch}>
                        {formatLabel(ch)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned Role (optional)</Label>
                <Select value={assignedRole} onValueChange={setAssignedRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">None</SelectItem>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {formatLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message Template</Label>
              <Textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={3}
                placeholder="Hello {{patient_name}}, this is a reminder..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Repeat Count</Label>
                <NumericInput
                  value={repeatCount}
                  onChange={setRepeatCount}
                  mode="integer"
                  min={1}
                  max={10}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Attempts</Label>
                <NumericInput
                  value={maxAttempts}
                  onChange={setMaxAttempts}
                  mode="integer"
                  min={1}
                  max={20}
                  placeholder="3"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stop Conditions (JSON array, optional)</Label>
              <Input
                value={stopConditions}
                onChange={(e) => setStopConditions(e.target.value)}
                placeholder='["COMPLETED", "CANCELLED"]'
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={!name || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editId ? "Update" : "Create"} Rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
