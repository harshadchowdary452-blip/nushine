import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Users, Stethoscope, Settings, Save, Plus, Trash2,
  Bell, Clock, CalendarClock, Phone, ChevronDown, ChevronRight,
  CheckCircle2, CircleDot, Eye, Search, RotateCcw, CalendarDays,
  AlertTriangle,
} from "lucide-react"
import { crmSettingsApi } from "@/services/endpoints"
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

interface FollowUpConfig {
  id?: string
  enabled: boolean
  start_delay_days: number
  num_follow_ups: number
  gap_days: number
  auto_close_on_completion: boolean
}

interface TreatmentItem {
  treatment_type_id: string
  treatment_name: string
  config: FollowUpConfig
}

function defaultFollowUp(): FollowUpConfig {
  return { enabled: true, start_delay_days: 0, num_follow_ups: 3, gap_days: 2, auto_close_on_completion: false }
}

function formatTimestamp(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
}

// ═══════════════════════════════════════════════════════════════════════════
// NUMERIC INPUT — hides spinner, disables wheel, selects on focus
// ═══════════════════════════════════════════════════════════════════════════

function NumericInput({ value, onChange, min = 0, max = 999, className }: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <Input
      ref={inputRef}
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
      onFocus={(e) => e.target.select()}
      onWheel={(e) => e.currentTarget.blur()}
      className={`[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className || ""}`}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// UNSAVED CHANGES HOOK — detects dirty state across the page
// ═══════════════════════════════════════════════════════════════════════════

const UnsavedChangesContext = {
  _listeners: new Set<() => void>(),
  _hasUnsaved: false,
  get hasUnsaved() { return this._hasUnsaved },
  set hasUnsaved(val: boolean) {
    this._hasUnsaved = val
    this._listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    this._listeners.add(listener)
    return () => { this._listeners.delete(listener) }
  },
}

function useUnsavedChangesWarning(hasUnsaved: boolean) {
  useEffect(() => {
    UnsavedChangesContext.hasUnsaved = hasUnsaved
  }, [hasUnsaved])

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (UnsavedChangesContext.hasUnsaved) {
        e.preventDefault()
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE PREVIEW COMPONENT — reused across all tabs
// ═══════════════════════════════════════════════════════════════════════════

function FollowUpPreview({ config, label }: { config: FollowUpConfig; label?: string }) {
  if (!config.enabled || config.num_follow_ups === 0) {
    return (
      <div className="bg-muted/30 rounded-lg p-3 border border-dashed">
        <p className="text-xs text-muted-foreground">Follow-ups are disabled.</p>
      </div>
    )
  }

  const days: number[] = []
  for (let i = 0; i < config.num_follow_ups; i++) {
    days.push(config.start_delay_days + i * config.gap_days)
  }

  return (
    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {days.map((day, idx) => (
          <div key={idx} className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1 border text-xs">
            <CheckCircle2 className="h-3 w-3 text-primary" />
            <span className="font-medium">Day {day}</span>
          </div>
        ))}
      </div>
      {config.auto_close_on_completion && (
        <p className="text-xs text-muted-foreground italic">Stops when treatment is completed.</p>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP CONFIG FORM — reusable form for a single follow-up config
// ═══════════════════════════════════════════════════════════════════════════

function FollowUpForm({ config, onChange }: { config: FollowUpConfig; onChange: (c: FollowUpConfig) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg border">
        <div>
          <p className="text-sm font-medium">Enabled</p>
          <p className="text-xs text-muted-foreground">Turn follow-ups on or off</p>
        </div>
        <Switch checked={config.enabled} onCheckedChange={(v) => onChange({ ...config, enabled: v })} />
      </div>

      {config.enabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Delay (days)</Label>
              <NumericInput value={config.start_delay_days} min={0} max={365} onChange={(v) => onChange({ ...config, start_delay_days: v })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Number of Follow-ups</Label>
              <NumericInput value={config.num_follow_ups} min={0} max={20} onChange={(v) => onChange({ ...config, num_follow_ups: v })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gap Between (days)</Label>
              <NumericInput value={config.gap_days} min={0} max={90} onChange={(v) => onChange({ ...config, gap_days: v })} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">Auto-close on completion</p>
              <p className="text-xs text-muted-foreground">Stop follow-ups when treatment is completed</p>
            </div>
            <Switch checked={config.auto_close_on_completion} onCheckedChange={(v) => onChange({ ...config, auto_close_on_completion: v })} />
          </div>
        </>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// SAVE STATUS INDICATOR — shows last saved timestamp
// ═══════════════════════════════════════════════════════════════════════════

function SavedIndicator({ lastSaved }: { lastSaved: Date | null }) {
  if (!lastSaved) return null
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3 w-3 text-green-600" />
      <span>Last Saved: {formatTimestamp(lastSaved)}</span>
    </div>
  )
}


export default function CrmSettings() {
  const [activeTab, setActiveTab] = useState("lead")
  const [anyDirty, setAnyDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useUnsavedChangesWarning(anyDirty)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="CRM Settings"
          description="Configure follow-ups and CRM behaviour for your hospital"
        />
        {lastSaved && <div className="mt-2"><SavedIndicator lastSaved={lastSaved} /></div>}
      </div>

      {anyDirty && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>You have unsaved changes. Save before leaving this page.</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/50">
          <TabsTrigger value="general" className="text-xs gap-1.5"><Settings className="h-3.5 w-3.5" /> General</TabsTrigger>
          <TabsTrigger value="lead" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Lead</TabsTrigger>
          <TabsTrigger value="opd" className="text-xs gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> OPD</TabsTrigger>
          <TabsTrigger value="treatment" className="text-xs gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Treatment</TabsTrigger>
          <TabsTrigger value="case" className="text-xs gap-1.5"><Phone className="h-3.5 w-3.5" /> Case</TabsTrigger>
        </TabsList>

        <TabsContent value="general"><GeneralSettingsTab onDirtyChange={setAnyDirty} onSaved={() => setLastSaved(new Date())} /></TabsContent>
        <TabsContent value="lead"><FollowUpTab context="lead" title="Lead Follow-up" description="Configure follow-ups when a new lead/enquiry is created." apiGet="getLead" apiUpdate="updateLead" defaultConfig={{ ...defaultFollowUp(), start_delay_days: 1 }} onDirtyChange={setAnyDirty} onSaved={() => setLastSaved(new Date())} /></TabsContent>
        <TabsContent value="opd"><FollowUpTab context="opd" title="OPD Follow-up" description="Configure follow-ups when a patient status is set to OPD." apiGet="getOpd" apiUpdate="updateOpd" defaultConfig={defaultFollowUp()} onDirtyChange={setAnyDirty} onSaved={() => setLastSaved(new Date())} /></TabsContent>
        <TabsContent value="treatment"><TreatmentSettingsTab onDirtyChange={setAnyDirty} onSaved={() => setLastSaved(new Date())} /></TabsContent>
        <TabsContent value="case"><CaseSettingsTab onDirtyChange={setAnyDirty} onSaved={() => setLastSaved(new Date())} /></TabsContent>
      </Tabs>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// GENERAL SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════

const WORKING_DAY_OPTIONS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

function GeneralSettingsTab({ onDirtyChange, onSaved }: { onDirtyChange: (d: boolean) => void; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ["crm-config-general"],
    queryFn: () => crmSettingsApi.crmConfig.getGeneral(),
  })

  const [crmEnabled, setCrmEnabled] = useState(true)
  const [workingDays, setWorkingDays] = useState<string[]>(["MON", "TUE", "WED", "THU", "FRI", "SAT"])
  const [businessStart, setBusinessStart] = useState("09:00")
  const [businessEnd, setBusinessEnd] = useState("18:00")
  const [reminderTime, setReminderTime] = useState("09:00")
  const [reminderOffset, setReminderOffset] = useState("1")
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [weekendPolicy, setWeekendPolicy] = useState("SKIP")
  const [holidays, setHolidays] = useState<string[]>([])
  const [newHoliday, setNewHoliday] = useState("")
  const [initialized, setInitialized] = useState(false)
  const savedRef = useRef("")

  function currentSnapshot() {
    return JSON.stringify({ crmEnabled, workingDays, businessStart, businessEnd, reminderTime, reminderOffset, timezone, weekendPolicy, holidays })
  }

  useEffect(() => {
    if (data && !initialized) {
      setCrmEnabled(data.crm_enabled !== "false")
      setWorkingDays(data.crm_working_days ? data.crm_working_days.split(",") : ["MON", "TUE", "WED", "THU", "FRI", "SAT"])
      setBusinessStart(data.crm_business_start || "09:00")
      setBusinessEnd(data.crm_business_end || "18:00")
      setReminderTime(data.crm_reminder_time || "09:00")
      setReminderOffset(data.crm_reminder_offset || "1")
      setTimezone(data.crm_timezone || "Asia/Kolkata")
      setWeekendPolicy(data.crm_weekend_policy || "SKIP")
      try {
        const parsed = JSON.parse(data.crm_holidays)
        setHolidays(Array.isArray(parsed) ? parsed : [])
      } catch {
        setHolidays([])
      }
      setInitialized(true)
    }
  }, [data, initialized])

  useEffect(() => {
    if (initialized) savedRef.current = currentSnapshot()
  }, [initialized])

  const isDirty = initialized && savedRef.current !== currentSnapshot()

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty])

  const saveMutation = useMutation({
    mutationFn: () => crmSettingsApi.crmConfig.updateGeneral({
      crm_enabled: String(crmEnabled),
      crm_working_days: workingDays.join(","),
      crm_business_start: businessStart,
      crm_business_end: businessEnd,
      crm_reminder_time: reminderTime,
      crm_reminder_offset: reminderOffset,
      crm_timezone: timezone,
      crm_weekend_policy: weekendPolicy,
      crm_holidays: JSON.stringify(holidays),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-config-general"] })
      addToast({ title: "Settings saved successfully.", variant: "success" })
      savedRef.current = currentSnapshot()
      onDirtyChange(false)
      onSaved()
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  function toggleDay(day: string) {
    setWorkingDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => WORKING_DAY_OPTIONS.indexOf(a) - WORKING_DAY_OPTIONS.indexOf(b)))
  }

  function addHoliday() {
    if (newHoliday && !holidays.includes(newHoliday)) {
      setHolidays((prev) => [...prev, newHoliday].sort())
      setNewHoliday("")
    }
  }

  function removeHoliday(h: string) {
    setHolidays((prev) => prev.filter((x) => x !== h))
  }

  function resetGeneral() {
    if (data) {
      setCrmEnabled(data.crm_enabled !== "false")
      setWorkingDays(data.crm_working_days ? data.crm_working_days.split(",") : ["MON", "TUE", "WED", "THU", "FRI", "SAT"])
      setBusinessStart(data.crm_business_start || "09:00")
      setBusinessEnd(data.crm_business_end || "18:00")
      setReminderTime(data.crm_reminder_time || "09:00")
      setReminderOffset(data.crm_reminder_offset || "1")
      setTimezone(data.crm_timezone || "Asia/Kolkata")
      setWeekendPolicy(data.crm_weekend_policy || "SKIP")
      try {
        const parsed = JSON.parse(data.crm_holidays)
        setHolidays(Array.isArray(parsed) ? parsed : [])
      } catch {
        setHolidays([])
      }
    }
  }

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading settings...</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General CRM Settings</CardTitle>
          <p className="text-xs text-muted-foreground">Core CRM behaviour used by the follow-up engine.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">CRM Enabled</p>
              <p className="text-xs text-muted-foreground">Turn CRM follow-ups on or off for this hospital</p>
            </div>
            <Switch checked={crmEnabled} onCheckedChange={setCrmEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Working Days</Label>
            <div className="flex flex-wrap gap-2">
              {WORKING_DAY_OPTIONS.map((day) => (
                <Button
                  key={day}
                  variant={workingDays.includes(day) ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => toggleDay(day)}
                >
                  {day}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Business Hours Start</Label>
              <Input type="time" value={businessStart} onChange={(e) => setBusinessStart(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Business Hours End</Label>
              <Input type="time" value={businessEnd} onChange={(e) => setBusinessEnd(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reminder Time</Label>
              <Input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reminder Offset (days before)</Label>
              <NumericInput value={parseInt(reminderOffset) || 1} min={0} max={30} onChange={(v) => setReminderOffset(String(v))} className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Timezone</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Weekend Policy</Label>
            <div className="flex gap-2">
              {["SKIP", "INCLUDE"].map((p) => (
                <Button key={p} variant={weekendPolicy === p ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setWeekendPolicy(p)}>
                  {p === "SKIP" ? "Skip Weekends" : "Include Weekends"}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Holiday Calendar</Label>
            <p className="text-xs text-muted-foreground">Add dates when the clinic is closed. Follow-ups will skip these days.</p>
            <div className="flex gap-2">
              <Input
                type="date"
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <Button variant="outline" size="sm" className="h-8" onClick={addHoliday} disabled={!newHoliday}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {holidays.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {holidays.map((h) => (
                  <span key={h} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                    {h}
                    <button onClick={() => removeHoliday(h)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isDirty} className="flex-1">
              {saveMutation.isPending ? (
                <><span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-1" /> Save General Settings</>
              )}
            </Button>
            <Button variant="outline" onClick={resetGeneral} disabled={!isDirty}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// GENERIC FOLLOW-UP TAB — used for Lead and OPD
// ═══════════════════════════════════════════════════════════════════════════

function FollowUpTab({ context, title, description, apiGet, apiUpdate, defaultConfig, onDirtyChange, onSaved }: {
  context: string
  title: string
  description: string
  apiGet: "getLead" | "getOpd"
  apiUpdate: "updateLead" | "updateOpd"
  defaultConfig: FollowUpConfig
  onDirtyChange: (d: boolean) => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: [`crm-${context}-config`],
    queryFn: () => crmSettingsApi.crmConfig[apiGet](),
  })

  const raw = data?.config
  const [config, setConfig] = useState<FollowUpConfig>(defaultConfig)
  const [initialized, setInitialized] = useState(false)
  const savedRef = useRef("")

  useEffect(() => {
    if (raw && !initialized) {
      setConfig({
        enabled: raw.enabled ?? true,
        start_delay_days: raw.start_delay_days ?? 0,
        num_follow_ups: raw.num_follow_ups ?? 3,
        gap_days: raw.gap_days ?? 2,
        auto_close_on_completion: raw.auto_close_on_completion ?? false,
      })
      setInitialized(true)
    }
  }, [raw, initialized])

  useEffect(() => {
    if (initialized) savedRef.current = JSON.stringify(config)
  }, [initialized])

  const isDirty = initialized && savedRef.current !== JSON.stringify(config)

  useEffect(() => { onDirtyChange(isDirty) }, [isDirty])

  const saveMutation = useMutation({
    mutationFn: () => crmSettingsApi.crmConfig[apiUpdate](config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`crm-${context}-config`] })
      addToast({ title: "Settings saved successfully.", variant: "success" })
      savedRef.current = JSON.stringify(config)
      onDirtyChange(false)
      onSaved()
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  function resetConfig() {
    if (raw) {
      setConfig({
        enabled: raw.enabled ?? true,
        start_delay_days: raw.start_delay_days ?? 0,
        num_follow_ups: raw.num_follow_ups ?? 3,
        gap_days: raw.gap_days ?? 2,
        auto_close_on_completion: raw.auto_close_on_completion ?? false,
      })
    }
  }

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading {context} settings...</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FollowUpForm config={config} onChange={setConfig} />
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Preview</p>
            <FollowUpPreview config={config} label={`Follow-up schedule for ${context.toUpperCase()}`} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isDirty} className="flex-1">
              {saveMutation.isPending ? (
                <><span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-1" /> Save {title}</>
              )}
            </Button>
            <Button variant="outline" onClick={resetConfig} disabled={!isDirty}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT SETTINGS TAB — auto-loads all treatment types
// ═══════════════════════════════════════════════════════════════════════════

function TreatmentSettingsTab({ onDirtyChange, onSaved }: { onDirtyChange: (d: boolean) => void; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["crm-config-treatment"],
    queryFn: () => crmSettingsApi.crmConfig.getTreatment(),
  })

  const allItems: TreatmentItem[] = data?.items || []
  const items = search
    ? allItems.filter((i) => i.treatment_name.toLowerCase().includes(search.toLowerCase()))
    : allItems

  const debouncedConfigs = useRef<Map<string, FollowUpConfig>>(new Map())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [dirtyCount, setDirtyCount] = useState(0)

  useEffect(() => { onDirtyChange(dirtyCount > 0) }, [dirtyCount])

  const saveMutation = useMutation({
    mutationFn: (item: TreatmentItem) =>
      crmSettingsApi.crmConfig.updateTreatment(item.treatment_type_id, item.config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-config-treatment"] })
      addToast({ title: "Settings saved successfully.", variant: "success" })
      setDirtyCount(0)
      onSaved()
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  const updateItemConfig = useCallback((treatmentTypeId: string, newConfig: FollowUpConfig) => {
    debouncedConfigs.current.set(treatmentTypeId, newConfig)
    const existing = timers.current.get(treatmentTypeId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      const cfg = debouncedConfigs.current.get(treatmentTypeId)
      if (cfg) {
        const item = allItems.find((i) => i.treatment_type_id === treatmentTypeId)
        if (item) {
          saveMutation.mutate({ ...item, config: cfg })
        }
      }
    }, 600)
    timers.current.set(treatmentTypeId, timer)
  }, [allItems, saveMutation])

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading treatment settings...</CardContent></Card>
  }

  if (allItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground mb-2">No treatment types found.</p>
          <p className="text-xs text-muted-foreground">Add treatment types in Clinical Settings first.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Treatment Follow-up Settings</CardTitle>
          <p className="text-xs text-muted-foreground">Configure follow-ups per treatment type. Changes save automatically after a short delay.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {allItems.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search treatment types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>
          )}
          {items.length === 0 && search && (
            <p className="text-xs text-muted-foreground text-center py-4">No treatment types match "{search}"</p>
          )}
          {items.map((item) => {
            const isExpanded = expandedId === item.treatment_type_id
            const cfg = item.config
            return (
              <div key={item.treatment_type_id} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : item.treatment_type_id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-medium">{item.treatment_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {cfg.enabled ? "Enabled" : "Disabled"}
                    </span>
                    {cfg.enabled && (
                      <span className="text-xs text-muted-foreground">
                        {cfg.num_follow_ups} follow-ups, {cfg.gap_days}d gap
                      </span>
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="p-4 border-t bg-muted/20 space-y-4">
                    <FollowUpForm config={cfg} onChange={(newCfg) => updateItemConfig(item.treatment_type_id, newCfg)} />
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Preview</p>
                      <FollowUpPreview config={cfg} label={`Follow-up schedule for ${item.treatment_name}`} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// CASE SETTINGS TAB — Recovery + Recall
// ═══════════════════════════════════════════════════════════════════════════

function CaseSettingsTab({ onDirtyChange, onSaved }: { onDirtyChange: (d: boolean) => void; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ["crm-config-case"],
    queryFn: () => crmSettingsApi.crmConfig.getCase(),
  })

  const [recovery, setRecovery] = useState<FollowUpConfig>({ enabled: true, start_delay_days: 3, num_follow_ups: 2, gap_days: 3, auto_close_on_completion: false })
  const [recall, setRecall] = useState<FollowUpConfig>({ enabled: true, start_delay_days: 180, num_follow_ups: 1, gap_days: 0, auto_close_on_completion: false })
  const [initialized, setInitialized] = useState(false)
  const recoveryRef = useRef("")
  const recallRef = useRef("")

  useEffect(() => {
    if (data && !initialized) {
      if (data.recovery) setRecovery({ ...recovery, ...data.recovery })
      if (data.recall) setRecall({ ...recall, ...data.recall })
      setInitialized(true)
    }
  }, [data, initialized])

  useEffect(() => {
    if (initialized) {
      recoveryRef.current = JSON.stringify(recovery)
      recallRef.current = JSON.stringify(recall)
    }
  }, [initialized])

  const isRecoveryDirty = initialized && recoveryRef.current !== JSON.stringify(recovery)
  const isRecallDirty = initialized && recallRef.current !== JSON.stringify(recall)
  const anyCaseDirty = isRecoveryDirty || isRecallDirty

  useEffect(() => { onDirtyChange(anyCaseDirty) }, [anyCaseDirty])

  const saveRecoveryMutation = useMutation({
    mutationFn: () => crmSettingsApi.crmConfig.updateCase("recovery", recovery),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-config-case"] })
      addToast({ title: "Settings saved successfully.", variant: "success" })
      recoveryRef.current = JSON.stringify(recovery)
      onDirtyChange(false)
      onSaved()
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  const saveRecallMutation = useMutation({
    mutationFn: () => crmSettingsApi.crmConfig.updateCase("recall", recall),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-config-case"] })
      addToast({ title: "Settings saved successfully.", variant: "success" })
      recallRef.current = JSON.stringify(recall)
      onDirtyChange(false)
      onSaved()
    },
    onError: (err: ApiError) => addToast({ title: "Error", description: extractDetail(err), variant: "destructive" }),
  })

  function resetRecovery() {
    if (data?.recovery) setRecovery({ ...recovery, ...data.recovery })
  }

  function resetRecall() {
    if (data?.recall) setRecall({ ...recall, ...data.recall })
  }

  if (isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading case settings...</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Case Recovery Follow-up</CardTitle>
          <p className="text-xs text-muted-foreground">Configure follow-ups after a case/treatment is completed.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FollowUpForm config={recovery} onChange={setRecovery} />
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Preview</p>
            <FollowUpPreview config={recovery} label="Recovery follow-up schedule" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveRecoveryMutation.mutate()} disabled={saveRecoveryMutation.isPending || !isRecoveryDirty} className="flex-1">
              {saveRecoveryMutation.isPending ? (
                <><span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-1" /> Save Recovery Settings</>
              )}
            </Button>
            <Button variant="outline" onClick={resetRecovery} disabled={!isRecoveryDirty}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Case Recall Follow-up</CardTitle>
          <p className="text-xs text-muted-foreground">Configure periodic recall follow-ups to bring patients back.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FollowUpForm config={recall} onChange={setRecall} />
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Preview</p>
            <FollowUpPreview config={recall} label="Recall follow-up schedule" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveRecallMutation.mutate()} disabled={saveRecallMutation.isPending || !isRecallDirty} className="flex-1">
              {saveRecallMutation.isPending ? (
                <><span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-1" /> Save Recall Settings</>
              )}
            </Button>
            <Button variant="outline" onClick={resetRecall} disabled={!isRecallDirty}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
