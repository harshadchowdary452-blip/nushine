import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Plus, Trash2, Save, Users, Stethoscope, Settings,
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Pencil,
} from "lucide-react"
import { treatmentTypesApi, crmSettingsApi, crmRulesApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ApiError } from "@/types"
import { extractDetail } from "@/types"

interface TreatmentType { id: string; name: string }
interface LeadRule {
  id: string; name: string; trigger: string; wait_time: string
  action: string; assign_to: string; send_whatsapp: boolean; send_notification: boolean; is_active: boolean
}
interface TreatmentRule {
  id: string; name: string; treatment_type_id: string; trigger: string; visit: string | null
  wait_time: string; action: string; assign_to: string
  send_whatsapp: boolean; send_notification: boolean; is_active: boolean
}

const LEAD_TRIGGERS = [
  { value: "NEW_ENQUIRY", label: "a new enquiry is received" },
  { value: "NO_ACTIVITY", label: "there is no activity" },
  { value: "MISSED_APPOINTMENT", label: "a patient misses an appointment" },
  { value: "MANUAL", label: "a staff member triggers it manually" },
]
const WAIT_TIMES = [
  { value: "IMMEDIATELY", label: "Immediately" },
  { value: "1_DAY", label: "1 Day" },
  { value: "2_DAYS", label: "2 Days" },
  { value: "3_DAYS", label: "3 Days" },
  { value: "7_DAYS", label: "7 Days" },
  { value: "15_DAYS", label: "15 Days" },
  { value: "30_DAYS", label: "30 Days" },
  { value: "180_DAYS", label: "180 Days" },
  { value: "CUSTOM", label: "Custom" },
]
const LEAD_ACTIONS = [
  { value: "FOLLOW_UP_ENQUIRY", label: "create a follow-up enquiry" },
  { value: "CREATE_REMINDER", label: "create a reminder" },
  { value: "NOTIFY_STAFF", label: "notify the staff" },
]
const ASSIGNEES = [
  { value: "RECEPTION", label: "Reception" },
  { value: "HOSPITAL_ADMIN", label: "Hospital Admin" },
  { value: "TREATMENT_COORDINATOR", label: "Treatment Coordinator" },
  { value: "DOCTOR", label: "Doctor" },
  { value: "SPECIFIC_STAFF", label: "Specific Staff" },
]
const TREATMENT_TRIGGERS = [
  { value: "VISIT_COMPLETED", label: "a visit is completed" },
  { value: "TREATMENT_COMPLETED", label: "the treatment is completed" },
  { value: "APPOINTMENT_MISSED", label: "an appointment is missed" },
  { value: "APPOINTMENT_SCHEDULED", label: "an appointment is scheduled" },
  { value: "MANUAL", label: "a staff member triggers it manually" },
]
const VISIT_TYPES = [
  { value: "ANY", label: "Any Visit" },
  { value: "FIRST", label: "First Visit" },
  { value: "MIDDLE", label: "Middle Visit" },
  { value: "FINAL", label: "Final Visit" },
]
const TREATMENT_ACTIONS = [
  { value: "WELLNESS_ENQUIRY", label: "create a Wellness Enquiry" },
  { value: "PAIN_ASSESSMENT", label: "create a Pain Assessment" },
  { value: "MEDICATION_REMINDER", label: "create a Medication Reminder" },
  { value: "RECOVERY_FOLLOW_UP", label: "create a Recovery Follow-up" },
  { value: "RECALL", label: "create a Recall" },
  { value: "GENERAL_FOLLOW_UP", label: "create a General Follow-up" },
]
const TREATMENT_ASSIGNEES = [
  { value: "RECEPTION", label: "Reception" },
  { value: "TREATMENT_COORDINATOR", label: "Treatment Coordinator" },
  { value: "DOCTOR", label: "Doctor" },
  { value: "SPECIFIC_STAFF", label: "Specific Staff" },
]

function findLabel(v: string, list: { value: string; label: string }[]) {
  return list.find((x) => x.value === v)?.label || v
}

