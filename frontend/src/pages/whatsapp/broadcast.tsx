import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Send, MessageSquare, Filter, ChevronRight, ExternalLink, Copy, CheckCircle2, Search } from "lucide-react"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/store/authStore"
import { patientsApi, leadsApi, whatsappTemplatesApi } from "@/services/endpoints"
import type { Patient, Lead } from "@/types"

type AudienceType = "all_patients" | "selected_patients" | "all_leads" | "selected_leads" | "appointment_tomorrow" | "pending_followups" | "six_month_recall" | "patient_source" | "custom"

export default function WhatsAppBroadcast() {
  const { addToast } = useToast()
  const { user } = useAuthStore()
  const hospitalId = user?.hospital_id || ""

  const [audienceType, setAudienceType] = useState<AudienceType>("all_patients")
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [customMessage, setCustomMessage] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [preview, setPreview] = useState<Array<{ name: string; phone: string; message: string; link: string }>>([])
  const [showPreview, setShowPreview] = useState(false)
  const [generatedLinks, setGeneratedLinks] = useState<Array<{ name: string; phone: string; message: string; link: string }>>([])
  const [copiedAll, setCopiedAll] = useState(false)

  const { data: patients } = useQuery({
    queryKey: ["patients", "all", hospitalId],
    queryFn: () => patientsApi.list({ limit: 500, hospital_id: hospitalId }),
    enabled: !!hospitalId,
  })

  const { data: leads } = useQuery({
    queryKey: ["leads", "all"],
    queryFn: () => leadsApi.list({ limit: 500 }),
  })

  const { data: templates } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => whatsappTemplatesApi.list(),
  })

  const allPatients: Patient[] = useMemo(() => Array.isArray(patients) ? patients : [], [patients])
  const allLeads: Lead[] = useMemo(() => Array.isArray(leads) ? leads : [], [leads])
  const allTemplates: Array<{ id: string; name: string; message: string }> = useMemo(() => Array.isArray(templates) ? templates : [], [templates])

  const filteredPatients = useMemo(() => {
    if (!searchTerm) return allPatients
    const q = searchTerm.toLowerCase()
    return allPatients.filter((p) =>
      (p.patient_name || "").toLowerCase().includes(q) || (p.phone || "").includes(q)
    )
  }, [allPatients, searchTerm])

  const filteredLeads = useMemo(() => {
    if (!searchTerm) return allLeads
    const q = searchTerm.toLowerCase()
    return allLeads.filter((l) =>
      l.lead_name.toLowerCase().includes(q) || l.mobile.includes(q)
    )
  }, [allLeads, searchTerm])

  function resolveAudience(): Array<Patient | Lead> {
    switch (audienceType) {
      case "all_patients": return allPatients.filter((p) => p.phone)
      case "all_leads": return allLeads.filter((l) => l.mobile)
      case "appointment_tomorrow": return allPatients.filter((p) => p.phone && (p as unknown as Record<string, unknown>).next_appointment_date)
      case "pending_followups": return allPatients.filter((p) => p.phone && (p as unknown as Record<string, unknown>).next_follow_up)
      case "six_month_recall": return allPatients.filter((p) => p.phone)
      default: return []
    }
  }

  function getMessage(): string {
    if (customMessage.trim()) return customMessage
    const t = allTemplates.find((t) => t.id === selectedTemplate)
    return t?.message || ""
  }

  function fillTemplate(msg: string, recipient: { patient_name?: string | null; lead_name?: string; full_name?: string }): string {
    const name = recipient.patient_name || recipient.lead_name || recipient.full_name || "Patient"
    return msg
      .replace(/\{PatientName\}/g, name)
      .replace(/\{HospitalName\}/g, user?.hospital_name || "Our Clinic")
      .replace(/\{Date\}/g, new Date().toLocaleDateString())
      .replace(/\{Time\}/g, new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      .replace(/\{DoctorName\}/g, "")
  }

  function generateDeepLink(phone: string, message: string): string {
    const clean = phone.replace(/\+/g, "").replace(/\s/g, "").replace(/-/g, "")
    const num = clean.startsWith("91") || clean.startsWith("1") ? clean : "91" + clean
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
  }

  function handlePreview() {
    const audience = resolveAudience().slice(0, 10)
    const message = getMessage()
    const items = audience.map((r) => {
      const phone = ('phone' in r ? r.phone : null) || ('mobile' in r ? r.mobile : null) || ""
      const name = ('patient_name' in r ? r.patient_name : null) || ('lead_name' in r ? r.lead_name : null) || "Patient"
      const filled = fillTemplate(message, r)
      return { name, phone, message: filled, link: generateDeepLink(phone, filled) }
    })
    setPreview(items)
    setShowPreview(true)
  }

  function handleGenerate() {
    const audience = resolveAudience()
    const message = getMessage()
    if (audience.length === 0) { addToast({ title: "No recipients", description: "No matching patients/leads found", variant: "destructive" }); return }
    if (!message.trim()) { addToast({ title: "No message", description: "Select a template or write a custom message", variant: "destructive" }); return }
    const links = audience.map((r) => {
      const phone = ('phone' in r ? r.phone : null) || ('mobile' in r ? r.mobile : null) || ""
      const name = ('patient_name' in r ? r.patient_name : null) || ('lead_name' in r ? r.lead_name : null) || "Patient"
      const filled = fillTemplate(message, r)
      return { name, phone, message: filled, link: generateDeepLink(phone, filled) }
    })
    setGeneratedLinks(links)
    addToast({ title: "Messages generated", description: `${links.length} WhatsApp links created`, variant: "success" })
  }

  function copyAllLinks() {
    const text = generatedLinks.map((l) => `${l.name}: ${l.phone}\n${l.link}`).join("\n\n")
    navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
    addToast({ title: "Copied", description: "All links copied to clipboard", variant: "success" })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="WhatsApp Broadcast" description="Generate WhatsApp messages for bulk communication">
        <Button onClick={handleGenerate} disabled={!getMessage()}>
          <Send className="h-4 w-4 mr-1.5" /> Generate Messages
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Filter className="h-4 w-4 text-primary" /> Select Audience</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={audienceType} onValueChange={(v: AudienceType) => setAudienceType(v)}>
                <SelectTrigger><SelectValue placeholder="Select audience" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_patients">All Patients</SelectItem>
                  <SelectItem value="all_leads">All Leads</SelectItem>
                  <SelectItem value="appointment_tomorrow">Appointment Tomorrow</SelectItem>
                  <SelectItem value="pending_followups">Pending Follow-Ups</SelectItem>
                  <SelectItem value="six_month_recall">6-Month Recall Patients</SelectItem>
                </SelectContent>
              </Select>

              {(audienceType === "all_patients" || audienceType === "appointment_tomorrow") && (
                <div>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search patients..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {filteredPatients.slice(0, 20).map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" className="rounded" />
                        <span className="flex-1">{p.patient_name || "Unknown"}</span>
                        <span className="text-xs text-gray-400">{p.phone || "—"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {audienceType === "all_leads" && (
                <div>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search leads..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {filteredLeads.slice(0, 20).map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" className="rounded" />
                        <span className="flex-1">{l.lead_name}</span>
                        <span className="text-xs text-gray-400">{l.mobile}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400">
                {resolveAudience().length} recipients match this filter
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4 text-primary" /> Message</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                <SelectContent>
                  {allTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <Label>Or write custom message</Label>
                <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={6} placeholder="Type your message here..." />
                <p className="text-xs text-gray-400 mt-1">Use {'{PatientName}'}, {'{HospitalName}'} as placeholders</p>
              </div>
              <Button variant="outline" onClick={handlePreview} disabled={!getMessage()}>
                <ChevronRight className="h-4 w-4 mr-1" /> Preview ({resolveAudience().slice(0, 10).length} samples)
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Audience</span><span className="font-medium">{audienceType.replace(/_/g, " ")}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Recipients</span><span className="font-medium">{resolveAudience().length}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Messages</span><span className="font-medium">{generatedLinks.length || 0}</span></div>
            </CardContent>
          </Card>

          {generatedLinks.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Generated Links</CardTitle>
                <Button size="sm" variant="outline" onClick={copyAllLinks}>
                  {copiedAll ? <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  Copy All
                </Button>
              </CardHeader>
              <CardContent className="max-h-80 overflow-y-auto space-y-2">
                {generatedLinks.slice(0, 50).map((l, i) => (
                  <div key={i} className="rounded-lg border border-gray-100 p-2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-700">{l.name}</span>
                      <a href={l.link} target="_blank" rel="noopener noreferrer" className="text-[#0EA5E9] hover:underline flex items-center gap-0.5">
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-gray-500 truncate">{l.phone}</p>
                    <Button size="sm" variant="ghost" className="h-auto p-0 text-xs text-gray-400 hover:text-gray-600 mt-1"
                      onClick={() => { navigator.clipboard.writeText(l.link); addToast({ title: "Copied", variant: "success" }) }}>
                      <Copy className="h-3 w-3 mr-1" /> Copy link
                    </Button>
                  </div>
                ))}
                {generatedLinks.length > 50 && (
                  <p className="text-xs text-gray-400 text-center pt-2">...and {generatedLinks.length - 50} more</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {showPreview && preview.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Preview ({preview.length} samples)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {preview.map((p, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{p.phone}</span>
                  </div>
                  <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0EA5E9] hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Open
                  </a>
                </div>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{p.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
