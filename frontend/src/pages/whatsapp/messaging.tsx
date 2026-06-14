import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Send, MessageSquare, Users as UsersIcon, Search, Loader2, CheckCircle, XCircle, Eye, Filter, CalendarDays, BarChart3, Clock, Heart, Gift, FileText } from "lucide-react"
import { patientsApi, doctorsApi, crmApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Patient } from "@/types"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

const TEMPLATE_VARIABLES = [
  { label: "Patient Name", variable: "{{patient_name}}" },
  { label: "Doctor Name", variable: "{{doctor_name}}" },
  { label: "Hospital Name", variable: "{{hospital_name}}" },
  { label: "Appointment Date", variable: "{{appointment_date}}" },
  { label: "Appointment Time", variable: "{{appointment_time}}" },
  { label: "Invoice Number", variable: "{{invoice_number}}" },
  { label: "Pending Amount", variable: "{{pending_amount}}" },
  { label: "Due Date", variable: "{{due_date}}" },
]

const PRESETS = [
  { id: "appointment_reminder", label: "Appointment Reminder", icon: CalendarDays, message: "Hi {{patient_name}}\n\nYour appointment with Dr. {{doctor_name}} is confirmed.\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\n\n- {{hospital_name}}" },
  { id: "follow_up", label: "Follow-Up", icon: Clock, message: "Dear {{patient_name}}, this is a follow-up reminder for your dental visit. Please contact us to schedule. - {{hospital_name}}" },
  { id: "payment_reminder", label: "Payment Reminder", icon: FileText, message: "Dear {{patient_name}}, this is a gentle reminder about your pending payment of {{pending_amount}}. Please clear it by {{due_date}}. - {{hospital_name}}" },
  { id: "recall", label: "6-Month Recall", icon: Heart, message: "Dear {{patient_name}}, it is time for your 6-month dental check-up. Please schedule an appointment at {{hospital_name}}." },
  { id: "festival_wishes", label: "Festival Wishes", icon: Gift, message: "Warm wishes from {{hospital_name}}! May this festive season bring happiness and good health to you and your family. - {{hospital_name}}" },
  { id: "custom", label: "Custom", icon: MessageSquare, message: "" },
]

const templates = PRESETS.map(({ id, label, message }) => ({ label, message }))