function leadRuleSentence(r: LeadRule) {
  const w = r.wait_time === "IMMEDIATELY" ? "right away" : `after ${findLabel(r.wait_time, WAIT_TIMES).toLowerCase()}`
  const parts = [
    `When ${findLabel(r.trigger, LEAD_TRIGGERS)}, wait ${w}`,
    `and ${findLabel(r.action, LEAD_ACTIONS)} assigned to ${findLabel(r.assign_to, ASSIGNEES)}.`,
  ]
  const extras: string[] = []
  if (r.send_whatsapp) extras.push("WhatsApp")
  if (r.send_notification) extras.push("notification")
  if (extras.length) parts.push(`Sends a ${extras.join(" and ")}.`)
  return parts.join(" ")
}

function treatmentRuleSentence(r: TreatmentRule, treatmentName?: string) {
  const tn = treatmentName || "this treatment"
  let when = ""
  if (r.trigger === "VISIT_COMPLETED" && r.visit) {
    when = `After ${findLabel(r.visit, VISIT_TYPES).toLowerCase()} of ${tn}`
  } else if (r.trigger === "TREATMENT_COMPLETED") {
    when = `When ${tn} is completed`
  } else if (r.trigger === "APPOINTMENT_MISSED") {
    when = `When a ${tn} appointment is missed`
  } else if (r.trigger === "APPOINTMENT_SCHEDULED") {
    when = `When a ${tn} appointment is scheduled`
  } else {
    when = `When ${findLabel(r.trigger, TREATMENT_TRIGGERS)} for ${tn}`
  }
  const w = r.wait_time === "IMMEDIATELY" ? "right away" : `after ${findLabel(r.wait_time, WAIT_TIMES).toLowerCase()}`
  const parts = [
    `${when}, wait ${w}`,
    `and ${findLabel(r.action, TREATMENT_ACTIONS)} assigned to ${findLabel(r.assign_to, TREATMENT_ASSIGNEES)}.`,
  ]
  const extras: string[] = []
  if (r.send_whatsapp) extras.push("WhatsApp")
  if (r.send_notification) extras.push("notification")
  if (extras.length) parts.push(`Sends a ${extras.join(" and ")}.`)
  return parts.join(" ")
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAD RULE DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function LeadRuleDialog({
  open, onOpenChange, editingRule, onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editingRule: LeadRule | null
  onSave: (data: { name: string; trigger: string; wait_time: string; action: string; assign_to: string; send_whatsapp: boolean; send_notification: boolean }) => void
}) {
  const [name, setName] = useState(editingRule?.name || "")
  const [trigger, setTrigger] = useState(editingRule?.trigger || "NEW_ENQUIRY")
  const [waitTime, setWaitTime] = useState(editingRule?.wait_time || "2_DAYS")
  const [action, setAction] = useState(editingRule?.action || "FOLLOW_UP_ENQUIRY")
  const [assignTo, setAssignTo] = useState(editingRule?.assign_to || "RECEPTION")
  const [whatsapp, setWhatsapp] = useState(editingRule?.send_whatsapp || false)
  const [notification, setNotification] = useState(editingRule?.send_notification || false)

  const preview: LeadRule = { id: "", name, trigger, wait_time: waitTime, action, assign_to: assignTo, send_whatsapp: whatsapp, send_notification: notification, is_active: true }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingRule ? "Edit Rule" : "Add New Rule"}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-sm text-primary font-medium leading-relaxed">{leadRuleSentence(preview)}</p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Rule Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Follow up new leads" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">When should this happen?</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">How long to wait?</Label>
            <Select value={waitTime} onValueChange={setWaitTime}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WAIT_TIMES.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">What should happen?</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Who should it be assigned to?</Label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ASSIGNEES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Send WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Send a WhatsApp message with this rule</p>
            </div>
            <Switch checked={whatsapp} onCheckedChange={setWhatsapp} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Send Notification</Label>
              <p className="text-xs text-muted-foreground">Notify the assigned staff member</p>
            </div>
            <Switch checked={notification} onCheckedChange={setNotification} />
          </div>
        </div>
        <Button className="w-full mt-2" onClick={() => onSave({ name, trigger, wait_time: waitTime, action, assign_to: assignTo, send_whatsapp: whatsapp, send_notification: notification })} disabled={!name.trim()}>
          {editingRule ? "Save Changes" : "Add Rule"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT RULE DIALOG
// ═══════════════════════════════════════════════════════════════════════════

function TreatmentRuleDialog({
  open, onOpenChange, editingRule, treatmentTypeId, treatmentName, onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editingRule: TreatmentRule | null
  treatmentTypeId: string
  treatmentName: string
  onSave: (data: { name: string; treatment_type_id: string; trigger: string; visit?: string; wait_time: string; action: string; assign_to: string; send_whatsapp: boolean; send_notification: boolean }) => void
}) {
  const [name, setName] = useState(editingRule?.name || "")
  const [trigger, setTrigger] = useState(editingRule?.trigger || "VISIT_COMPLETED")
  const [visit, setVisit] = useState(editingRule?.visit || "ANY")
  const [waitTime, setWaitTime] = useState(editingRule?.wait_time || "2_DAYS")
  const [action, setAction] = useState(editingRule?.action || "WELLNESS_ENQUIRY")
  const [assignTo, setAssignTo] = useState(editingRule?.assign_to || "RECEPTION")
  const [whatsapp, setWhatsapp] = useState(editingRule?.send_whatsapp || false)
  const [notification, setNotification] = useState(editingRule?.send_notification || false)

  const preview: TreatmentRule = {
    id: "", name, treatment_type_id: treatmentTypeId, trigger,
    visit: trigger === "VISIT_COMPLETED" ? visit : null,
    wait_time: waitTime, action, assign_to: assignTo,
    send_whatsapp: whatsapp, send_notification: notification, is_active: true,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingRule ? "Edit Rule" : `Add Rule for ${treatmentName}`}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <p className="text-sm text-primary font-medium leading-relaxed">{treatmentRuleSentence(preview, treatmentName)}</p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Rule Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wellness check after visit" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">When should this happen?</Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TREATMENT_TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {trigger === "VISIT_COMPLETED" && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Which visit?</Label>
              <Select value={visit} onValueChange={setVisit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VISIT_TYPES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs font-medium">How long to wait?</Label>
            <Select value={waitTime} onValueChange={setWaitTime}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WAIT_TIMES.filter((w) => w.value !== "15_DAYS").map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">What should happen?</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TREATMENT_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Who should it be assigned to?</Label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TREATMENT_ASSIGNEES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Send WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Send a WhatsApp message to the patient</p>
            </div>
            <Switch checked={whatsapp} onCheckedChange={setWhatsapp} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Send Notification</Label>
              <p className="text-xs text-muted-foreground">Notify the assigned staff member</p>
            </div>
            <Switch checked={notification} onCheckedChange={setNotification} />
          </div>
        </div>
        <Button
          className="w-full mt-2"
          onClick={() => onSave({
            name, treatment_type_id: treatmentTypeId, trigger,
            visit: trigger === "VISIT_COMPLETED" ? visit : undefined,
            wait_time: waitTime, action, assign_to: assignTo,
            send_whatsapp: whatsapp, send_notification: notification,
          })}
          disabled={!name.trim()}
        >
          {editingRule ? "Save Changes" : "Add Rule"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CRM SETTINGS (Rule-Based, Business-Friendly)
// ═══════════════════════════════════════════════════════════════════════════

export default function CrmSettings() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState("lead-rules")

  // ── CRM Config (General tab) ──
  const { data: crmConfig } = useQuery({
    queryKey: ["crm-config"],
    queryFn: () => crmSettingsApi.crmConfig.get(),
  })
  const config: Record<string, string> = crmConfig || {}

  const updateConfigMutation = useMutation({
    mutationFn: (configs: Record<string, string>) => crmSettingsApi.crmConfig.update(configs),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crm-config"] }); addToast({ title: "Settings saved", variant: "success" }) },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })
  const setConfig = (key: string, value: string) => updateConfigMutation.mutate({ [key]: value })

  // ── Lead Rules ──
  const { data: leadRulesData } = useQuery({
    queryKey: ["crm-lead-rules"],
    queryFn: () => crmRulesApi.lead.list(),
  })
  const leadRules: LeadRule[] = leadRulesData?.rules || []

  const addLeadRuleMutation = useMutation({
    mutationFn: (data: { name: string; trigger: string; wait_time: string; action: string; assign_to: string; send_whatsapp: boolean; send_notification: boolean }) => crmRulesApi.lead.add(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crm-lead-rules"] }); addToast({ title: "Rule added", variant: "success" }); setLeadDialogOpen(false) },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })
  const updateLeadRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => crmRulesApi.lead.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crm-lead-rules"] }); addToast({ title: "Rule updated", variant: "success" }); setLeadDialogOpen(false); setEditingLeadRule(null) },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })
  const deleteLeadRuleMutation = useMutation({
    mutationFn: crmRulesApi.lead.remove,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crm-lead-rules"] }); addToast({ title: "Rule removed", variant: "success" }) },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })
  const toggleLeadRuleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => crmRulesApi.lead.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-lead-rules"] }),
  })

  const [leadDialogOpen, setLeadDialogOpen] = useState(false)
  const [editingLeadRule, setEditingLeadRule] = useState<LeadRule | null>(null)

  // ── Treatment Rules ──
  const { data: treatmentRulesData } = useQuery({
    queryKey: ["crm-treatment-rules"],
    queryFn: () => crmRulesApi.treatment.listAll(),
  })
  const allTreatmentRules: TreatmentRule[] = treatmentRulesData?.rules || []

  const { data: treatmentTypes } = useQuery({
    queryKey: ["treatment-types"],
    queryFn: () => treatmentTypesApi.list(),
  })
  const treatmentTypesList: TreatmentType[] = treatmentTypes || []

  const [expandedTreatment, setExpandedTreatment] = useState<string | null>(null)
  const [treatmentDialogOpen, setTreatmentDialogOpen] = useState(false)
  const [editingTreatmentRule, setEditingTreatmentRule] = useState<TreatmentRule | null>(null)

  const addTreatmentRuleMutation = useMutation({
    mutationFn: crmRulesApi.treatment.add,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crm-treatment-rules"] }); addToast({ title: "Rule added", variant: "success" }); setTreatmentDialogOpen(false) },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })
  const updateTreatmentRuleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => crmRulesApi.treatment.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crm-treatment-rules"] }); addToast({ title: "Rule updated", variant: "success" }); setTreatmentDialogOpen(false); setEditingTreatmentRule(null) },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })
  const deleteTreatmentRuleMutation = useMutation({
    mutationFn: crmRulesApi.treatment.remove,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["crm-treatment-rules"] }); addToast({ title: "Rule removed", variant: "success" }) },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })
  const toggleTreatmentRuleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => crmRulesApi.treatment.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-treatment-rules"] }),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Settings" description="Set up simple rules for when patients should be contacted" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/50">
          <TabsTrigger value="lead-rules" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Lead Rules</TabsTrigger>
          <TabsTrigger value="treatment-rules" className="text-xs gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Treatment Rules</TabsTrigger>
          <TabsTrigger value="general" className="text-xs gap-1.5"><Settings className="h-3.5 w-3.5" /> General</TabsTrigger>
        </TabsList>

        {/* ═══ LEAD RULES ═══ */}
        <TabsContent value="lead-rules">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Lead Follow-up Rules</CardTitle>
                  <p className="text-xs text-muted-foreground">Define when and how your team should follow up with leads.</p>
                </div>
                <Button size="sm" onClick={() => { setEditingLeadRule(null); setLeadDialogOpen(true) }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Rule
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {leadRules.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <p className="text-sm mb-1">No rules yet.</p>
                  <p className="text-xs">Click &quot;Add Rule&quot; to define when patients should be contacted.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {leadRules.map((rule) => (
                    <div key={rule.id} className="flex items-start gap-3 rounded-lg border p-3 group">
                      <button onClick={() => toggleLeadRuleMutation.mutate({ id: rule.id, is_active: !rule.is_active })} className="mt-0.5 shrink-0">
                        {rule.is_active ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{rule.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{leadRuleSentence(rule)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon-sm" onClick={() => { setEditingLeadRule(rule); setLeadDialogOpen(true) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => { if (confirm("Remove this rule?")) deleteLeadRuleMutation.mutate(rule.id) }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <LeadRuleDialog
            open={leadDialogOpen}
            onOpenChange={setLeadDialogOpen}
            editingRule={editingLeadRule}
            onSave={(data) => {
              if (editingLeadRule) {
                updateLeadRuleMutation.mutate({ id: editingLeadRule.id, data })
              } else {
                addLeadRuleMutation.mutate(data)
              }
            }}
          />
        </TabsContent>

        {/* ═══ TREATMENT RULES ═══ */}
        <TabsContent value="treatment-rules">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Treatment Follow-up Rules</CardTitle>
              <p className="text-xs text-muted-foreground">Set rules for each treatment. Click a treatment to see and add its rules.</p>
            </CardHeader>
            <CardContent>
              {treatmentTypesList.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <p className="text-sm">No treatments found. Add treatments in Treatment Master first.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {treatmentTypesList.map((tt) => {
                    const rulesForTreatment = allTreatmentRules.filter((r) => r.treatment_type_id === tt.id)
                    const isExpanded = expandedTreatment === tt.id
                    return (
                      <div key={tt.id} className="rounded-lg border overflow-hidden">
                        <div
                          className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/50"}`}
                          onClick={() => setExpandedTreatment(isExpanded ? null : tt.id)}
                        >
                          <div className="flex items-center gap-3">
                            <Stethoscope className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">{tt.name}</span>
                            {rulesForTreatment.length > 0 && (
                              <Badge variant="outline" className="text-[10px]">{rulesForTreatment.length} rules</Badge>
                            )}
                          </div>
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        {isExpanded && (
                          <div className="p-4 bg-muted/20 border-t space-y-2">
                            {rulesForTreatment.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">No rules for this treatment yet.</p>
                            ) : (
                              rulesForTreatment.map((rule) => (
                                <div key={rule.id} className="flex items-start gap-3 rounded-lg border bg-white p-3 group">
                                  <button onClick={() => toggleTreatmentRuleMutation.mutate({ id: rule.id, is_active: !rule.is_active })} className="mt-0.5 shrink-0">
                                    {rule.is_active ? <ToggleRight className="h-5 w-5 text-green-600" /> : <ToggleLeft className="h-5 w-5 text-gray-400" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{rule.name}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{treatmentRuleSentence(rule, tt.name)}</p>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button variant="ghost" size="icon-sm" onClick={() => { setEditingTreatmentRule(rule); setTreatmentDialogOpen(true) }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" onClick={() => { if (confirm("Remove this rule?")) deleteTreatmentRuleMutation.mutate(rule.id) }}>
                                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => { setEditingTreatmentRule(null); setTreatmentDialogOpen(true) }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule for {tt.name}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <TreatmentRuleDialog
            open={treatmentDialogOpen}
            onOpenChange={setTreatmentDialogOpen}
            editingRule={editingTreatmentRule}
            treatmentTypeId={expandedTreatment || ""}
            treatmentName={treatmentTypesList.find((t) => t.id === expandedTreatment)?.name || ""}
            onSave={(data) => {
              if (editingTreatmentRule) {
                updateTreatmentRuleMutation.mutate({ id: editingTreatmentRule.id, data })
              } else {
                addTreatmentRuleMutation.mutate(data)
              }
            }}
          />
        </TabsContent>

        {/* ═══ GENERAL ═══ */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General Settings</CardTitle>
              <p className="text-xs text-muted-foreground">Basic CRM preferences for your clinic.</p>
            </CardHeader>
            <CardContent className="space-y-6 max-w-lg">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">CRM Enabled</Label>
                  <p className="text-xs text-muted-foreground">Turn CRM features on or off for this clinic</p>
                </div>
                <Switch checked={config.crm_enabled !== "false"} onCheckedChange={(v) => setConfig("crm_enabled", String(v))} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Working Days</Label>
                <p className="text-xs text-muted-foreground">Which days are you open? Follow-ups are only scheduled on working days.</p>
                <div className="flex gap-2">
                  {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => {
                    const days = (config.crm_working_days || "MON,TUE,WED,THU,FRI,SAT").split(",")
                    const isActive = days.includes(day)
                    return (
                      <Button
                        key={day}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className="h-9 w-12 text-xs"
                        onClick={() => {
                          const current = (config.crm_working_days || "MON,TUE,WED,THU,FRI,SAT").split(",")
                          const next = isActive ? current.filter((d) => d !== day) : [...current, day]
                          setConfig("crm_working_days", next.join(","))
                        }}
                      >
                        {day}
                      </Button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reminder Time</Label>
                <p className="text-xs text-muted-foreground">What time should follow-up reminders be sent?</p>
                <Input type="time" className="h-9 w-40" value={config.crm_reminder_time || "09:00"} onChange={(e) => setConfig("crm_reminder_time", e.target.value)} />
              </div>
              <Button onClick={() => addToast({ title: "Settings saved", variant: "success" })}>
                <Save className="h-4 w-4 mr-1" /> Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
