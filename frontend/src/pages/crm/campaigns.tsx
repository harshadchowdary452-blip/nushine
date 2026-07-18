import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Megaphone, Plus, Loader2, Rocket, Trash2, Send, Eye, MessageCircle, Mail, MessageSquare,
  Target, Users, CheckCircle, AlertCircle, Copy, Archive, RotateCcw, BarChart3,
  Clock, TrendingUp, Activity,
  Gift, Sparkles, Droplets, Crown, Smile, Stethoscope, FileText,
} from "lucide-react"
import { campaignsApi, campaignTemplatesApi, whatsappTemplatesApi } from "@/services/endpoints"
import { extractDetail } from "@/types"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Campaign {
  id: string
  name?: string
  status?: string
  is_active?: boolean
  created_at?: string
  channel?: string
  target?: string
  patients_targeted?: number
  messages_sent?: number
  messages_failed?: number
  messages_delivered?: number
}

interface CampaignRecipient {
  id: string
  status?: string
  patient_name?: string
  recipient_name?: string
  patient_id?: string
  phone?: string
  error_message?: string
}

interface CampaignTemplateItem {
  id: string
  name?: string
  message?: string
}

interface CampaignFilters {
  gender?: string
  doctor_id?: string
  age_min?: number
  age_max?: number
}

interface CampaignProgress {
  sent?: number
  failed?: number
  delivered?: number
  pending?: number
  total_recipients?: number
}

interface CampaignAnalyticsData {
  overview?: Record<string, number>
  top_campaigns?: Array<{ id?: string; name?: string; sent?: number; messages_sent?: number; delivered?: number; messages_delivered?: number; revenue?: number; revenue_generated?: number }>
  roi_data?: Array<{ campaign_name?: string; campaign_cost?: number; revenue_generated?: number; roi_percentage?: number; patients_converted?: number }>
  conversion_funnel?: Record<string, number>
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }

const statusBadge: Record<string, string> = {
  DRAFT: "bg-gray-50 text-gray-600",
  ACTIVE: "bg-green-50 text-green-700",
  COMPLETED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-red-50 text-red-600",
}

const channelIcon: Record<string, React.ElementType> = {
  WHATSAPP: MessageCircle, SMS: MessageSquare, EMAIL: Mail,
}

const targetLabels: Record<string, string> = {
  ALL: "All Patients", ACTIVE: "Active Patients",
  COMPLETED_TREATMENT: "Treatment Completed", FOLLOW_UP: "In Follow-Up",
  NOT_VISITED_6M: "Not Visited 6M", NOT_VISITED_1Y: "Not Visited 1Y",
  LEAD: "Leads",
}

const targetOptions = [
  { value: "ALL", label: "All Patients" },
  { value: "ACTIVE", label: "Active Patients" },
  { value: "COMPLETED_TREATMENT", label: "Treatment Completed" },
  { value: "FOLLOW_UP", label: "In Follow-Up" },
  { value: "NOT_VISITED_6M", label: "Not Visited 6 Months" },
  { value: "NOT_VISITED_1Y", label: "Not Visited 1 Year" },
  { value: "LEAD", label: "Leads" },
]

const quickCampaigns = [
  { label: "Festival Wishes", type: "FESTIVAL_GREETING", icon: Gift, color: "bg-pink-50 text-pink-600" },
  { label: "Dental Check-up", type: "RECALL", icon: Stethoscope, color: "bg-blue-50 text-blue-600" },
  { label: "Teeth Cleaning", type: "PROMOTIONAL", icon: Droplets, color: "bg-cyan-50 text-cyan-600" },
  { label: "Dental Implants", type: "PROMOTIONAL", icon: Crown, color: "bg-purple-50 text-purple-600" },
  { label: "Teeth Whitening", type: "PROMOTIONAL", icon: Sparkles, color: "bg-amber-50 text-amber-600" },
  { label: "Braces Awareness", type: "DENTAL_AWARENESS", icon: Smile, color: "bg-indigo-50 text-indigo-600" },
  { label: "Free Consultation", type: "PROMOTIONAL", icon: Stethoscope, color: "bg-green-50 text-green-600" },
  { label: "Custom", type: "CUSTOM", icon: FileText, color: "bg-gray-50 text-gray-600" },
]

