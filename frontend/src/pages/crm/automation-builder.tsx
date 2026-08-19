import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Zap,
  Plus,
  Loader2,
  Edit3,
  Trash2,
  Copy,
  Archive,
  Play,
  Search,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Eye,
  RotateCcw,
} from "lucide-react"
import api from "@/services/api"
import { PageHeader } from "@/design-system"
import KpiCard from "@/components/ui/kpi-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { formatLabel, priorityColors, PAGE_CONTAINER_VARIANTS } from "@/components/crm/index"
import { motion } from "framer-motion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface AutomationRule {
  id: string
  name: string
  description?: string
  trigger_event: string
  procedure?: string
  channel: string
  priority: string
  assigned_role?: string
  status: string
  is_active: boolean
  condition_logic: string
  delay_days: number
  escalation_enabled: boolean
  execution_count: number
  success_count: number
  failure_count: number
  version: number
  created_at?: string
  updated_at?: string
}

interface RuleCondition {
  id?: string
  field_name: string
  operator: string
  value: string
  value_type: string
  sort_order: number
}

interface RuleAction {
  id?: string
  action_type: string
  action_config?: string | Record<string, unknown>
  delay_days: number
  delay_hours: number
  responsible_role?: string
  priority: string
  max_retries: number
  sort_order: number
  is_active: boolean
}

interface RuleDetail extends AutomationRule {
  conditions: RuleCondition[]
  actions: RuleAction[]
  escalation_days_1?: number | null
  escalation_role_1?: string | null
  escalation_days_2?: number | null
  escalation_role_2?: string | null
  escalation_days_3?: number | null
  escalation_role_3?: string | null
}

interface DashboardData {
  total_rules: number
  active_rules: number
  disabled_rules: number
  draft_rules: number
  total_executions: number
  failed_executions: number
  success_rate: number
  queue: { queued: number; processing: number; retrying: number }
}

interface LogEntry {
  id: string
  event_type: string
  action_type: string
  execution_status: string
  is_test: string
  error_message?: string
  created_at?: string
}

interface VersionEntry {
  id: string
  version: number
  change_summary?: string
  created_by?: string
  created_at?: string
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

const CONDITION_FIELDS = [
  "patient_age",
  "patient_gender",
  "patient_source",
  "procedure",
  "payment_status",
  "days_since_last_visit",
  "patient_phone",
  "patient_email",
  "treatment_cost",
]

const OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "NOT_CONTAINS",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_EQUAL",
  "LESS_EQUAL",
  "IN",
  "NOT_IN",
  "IS_NULL",
  "IS_NOT_NULL",
]

const ACTION_TYPES = [
  "CREATE_FOLLOW_UP",
  "SEND_WHATSAPP",
  "SEND_EMAIL",
  "CREATE_NOTIFICATION",
  "CREATE_TASK",
  "ESCALATE_FOLLOW_UP",
]

const CHANNELS = ["WHATSAPP", "SMS", "EMAIL", "PHONE", "TASK", "NOTIFICATION"]
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"]
const ROLES = ["RECEPTION", "DOCTOR", "CRM_EXECUTIVE", "HOSPITAL_ADMIN"]

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  DISABLED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  DRAFT: "bg-yellow-50 text-yellow-700",
  ARCHIVED: "bg-red-50 text-red-600",
}

const logStatusColors: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-700",
  QUEUED: "bg-blue-50 text-blue-700",
}

const actionTypeColors: Record<string, string> = {
  CREATE_FOLLOW_UP: "bg-blue-50 text-blue-700",
  SEND_WHATSAPP: "bg-green-50 text-green-700",
  SEND_EMAIL: "bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)]",
  CREATE_NOTIFICATION: "bg-amber-50 text-amber-700",
  CREATE_TASK: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  ESCALATE_FOLLOW_UP: "bg-red-50 text-red-700",
}

const WIZARD_STEPS = ["Rule Info", "Conditions", "Actions", "Escalation", "Review"]

function getDefaultCondition(): RuleCondition {
  return {
    field_name: "procedure",
    operator: "EQUALS",
    value: "",
    value_type: "STRING",
    sort_order: 0,
  }
}

function getDefaultAction(): RuleAction {
  return {
    action_type: "CREATE_FOLLOW_UP",
    action_config: "{}",
    delay_days: 0,
    delay_hours: 0,
    priority: "MEDIUM",
    max_retries: 1,
    sort_order: 0,
    is_active: true,
  }
}

