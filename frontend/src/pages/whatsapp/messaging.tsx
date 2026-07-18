import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Send, MessageSquare, Users, Search, Loader2, CheckCircle2, Eye, Filter, History, FileText, ExternalLink, Smartphone, Clock } from "lucide-react"
import { patientsApi, whatsappV2Api } from "@/services/endpoints"
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
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import WhatsAppPreviewModal from "@/components/whatsapp/preview-modal"
import BulkPreviewPanel from "@/components/whatsapp/bulk-preview-panel"
import type { Patient } from "@/types"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

const TEMPLATE_VARIABLES = [
  { label: "Patient Name", variable: "{{patient_name}}" },
  { label: "Doctor Name", variable: "{{doctor_name}}" },
  { label: "Hospital Name", variable: "{{hospital_name}}" },
  { label: "Appointment Date", variable: "{{appointment_date}}" },
  { label: "Appointment Time", variable: "{{appointment_time}}" },
  { label: "Treatment Name", variable: "{{treatment_name}}" },
  { label: "Follow-Up Date", variable: "{{follow_up_date}}" },
  { label: "Recall Date", variable: "{{recall_date}}" },
  { label: "Invoice Number", variable: "{{invoice_number}}" },
  { label: "Pending Amount", variable: "{{pending_amount}}" },
  { label: "Due Date", variable: "{{due_date}}" },
]

const PRESETS = [
  { id: "appointment_reminder", label: "Appointment Reminder", icon: Clock, message: "Hi {{patient_name}}\n\nYour appointment with Dr. {{doctor_name}} is confirmed.\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\n\n- {{hospital_name}}" },
  { id: "follow_up", label: "Follow-Up", icon: MessageSquare, message: "Dear {{patient_name}}, this is a follow-up reminder for your dental visit. Please contact us to schedule. - {{hospital_name}}" },
  { id: "payment_reminder", label: "Payment Reminder", icon: FileText, message: "Dear {{patient_name}}, this is a gentle reminder about your pending payment of {{pending_amount}}. Please clear it by {{due_date}}. - {{hospital_name}}" },
  { id: "recall", label: "6-Month Recall", icon: Clock, message: "Dear {{patient_name}}, it is time for your 6-month dental check-up. Please schedule an appointment at {{hospital_name}}." },
  { id: "treatment_follow_up", label: "Treatment Follow-Up", icon: FileText, message: "Dear {{patient_name}}, we hope you are recovering well after your {{treatment_name}}. Please let us know if you have any concerns. - {{hospital_name}}" },
  { id: "custom", label: "Custom", icon: MessageSquare, message: "" },
]