export default function WhatsAppMessaging() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [tab, setTab] = useState<string>("presets")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [selectedPatient, setSelectedPatient] = useState("")
  const [selectedPatients, setSelectedPatients] = useState<string[]>([])
  const [template, setTemplate] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterDoctor, setFilterDoctor] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterApptDate, setFilterApptDate] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)

  const { data: patients } = useQuery({
    queryKey: ["patients", "whatsapp"],
    queryFn: () => patientsApi.list({ page_size: 200 }),
  })
  const { data: doctors } = useQuery({
    queryKey: ["doctors", "whatsapp"],
    queryFn: () => doctorsApi.list({ page_size: 100 }),
  })

  const patientList: Patient[] = patients?.items || patients || []
  const doctorList: any[] = doctors?.items || doctors || []

  const sendMutation = useMutation({
    mutationFn: () => crmApi.sendWhatsApp({ patient_id: selectedPatient, message }),
    onSuccess: () => {
      addToast({ title: "Sent!", description: "WhatsApp message sent successfully", variant: "success" })
      setPhone(""); setMessage(""); setSelectedPatient("")
    },
    onError: () => addToast({ title: "Error", description: "Failed to send message", variant: "destructive" }),
  })

  const broadcastMutation = useMutation({
    mutationFn: () => crmApi.broadcastWhatsApp({
      message,
      filter_type: filterType,
      ...(filterType === "appointment_date" && filterApptDate ? { appointment_date: filterApptDate } : {}),
      ...(filterType === "doctor" && filterDoctor ? { doctor_id: filterDoctor } : {}),
      ...(filterType === "status" && filterStatus ? { status: filterStatus } : {}),
      ...(filterType === "ids" ? { patient_ids: selectedPatients } : {}),
    }),
    onSuccess: (res) => {
      addToast({ title: "Broadcast complete", description: `${res.sent} sent, ${res.failed} failed`, variant: "success" })
      setSelectedPatients([]); setMessage(""); setShowPreview(false); setPreviewData(null)
      queryClient.invalidateQueries({ queryKey: ["crm", "analytics"] })
    },
    onError: () => addToast({ title: "Error", description: "Broadcast failed", variant: "destructive" }),
  })

  const previewMutation = useMutation({
    mutationFn: () => crmApi.preview({
      message,
      filter_type: filterType,
      ...(filterType === "appointment_date" && filterApptDate ? { appointment_date: filterApptDate } : {}),
      ...(filterType === "doctor" && filterDoctor ? { doctor_id: filterDoctor } : {}),
      ...(filterType === "status" && filterStatus ? { status: filterStatus } : {}),
      ...(filterType === "ids" ? { patient_ids: selectedPatients } : {}),
    }),
    onSuccess: (data) => {
      setPreviewData(data)
      setShowPreview(true)
    },
    onError: () => addToast({ title: "Error", description: "Failed to load preview", variant: "destructive" }),
  })

  const { data: analytics } = useQuery({
    queryKey: ["crm", "analytics"],
    queryFn: () => crmApi.analytics(),
    enabled: tab === "broadcast",
  })

  function applyTemplate(t: string) {
    const found = templates.find((x) => x.label === t)
    if (found) setMessage(found.message)
  }

  function insertVariable(variable: string) {
    setMessage((prev) => prev + variable)
  }

  function togglePatient(id: string) {
    setSelectedPatients((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  function toggleAll() {
    if (selectedPatients.length === patientList.length) {
      setSelectedPatients([])
    } else {
      setSelectedPatients(patientList.map((p: any) => p.id))
    }
  }

  async function handlePreview() {
    if (filterType === "all") {
      setSelectedPatients(patientList.map((p: any) => p.id))
    }
    previewMutation.mutate()
  }

  async function handleSend() {
    if (filterType === "all") {
      setSelectedPatients(patientList.map((p: any) => p.id))
    }
    broadcastMutation.mutate()
  }

  const broadcastReady = message && (
    (filterType === "all") ||
    (filterType === "appointment_date" && filterApptDate) ||
    (filterType === "doctor" && filterDoctor) ||
    (filterType === "status" && filterStatus) ||
    (filterType === "ids" && selectedPatients.length > 0)
  )

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="WhatsApp Messaging" description="Send messages, campaigns & broadcasts to patients" />

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="w-full">
        <TabsList className="bg-white border border-border rounded-xl p-1">
          <TabsTrigger value="presets"><MessageSquare className="h-4 w-4 mr-1" /> Presets</TabsTrigger>
          <TabsTrigger value="broadcast"><UsersIcon className="h-4 w-4 mr-1" /> Broadcast</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" /> Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-green-500" />
                    Message Presets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESETS.map((p) => {
                      const Icon = p.icon
                      return (
                        <button key={p.id} onClick={() => { setTemplate(p.label); applyTemplate(p.label) }}
                          className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-all hover:border-green-300 hover:bg-green-50 ${
                            template === p.label ? "border-green-400 bg-green-50 ring-1 ring-green-400" : "border-border"
                          }`}>
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{p.label}</p>
                            <p className="text-xs text-gray-500">{p.message ? "Has template" : "Custom message"}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Send className="h-5 w-5 text-green-500" />
                    Quick Send
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Patient</Label>
                    <Select value={selectedPatient} onValueChange={(v) => {
                      setSelectedPatient(v)
                      const p = patientList.find((x: any) => x.id === v)
                      if (p) setPhone(p.phone || "")
                    }}>
                      <SelectTrigger><SelectValue placeholder="Search patient..." /></SelectTrigger>
                      <SelectContent>
                        {patientList.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name} - {p.phone}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input placeholder="+911234567890" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <Button className="w-full gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => sendMutation.mutate()}
                    disabled={!selectedPatient || !message || sendMutation.isPending}>
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Message
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="h-5 w-5 text-blue-500" />
                  Compose Message
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={template} onValueChange={(v) => { setTemplate(v); applyTemplate(v) }}>
                    <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Insert Variable</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button key={v.variable} type="button" onClick={() => insertVariable(v.variable)}
                        className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea placeholder="Type your message here... Use {{...}} for template variables." value={message}
                    onChange={(e) => setMessage(e.target.value)} rows={5} />
                  <p className="text-xs text-gray-400">Click a variable button above to insert it into your message.</p>
                </div>

                <div className="rounded-lg border bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Preview</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{message || "Your message will appear here..."}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="broadcast" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UsersIcon className="h-5 w-5 text-blue-500" />
                  Broadcast
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={template} onValueChange={(v) => { setTemplate(v); applyTemplate(v) }}>
                    <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Insert Variable</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button key={v.variable} type="button" onClick={() => insertVariable(v.variable)}
                        className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border bg-gray-50 p-3">
                  <Label className="font-semibold text-gray-700"><Filter className="h-4 w-4 inline mr-1" />Broadcast Filters</Label>
                  <div className="space-y-2">
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger><SelectValue placeholder="Select filter..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Patients</SelectItem>
                        <SelectItem value="doctor">By Doctor</SelectItem>
                        <SelectItem value="status">By Status</SelectItem>
                        <SelectItem value="appointment_date">By Appointment Date</SelectItem>
                        <SelectItem value="recall">6-Month Recalls</SelectItem>
                        <SelectItem value="custom_date">Custom Date Range</SelectItem>
                      </SelectContent>
                    </Select>
                    {filterType === "doctor" && (
                      <Select value={filterDoctor} onValueChange={setFilterDoctor}>
                        <SelectTrigger><SelectValue placeholder="Select doctor..." /></SelectTrigger>
                        <SelectContent>
                          {doctorList.map((d: any) => (
                            <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {filterType === "status" && (
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                          <SelectItem value="COMPLETED">Completed</SelectItem>
                          <SelectItem value="FOLLOW_UP">Follow-Up</SelectItem>
                          <SelectItem value="NEW">New</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {filterType === "appointment_date" && (
                      <div>
                        <input type="date" value={filterApptDate} onChange={(e) => setFilterApptDate(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" />
                      </div>
                    )}
                    {filterType === "custom_date" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">From</Label>
                          <input type="date" className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">To</Label>
                          <input type="date" className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea placeholder="Type your broadcast message..." value={message}
                    onChange={(e) => setMessage(e.target.value)} rows={4} />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2"
                    onClick={handlePreview}
                    disabled={!broadcastReady || previewMutation.isPending}>
                    {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    Preview
                  </Button>
                  <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                    onClick={handleSend}
                    disabled={!broadcastReady || broadcastMutation.isPending}>
                    {broadcastMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Broadcast
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {showPreview && previewData && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Eye className="h-5 w-5 text-blue-500" />
                      Broadcast Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-blue-50 p-3 text-center">
                        <p className="text-2xl font-bold text-blue-600">{previewData.total_recipients}</p>
                        <p className="text-xs text-blue-600/70">Recipients</p>
                      </div>
                      <div className="rounded-lg bg-purple-50 p-3 text-center">
                        <p className="text-2xl font-bold text-purple-600">{previewData.patient_count ?? previewData.total_recipients}</p>
                        <p className="text-xs text-purple-600/70">Patients</p>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">{previewData.estimated_delivery ?? previewData.total_recipients}</p>
                        <p className="text-xs text-green-600/70">Est. Delivery</p>
                      </div>
                    </div>

                    <div>
                      <Label>Message Preview</Label>
                      <div className="mt-1 rounded-lg border bg-gray-50 p-3 text-sm whitespace-pre-wrap">{message}</div>
                    </div>

                    {previewData.recipients && previewData.recipients.length > 0 && (
                      <div>
                        <Label>Recipients ({previewData.recipients.length})</Label>
                        <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                          {previewData.recipients.slice(0, 20).map((r: any) => (
                            <div key={r.id} className="flex items-center gap-2 text-sm">
                              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                              <span className="truncate">{r.name}</span>
                              {r.phone && <span className="shrink-0 text-xs text-gray-400">{r.phone}</span>}
                            </div>
                          ))}
                          {previewData.recipients.length > 20 && (
                            <p className="text-xs text-gray-400">...and {previewData.recipients.length - 20} more</p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {filterType === "ids" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <UsersIcon className="h-5 w-5 text-blue-500" />
                      Select Patients ({selectedPatients.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input placeholder="Search patients..." className="pl-10" />
                    </div>
                    <div className="mb-2">
                      <button onClick={toggleAll} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                        {selectedPatients.length === patientList.length ? "Deselect All" : "Select All"}
                      </button>
                    </div>
                    <div className="max-h-80 space-y-1 overflow-y-auto">
                      {patientList.map((p: any) => (
                        <button key={p.id} onClick={() => togglePatient(p.id)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            selectedPatients.includes(p.id) ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                          }`}>
                          {selectedPatients.includes(p.id) ? (
                            <CheckCircle className="h-4 w-4 shrink-0 text-blue-600" />
                          ) : (
                            <div className="h-4 w-4 shrink-0 rounded-full border-2 border-gray-300" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{p.full_name}</p>
                            <p className="truncate text-xs text-gray-500">{p.phone || "No phone"}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <div className="space-y-6">
            {analytics && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="p-6 border-border shadow-card">
                    <p className="text-sm text-text-muted mb-1">Today's Messages</p>
                    <p className="text-3xl font-bold text-text-primary">{analytics.todays_messages ?? 0}</p>
                  </Card>
                  <Card className="p-6 border-border shadow-card">
                    <p className="text-sm text-text-muted mb-1">Campaigns Sent</p>
                    <p className="text-3xl font-bold text-text-primary">{analytics.campaigns_sent ?? 0}</p>
                  </Card>
                  <Card className="p-6 border-border shadow-card">
                    <p className="text-sm text-text-muted mb-1">Success Rate</p>
                    <p className="text-3xl font-bold text-green-600">{analytics.broadcast_success_rate?.success_rate ?? 0}%</p>
                  </Card>
                  <Card className="p-6 border-border shadow-card">
                    <p className="text-sm text-text-muted mb-1">Delivery Rate</p>
                    <p className="text-3xl font-bold text-blue-600">{analytics.delivery_rate ?? 0}%</p>
                  </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {analytics.top_communication_days && analytics.top_communication_days.length > 0 && (
                    <Card className="p-6 border-border shadow-card">
                      <h3 className="text-lg font-semibold text-text-primary mb-4">Top Communication Days</h3>
                      <div className="space-y-2">
                        {analytics.top_communication_days.map((d: any) => (
                          <div key={d.date} className="flex items-center justify-between rounded-lg border border-border p-3">
                            <span className="text-sm text-text-primary">{d.date}</span>
                            <span className="text-sm font-semibold text-text-primary">{d.count} messages</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                  <Card className="p-6 border-border shadow-card">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">Sent Messages (Last 30 Days)</h3>
                    <p className="text-4xl font-bold text-primary">{analytics.total_sent ?? analytics.todays_messages ?? 0}</p>
                    <p className="text-sm text-text-muted mt-2">Messages sent across all campaigns and broadcasts</p>
                  </Card>
                </div>
              </>
            )}
            {!analytics && (
              <Card className="p-12 text-center">
                <BarChart3 className="h-12 w-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">No analytics data available yet. Send some messages to see analytics.</p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
