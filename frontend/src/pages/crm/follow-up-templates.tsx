import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  Loader2,
  Edit3,
  Trash2,
  FileText,
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
import { extractDetail } from "@/types"
import type { ApiError } from "@/types"

interface FollowUpTemplate {
  id: string
  name: string
  procedure: string | null
  trigger_event: string
  delay_days: number
  follow_up_type: string
  reminder_channel: string
  priority: string
  responsible_role: string | null
  max_retries: number
  notes: string | null
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

const FOLLOW_UP_TYPES = [
  "1_DAY_FOLLOWUP",
  "7_DAY_FOLLOWUP",
  "2_WEEK_FOLLOWUP",
  "1_MONTH_FOLLOWUP",
  "RECALL_6_MONTH",
  "RECALL_12_MONTH",
  "CUSTOM",
]

const CHANNELS = ["WHATSAPP", "SMS", "EMAIL", "PHONE", "TASK", "NOTIFICATION"]
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"]
const ROLES = ["RECEPTION", "DOCTOR", "CRM_EXECUTIVE", "HOSPITAL_ADMIN"]

const channelColors: Record<string, string> = {
  WHATSAPP: "bg-green-50 text-green-600",
  SMS: "bg-blue-50 text-blue-600",
  EMAIL: "bg-purple-50 text-purple-600",
  PHONE: "bg-amber-50 text-amber-600",
  TASK: "bg-gray-50 text-gray-600",
  NOTIFICATION: "bg-indigo-50 text-indigo-600",
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

export default function FollowUpTemplates() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterTrigger, setFilterTrigger] = useState("")