export default function AutomationBuilder() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [testOpen, setTestOpen] = useState(false)
  const [testRuleId, setTestRuleId] = useState<string | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsRuleId, setLogsRuleId] = useState<string | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [versionsRuleId, setVersionsRuleId] = useState<string | null>(null)
  const [viewDetail, setViewDetail] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("")

  // Form state
  const [formName, setFormName] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formTrigger, setFormTrigger] = useState("MANUAL")
  const [formProcedure, setFormProcedure] = useState("")
  const [formChannel, setFormChannel] = useState("WHATSAPP")
  const [formPriority, setFormPriority] = useState("MEDIUM")
  const [formConditionLogic, setFormConditionLogic] = useState("AND")
  const [formDelayDays, setFormDelayDays] = useState(0)
  const [formEscalationEnabled, setFormEscalationEnabled] = useState(false)
  const [formEscDays1, setFormEscDays1] = useState<number | null>(null)
  const [formEscRole1, setFormEscRole1] = useState<string | null>(null)
  const [formEscDays2, setFormEscDays2] = useState<number | null>(null)
  const [formEscRole2, setFormEscRole2] = useState<string | null>(null)
  const [formConditions, setFormConditions] = useState<RuleCondition[]>([])
  const [formActions, setFormActions] = useState<RuleAction[]>([])

  // Test state
  const [testEventType, setTestEventType] = useState("MANUAL")
  const [testPayload, setTestPayload] = useState("{}")
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)

  const resetForm = () => {
    setFormName("")
    setFormDesc("")
    setFormTrigger("MANUAL")
    setFormProcedure("")
    setFormChannel("WHATSAPP")
    setFormPriority("MEDIUM")
    setFormConditionLogic("AND")
    setFormDelayDays(0)
    setFormEscalationEnabled(false)
    setFormEscDays1(null)
    setFormEscRole1(null)
    setFormEscDays2(null)
    setFormEscRole2(null)
    setFormConditions([])
    setFormActions([])
    setStep(0)
    setEditId(null)
  }

  // --- API Calls ---
  const { data: dashboardRes, isLoading: dashLoading } = useQuery({
    queryKey: ["auto-dashboard"],
    queryFn: () => api.get("/crm/automation/dashboard").then((r) => r.data),
  })
  const dashboard: DashboardData = dashboardRes?.data || {
    total_rules: 0,
    active_rules: 0,
    disabled_rules: 0,
    draft_rules: 0,
    total_executions: 0,
    failed_executions: 0,
    success_rate: 0,
    queue: { queued: 0, processing: 0, retrying: 0 },
  }

  const { data: rulesRes, isLoading: rulesLoading } = useQuery({
    queryKey: ["auto-rules", filterStatus],
    queryFn: () =>
      api
        .get("/crm/automation/rules", {
          params: { ...(filterStatus ? { status: filterStatus } : {}) },
        })
        .then((r) => r.data),
  })
  const rules: AutomationRule[] = rulesRes?.data || []

  const filteredRules = rules.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.trigger_event.toLowerCase().includes(search.toLowerCase()),
  )

  // Rule detail
  const { data: detailRes } = useQuery({
    queryKey: ["auto-rule-detail", viewDetail],
    queryFn: () => api.get(`/crm/automation/rules/${viewDetail}`).then((r) => r.data),
    enabled: !!viewDetail,
  })
  const ruleDetail: RuleDetail | null = detailRes?.data || null

  // Logs
  const { data: logsRes, isLoading: logsLoading } = useQuery({
    queryKey: ["auto-logs", logsRuleId],
    queryFn: () => api.get(`/crm/automation/rules/${logsRuleId}/logs`).then((r) => r.data),
    enabled: !!logsRuleId,
  })
  const logs: LogEntry[] = logsRes?.data || []

  // Versions
  const { data: versionsRes } = useQuery({
    queryKey: ["auto-versions", versionsRuleId],
    queryFn: () => api.get(`/crm/automation/rules/${versionsRuleId}/versions`).then((r) => r.data),
    enabled: !!versionsRuleId,
  })
  const versions: VersionEntry[] = versionsRes?.data || []

  // --- Mutations ---
  const buildPayload = useCallback(
    () => ({
      name: formName,
      description: formDesc || null,
      trigger_event: formTrigger,
      procedure: formProcedure || null,
      channel: formChannel,
      priority: formPriority,
      condition_logic: formConditionLogic,
      delay_days: formDelayDays,
      escalation_enabled: formEscalationEnabled,
      escalation_days_1: formEscDays1,
      escalation_role_1: formEscRole1,
      escalation_days_2: formEscDays2,
      escalation_role_2: formEscRole2,
      conditions: formConditions.filter((c) => c.field_name),
      actions: formActions.map((a) => ({
        ...a,
        action_config:
          typeof a.action_config === "string"
            ? a.action_config
            : JSON.stringify(a.action_config || {}),
      })),
    }),
    [
      formName,
      formDesc,
      formTrigger,
      formProcedure,
      formChannel,
      formPriority,
      formConditionLogic,
      formDelayDays,
      formEscalationEnabled,
      formEscDays1,
      formEscRole1,
      formEscDays2,
      formEscRole2,
      formConditions,
      formActions,
    ],
  )

  const createMutation = useMutation({
    mutationFn: () => api.post("/crm/automation/rules", buildPayload()).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-rules"] })
      queryClient.invalidateQueries({ queryKey: ["auto-dashboard"] })
      addToast({ title: "Rule created", variant: "success" })
      setCreateOpen(false)
      resetForm()
    },
    onError: (err: ApiError) =>
      showErrorToast(err, addToast),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      api.put(`/crm/automation/rules/${editId}`, buildPayload()).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-rules"] })
      queryClient.invalidateQueries({ queryKey: ["auto-dashboard"] })
      addToast({ title: "Rule updated", variant: "success" })
      setCreateOpen(false)
      resetForm()
    },
    onError: (err: ApiError) =>
      showErrorToast(err, addToast),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/automation/rules/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-rules"] })
      queryClient.invalidateQueries({ queryKey: ["auto-dashboard"] })
      addToast({ title: "Deleted", variant: "success" })
    },
    onError: (err: ApiError) =>
      showErrorToast(err, addToast),
  })

  const enableMutation = useMutation({
    mutationFn: (id: string) => api.post(`/crm/automation/rules/${id}/enable`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-rules"] })
      queryClient.invalidateQueries({ queryKey: ["auto-dashboard"] })
      addToast({ title: "Rule enabled", variant: "success" })
    },
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => api.post(`/crm/automation/rules/${id}/disable`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-rules"] })
      queryClient.invalidateQueries({ queryKey: ["auto-dashboard"] })
      addToast({ title: "Rule disabled", variant: "success" })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/crm/automation/rules/${id}/archive`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-rules"] })
      queryClient.invalidateQueries({ queryKey: ["auto-dashboard"] })
      addToast({ title: "Rule archived", variant: "success" })
    },
  })

  const cloneMutation = useMutation({
    mutationFn: (id: string) => api.post(`/crm/automation/rules/${id}/clone`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-rules"] })
      addToast({ title: "Rule cloned", variant: "success" })
    },
  })

  const testMutation = useMutation({
    mutationFn: () => {
      let payload = {}
      try {
        payload = JSON.parse(testPayload)
      } catch {
        /* use empty */
      }
      return api
        .post(`/crm/automation/rules/${testRuleId}/test`, { event_type: testEventType, payload })
        .then((r) => r.data)
    },
    onSuccess: (res) => {
      setTestResult(res?.data || res)
      addToast({ title: "Test completed", variant: "success" })
    },
    onError: (err: ApiError) =>
      showErrorToast(err, addToast),
  })

  const openEdit = async (ruleId: string) => {
    try {
      const res = await api.get(`/crm/automation/rules/${ruleId}`).then((r) => r.data)
      const d: RuleDetail = res?.data
      if (!d) return
      setEditId(d.id)
      setFormName(d.name)
      setFormDesc(d.description || "")
      setFormTrigger(d.trigger_event)
      setFormProcedure(d.procedure || "")
      setFormChannel(d.channel)
      setFormPriority(d.priority)
      setFormConditionLogic(d.condition_logic)
      setFormDelayDays(d.delay_days || 0)
      setFormEscalationEnabled(d.escalation_enabled)
      setFormEscDays1(d.escalation_days_1 ?? null)
      setFormEscRole1(d.escalation_role_1 ?? null)
      setFormEscDays2(d.escalation_days_2 ?? null)
      setFormEscRole2(d.escalation_role_2 ?? null)
      setFormConditions(d.conditions || [])
      setFormActions(d.actions || [])
      setStep(0)
      setCreateOpen(true)
    } catch {
      addToast({ title: "Failed to load rule", variant: "destructive" })
    }
  }

  const openNew = () => {
    resetForm()
    setCreateOpen(true)
  }

  const canNext = () => {
    if (step === 0) return formName.trim().length > 0
    return true
  }

  return (
    <motion.div
      variants={PAGE_CONTAINER_VARIANTS}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <PageHeader
        title="Automation Builder"
        description="Design, configure, test and monitor automation rules"
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> New Rule
          </Button>
        }
      />

      {/* Dashboard KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Total Rules"
          value={dashboard.total_rules}
          icon={Zap}
          loading={dashLoading}
        />
        <KpiCard
          title="Active"
          value={dashboard.active_rules}
          icon={CheckCircle2}
          loading={dashLoading}
          color="text-green-600"
        />
        <KpiCard
          title="Disabled"
          value={dashboard.disabled_rules}
          icon={AlertTriangle}
          loading={dashLoading}
          color="text-[var(--ds-text-secondary)]"
        />
        <KpiCard
          title="Draft"
          value={dashboard.draft_rules}
          icon={Clock}
          loading={dashLoading}
          color="text-amber-600"
        />
      </div>

      {/* Execution Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Total Executions"
          value={dashboard.total_executions}
          icon={Play}
          loading={dashLoading}
        />
        <KpiCard
          title="Failed"
          value={dashboard.failed_executions}
          icon={AlertTriangle}
          loading={dashLoading}
          color="text-red-600"
        />
        <KpiCard
          title="Success Rate"
          value={`${dashboard.success_rate}%`}
          icon={CheckCircle2}
          loading={dashLoading}
          color="text-green-600"
        />
        <KpiCard
          title="Queue"
          value={dashboard.queue.queued + dashboard.queue.processing + dashboard.queue.retrying}
          icon={Clock}
          loading={dashLoading}
        />
      </div>

      {/* Rules Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Rules
              <Badge className="ml-1">{filteredRules.length}</Badge>
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
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">All Statuses</SelectItem>
                  {["ACTIVE", "DRAFT", "DISABLED", "ARCHIVED"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rulesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Zap className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>No automation rules found. Click "New Rule" to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Executions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <span className="font-semibold text-sm">{r.name}</span>
                          {r.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {r.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {formatLabel(r.trigger_event)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] ${(priorityColors as Record<string, string>)[r.channel] || ""}`}
                        >
                          {r.channel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${priorityColors[r.priority] || ""}`}>
                          {r.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusColors[r.status] || ""}`}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.execution_count || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="View Details"
                            onClick={() => setViewDetail(viewDetail === r.id ? null : r.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Edit"
                            onClick={() => openEdit(r.id)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          {r.status === "ACTIVE" ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Disable"
                              onClick={() => disableMutation.mutate(r.id)}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Enable"
                              onClick={() => enableMutation.mutate(r.id)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Clone"
                            onClick={() => cloneMutation.mutate(r.id)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Test"
                            onClick={() => {
                              setTestRuleId(r.id)
                              setTestResult(null)
                              setTestEventType(r.trigger_event)
                              setTestPayload("{}")
                              setTestOpen(true)
                            }}
                          >
                            <Play className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Logs"
                            onClick={() => {
                              setLogsRuleId(r.id)
                              setLogsOpen(true)
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Versions"
                            onClick={() => {
                              setVersionsRuleId(r.id)
                              setVersionsOpen(true)
                            }}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Archive"
                            onClick={() => archiveMutation.mutate(r.id)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Delete"
                            className="text-red-600"
                            onClick={() => {
                              if (confirm("Delete this rule permanently?"))
                                deleteMutation.mutate(r.id)
                            }}
                          >
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

      {/* Expanded Detail Panel */}
      {viewDetail && ruleDetail && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{ruleDetail.name} — Details</CardTitle>
              <Button variant="ghost" size="icon-sm" onClick={() => setViewDetail(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Trigger:</span>{" "}
                <span className="font-medium">{formatLabel(ruleDetail.trigger_event)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Channel:</span>{" "}
                <span className="font-medium">{ruleDetail.channel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Priority:</span>{" "}
                <span className="font-medium">{ruleDetail.priority}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge className={`text-[10px] ml-1 ${statusColors[ruleDetail.status] || ""}`}>
                  {ruleDetail.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Condition Logic:</span>{" "}
                <span className="font-medium">{ruleDetail.condition_logic}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Delay:</span>{" "}
                <span className="font-medium">{ruleDetail.delay_days} days</span>
              </div>
              <div>
                <span className="text-muted-foreground">Version:</span>{" "}
                <span className="font-medium">v{ruleDetail.version}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Executions:</span>{" "}
                <span className="font-medium">
                  {ruleDetail.execution_count || 0} ({ruleDetail.success_count || 0} ok,{" "}
                  {ruleDetail.failure_count || 0} fail)
                </span>
              </div>
            </div>

            {ruleDetail.conditions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Conditions ({ruleDetail.condition_logic})
                </h4>
                <div className="space-y-1">
                  {ruleDetail.conditions.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm bg-[var(--ds-background-subtle)] rounded-lg px-3 py-1.5"
                    >
                      <Badge variant="outline" className="text-[10px]">
                        {c.field_name}
                      </Badge>
                      <span className="text-muted-foreground">{c.operator}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {c.value || "—"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {c.value_type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ruleDetail.actions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Actions</h4>
                <div className="space-y-1">
                  {ruleDetail.actions.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm bg-[var(--ds-background-subtle)] rounded-lg px-3 py-1.5"
                    >
                      <Badge className={`text-[10px] ${actionTypeColors[a.action_type] || ""}`}>
                        {formatLabel(a.action_type)}
                      </Badge>
                      {a.delay_days > 0 && (
                        <span className="text-muted-foreground">delay {a.delay_days}d</span>
                      )}
                      {a.delay_hours > 0 && (
                        <span className="text-muted-foreground">{a.delay_hours}h</span>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {a.priority}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ruleDetail.escalation_enabled && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Escalation</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  {ruleDetail.escalation_days_1 && (
                    <p>
                      Level 1: After {ruleDetail.escalation_days_1} days →{" "}
                      {formatLabel(ruleDetail.escalation_role_1 || "")}
                    </p>
                  )}
                  {ruleDetail.escalation_days_2 && (
                    <p>
                      Level 2: After {ruleDetail.escalation_days_2} days →{" "}
                      {formatLabel(ruleDetail.escalation_role_2 || "")}
                    </p>
                  )}
                  {ruleDetail.escalation_days_3 && (
                    <p>
                      Level 3: After {ruleDetail.escalation_days_3} days →{" "}
                      {formatLabel(ruleDetail.escalation_role_3 || "")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Wizard Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(v) => {
          if (!v) {
            resetForm()
            setCreateOpen(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Rule" : "Create Rule"}</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-4">
            {WIZARD_STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === step ? "bg-blue-600 text-white" : i < step ? "bg-green-500 text-white" : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]"}`}
                >
                  {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={`text-xs truncate hidden sm:inline ${i === step ? "text-blue-600 font-semibold" : "text-muted-foreground"}`}
                >
                  {s}
                </span>
                {i < WIZARD_STEPS.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-[var(--ds-text-tertiary)] shrink-0" />
                )}
              </div>
            ))}
          </div>

          {/* Step 0: Rule Info */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Missed Appointment Follow-Up"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder="Brief description of what this rule does"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Trigger Event</Label>
                  <Select value={formTrigger} onValueChange={setFormTrigger}>
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
                    value={formProcedure}
                    onChange={(e) => setFormProcedure(e.target.value)}
                    placeholder="Leave empty for all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={formChannel} onValueChange={setFormChannel}>
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
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={formPriority} onValueChange={setFormPriority}>
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
                  <Label>Default Delay (days)</Label>
                  <NumericInput
                    mode="integer"
                    min={0}
                    value={formDelayDays}
                    onChange={(v) => setFormDelayDays(parseInt(v) || 0)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Conditions */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Conditions</Label>
                  <Select value={formConditionLogic} onValueChange={setFormConditionLogic}>
                    <SelectTrigger className="w-24 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormConditions([
                      ...formConditions,
                      { ...getDefaultCondition(), sort_order: formConditions.length },
                    ])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {formConditions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No conditions. Rule will always match.
                </p>
              )}
              {formConditions.map((c, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-end bg-[var(--ds-background-subtle)] rounded-lg p-3"
                >
                  <div className="col-span-3">
                    <Label className="text-xs">Field</Label>
                    <Select
                      value={c.field_name}
                      onValueChange={(v) => {
                        const nc = [...formConditions]
                        nc[i] = { ...nc[i], field_name: v }
                        setFormConditions(nc)
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITION_FIELDS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Operator</Label>
                    <Select
                      value={c.operator}
                      onValueChange={(v) => {
                        const nc = [...formConditions]
                        nc[i] = { ...nc[i], operator: v }
                        setFormConditions(nc)
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((o) => (
                          <SelectItem key={o} value={o}>
                            {formatLabel(o)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">Value</Label>
                    <Input
                      className="h-8"
                      value={c.value}
                      onChange={(e) => {
                        const nc = [...formConditions]
                        nc[i] = { ...nc[i], value: e.target.value }
                        setFormConditions(nc)
                      }}
                      placeholder="Expected value"
                    />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={c.value_type}
                      onValueChange={(v) => {
                        const nc = [...formConditions]
                        nc[i] = { ...nc[i], value_type: v }
                        setFormConditions(nc)
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["STRING", "NUMBER", "BOOLEAN"].map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-500"
                      onClick={() => setFormConditions(formConditions.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 2: Actions */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Actions</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormActions([
                      ...formActions,
                      { ...getDefaultAction(), sort_order: formActions.length },
                    ])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Action
                </Button>
              </div>
              {formActions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No actions configured.
                </p>
              )}
              {formActions.map((a, i) => (
                <div key={i} className="bg-[var(--ds-background-subtle)] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Action #{i + 1}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-500"
                      onClick={() => setFormActions(formActions.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={a.action_type}
                        onValueChange={(v) => {
                          const na = [...formActions]
                          na[i] = { ...na[i], action_type: v }
                          setFormActions(na)
                        }}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {formatLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Delay Days</Label>
                      <NumericInput
                        mode="integer"
                        min={0}
                        value={a.delay_days}
                        onChange={(v) => {
                          const na = [...formActions]
                          na[i] = { ...na[i], delay_days: parseInt(v) || 0 }
                          setFormActions(na)
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Delay Hours</Label>
                      <NumericInput
                        mode="integer"
                        min={0}
                        value={a.delay_hours}
                        onChange={(v) => {
                          const na = [...formActions]
                          na[i] = { ...na[i], delay_hours: parseInt(v) || 0 }
                          setFormActions(na)
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Priority</Label>
                      <Select
                        value={a.priority}
                        onValueChange={(v) => {
                          const na = [...formActions]
                          na[i] = { ...na[i], priority: v }
                          setFormActions(na)
                        }}
                      >
                        <SelectTrigger className="h-8">
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
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Config (JSON)</Label>
                      <Textarea
                        className="h-16 font-mono text-xs"
                        value={
                          typeof a.action_config === "string"
                            ? a.action_config
                            : JSON.stringify(a.action_config || {}, null, 2)
                        }
                        onChange={(e) => {
                          const na = [...formActions]
                          na[i] = { ...na[i], action_config: e.target.value }
                          setFormActions(na)
                        }}
                        placeholder='{"time": "10:00", "notes": "Follow up"}'
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Responsible Role</Label>
                      <Select
                        value={a.responsible_role || ""}
                        onValueChange={(v) => {
                          const na = [...formActions]
                          na[i] = { ...na[i], responsible_role: v || undefined }
                          setFormActions(na)
                        }}
                      >
                        <SelectTrigger className="h-8">
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
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Escalation */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Escalation</Label>
                <Switch
                  checked={formEscalationEnabled}
                  onCheckedChange={setFormEscalationEnabled}
                />
              </div>
              {formEscalationEnabled && (
                <div className="space-y-4">
                  {[1, 2].map((level) => (
                    <div key={level} className="grid grid-cols-2 gap-4 bg-[var(--ds-background-subtle)] rounded-lg p-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Level {level} — After (days)</Label>
                        <NumericInput
                          mode="integer"
                          min={1}
                          value={level === 1 ? (formEscDays1 ?? "") : (formEscDays2 ?? "")}
                          onChange={(v) => {
                            const parsed = parseInt(v) || null
                            if (level === 1) setFormEscDays1(parsed)
                            else setFormEscDays2(parsed)
                          }}
                          placeholder="Days"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Escalate To</Label>
                        <Select
                          value={level === 1 ? formEscRole1 || "" : formEscRole2 || ""}
                          onValueChange={(v) => {
                            if (level === 1) setFormEscRole1(v || null)
                            else setFormEscRole2(v || null)
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select role" />
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
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Review Rule Configuration</h4>
              <div className="bg-[var(--ds-background-subtle)] rounded-lg p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="font-medium">{formName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Trigger:</span>{" "}
                    <span className="font-medium">{formatLabel(formTrigger)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Channel:</span>{" "}
                    <span className="font-medium">{formChannel}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Priority:</span>{" "}
                    <span className="font-medium">{formPriority}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Delay:</span>{" "}
                    <span className="font-medium">{formDelayDays} days</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Condition Logic:</span>{" "}
                    <span className="font-medium">{formConditionLogic}</span>
                  </div>
                </div>
                {formConditions.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">
                      Conditions ({formConditions.length}):
                    </span>
                    {formConditions.map((c, i) => (
                      <div key={i} className="ml-2 text-xs">
                        • {c.field_name} {c.operator} "{c.value}" ({c.value_type})
                      </div>
                    ))}
                  </div>
                )}
                {formActions.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Actions ({formActions.length}):</span>
                    {formActions.map((a, i) => (
                      <div key={i} className="ml-2 text-xs">
                        • {formatLabel(a.action_type)}{" "}
                        {a.delay_days > 0 ? `after ${a.delay_days}d` : "immediately"}
                      </div>
                    ))}
                  </div>
                )}
                {formEscalationEnabled && (
                  <div>
                    <span className="text-muted-foreground">Escalation: Enabled</span>
                    {formEscDays1 && (
                      <div className="ml-2 text-xs">
                        • L1: {formEscDays1}d → {formatLabel(formEscRole1 || "")}
                      </div>
                    )}
                    {formEscDays2 && (
                      <div className="ml-2 text-xs">
                        • L2: {formEscDays2}d → {formatLabel(formEscRole2 || "")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <div className="flex gap-2">
              {step < WIZARD_STEPS.length - 1 ? (
                <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={() => (editId ? updateMutation.mutate() : createMutation.mutate())}
                  disabled={
                    !formName.trim() || createMutation.isPending || updateMutation.isPending
                  }
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  {editId ? "Update Rule" : "Create Rule"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Dialog */}
      <Dialog
        open={testOpen}
        onOpenChange={(v) => {
          if (!v) {
            setTestOpen(false)
            setTestResult(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Event Type</Label>
              <Select value={testEventType} onValueChange={setTestEventType}>
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
              <Label>Payload (JSON)</Label>
              <Textarea
                className="font-mono text-xs"
                rows={6}
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                placeholder='{"patient_id": "...", "patient_name": "Test"}'
              />
            </div>
            <Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              {testMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Play className="h-4 w-4 mr-1" /> Run Test
            </Button>
            {testResult && (
              <div className="bg-[var(--ds-background-subtle)] rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">Test Results</h4>
                <pre className="text-xs bg-[var(--ds-surface)] rounded-lg p-3 overflow-x-auto border max-h-60 overflow-y-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog
        open={logsOpen}
        onOpenChange={(v) => {
          if (!v) {
            setLogsOpen(false)
            setLogsRuleId(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Execution Logs</DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No execution logs found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{formatLabel(l.event_type)}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${actionTypeColors[l.action_type] || ""}`}>
                        {formatLabel(l.action_type || "")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${logStatusColors[l.execution_status] || ""}`}>
                        {l.execution_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {l.is_test === "Y" ? (
                        <Badge className="text-[10px] bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)]">Test</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Versions Dialog */}
      <Dialog
        open={versionsOpen}
        onOpenChange={(v) => {
          if (!v) {
            setVersionsOpen(false)
            setVersionsRuleId(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No version history found.
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-3 bg-[var(--ds-background-subtle)] rounded-lg px-4 py-2">
                  <Badge variant="outline">v{v.version}</Badge>
                  <span className="text-sm flex-1">{v.change_summary || "No summary"}</span>
                  <span className="text-xs text-muted-foreground">
                    {v.created_at ? new Date(v.created_at).toLocaleString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
