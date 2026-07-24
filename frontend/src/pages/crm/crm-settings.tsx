import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Users, Stethoscope, Settings, Save, Plus, Trash2,
  MessageCircle, Bell, Clock, ChevronDown, ChevronRight,
  CheckCircle2, CircleDot, CalendarClock, Phone,
} from "lucide-react"
import { crmRulesApi, crmSettingsApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ApiError } from "@/types"
import { extractDetail } from "@/types"

interface LeadFollowUp {
  id?: string
  delay_days: number
  enabled: boolean
  send_whatsapp: boolean
  send_notification: boolean
}

interface TreatmentJourneyStep {
  id?: string
  milestone: string
  delay_days: number
  enabled: boolean
  send_whatsapp: boolean
  send_notification: boolean
  label: string
  visit_stage?: string
  action?: string
}

interface TreatmentJourney {
  treatment_type_id: string
  treatment_name: string
  steps: TreatmentJourneyStep[]
  step_count: number
  active_count: number
}

const MILESTONE_META: Record<string, { label: string; icon: typeof CircleDot; description: string; default_delay: number; default_action: string; default_visit_stage?: string }> = {
  VISIT_COMPLETED: {
    label: "Visit Completed",
    icon: CheckCircle2,
    description: "After a visit is completed",
    default_delay: 2,
    default_action: "WELLNESS_ENQUIRY",
    default_visit_stage: "ANY",
  },
  APPOINTMENT_CREATED: {
    label: "Next Appointment Reminder",
    icon: CalendarClock,
    description: "Before the next appointment",
    default_delay: 1,
    default_action: "APPOINTMENT_REMINDER",
  },
}

const DEFAULT_LEAD_STEPS: LeadFollowUp[] = [
  { delay_days: 2, enabled: true, send_whatsapp: true, send_notification: true },
  { delay_days: 5, enabled: true, send_whatsapp: true, send_notification: false },
  { delay_days: 10, enabled: true, send_whatsapp: true, send_notification: false },
]

const DEFAULT_TREATMENT_STEPS: TreatmentJourneyStep[] = [
  { milestone: "VISIT_COMPLETED", delay_days: 2, enabled: true, send_whatsapp: true, send_notification: true, label: "Wellness Follow-up", visit_stage: "ANY", action: "WELLNESS_ENQUIRY" },
  { milestone: "APPOINTMENT_CREATED", delay_days: 1, enabled: true, send_whatsapp: true, send_notification: false, label: "Appointment Reminder", action: "APPOINTMENT_REMINDER" },
]

export default function CrmSettings() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState("lead-policy")

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Settings"
        description="Configure when and how the clinic follows up with patients"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/50">
          <TabsTrigger value="lead-policy" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Lead Follow-up</TabsTrigger>
          <TabsTrigger value="treatment-journeys" className="text-xs gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Treatment Journeys</TabsTrigger>
          <TabsTrigger value="case-journey" className="text-xs gap-1.5"><Phone className="h-3.5 w-3.5" /> Case Journey</TabsTrigger>
          <TabsTrigger value="general" className="text-xs gap-1.5"><Settings className="h-3.5 w-3.5" /> General</TabsTrigger>
        </TabsList>

        <TabsContent value="lead-policy">
          <LeadFollowUpPolicy />
        </TabsContent>

        <TabsContent value="treatment-journeys">
          <TreatmentJourneyPolicies />
        </TabsContent>

        <TabsContent value="case-journey">
          <CaseJourneyPolicy />
        </TabsContent>

        <TabsContent value="general">
          <GeneralSettings config={config} setConfig={setConfig} addToast={addToast} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAD FOLLOW-UP POLICY
// ═══════════════════════════════════════════════════════════════════════════