  const [name, setName] = useState("")
  const [procedure, setProcedure] = useState("")
  const [triggerEvent, setTriggerEvent] = useState("MANUAL")
  const [delayDays, setDelayDays] = useState("")
  const [followUpType, setFollowUpType] = useState("1_DAY_FOLLOWUP")
  const [reminderChannel, setReminderChannel] = useState("WHATSAPP")
  const [priority, setPriority] = useState("MEDIUM")
  const [responsibleRole, setResponsibleRole] = useState("")
  const [maxRetries, setMaxRetries] = useState("3")
  const [notes, setNotes] = useState("")
  const [isActive, setIsActive] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ["crm-follow-up-templates", filterTrigger],
    queryFn: () => crmV2Api.templates.list(filterTrigger ? { trigger_event: filterTrigger } : {}),
  })
  const items: FollowUpTemplate[] = Array.isArray(data) ? data : data?.items || []

  const filtered = items.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.procedure?.toLowerCase().includes(search.toLowerCase()),
  )

  const reset = () => {
    setName("")
    setProcedure("")
    setTriggerEvent("MANUAL")
    setDelayDays("")
    setFollowUpType("1_DAY_FOLLOWUP")
    setReminderChannel("WHATSAPP")
    setPriority("MEDIUM")
    setResponsibleRole("")
    setMaxRetries("3")
    setNotes("")
    setIsActive(true)
    setEditId(null)
  }

  const openEdit = (t: FollowUpTemplate) => {
    setEditId(t.id)
    setName(t.name)
    setProcedure(t.procedure || "")
    setTriggerEvent(t.trigger_event)
    setDelayDays(String(t.delay_days ?? ""))
    setFollowUpType(t.follow_up_type)
    setReminderChannel(t.reminder_channel)
    setPriority(t.priority)
    setResponsibleRole(t.responsible_role || "")
    setMaxRetries(String(t.max_retries ?? 3))
    setNotes(t.notes || "")
    setIsActive(t.is_active)
    setOpen(true)
  }

  const buildPayload = () => ({
    name,
    procedure: procedure || null,
    trigger_event: triggerEvent,
    delay_days: delayDays ? parseInt(delayDays) : 0,
    follow_up_type: followUpType,
    reminder_channel: reminderChannel,
    priority,
    responsible_role: responsibleRole || null,
    max_retries: maxRetries ? parseInt(maxRetries) : 3,
    notes: notes || null,
    is_active: isActive,
  })

  const createMutation = useMutation({
    mutationFn: () => crmV2Api.templates.create(buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-follow-up-templates"] })
      addToast({ title: "Template created", variant: "success" })
      setOpen(false)
      reset()
    },
    onError: (err: ApiError) =>
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  const updateMutation = useMutation({
    mutationFn: () => crmV2Api.templates.update(editId!, buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-follow-up-templates"] })
      addToast({ title: "Template updated", variant: "success" })
      setOpen(false)
      reset()
    },
    onError: (err: ApiError) =>
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crmV2Api.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-follow-up-templates"] })
      addToast({ title: "Deleted", variant: "success" })
    },
    onError: (err: ApiError) =>
      addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  const handleSave = () => {
    if (!name) return
    if (editId) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-Up Templates"
        description="Manage automated follow-up templates for patient engagement"
        actions={
          <Button
            onClick={() => {
              reset()
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New Template
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Templates
              <Badge className="ml-1">{items.length}</Badge>
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search templates..."
                  className="pl-9 w-56"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterTrigger} onValueChange={setFilterTrigger}>
                <SelectTrigger className="w-44">
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
              <FileText className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>No templates found. Click "New Template" to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Procedure</th>
                    <th className="pb-2 pr-4">Trigger</th>
                    <th className="pb-2 pr-4 text-center">Delay</th>
                    <th className="pb-2 pr-4">Channel</th>
                    <th className="pb-2 pr-4">Priority</th>
                    <th className="pb-2 pr-4">Role</th>
                    <th className="pb-2 pr-4 text-center">Active</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 pr-4 font-medium">{t.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{t.procedure || "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="text-[10px]">
                          {formatLabel(t.trigger_event)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-center">{t.delay_days}d</td>
                      <td className="py-3 pr-4">
                        <Badge className={`text-[10px] ${channelColors[t.reminder_channel] || ""}`}>
                          {t.reminder_channel}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge className={`text-[10px] ${priorityColors[t.priority] || ""}`}>
                          {t.priority}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {t.responsible_role ? formatLabel(t.responsible_role) : "—"}
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            crmV2Api.templates
                              .update(t.id, { is_active: !t.is_active })
                              .then(() =>
                                queryClient.invalidateQueries({
                                  queryKey: ["crm-follow-up-templates"],
                                }),
                              )
                          }}
                        >
                          {t.is_active ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-gray-400" />
                          )}
                        </Button>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(t)}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-red-600"
                            onClick={() => {
                              if (confirm("Delete this template?")) deleteMutation.mutate(t.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <DialogTitle>{editId ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Post-Treatment Follow-Up"
              />
            </div>
            <div className="space-y-2">
              <Label>Procedure (optional)</Label>
              <Input
                value={procedure}
                onChange={(e) => setProcedure(e.target.value)}
                placeholder="e.g. Root Canal"
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
                <Label>Delay Days</Label>
                <NumericInput
                  value={delayDays}
                  onChange={setDelayDays}
                  mode="integer"
                  min={0}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Follow-Up Type</Label>
                <Select value={followUpType} onValueChange={setFollowUpType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_UP_TYPES.map((ft) => (
                      <SelectItem key={ft} value={ft}>
                        {formatLabel(ft)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reminder Channel</Label>
                <Select value={reminderChannel} onValueChange={setReminderChannel}>
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
                <Label>Responsible Role (optional)</Label>
                <Select value={responsibleRole} onValueChange={setResponsibleRole}>
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
              <Label>Max Retries</Label>
              <NumericInput
                value={maxRetries}
                onChange={setMaxRetries}
                mode="integer"
                min={0}
                max={10}
                placeholder="3"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Additional notes..."
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
              {editId ? "Update" : "Create"} Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
