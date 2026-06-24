import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  LayoutDashboard, Megaphone, CalendarDays, MessageSquare, FileText, BarChart3,
  Bell, Settings, Clock, Plus, Send, Trash2, Edit3, Target
} from "lucide-react"
import { crmApi, campaignsApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import CrmDashboard from "@/pages/dashboard/crm-dashboard"
import EnquiryCalendar from "@/pages/crm/enquiry-calendar"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

const statusBadge: Record<string, string> = {
  DRAFT: "bg-gray-50 text-gray-600",
  ACTIVE: "bg-green-50 text-green-700",
  PAUSED: "bg-yellow-50 text-yellow-700",
  COMPLETED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-red-50 text-red-600",
}

export default function CrmPage() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [campaignName, setCampaignName] = useState("")
  const [campaignType, setCampaignType] = useState("GENERAL")
  const [campaignMessage, setCampaignMessage] = useState("")

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ["crm-campaigns"],
    queryFn: () => campaignsApi.list(),
  })
  const campaigns: any[] = Array.isArray(campaignsData) ? campaignsData : campaignsData?.items || []

  const { data: templatesData } = useQuery({
    queryKey: ["crm", "templates"],
    queryFn: () => crmApi.templates.list(),
  })
  const templates: any[] = Array.isArray(templatesData) ? templatesData : templatesData?.items || []

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader
        title="CRM"
        description="Patient engagement, enquiries, follow-ups, recalls & campaigns"
      />

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="bg-white border border-border rounded-xl p-1 flex-wrap">
          <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarDays className="h-4 w-4 mr-1.5" />Enquiries</TabsTrigger>
          <TabsTrigger value="campaigns"><Megaphone className="h-4 w-4 mr-1.5" />Campaigns ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="templates"><FileText className="h-4 w-4 mr-1.5" />Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageSquare className="h-4 w-4 mr-1.5" />WhatsApp</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1.5" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <CrmDashboard />
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <EnquiryCalendar embedded />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Campaigns</h2>
            <Button size="sm" onClick={() => setCampaignOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />New Campaign
            </Button>
          </div>
          {campaignsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <Card className="p-12 text-center">
              <Megaphone className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No campaigns yet</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c: any) => (
                <Card key={c.id} className="p-4 border-border shadow-card">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary truncate">{c.name}</span>
                        <Badge className={`text-xs ${statusBadge[c.status] || "bg-gray-50 text-gray-600"}`}>{c.status || "DRAFT"}</Badge>
                        <Badge className="text-xs bg-muted">{c.type || "General"}</Badge>
                      </div>
                      {c.message && <p className="text-sm text-text-secondary mt-1 truncate">{c.message}</p>}
                      <p className="text-xs text-text-muted mt-1">Target: {c.target_audience || "All"} | Sent: {c.sent_count || 0}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/crm/campaigns`)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => {}}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Message Templates</h2>
            <Button size="sm" onClick={() => navigate("/crm/templates")}>
              <Plus className="h-4 w-4 mr-1.5" />Manage Templates
            </Button>
          </div>
          {templates.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No templates yet</p>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((t: any) => (
                <Card key={t.id} className="p-4 border-border shadow-card">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium text-text-primary">{t.name}</span>
                    <Badge className={`text-xs ${t.is_active ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {t.subject && <p className="text-xs text-text-secondary">Subject: {t.subject}</p>}
                  <p className="text-xs text-text-muted mt-1 truncate">{t.body}</p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">WhatsApp Messaging</h2>
            <Button size="sm" onClick={() => navigate("/whatsapp")}>
              <Send className="h-4 w-4 mr-1.5" />Open Full WhatsApp
            </Button>
          </div>
          <Card className="p-6 border-border shadow-card">
            <p className="text-sm text-text-secondary mb-4">Send quick WhatsApp messages to patients. Use the full WhatsApp page for advanced features like templates, broadcasts, and analytics.</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Button variant="outline" className="justify-start" onClick={() => navigate("/whatsapp?tab=presets")}>
                <MessageSquare className="h-4 w-4 mr-2 text-green-600" />Message Presets
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate("/whatsapp?tab=broadcast")}>
                <Send className="h-4 w-4 mr-2 text-blue-600" />Broadcast
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => navigate("/whatsapp")}>
                <BarChart3 className="h-4 w-4 mr-2 text-purple-600" />Analytics
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-6 border-border shadow-card">
              <p className="text-sm text-text-muted mb-1">Total Campaigns</p>
              <p className="text-3xl font-bold text-text-primary">{campaigns.length}</p>
            </Card>
            <Card className="p-6 border-border shadow-card">
              <p className="text-sm text-text-muted mb-1">Total Templates</p>
              <p className="text-3xl font-bold text-text-primary">{templates.length}</p>
            </Card>
            <Card className="p-6 border-border shadow-card">
              <p className="text-sm text-text-muted mb-1">Modules Active</p>
              <p className="text-3xl font-bold text-primary">4</p>
              <p className="text-xs text-text-muted mt-1">Leads · Enquiries · Follow-Ups · Recalls</p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label>Campaign Name</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Summer Checkup Drive" />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={campaignType} onValueChange={setCampaignType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROMOTIONAL">Promotional</SelectItem>
                  <SelectItem value="SEASONAL">Seasonal</SelectItem>
                  <SelectItem value="AWARENESS">Awareness</SelectItem>
                  <SelectItem value="DISCOUNT">Discount</SelectItem>
                  <SelectItem value="RECALL">Recall</SelectItem>
                  <SelectItem value="FOLLOW_UP">Follow-Up</SelectItem>
                  <SelectItem value="GENERAL">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Message</Label>
              <Textarea value={campaignMessage} onChange={(e) => setCampaignMessage(e.target.value)} rows={3} placeholder="Campaign message..." />
            </div>
            <Button className="w-full bg-primary text-white"
              onClick={() => {}}
              disabled={!campaignName}>
              Create Campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