export default function Campaigns() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [tab, setTab] = useState("all")
  const [wizardOpen, setWizardOpen] = useState(false)
  const [quickType, setQuickType] = useState<string | null>(null)
  const [viewRecipients, setViewRecipients] = useState<string | null>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)


  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns", tab],
    queryFn: () => campaignsApi.list({ status: tab === "all" ? undefined : tab }),
    refetchInterval: tab === "all" ? 15000 : undefined,
  })
  const { data: analytics } = useQuery({
    queryKey: ["campaigns", "analytics", "overview"],
    queryFn: () => campaignsApi.analytics.overview(),
    refetchInterval: 30000,
  })
  const { data: detailedAnalytics } = useQuery({
    queryKey: ["campaigns", "analytics", "detailed"],
    queryFn: () => campaignsApi.analytics.detailed(),
    enabled: showAnalytics,
  })
  const items: Campaign[] = Array.isArray(campaigns) ? campaigns : []

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); addToast({ title: "Deleted", variant: "success" }) },
    onError: (err: unknown) => addToast({ title: "Error", description: extractDetail(err) || "Failed to delete", variant: "destructive" }),
  })
  const archiveMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.update(id, { is_active: false }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); addToast({ title: "Archived", variant: "success" }) },
  })
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.duplicate(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); addToast({ title: "Duplicated", variant: "success" }) },
  })
  const resendMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.resend(id),
    onSuccess: (data: { sent_count?: number; recipients_count?: number }) => { addToast({ title: "Sent", description: `Sent to ${data.sent_count || data.recipients_count} recipients`, variant: "success" }) },
  })
  const launchMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.launch(id),
    onSuccess: (data: { recipients_count?: number }) => { addToast({ title: "Launched", description: `Sending to ${data.recipients_count} recipients`, variant: "success" }) },
    onError: (err: unknown) => addToast({ title: "Error", description: extractDetail(err) || "Failed to launch", variant: "destructive" }),
  })

  const handleQuickCampaign = (type: string) => {
    if (type === "CUSTOM") { setWizardOpen(true); return }
    setQuickType(type)
    setWizardOpen(true)
  }

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader
        title={showAnalytics ? "Campaign Analytics" : "Marketing Campaigns"}
        description={showAnalytics ? "Performance metrics and insights" : "Send bulk messages, track delivery, and analyze campaign performance"}
      >
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowAnalytics(!showAnalytics)}>
            <BarChart3 className="h-4 w-4" /> {showAnalytics ? "Campaigns" : "Analytics"}
          </Button>
          <Button className="gap-2" onClick={() => { setQuickType(null); setWizardOpen(true) }}>
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
        </div>
      </PageHeader>

      {!showAnalytics && (
        <>
          {analytics && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              <KpiCard title="Active" value={analytics.active_campaigns ?? 0} color="blue" icon={Activity} />
              <KpiCard title="Sent Today" value={analytics.total_delivered ?? 0} color="green" icon={Send} />
              <KpiCard title="Delivery Rate" value={`${analytics.delivery_rate ?? 0}%`} color="cyan" icon={CheckCircle} />
              <KpiCard title="Failed" value={(analytics.total_campaigns ?? 0) > 0 ? ((analytics.total_campaigns ?? 0) - (analytics.total_delivered ?? 0)) : 0} color="red" icon={AlertCircle} />
              <KpiCard title="Replies" value={analytics.total_responses ?? 0} color="amber" icon={MessageCircle} />
              <KpiCard title="Revenue" value={formatIndianRupees(analytics.total_revenue ?? 0)} color="purple" icon={TrendingUp} />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickCampaigns.map((qc) => (
              <button key={qc.label} onClick={() => handleQuickCampaign(qc.type)}
                className={cn("flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5", qc.color)}>
                <qc.icon className="h-6 w-6 shrink-0" />
                <span className="text-sm font-medium">{qc.label}</span>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Campaign History</CardTitle>
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className="h-8">
                    <TabsTrigger value="all" className="text-xs px-2.5">All</TabsTrigger>
                    <TabsTrigger value="ACTIVE" className="text-xs px-2.5">Active</TabsTrigger>
                    <TabsTrigger value="COMPLETED" className="text-xs px-2.5">Completed</TabsTrigger>
                    <TabsTrigger value="DRAFT" className="text-xs px-2.5">Drafts</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <Send className="mx-auto h-8 w-8 mb-2 opacity-40" />
                  <p>No campaigns yet. Click "New Campaign" or use a quick campaign button above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((c: Campaign) => (
                    <CampaignRow
                      key={c.id}
                      campaign={c}
                      onDelete={() => deleteMutation.mutate(c.id)}
                      onArchive={() => archiveMutation.mutate(c.id)}
                      onDuplicate={() => duplicateMutation.mutate(c.id)}
                      onResend={() => resendMutation.mutate(c.id)}
                      onLaunch={() => launchMutation.mutate(c.id)}
                      onViewRecipients={() => setViewRecipients(c.id)}
                      launchPending={launchMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {showAnalytics && detailedAnalytics && (
        <AnalyticsSection data={detailedAnalytics} />
      )}

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <CampaignWizard
            quickType={quickType}
            onDone={() => { setWizardOpen(false); queryClient.invalidateQueries({ queryKey: ["campaigns"] }) }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewRecipients} onOpenChange={(o) => { if (!o) setViewRecipients(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Recipients</DialogTitle></DialogHeader>
          {viewRecipients && <RecipientsList campaignId={viewRecipients} />}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function KpiCard({ title, value, color, icon: Icon }: { title: string; value: string | number; color: string; icon: React.ElementType }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600",
    cyan: "bg-cyan-50 text-cyan-600", red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600", purple: "bg-purple-50 text-purple-600",
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg shrink-0", colors[color])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold truncate">{value}</p>
            <p className="text-xs text-gray-500 truncate">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface CampaignRowProps {
  campaign: Campaign
  onDelete: () => void
  onArchive: () => void
  onDuplicate: () => void
  onResend: () => void
  onLaunch: () => void
  onViewRecipients: () => void
  launchPending: boolean
}

function CampaignRow({ campaign: c, onDelete, onArchive, onDuplicate, onResend, onLaunch, onViewRecipients, launchPending }: CampaignRowProps) {
  const [liveProgress, setLiveProgress] = useState<CampaignProgress | null>(null)
  const ChannelIcon = channelIcon[c.channel] || MessageCircle
  const total = c.patients_targeted || 1
  const sent = c.messages_sent || 0
  const failed = c.messages_failed || 0
  const pct = Math.min(((sent + failed) / total) * 100, 100)

  useEffect(() => {
    if (c.status !== "ACTIVE") { setLiveProgress(null); return }
    const id = setInterval(async () => {
      try {
        const p = await campaignsApi.progress(c.id)
        setLiveProgress(p)
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(id)
  }, [c.id, c.status])

  const p = liveProgress
  const displaySent = p?.sent ?? sent
  const displayFailed = p?.failed ?? failed
  const displayDelivered = p?.delivered ?? c.messages_delivered ?? 0
  const displayPending = p?.pending ?? Math.max(0, total - displaySent - displayFailed)
  const displayTotal = p?.total_recipients ?? total

  return (
    <div className="rounded-lg border p-4 transition-colors hover:bg-gray-50">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <ChannelIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{c.name}</span>
            <Badge className={`text-xs ${statusBadge[c.status] || ""}`}>{c.status}</Badge>
            {c.is_active === false && <Badge className="text-xs bg-gray-50 text-gray-500">Archived</Badge>}
            <span className="text-xs text-gray-400 ml-auto">{c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Target className="h-3 w-3" />{targetLabels[c.target] || c.target}</span>
            <span className="flex items-center gap-1"><Send className="h-3 w-3" />{displaySent} sent</span>
            <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" />{displayDelivered} delivered</span>
            {displayFailed > 0 && <span className="flex items-center gap-1 text-red-500"><AlertCircle className="h-3 w-3" />{displayFailed} failed</span>}
            {displayPending > 0 && <span className="flex items-center gap-1 text-gray-400"><Clock className="h-3 w-3" />{displayPending} pending</span>}
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{displayTotal} targeted</span>
          </div>
          {c.status === "ACTIVE" && (
            <div className="mt-2 space-y-1">
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                Sending — {displaySent + displayFailed} / {displayTotal} processed
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="text-gray-500" title="View Recipients" onClick={onViewRecipients}>
            <Eye className="h-4 w-4" />
          </Button>
          {c.status === "DRAFT" && (
            <Button variant="ghost" size="icon-sm" className="text-green-600" title="Launch" onClick={onLaunch} disabled={launchPending}>
              {launchPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            </Button>
          )}
          {c.status === "COMPLETED" && (
            <Button variant="ghost" size="icon-sm" className="text-blue-600" title="Resend" onClick={onResend}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="text-gray-500" title="Duplicate" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
          </Button>
          {c.is_active !== false && (
            <Button variant="ghost" size="icon-sm" className="text-gray-500" title="Archive" onClick={onArchive}>
              <Archive className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="text-red-600" title="Delete" onClick={() => { if (confirm("Delete this campaign?")) onDelete() }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function RecipientsList({ campaignId }: { campaignId: string }) {
  const { data: recipients, isLoading } = useQuery({
    queryKey: ["campaigns", campaignId, "recipients"],
    queryFn: () => campaignsApi.recipients(campaignId),
    refetchInterval: 5000,
  })
  const items: CampaignRecipient[] = Array.isArray(recipients) ? recipients : []
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (items.length === 0) return <div className="py-8 text-center text-gray-400">No recipients yet</div>
  const grouped: Record<string, CampaignRecipient[]> = {}
  items.forEach((r: CampaignRecipient) => { const s = r.status || "UNKNOWN"; if (!grouped[s]) grouped[s] = []; grouped[s].push(r) })
  const statusOrder = ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "REPLIED"]
  return (
    <div className="space-y-4 max-h-80 overflow-y-auto">
      {statusOrder.map((s) => {
        const g = grouped[s]
        if (!g?.length) return null
        return (
          <div key={s}>
            <p className="text-xs font-medium text-gray-500 mb-1">{s} ({g.length})</p>
            <div className="space-y-1">
              {g.map((r: CampaignRecipient) => (
                <div key={r.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span className="font-medium truncate">{r.patient_name || r.recipient_name || `#${(r.patient_id || r.id).slice(-6)}`}</span>
                  {r.phone && <span className="text-xs text-gray-400 ml-2">{r.phone}</span>}
                  {r.error_message && <span className="text-xs text-red-500 ml-2">{r.error_message}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CampaignWizard({ quickType, onDone }: { quickType: string | null; onDone: () => void }) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [campaignType, setCampaignType] = useState(quickType || "PROMOTIONAL")
  const [channel, setChannel] = useState("WHATSAPP")
  const [target, setTarget] = useState("ALL")
  const [message, setMessage] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [filters, setFilters] = useState<CampaignFilters>({})
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [newTplName, setNewTplName] = useState("")
  const [newTplMsg, setNewTplMsg] = useState("")
  const [templateSource, setTemplateSource] = useState("campaign")

  const { data: campaignTemplates } = useQuery({
    queryKey: ["campaign-templates"],
    queryFn: () => campaignTemplatesApi.list(),
  })
  const ctItems: CampaignTemplateItem[] = Array.isArray(campaignTemplates) ? campaignTemplates : []

  const { data: waTemplates } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => whatsappTemplatesApi.list(),
  })
  const waTmplItems: CampaignTemplateItem[] = Array.isArray(waTemplates) ? waTemplates : (waTemplates as { data?: CampaignTemplateItem[]; items?: CampaignTemplateItem[] })?.data || (waTemplates as { data?: CampaignTemplateItem[]; items?: CampaignTemplateItem[] })?.items || []

  const saveTemplateMutation = useMutation({
    mutationFn: (data: { name: string; channel: string; category: string; message: string }) =>
      campaignTemplatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-templates"] })
      addToast({ title: "Template saved", variant: "success" })
      setTemplateDialogOpen(false)
      setNewTplName(""); setNewTplMsg("")
    },
  })

  const templates = templateSource === "whatsapp" ? waTmplItems : ctItems

  useEffect(() => {
    if (quickType && !name) {
      const quick = quickCampaigns.find((q) => q.type === quickType)
      if (quick) setName(quick.label)
      setCampaignType(quickType)
    }
  }, [quickType, name])

  const previewAudience = async () => {
    setPreviewLoading(true)
    try {
      const result = await campaignsApi.previewAudience({ target, filters: Object.keys(filters).length ? filters : undefined })
      setPreviewCount(result.total_count ?? result.count ?? result.total ?? 0)
    } catch { setPreviewCount(0) }
    setPreviewLoading(false)
  }

  const handleCreate = async () => {
    if (!name || !message) return
    setSending(true)
    try {
      await campaignsApi.create({ name, description, campaign_type: campaignType, channel, target, message })
      addToast({ title: "Created", description: "Campaign created. Launch it from the list.", variant: "success" })
      onDone()
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
    } catch (err: unknown) {
      addToast({ title: "Error", description: extractDetail(err) || "Failed to create", variant: "destructive" })
    }
    setSending(false)
  }

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle>
          {step === 1 && "Campaign Info"}
          {step === 2 && "Target Audience"}
          {step === 3 && "Choose Message"}
          {step === 4 && "Review & Launch"}
        </DialogTitle>
      </DialogHeader>

      <div className="flex gap-1">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={cn("flex-1 h-1.5 rounded-full transition-colors", s <= step ? "bg-blue-500" : "bg-gray-200")} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Campaign Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Checkup Drive" />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this campaign" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Campaign Type</Label>
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROMOTIONAL">Promotional</SelectItem>
                  <SelectItem value="RECALL">Recall</SelectItem>
                  <SelectItem value="TREATMENT_FOLLOW_UP">Treatment Follow-Up</SelectItem>
                  <SelectItem value="FESTIVAL_GREETING">Festival Greeting</SelectItem>
                  <SelectItem value="DENTAL_AWARENESS">Dental Awareness</SelectItem>
                  <SelectItem value="APPOINTMENT_REMINDER">Appointment Reminder</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(2)} disabled={!name}>Next →</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Target Audience</Label>
            <Select value={target} onValueChange={(v) => { setTarget(v); setPreviewCount(null) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {targetOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Gender</Label>
              <Select value={filters.gender || ""} onValueChange={(v) => setFilters((f: CampaignFilters) => ({ ...f, gender: v || undefined }))}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Doctor</Label>
              <Input value={filters.doctor_id || ""} onChange={(e) => setFilters((f: CampaignFilters) => ({ ...f, doctor_id: e.target.value || undefined }))} placeholder="Doctor ID" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min Age</Label>
              <Input type="number" value={filters.age_min || ""} onChange={(e) => setFilters((f: CampaignFilters) => ({ ...f, age_min: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Age</Label>
              <Input type="number" value={filters.age_max || ""} onChange={(e) => setFilters((f: CampaignFilters) => ({ ...f, age_max: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1" onClick={previewAudience} disabled={previewLoading}>
            {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
            Preview Count
          </Button>
          {previewCount !== null && (
            <p className="text-sm text-gray-600">
              Total recipients: <strong>{previewCount}</strong>
            </p>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
            <Button onClick={() => setStep(3)}>Next →</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Template Source:</Label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button className={cn("px-3 py-1 text-xs rounded-md transition-colors", templateSource === "campaign" ? "bg-white shadow-sm font-medium" : "text-gray-500")}
                onClick={() => setTemplateSource("campaign")}>Campaign Templates</button>
              <button className={cn("px-3 py-1 text-xs rounded-md transition-colors", templateSource === "whatsapp" ? "bg-white shadow-sm font-medium" : "text-gray-500")}
                onClick={() => setTemplateSource("whatsapp")}>WhatsApp Templates</button>
            </div>
            <Button variant="outline" size="sm" className="ml-auto text-xs gap-1" onClick={() => {
              setNewTplName(""); setNewTplMsg(""); setTemplateDialogOpen(true)
            }}><Plus className="h-3 w-3" /> New</Button>
          </div>
          {templates.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                {templates.map((t: CampaignTemplateItem) => (
                <button key={t.id} type="button" onClick={() => { setSelectedTemplate(t.id); setMessage(t.message) }}
                  className={cn("w-full text-left px-3 py-2 rounded-md text-sm transition-colors", selectedTemplate === t.id ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50")}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {templates.length === 0 && <p className="text-xs text-gray-400">No templates available. Type a custom message below.</p>}
          <div className="space-y-2">
            <Label>Custom Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
              placeholder='Hello {{patient_name}}, this is a message from {{hospital_name}}.' />
            <p className="text-xs text-gray-400">
              Variables: {'{{patient_name}}'} {'{{doctor_name}}'} {'{{hospital_name}}'} {'{{appointment_date}}'} {'{{treatment_name}}'}
            </p>
          </div>
          {message && (
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Preview:</p>
              <p className="text-sm text-gray-700">{message.replace(/\{\{(\w+)\}\}/g, (_, v) => `[${v}]`)}</p>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
            <Button onClick={() => setStep(4)} disabled={!message}>Next →</Button>
          </div>
        </div>
      )}

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Template Name</Label>
              <Input value={newTplName} onChange={(e) => setNewTplName(e.target.value)} placeholder="e.g. Summer Promo" />
            </div>
            <div className="space-y-1">
              <Label>Message</Label>
              <Textarea value={newTplMsg} onChange={(e) => setNewTplMsg(e.target.value)} rows={4}
                placeholder='Hello {{patient_name}}...' />
            </div>
            <Button className="w-full gap-2" onClick={() => saveTemplateMutation.mutate({ name: newTplName, channel, category: campaignType, message: newTplMsg })}
              disabled={!newTplName || !newTplMsg || saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Name:</span> <span className="font-medium">{name}</span></div>
              <div><span className="text-gray-500">Type:</span> <span className="font-medium">{campaignType}</span></div>
              <div><span className="text-gray-500">Channel:</span> <span className="font-medium">{channel}</span></div>
              <div><span className="text-gray-500">Target:</span> <span className="font-medium">{targetLabels[target] || target}</span></div>
              <div><span className="text-gray-500">Recipients:</span> <span className="font-medium">{previewCount ?? "—"}</span></div>
            </div>
            <div className="border-t pt-2">
              <p className="text-xs text-gray-500 mb-1">Message:</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{message}</p>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
            <Button className="gap-2" onClick={handleCreate} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Rocket className="h-4 w-4" /> Create Campaign
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function AnalyticsSection({ data }: { data: CampaignAnalyticsData }) {
  const overview = data?.overview || {}
  const topCampaigns = data?.top_campaigns || []
  const roiData = data?.roi_data || []

  const funnel = data?.conversion_funnel || {}

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard title="Total Campaigns" value={overview.total_campaigns ?? 0} color="blue" icon={Megaphone} />
        <KpiCard title="Messages Sent" value={overview.total_delivered ?? 0} color="green" icon={Send} />
        <KpiCard title="Delivery Rate" value={`${overview.delivery_rate ?? 0}%`} color="cyan" icon={CheckCircle} />
        <KpiCard title="Response Rate" value={`${overview.response_rate ?? 0}%`} color="amber" icon={MessageCircle} />
        <KpiCard title="Revenue" value={formatIndianRupees(overview.total_revenue ?? 0)} color="purple" icon={TrendingUp} />
        <KpiCard title="ROI" value={overview.roi_percentage != null ? `${overview.roi_percentage}%` : "—"} color="blue" icon={Activity} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top Campaigns</CardTitle></CardHeader>
          <CardContent>
            {topCampaigns.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No campaign data yet</p>
            ) : (
              <div className="space-y-2">
                {topCampaigns.map((c: { id?: string; name?: string; sent?: number; messages_sent?: number; delivered?: number; messages_delivered?: number; revenue?: number; revenue_generated?: number }, i: number) => (
                  <div key={c.id || i} className="flex items-center justify-between rounded border p-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{c.name || `Campaign #${i + 1}`}</p>
                      <p className="text-xs text-gray-400">{c.sent || c.messages_sent || 0} sent · {c.delivered || c.messages_delivered || 0} delivered</p>
                    </div>
                    <span className="text-sm font-semibold text-green-600 ml-2">{formatIndianRupees(c.revenue || c.revenue_generated || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "Sent", value: funnel.total_sent || overview.total_delivered || 0, color: "bg-blue-500" },
                { label: "Delivered", value: funnel.total_delivered || overview.total_delivered || 0, color: "bg-green-500" },
                { label: "Responses", value: funnel.total_responses || overview.total_responses || 0, color: "bg-amber-500" },
                { label: "Appointments", value: funnel.total_appointments || overview.total_appointments || 0, color: "bg-purple-500" },
                { label: "Converted", value: funnel.total_converted || overview.total_converted || 0, color: "bg-indigo-500" },
              ].map((item) => {
                const maxVal = Math.max(funnel.total_sent || overview.total_delivered || 1, 1)
                const pct = (item.value / maxVal) * 100
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div className={cn("h-full rounded-full transition-all", item.color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {roiData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Campaign ROI</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Campaign</th><th className="pb-2 pr-4">Cost</th><th className="pb-2 pr-4">Revenue</th><th className="pb-2 pr-4">ROI</th><th className="pb-2 pr-4">Converted</th>
                </tr></thead>
                <tbody>
                  {roiData.map((r: { campaign_name?: string; campaign_cost?: number; revenue_generated?: number; roi_percentage?: number; patients_converted?: number }, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.campaign_name || `Campaign #${i + 1}`}</td>
                      <td className="py-2 pr-4">{formatIndianRupees(r.campaign_cost || 0)}</td>
                      <td className="py-2 pr-4 text-green-600">{formatIndianRupees(r.revenue_generated || 0)}</td>
                      <td className="py-2 pr-4 font-semibold">{r.roi_percentage != null ? `${r.roi_percentage}%` : "—"}</td>
                      <td className="py-2 pr-4">{r.patients_converted || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