export default function WhatsAppMessaging() {
  const { addToast } = useToast()
  const [tab, setTab] = useState<string>("send")
  const [message, setMessage] = useState("")

  const [selectedPatient, setSelectedPatient] = useState("")
  const [selectedPatients, setSelectedPatients] = useState<string[]>([])
  const [template, setTemplate] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [showPreview, setShowPreview] = useState(false)
  interface PreviewPayload { patient_id: string; patient_name: string; patient_phone: string | null; doctor_name: string | null; hospital_name: string | null; rendered_message: string; resolved_variables: Record<string, string>; unresolved_variables: string[]; validation: Record<string, boolean>; variables_panel: Record<string, Record<string, string | undefined>> }
  const [previewData, setPreviewData] = useState<PreviewPayload | null>(null)

  interface BulkItemPayload { patient_id: string; patient_name: string; patient_phone: string | null; rendered_message: string; resolved_variables: Record<string, string>; unresolved_variables: string[]; validation: Record<string, boolean>; has_phone: boolean; is_valid: boolean }
  interface BulkPreviewPayload { items: BulkItemPayload[]; totals: { total: number; valid: number; invalid: number; with_phone: number; without_phone: number }; message: string }
  const [showBulkPreview, setShowBulkPreview] = useState(false)
  const [bulkPreviewData, setBulkPreviewData] = useState<BulkPreviewPayload | null>(null)

  const [historyPage, setHistoryPage] = useState(1)
  const [historyFilter, setHistoryFilter] = useState({ patient_id: "", message_type: "", status: "" })

  const { data: patients } = useQuery({
    queryKey: ["patients", "whatsapp"],
    queryFn: () => patientsApi.list({ page_size: 200 }),
  })
  const { data: messageTypes } = useQuery({
    queryKey: ["whatsapp", "message-types"],
    queryFn: () => whatsappV2Api.messageTypes(),
  })
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ["whatsapp", "history", historyPage, historyFilter],
    queryFn: () => whatsappV2Api.history({
      page: historyPage, page_size: 20,
      ...(historyFilter.patient_id && { patient_id: historyFilter.patient_id }),
      ...(historyFilter.message_type && { message_type: historyFilter.message_type }),
      ...(historyFilter.status && { status: historyFilter.status }),
    }),
  })

  const patientList: Patient[] = patients?.items || patients || []

  const previewMutation = useMutation({
    mutationFn: (data: { patient_id: string; message: string }) =>
      whatsappV2Api.preview(data),
    onSuccess: (data) => {
      setPreviewData(data)
      setShowPreview(true)
    },
    onError: () => addToast({ title: "Error", description: "Failed to generate preview", variant: "destructive" }),
  })

  const sendMutation = useMutation({
    mutationFn: (data: { patient_id: string; message: string; send_mode: string }) =>
      whatsappV2Api.send(data),
    onSuccess: (data) => {
      if (data.wa_link) {
        window.open(data.wa_link, "_blank")
      }
      addToast({ title: "Sent!", description: "WhatsApp message sent", variant: "success" })
      setShowPreview(false)
      setPreviewData(null)
      setSelectedPatient("")
      setMessage("")
      setTemplate("")
    },
    onError: () => addToast({ title: "Error", description: "Failed to send message", variant: "destructive" }),
  })

  const bulkPreviewMutation = useMutation({
    mutationFn: (data: { patient_ids: string[]; message: string }) =>
      whatsappV2Api.bulkPreview(data),
    onSuccess: (data) => {
      setBulkPreviewData(data)
      setShowBulkPreview(true)
    },
    onError: () => addToast({ title: "Error", description: "Failed to generate bulk preview", variant: "destructive" }),
  })

  const bulkSendMutation = useMutation({
    mutationFn: (data: { items: Record<string, string>[]; send_mode: string }) =>
      whatsappV2Api.bulkSend({ items: data.items.map(i => ({ ...i, send_mode: data.send_mode })) }),
    onSuccess: (data) => {
      addToast({ title: "Broadcast Done", description: `${data.sent} sent, ${data.failed} failed`, variant: "success" })
      setShowBulkPreview(false)
      setBulkPreviewData(null)
      setSelectedPatients([])
    },
    onError: () => addToast({ title: "Error", description: "Broadcast failed", variant: "destructive" }),
  })

  function applyTemplate(t: string) {
    const found = PRESETS.find((x) => x.label === t)
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
      setSelectedPatients(patientList.map((p: Patient) => p.id))
    }
  }

  async function handlePreview() {
    if (!selectedPatient || !message) return
    previewMutation.mutate({ patient_id: selectedPatient, message })
  }

  async function handleSendFromPreview(mode: "redirect" | "api") {
    if (!previewData) return
    const pd = previewData
    sendMutation.mutate({
      patient_id: pd.patient_id,
      message: pd.rendered_message,
      send_mode: mode,
    })
  }

  async function handleBulkPreview() {
    const ids = filterType === "all" ? patientList.map((p: Patient) => p.id) : selectedPatients
    if (ids.length === 0) {
      addToast({ title: "No patients", description: "Select at least one patient", variant: "destructive" })
      return
    }
    bulkPreviewMutation.mutate({ patient_ids: ids, message })
  }

  async function handleBulkSend(mode: "redirect" | "api") {
    if (!bulkPreviewData) return
    const validItems = bulkPreviewData.items
      .filter((i) => i.is_valid)
      .map((i) => ({
        patient_id: i.patient_id,
        message: i.rendered_message,
        message_type: "GENERAL" as string,
      }))
    bulkSendMutation.mutate({ items: validItems, send_mode: mode })
  }

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="WhatsApp Messaging" description="Send messages with live preview & audit trail" />

      <Tabs value={tab} onValueChange={(v: string) => setTab(v)} className="w-full">
        <TabsList className="bg-white border border-border rounded-xl p-1">
          <TabsTrigger value="send"><Send className="h-4 w-4 mr-1" /> Send</TabsTrigger>
          <TabsTrigger value="bulk"><Users className="h-4 w-4 mr-1" /> Bulk</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MessageSquare className="h-5 w-5 text-green-500" />
                    Compose Message
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Patient</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                          <SelectTrigger><SelectValue placeholder="Select patient..." /></SelectTrigger>
                          <SelectContent>
                            {patientList.map((p: Patient) => (
                              <SelectItem key={p.id} value={p.id}>{p.full_name} - {p.phone}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={template} onValueChange={(v) => { setTemplate(v); applyTemplate(v) }}>
                      <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                      <SelectContent>
                        {PRESETS.map((p) => (
                          <SelectItem key={p.id} value={p.label}>{p.label}</SelectItem>
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
                    <Textarea placeholder="Type your message... Use {{variable}} for dynamic content." value={message}
                      onChange={(e) => setMessage(e.target.value)} rows={5} />
                  </div>

                  <Button className="w-full gap-2"
                    onClick={handlePreview}
                    disabled={!selectedPatient || !message || previewMutation.isPending}>
                    {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    Preview & Send
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-blue-500" />
                  Quick Templates
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

                <Separator className="my-4" />

                <div className="rounded-lg border bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Raw Preview</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{message || "Your message will appear here..."}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="mt-6">
          {showBulkPreview && bulkPreviewData ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="h-5 w-5 text-blue-500" />
                  Bulk Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BulkPreviewPanel
                  preview={bulkPreviewData}
                  onSendAll={handleBulkSend}
                  onBack={() => { setShowBulkPreview(false); setBulkPreviewData(null) }}
                  sending={bulkSendMutation.isPending}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-blue-500" />
                    Broadcast
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select value={template} onValueChange={(v) => { setTemplate(v); applyTemplate(v) }}>
                      <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                      <SelectContent>
                        {PRESETS.map((p) => (
                          <SelectItem key={p.id} value={p.label}>{p.label}</SelectItem>
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
                    <Label className="font-semibold text-gray-700"><Filter className="h-4 w-4 inline mr-1" />Recipients</Label>
                    <div className="space-y-2">
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger><SelectValue placeholder="Select filter..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Patients</SelectItem>
                          <SelectItem value="ids">Select Manually</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea placeholder="Type your broadcast message..." value={message}
                      onChange={(e) => setMessage(e.target.value)} rows={4} />
                  </div>

                  <Button className="w-full gap-2"
                    onClick={handleBulkPreview}
                    disabled={!message || bulkPreviewMutation.isPending}>
                    {bulkPreviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    Generate Preview
                  </Button>
                </CardContent>
              </Card>

              {filterType === "ids" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Users className="h-5 w-5 text-blue-500" />
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
                    <ScrollArea className="h-80">
                      <div className="space-y-1">
                        {patientList.map((p: Patient) => (
                          <button key={p.id} onClick={() => togglePatient(p.id)}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                              selectedPatients.includes(p.id) ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                            }`}>
                            {selectedPatients.includes(p.id) ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
                            ) : (
                              <div className="h-4 w-4 shrink-0 rounded-full border-2 border-gray-300" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{p.full_name}</p>
                              <p className="truncate text-xs text-gray-500">{p.phone || "No phone"}</p>
                            </div>
                            {p.phone && <Smartphone className="h-3.5 w-3.5 shrink-0 text-green-400" />}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5 text-purple-500" />
                Message History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyData?.stats && (
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg bg-blue-50 p-3 text-center">
                    <p className="text-xl font-bold text-blue-600">{historyData.stats.today || 0}</p>
                    <p className="text-xs text-blue-600/70">Today</p>
                  </div>
                  <div className="rounded-lg bg-purple-50 p-3 text-center">
                    <p className="text-xl font-bold text-purple-600">{historyData.stats.this_week || 0}</p>
                    <p className="text-xs text-purple-600/70">This Week</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-3 text-center">
                    <p className="text-xl font-bold text-red-600">{historyData.stats.failed || 0}</p>
                    <p className="text-xs text-red-600/70">Failed</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-3 text-center">
                    <p className="text-xl font-bold text-green-600">{historyData.total || 0}</p>
                    <p className="text-xs text-green-600/70">Total</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mb-4">
                <div className="flex-1">
                  <Input placeholder="Filter by patient ID..." value={historyFilter.patient_id}
                    onChange={(e) => setHistoryFilter(f => ({ ...f, patient_id: e.target.value }))} />
                </div>
                <Select value={historyFilter.message_type} onValueChange={(v) => setHistoryFilter(f => ({ ...f, message_type: v }))}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {messageTypes?.types?.map((t: Record<string, string>) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <div className="rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left">
                      <th className="px-4 py-2.5 font-medium text-gray-600">Patient</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Type</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Status</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Via</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Template</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600">Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData?.items?.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No messages sent yet</td></tr>
                    )}
                    {historyData?.items?.map((item: Record<string, unknown>) => (
                      <tr key={String(item.id)} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="font-medium text-gray-900">{item.patient_name as string}</p>
                            <p className="text-xs text-gray-500">{item.patient_phone as string}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="info">{item.message_type as string}</Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={(item.status === "SENT" || item.status === "DELIVERED") ? "success" : item.status === "FAILED" ? "destructive" : "default"}>
                            {item.status as string}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {item.sent_via === "api" ? <><Smartphone className="h-3.5 w-3.5 inline mr-1" />API</> : <><ExternalLink className="h-3.5 w-3.5 inline mr-1" />Redirect</>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{(item.template_name as string) || "-"}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{item.sent_at ? new Date(item.sent_at as string).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {historyData && historyData.total > historyData.page_size && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">Page {historyData.page} of {Math.ceil(historyData.total / historyData.page_size)}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={historyPage <= 1}
                      onClick={() => setHistoryPage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={historyPage >= Math.ceil(historyData.total / historyData.page_size)}
                      onClick={() => setHistoryPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <WhatsAppPreviewModal
        open={showPreview}
        onClose={() => { setShowPreview(false); setPreviewData(null) }}
        preview={previewData}
        loading={previewMutation.isPending}
        onSend={handleSendFromPreview}
        sending={sendMutation.isPending}
      />
    </motion.div>
  )
}