function LeadFollowUpPolicy() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ["crm-lead-policy"],
    queryFn: () => crmRulesApi.policies.getLeadPolicy(),
  })

  const policy = data?.policy
  const [steps, setSteps] = useState<LeadFollowUp[]>(DEFAULT_LEAD_STEPS)
  const [autoCloseDays, setAutoCloseDays] = useState(30)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (policy && !initialized) {
      if (policy.follow_ups && policy.follow_ups.length > 0) {
        setSteps(policy.follow_ups.map((s: LeadFollowUp) => ({ ...s })))
      }
      if (policy.auto_close_days) {
        setAutoCloseDays(policy.auto_close_days)
      }
      setInitialized(true)
    }
  }, [policy, initialized])

  const saveMutation = useMutation({
    mutationFn: () => crmRulesApi.policies.saveLeadPolicy({ follow_ups: steps, auto_close_days: autoCloseDays }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-lead-policy"] })
      addToast({ title: "Lead follow-up policy saved", variant: "success" })
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  function addStep() {
    const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_days : 0
    setSteps([...steps, { delay_days: lastDelay + 5, enabled: true, send_whatsapp: true, send_notification: false }])
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx))
  }

  function updateStep(idx: number, field: keyof LeadFollowUp, value: boolean | number) {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading policy...</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Follow-up Policy</CardTitle>
          <p className="text-xs text-muted-foreground">
            Configure how the clinic follows up with new enquiries before they become patients.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {steps.length === 0 ? (
            <div className="py-8 text-center border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">No follow-up steps configured.</p>
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-4 w-4 mr-1" /> Add First Follow-up
              </Button>
            </div>
          ) : (
            <div className="space-y-0">
              {steps.map((step, idx) => (
                <div key={idx} className="relative">
                  <div className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${step.enabled ? "bg-white" : "bg-gray-50 opacity-70"}`}>
                    <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step.enabled ? "bg-primary text-primary-foreground" : "bg-gray-200 text-gray-500"}`}>
                        {idx + 1}
                      </div>
                      {idx < steps.length - 1 && (
                        <div className="w-px h-6 bg-gray-200" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Follow-up {idx + 1}</p>
                          <p className="text-xs text-muted-foreground">Sends {step.delay_days} day{step.delay_days !== 1 ? "s" : ""} after enquiry is created</p>
                        </div>
                        <Switch checked={step.enabled} onCheckedChange={(v) => updateStep(idx, "enabled", v)} />
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <Label className="text-xs text-muted-foreground">After</Label>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={step.delay_days}
                            onChange={(e) => updateStep(idx, "delay_days", Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-7 w-16 text-xs text-center"
                          />
                          <Label className="text-xs text-muted-foreground">day{step.delay_days !== 1 ? "s" : ""}</Label>
                        </div>
                        <div className="flex items-center gap-3 ml-auto">
                          <div className="flex items-center gap-1.5" title="Send WhatsApp message">
                            <MessageCircle className={`h-3.5 w-3.5 ${step.send_whatsapp ? "text-green-600" : "text-gray-400"}`} />
                            <Switch
                              checked={step.send_whatsapp}
                              onCheckedChange={(v) => updateStep(idx, "send_whatsapp", v)}
                              className="scale-75"
                            />
                          </div>
                          <div className="flex items-center gap-1.5" title="Notify staff">
                            <Bell className={`h-3.5 w-3.5 ${step.send_notification ? "text-amber-600" : "text-gray-400"}`} />
                            <Switch
                              checked={step.send_notification}
                              onCheckedChange={(v) => updateStep(idx, "send_notification", v)}
                              className="scale-75"
                            />
                          </div>
                          {steps.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-red-500"
                              onClick={() => removeStep(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {steps.length > 0 && steps.length < 5 && (
            <Button variant="outline" size="sm" className="w-full" onClick={addStep}>
              <Plus className="h-4 w-4 mr-1" /> Add Another Follow-up
            </Button>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Auto-close enquiry after</Label>
                <p className="text-xs text-muted-foreground">Close enquiries with no response</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={autoCloseDays}
                  onChange={(e) => setAutoCloseDays(Math.max(1, parseInt(e.target.value) || 30))}
                  className="h-8 w-20 text-xs text-center"
                />
                <Label className="text-xs text-muted-foreground">days</Label>
              </div>
            </div>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save Lead Follow-up Policy"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT JOURNEY POLICIES
// ═══════════════════════════════════════════════════════════════════════════

function TreatmentJourneyPolicies() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["crm-treatment-journeys"],
    queryFn: () => crmRulesApi.policies.getTreatmentJourneys(),
  })

  const journeys: TreatmentJourney[] = data?.journeys || []

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading treatment journeys...</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Treatment Journey Policies</CardTitle>
          <p className="text-xs text-muted-foreground">
            Select a treatment to view and configure its patient follow-up timeline.
          </p>
        </CardHeader>
        <CardContent>
          {journeys.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-sm">No treatments found. Add treatments in Treatment Master first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {journeys.map((journey) => (
                <JourneyCard
                  key={journey.treatment_type_id}
                  journey={journey}
                  isExpanded={expandedId === journey.treatment_type_id}
                  onToggle={() => setExpandedId(expandedId === journey.treatment_type_id ? null : journey.treatment_type_id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function JourneyCard({
  journey,
  isExpanded,
  onToggle,
}: {
  journey: TreatmentJourney
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className={`rounded-lg border overflow-hidden transition-all ${isExpanded ? "ring-1 ring-primary/20" : ""}`}>
      <div
        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/50"}`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <Stethoscope className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <span className="text-sm font-medium">{journey.treatment_name}</span>
            <div className="flex items-center gap-2 mt-0.5">
              {journey.step_count > 0 ? (
                <>
                  <span className="text-[10px] text-muted-foreground">{journey.active_count} active</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">{journey.step_count} steps</span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">No steps configured</span>
              )}
            </div>
          </div>
        </div>
        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      {isExpanded && (
        <JourneyTimeline journey={journey} />
      )}
    </div>
  )
}

function JourneyTimeline({ journey }: { journey: TreatmentJourney }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [steps, setSteps] = useState<TreatmentJourneyStep[]>(journey.steps.length > 0 ? journey.steps : DEFAULT_TREATMENT_STEPS)
  const [notes, setNotes] = useState("")

  useEffect(() => {
    setSteps(journey.steps.length > 0 ? journey.steps : DEFAULT_TREATMENT_STEPS)
  }, [journey.treatment_type_id, journey.steps])

  const saveMutation = useMutation({
    mutationFn: () => crmRulesApi.policies.saveTreatmentJourney(journey.treatment_type_id, { steps, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-treatment-journeys"] })
      addToast({ title: `${journey.treatment_name} journey saved`, variant: "success" })
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  function addStep(milestone: string) {
    const meta = MILESTONE_META[milestone]
    if (!meta) return
    setSteps([...steps, {
      milestone,
      delay_days: meta.default_delay,
      enabled: true,
      send_whatsapp: true,
      send_notification: false,
      label: meta.label,
      visit_stage: meta.default_visit_stage,
      action: meta.default_action,
    }])
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx))
  }

  function updateStep(idx: number, field: keyof TreatmentJourneyStep, value: boolean | number | string) {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const availableMilestones = Object.keys(MILESTONE_META).filter(
    (m) => !steps.some((s) => s.milestone === m)
  )

  return (
    <div className="p-4 bg-muted/20 border-t space-y-4">
      {steps.length > 0 ? (
        <div className="space-y-0">
          {steps.map((step, idx) => {
            const meta = MILESTONE_META[step.milestone] || MILESTONE_META.VISIT_COMPLETED
            const Icon = meta.icon
            return (
              <div key={idx} className="relative">
                <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${step.enabled ? "bg-white border" : "bg-gray-50 border opacity-70"}`}>
                  <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step.enabled ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400"}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    {idx < steps.length - 1 && <div className="w-px h-4 bg-gray-200 my-0.5" />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-900">{step.label || meta.label}</p>
                        <p className="text-[10px] text-muted-foreground">{meta.description}</p>
                      </div>
                      <Switch checked={step.enabled} onCheckedChange={(v) => updateStep(idx, "enabled", v)} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <Label className="text-[10px] text-muted-foreground">
                          {step.milestone === "APPOINTMENT_CREATED" ? "Before" : "After"}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={step.delay_days}
                          onChange={(e) => updateStep(idx, "delay_days", Math.max(0, parseInt(e.target.value) || 0))}
                          className="h-6 w-14 text-[10px] text-center"
                        />
                        <Label className="text-[10px] text-muted-foreground">
                          day{step.delay_days !== 1 ? "s" : ""}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <div className="flex items-center gap-0.5" title="WhatsApp">
                          <MessageCircle className={`h-3 w-3 ${step.send_whatsapp ? "text-green-600" : "text-gray-400"}`} />
                          <Switch
                            checked={step.send_whatsapp}
                            onCheckedChange={(v) => updateStep(idx, "send_whatsapp", v)}
                            className="scale-[0.6]"
                          />
                        </div>
                        <div className="flex items-center gap-0.5" title="Notification">
                          <Bell className={`h-3 w-3 ${step.send_notification ? "text-amber-600" : "text-gray-400"}`} />
                          <Switch
                            checked={step.send_notification}
                            onCheckedChange={(v) => updateStep(idx, "send_notification", v)}
                            className="scale-[0.6]"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-gray-400 hover:text-red-500"
                          onClick={() => removeStep(idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="py-6 text-center border border-dashed rounded-lg">
          <p className="text-xs text-muted-foreground">No follow-up steps configured for this treatment.</p>
        </div>
      )}

      {availableMilestones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableMilestones.map((m) => {
            const meta = MILESTONE_META[m]
            return (
              <Button
                key={m}
                variant="outline"
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={() => addStep(m)}
              >
                <Plus className="h-3 w-3" />
                {meta.label}
              </Button>
            )
          })}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Staff Notes (optional)</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal instructions for staff handling this treatment journey..."
          className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-xs min-h-[60px] placeholder:text-muted-foreground"
        />
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="sm" className="w-full">
        <Save className="h-3.5 w-3.5 mr-1" />
        {saveMutation.isPending ? "Saving..." : `Save ${journey.treatment_name} Journey`}
      </Button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CASE JOURNEY POLICY — Recovery + Recall (scope=CASE)
// ═══════════════════════════════════════════════════════════════════════════

interface CaseJourneyStep {
  id?: string
  milestone: string
  delay_days: number
  enabled: boolean
  send_whatsapp: boolean
  send_notification: boolean
  label: string
}

const CASE_MILESTONE_META: Record<string, { label: string; icon: typeof CircleDot; description: string; default_delay: number }> = {
  CASE_RECOVERY: {
    label: "Recovery Follow-up",
    icon: CheckCircle2,
    description: "Check healing progress after case completion",
    default_delay: 3,
  },
  CASE_RECALL: {
    label: "6-Month Recall",
    icon: Phone,
    description: "Periodic recall checkup after case completion",
    default_delay: 180,
  },
}

const DEFAULT_CASE_STEPS: CaseJourneyStep[] = [
  { milestone: "CASE_RECOVERY", delay_days: 3, enabled: true, send_whatsapp: true, send_notification: true, label: "Recovery Follow-up" },
  { milestone: "CASE_RECALL", delay_days: 180, enabled: true, send_whatsapp: true, send_notification: false, label: "6-Month Recall" },
]

function CaseJourneyPolicy() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ["crm-case-journey"],
    queryFn: () => crmRulesApi.policies.getCaseJourney(),
  })

  const policy = data?.policy
  const [steps, setSteps] = useState<CaseJourneyStep[]>(DEFAULT_CASE_STEPS)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (policy && !initialized) {
      if (policy.steps && policy.steps.length > 0) {
        setSteps(policy.steps.map((s: CaseJourneyStep) => ({ ...s })))
      }
      setInitialized(true)
    }
  }, [policy, initialized])

  const saveMutation = useMutation({
    mutationFn: () => crmRulesApi.policies.saveCaseJourney({ steps }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-case-journey"] })
      addToast({ title: "Case journey policy saved", variant: "success" })
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  function updateStep(idx: number, field: keyof CaseJourneyStep, value: boolean | number | string) {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading case journey policy...</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Case Journey Policy</CardTitle>
          <p className="text-xs text-muted-foreground">
            Configure follow-ups that trigger when an entire case (all treatments) is completed.
            These are separate from per-treatment milestones.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {steps.length > 0 ? (
            <div className="space-y-0">
              {steps.map((step, idx) => {
                const meta = CASE_MILESTONE_META[step.milestone] || CASE_MILESTONE_META.CASE_RECOVERY
                const Icon = meta.icon
                return (
                  <div key={idx} className="relative">
                    <div className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${step.enabled ? "bg-white" : "bg-gray-50 opacity-70"}`}>
                      <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step.enabled ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400"}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        {idx < steps.length - 1 && (
                          <div className="w-px h-6 bg-gray-200" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{step.label || meta.label}</p>
                            <p className="text-xs text-muted-foreground">{meta.description}</p>
                          </div>
                          <Switch checked={step.enabled} onCheckedChange={(v) => updateStep(idx, "enabled", v)} />
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <Label className="text-xs text-muted-foreground">After</Label>
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              value={step.delay_days}
                              onChange={(e) => updateStep(idx, "delay_days", Math.max(1, parseInt(e.target.value) || 1))}
                              className="h-7 w-16 text-xs text-center"
                            />
                            <Label className="text-xs text-muted-foreground">day{step.delay_days !== 1 ? "s" : ""}</Label>
                          </div>
                          <div className="flex items-center gap-3 ml-auto">
                            <div className="flex items-center gap-1.5" title="Send WhatsApp message">
                              <MessageCircle className={`h-3.5 w-3.5 ${step.send_whatsapp ? "text-green-600" : "text-gray-400"}`} />
                              <Switch
                                checked={step.send_whatsapp}
                                onCheckedChange={(v) => updateStep(idx, "send_whatsapp", v)}
                                className="scale-75"
                              />
                            </div>
                            <div className="flex items-center gap-1.5" title="Notify staff">
                              <Bell className={`h-3.5 w-3.5 ${step.send_notification ? "text-amber-600" : "text-gray-400"}`} />
                              <Switch
                                checked={step.send_notification}
                                onCheckedChange={(v) => updateStep(idx, "send_notification", v)}
                                className="scale-75"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-8 text-center border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">No case journey steps configured.</p>
            </div>
          )}

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save Case Journey Policy"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// GENERAL SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

function GeneralSettings({
  config,
  setConfig,
  addToast,
}: {
  config: Record<string, string>
  setConfig: (key: string, value: string) => void
  addToast: (t: { title: string; variant: "success" | "destructive" }) => void
}) {
  const [crmEnabled, setCrmEnabled] = useState(config.crm_enabled !== "false")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">General Settings</CardTitle>
        <p className="text-xs text-muted-foreground">Basic CRM preferences for the clinic.</p>
      </CardHeader>
      <CardContent className="space-y-6 max-w-lg">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">CRM Enabled</Label>
            <p className="text-xs text-muted-foreground">Turn CRM features on or off for this clinic</p>
          </div>
          <Switch
            checked={crmEnabled}
            onCheckedChange={(v) => {
              setCrmEnabled(v)
              setConfig("crm_enabled", String(v))
            }}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Working Days</Label>
          <p className="text-xs text-muted-foreground">Follow-ups are only scheduled on working days.</p>
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
          <Input
            type="time"
            className="h-9 w-40"
            value={config.crm_reminder_time || "09:00"}
            onChange={(e) => setConfig("crm_reminder_time", e.target.value)}
          />
        </div>
        <Button onClick={() => addToast({ title: "Settings saved", variant: "success" })}>
          <Save className="h-4 w-4 mr-1" /> Save Settings
        </Button>
      </CardContent>
    </Card>
  )
}
