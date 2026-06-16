import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Megaphone, Plus, Loader2, Rocket, Trash2, BarChart3, Target, Send, Eye, MessageSquare,
  MessageCircle, FileText, Edit3, X
} from "lucide-react"
import { campaignsApi, crmApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

const statusBadge: Record<string, string> = {
  DRAFT: "bg-gray-50 text-gray-600",
  ACTIVE: "bg-green-50 text-green-700",
  PAUSED: "bg-yellow-50 text-yellow-700",
  COMPLETED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-red-50 text-red-600",
}

const typeBadge: Record<string, string> = {
  PROMOTIONAL: "bg-purple-50 text-purple-700",
  SEASONAL: "bg-pink-50 text-pink-700",
  AWARENESS: "bg-cyan-50 text-cyan-700",
  DISCOUNT: "bg-orange-50 text-orange-700",
  RECALL: "bg-indigo-50 text-indigo-700",
  FOLLOW_UP: "bg-teal-50 text-teal-700",
  GENERAL: "bg-gray-50 text-gray-600",
}

export default function Campaigns() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [tab, setTab] = useState("campaigns")
  const [open, setOpen] = useState(false)
  const [recipientsOpen, setRecipientsOpen] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [customMessage, setCustomMessage] = useState("")
  const [name, setName] = useState("")
  const [campaignType, setCampaignType] = useState("GENERAL")
  const [channel, setChannel] = useState("WHATSAPP")
  const [target, setTarget] = useState("ALL")
  const [message, setMessage] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // WhatsApp Template state
  const [tmplOpen, setTmplOpen] = useState(false)
  const [tmplName, setTmplName] = useState("")
  const [tmplMessage, setTmplMessage] = useState("")
  const [editTmplId, setEditTmplId] = useState<string | null>(null)

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => campaignsApi.list(),
  })

  const { data: analytics } = useQuery({
    queryKey: ["campaigns", "analytics"],
    queryFn: () => campaignsApi.analytics.overview(),
  })

  const { data: waTemplates } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => crmApi.whatsappTemplates.list(),
  })

  const items: any[] = campaigns || []
  const waTmplItems: any[] = waTemplates || []

  const createMutation = useMutation({
    mutationFn: () => campaignsApi.create({ name, campaign_type: campaignType, channel, target, message, start_date: startDate || null, end_date: endDate || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      addToast({ title: "Created", description: "Campaign created", variant: "success" })
      setOpen(false); setName(""); setMessage(""); setStartDate(""); setEndDate("")
    },
    onError: () => addToast({ title: "Error", description: "Failed to create campaign", variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); addToast({ title: "Deleted", variant: "success" }) },
    onError: (err: any) => { const msg = err?.response?.data?.detail || "Failed to delete campaign"; addToast({ title: "Error", description: msg, variant: "destructive" }) },
  })

  const launchMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.launch(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      queryClient.invalidateQueries({ queryKey: ["campaigns", "analytics"] })
      addToast({ title: "Launched", description: `Campaign sent to ${data.recipients_count} patients`, variant: "success" })
    },
  })

  const sendWAMutation = useMutation({
    mutationFn: (data: { campaign_id: string; template_id?: string; custom_message?: string }) =>
      crmApi.campaignSendWhatsApp(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] })
      addToast({ title: "Sent", description: `WhatsApp sent to ${data.sent} patients`, variant: "success" })
      setSendOpen(null); setSelectedTemplate(""); setCustomMessage("")
    },
    onError: () => addToast({ title: "Error", description: "Failed to send WhatsApp", variant: "destructive" }),
  })

  const createTmplMutation = useMutation({
    mutationFn: () => editTmplId
      ? crmApi.whatsappTemplates.update(editTmplId, { name: tmplName, message: tmplMessage })
      : crmApi.whatsappTemplates.create({ name: tmplName, message: tmplMessage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] })
      addToast({ title: editTmplId ? "Updated" : "Created", description: "WhatsApp template saved", variant: "success" })
      setTmplOpen(false); setTmplName(""); setTmplMessage(""); setEditTmplId(null)
    },
  })

  const deleteTmplMutation = useMutation({
    mutationFn: (id: string) => crmApi.whatsappTemplates.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }); addToast({ title: "Deleted", variant: "success" }) },
  })

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="Campaigns" description="Create and manage WhatsApp campaigns">
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => { setEditTmplId(null); setTmplName(""); setTmplMessage(""); setTmplOpen(true) }}>
            <FileText className="h-4 w-4" /> Templates
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Megaphone className="h-4 w-4" /> New Campaign</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Checkup Drive" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={campaignType} onValueChange={setCampaignType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GENERAL">General</SelectItem>
                        <SelectItem value="PROMOTIONAL">Promotional</SelectItem>
                        <SelectItem value="SEASONAL">Seasonal</SelectItem>
                        <SelectItem value="AWARENESS">Awareness</SelectItem>
                        <SelectItem value="DISCOUNT">Discount</SelectItem>
                        <SelectItem value="RECALL">Recall</SelectItem>
                        <SelectItem value="FOLLOW_UP">Follow-Up</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target</Label>
                    <Select value={target} onValueChange={setTarget}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Patients</SelectItem>
                        <SelectItem value="ACTIVE">Active Patients</SelectItem>
                        <SelectItem value="COMPLETED_TREATMENT">Completed Treatment</SelectItem>
                        <SelectItem value="FOLLOW_UP">In Follow-Up</SelectItem>
                        <SelectItem value="NOT_VISITED_6M">No Visit 6 Months</SelectItem>
                        <SelectItem value="NOT_VISITED_1Y">No Visit 1 Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <div className="flex gap-2 mb-2">
                    <Select value={selectedTemplate} onValueChange={(v) => {
                      setSelectedTemplate(v)
                      const t = waTmplItems.find((x: any) => x.id === v)
                      if (t) setMessage(t.message)
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Load from template..." /></SelectTrigger>
                      <SelectContent>
                        {waTmplItems.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplate && (
                      <Button variant="ghost" size="icon-sm" onClick={() => { setSelectedTemplate(""); setMessage("") }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                    placeholder='Template variables: {{patient_name}}, {{doctor_name}}, {{hospital_name}}' />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" />
                  </div>
                </div>
                <Button className="w-full gap-2" onClick={() => createMutation.mutate()}
                  disabled={!name || !message || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Campaign
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      {analytics && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{analytics.total_campaigns}</p>
            <p className="text-xs text-gray-500">Total Campaigns</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{analytics.active_campaigns}</p>
            <p className="text-xs text-gray-500">Active</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{analytics.total_recipients}</p>
            <p className="text-xs text-gray-500">Total Recipients</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-cyan-600">{analytics.delivery_rate}%</p>
            <p className="text-xs text-gray-500">Delivery Rate</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{analytics.response_rate}%</p>
            <p className="text-xs text-gray-500">Response Rate</p>
          </CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No campaigns yet. Create your first campaign!</div>
          ) : (
            <div className="space-y-3">
              {items.map((c: any) => (
                <div key={c.id} className="rounded-lg border p-4 transition-colors hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                        <Badge className={`text-xs ${statusBadge[c.status] || ""}`}>{c.status}</Badge>
                        <Badge className={`text-xs ${typeBadge[c.campaign_type] || ""}`}>{c.campaign_type}</Badge>
                        <span className="ml-auto text-xs text-gray-400">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Target className="h-3 w-3" />{c.target}</span>
                        <span className="flex items-center gap-1"><Send className="h-3 w-3" />{c.messages_sent} sent</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{c.messages_delivered} delivered</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{c.responses_count} responses</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {c.status === "DRAFT" && (
                        <>
                          <Button variant="ghost" size="icon-sm" className="text-green-600" title="Send WhatsApp Now"
                            onClick={() => setSendOpen(c.id)}>
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="text-green-600" title="Launch Campaign"
                            onClick={() => { if (confirm("Launch this campaign?")) launchMutation.mutate(c.id) }}
                            disabled={launchMutation.isPending}>
                            <Rocket className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Dialog open={recipientsOpen === c.id} onOpenChange={(o) => setRecipientsOpen(o ? c.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="text-blue-600" title="View Recipients">
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader><DialogTitle>Recipients - {c.name}</DialogTitle></DialogHeader>
                          <RecipientsList campaignId={c.id} />
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon-sm" className="text-red-600" title="Delete"
                        onClick={() => { if (confirm("Delete this campaign?")) deleteMutation.mutate(c.id) }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send WhatsApp Dialog */}
      <Dialog open={!!sendOpen} onOpenChange={(o) => { if (!o) setSendOpen(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Send WhatsApp Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Use Template</Label>
              <Select value={selectedTemplate} onValueChange={(v) => {
                setSelectedTemplate(v)
                const t = waTmplItems.find((x: any) => x.id === v)
                if (t) setCustomMessage(t.message)
              }}>
                <SelectTrigger><SelectValue placeholder="Select template..." /></SelectTrigger>
                <SelectContent>
                  {waTmplItems.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Custom Message</Label>
              <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={4}
                placeholder="Or type custom message..." />
            </div>
            <Button className="w-full gap-2" onClick={() => {
              if (sendOpen) sendWAMutation.mutate({
                campaign_id: sendOpen,
                template_id: selectedTemplate || undefined,
                custom_message: customMessage || undefined,
              })
            }} disabled={sendWAMutation.isPending || (!customMessage && !selectedTemplate)}>
              {sendWAMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" /> Send WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Template Dialog */}
      <Dialog open={tmplOpen} onOpenChange={setTmplOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editTmplId ? "Edit" : "Create"} WhatsApp Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={tmplName} onChange={(e) => setTmplName(e.target.value)} placeholder="e.g. 6-Month Recall" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={tmplMessage} onChange={(e) => setTmplMessage(e.target.value)} rows={5}
                placeholder='Hello {{patient_name}}, it is time for your check-up...' />
              <p className="text-xs text-gray-400">Use {'{{patient_name}}'}, {'{{doctor_name}}'}, {'{{hospital_name}}'} as variables</p>
            </div>
            <Button className="w-full gap-2" onClick={() => createTmplMutation.mutate()}
              disabled={!tmplName || !tmplMessage || createTmplMutation.isPending}>
              {createTmplMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editTmplId ? "Update" : "Create"} Template
            </Button>
          </div>
          {waTmplItems.length > 0 && (
            <div className="mt-4 max-h-48 overflow-y-auto space-y-2 border-t pt-4">
              {waTmplItems.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t.message}</p>
                  </div>
                  <div className="flex shrink-0 gap-1 ml-2">
                    <Button variant="ghost" size="icon-sm" onClick={() => {
                      setEditTmplId(t.id); setTmplName(t.name); setTmplMessage(t.message)
                    }}><Edit3 className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon-sm" className="text-red-600"
                      onClick={() => { if (confirm("Delete template?")) deleteTmplMutation.mutate(t.id) }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function RecipientsList({ campaignId }: { campaignId: string }) {
  const { data: recipients, isLoading } = useQuery({
    queryKey: ["campaigns", campaignId, "recipients"],
    queryFn: () => campaignsApi.recipients(campaignId),
  })
  const items: any[] = recipients || []
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
  if (items.length === 0) return <div className="py-8 text-center text-gray-400">No recipients yet</div>
  return (
    <div className="max-h-80 space-y-2 overflow-y-auto">
      {items.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between rounded border p-3 text-sm">
          <span className="font-medium">{r.patient_name || `Patient #${r.patient_id.slice(-6)}`}</span>
          <Badge className={`text-xs ${
            r.status === "SENT" ? "bg-green-50 text-green-700" :
            r.status === "DELIVERED" ? "bg-blue-50 text-blue-700" :
            r.status === "READ" ? "bg-purple-50 text-purple-700" :
            r.status === "RESPONDED" ? "bg-amber-50 text-amber-700" :
            "bg-gray-50 text-gray-500"
          }`}>{r.status}</Badge>
        </div>
      ))}
    </div>
  )
}
