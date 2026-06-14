import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import {
  CalendarDays, CheckCircle, XCircle, Loader2, Plus, Trash2, PhoneCall, MessageCircle,
  MessageSquare, Send, ExternalLink, Clock, AlertTriangle, Filter, Search, User, FileText, Tag, Activity
} from "lucide-react"
import { crmApi, patientsApi } from "@/services/endpoints"
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

import { casesApi } from "@/services/endpoints"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-50 text-blue-700",
  PENDING: "bg-yellow-50 text-yellow-700",
  CONTACTED: "bg-purple-50 text-purple-700",
  RESPONDED: "bg-green-50 text-green-700",
  APPOINTMENT_BOOKED: "bg-indigo-50 text-indigo-700",
  COMPLETED: "bg-green-50 text-green-700",
  NO_RESPONSE: "bg-red-50 text-red-700",
  MISSED: "bg-red-50 text-red-600",
  CANCELLED: "bg-gray-50 text-gray-500",
}

const typeLabels: Record<string, string> = {
  "1_DAY_POST_TREATMENT": "1-Day Post Treatment",
  "6_MONTH_RECALL": "6-Month Recall",
  MANUAL: "Manual",
}

const ONE_DAY_TEMPLATE = `Hello {{patient_name}},

We hope you are recovering well after your recent treatment.

Please let us know if you have any discomfort or concerns.

Regards,
{{hospital_name}}`

const SIX_MONTH_TEMPLATE = `Hello {{patient_name}},

It has been 6 months since your treatment.

We recommend scheduling a routine dental check-up.

Please contact us to book an appointment.

Regards,
{{hospital_name}}`

const filterOptions = [
  { value: "", label: "All" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "overdue", label: "Overdue" },
  { value: "one_day", label: "1-Day Follow-Up" },
  { value: "six_month", label: "6-Month Recall" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
]

export default function FollowUps() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [searchParams] = useSearchParams()
  const initialPatient = searchParams.get("patient") || ""

  const [open, setOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [notes, setNotes] = useState("")
  const [activeFilter, setActiveFilter] = useState("today")
  const [communicateOpen, setCommunicateOpen] = useState<string | null>(null)
  const [commChannel, setCommChannel] = useState("WHATSAPP")
  const [commMessage, setCommMessage] = useState("")
  const [commNotes, setCommNotes] = useState("")
  const [responseOpen, setResponseOpen] = useState<string | null>(null)
  const [respMsg, setRespMsg] = useState("")
  const [respStatus, setRespStatus] = useState("POSITIVE")
  const [convertToCase, setConvertToCase] = useState("no")
  const [chiefComplaint, setChiefComplaint] = useState("")
  const [doctorId, setDoctorId] = useState("")

  const { data: followUps, isLoading } = useQuery({
    queryKey: ["crm", "follow-ups-filtered", activeFilter],
    queryFn: () => crmApi.followUpsFiltered({ filter: activeFilter || undefined }),
  })

  const { data: patients } = useQuery({
    queryKey: ["patients", "follow-ups"],
    queryFn: () => patientsApi.list({ page_size: 200 }),
  })
  const patientList: any[] = patients?.items || patients || []
  const items: any[] = followUps || []

  const createMutation = useMutation({
    mutationFn: async () => {
      let caseId: string | undefined
      if (convertToCase === "yes") {
        const caseData = {
          patient_id: selectedPatient,
          doctor_id: doctorId || undefined,
          chief_complaint: chiefComplaint || "Follow-up enquiry converting to case",
        }
        const newCase = await casesApi.create(caseData)
        caseId = newCase.id
      }
      return crmApi.followUps.create({
        patient_id: selectedPatient,
        follow_up_date: followUpDate,
        notes,
        doctor_id: doctorId || undefined,
        case_id: caseId,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      queryClient.invalidateQueries({ queryKey: ["cases"] })
      addToast({ title: "Created", description: "Follow-up scheduled", variant: "success" })
      setOpen(false); setSelectedPatient(""); setFollowUpDate(""); setNotes("")
      setConvertToCase("no"); setChiefComplaint(""); setDoctorId("")
    },
    onError: (err: any) =>
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to create follow-up", variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crmApi.followUps.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Deleted", description: "Follow-up deleted", variant: "success" })
    },
  })

  const markDoneMutation = useMutation({
    mutationFn: (id: string) => crmApi.markDone(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Done", description: "Follow-up marked completed", variant: "success" })
    },
  })

  const communicateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { channel: string; message: string; notes?: string } }) =>
      crmApi.communicate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Sent", description: "Communication logged", variant: "success" })
      setCommunicateOpen(null); setCommMessage(""); setCommNotes("")
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const recordRespMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { response_message?: string; response_status: string } }) =>
      crmApi.recordResponse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm"] })
      addToast({ title: "Recorded", description: "Response saved", variant: "success" })
      setResponseOpen(null); setRespMsg("")
    },
  })

  function applyTemplate() {
    if (!communicateOpen) return
    const fu = items.find((f: any) => f.id === communicateOpen)
    if (!fu) return
    const hospitalName = "";
    const patientName = fu.patient_name || "Patient";
    if (fu.follow_up_type === "1_DAY_POST_TREATMENT") {
      setCommMessage(ONE_DAY_TEMPLATE.replace(/\{\{patient_name\}\}/g, patientName).replace(/\{\{hospital_name\}\}/g, hospitalName))
    } else if (fu.follow_up_type === "6_MONTH_RECALL") {
      setCommMessage(SIX_MONTH_TEMPLATE.replace(/\{\{patient_name\}\}/g, patientName).replace(/\{\{hospital_name\}\}/g, hospitalName))
    }
  }

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="Follow-Ups" description="Manage patient follow-ups & communications">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Follow-Up</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Schedule Follow-Up</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                  <SelectTrigger><SelectValue placeholder="Select patient..." /></SelectTrigger>
                  <SelectContent>
                    {patientList.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Follow-Up Date</Label>
                <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm" />
              </div>

              <div className="rounded-lg border border-gray-200 p-4 space-y-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold">Convert enquiry to a case?</Label>
                </div>
                <Select value={convertToCase} onValueChange={setConvertToCase}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No, just a follow-up</SelectItem>
                    <SelectItem value="yes">Yes, convert to case</SelectItem>
                  </SelectContent>
                </Select>

                {convertToCase === "yes" && (
                  <div className="space-y-3 pt-3 border-t border-gray-200 mt-2">
                    <div className="space-y-2">
                      <Label>Chief Complaint *</Label>
                      <Textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)}
                        rows={2} placeholder="e.g. Tooth pain, root canal required" />
                    </div>
                    <div className="space-y-2">
                      <Label>Assign Doctor</Label>
                      <Input value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
                        placeholder="Doctor ID (optional)" />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
              </div>
              <Button className="w-full gap-2" onClick={() => createMutation.mutate()} disabled={!selectedPatient || !followUpDate || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {convertToCase === "yes" ? "Create Case & Schedule Follow-Up" : "Schedule"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {filterOptions.map((f) => (
          <Button key={f.value} variant={activeFilter === f.value ? "default" : "outline"} size="sm"
            onClick={() => setActiveFilter(f.value)} className="text-xs">
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            {filterOptions.find(f => f.value === activeFilter)?.label || "All"} Follow-Ups
            <Badge className="ml-2">{items.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No follow-ups found</div>
          ) : (
            <div className="space-y-2">
              {items.map((f: any) => (
                <FollowUpCard key={f.id} f={f}
                  statusColors={statusColors} typeLabels={typeLabels}
                  onDelete={(id) => { if (confirm("Delete?")) deleteMutation.mutate(id) }}
                  onMarkDone={(id) => markDoneMutation.mutate(id)}
                  onCommunicate={(id) => setCommunicateOpen(id)}
                  onRecordResponse={(id) => setResponseOpen(id)}
                  isDeleting={deleteMutation.isPending}
                  isCompleting={markDoneMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Communicate Dialog */}
      <Dialog open={!!communicateOpen} onOpenChange={(o) => { if (!o) setCommunicateOpen(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={commChannel} onValueChange={setCommChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="CALL">Phone Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {commChannel === "WHATSAPP" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Message</Label>
                  <Button variant="ghost" size="sm" className="text-xs text-blue-600" onClick={applyTemplate}>
                    Use Template
                  </Button>
                </div>
                <Textarea value={commMessage} onChange={(e) => setCommMessage(e.target.value)} rows={5}
                  placeholder="Enter WhatsApp message..." />
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={commNotes} onChange={(e) => setCommNotes(e.target.value)}
                placeholder={commChannel === "CALL" ? "Call notes..." : "Optional notes..."} />
            </div>
            <Button className="w-full gap-2" onClick={() => {
              if (communicateOpen) communicateMutation.mutate({
                id: communicateOpen,
                data: { channel: commChannel, message: commMessage || "Patient contacted", notes: commNotes || undefined }
              })
            }} disabled={communicateMutation.isPending}>
              {communicateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" /> Log Communication
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Response Dialog */}
      <Dialog open={!!responseOpen} onOpenChange={(o) => { if (!o) setResponseOpen(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Record Patient Response</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Response Status</Label>
              <Select value={respStatus} onValueChange={setRespStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POSITIVE">Positive</SelectItem>
                  <SelectItem value="NEEDS_ATTENTION">Needs Attention</SelectItem>
                  <SelectItem value="COMPLAINT">Complaint</SelectItem>
                  <SelectItem value="EMERGENCY">Emergency</SelectItem>
                  <SelectItem value="NO_RESPONSE">No Response</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Patient Message</Label>
              <Textarea value={respMsg} onChange={(e) => setRespMsg(e.target.value)} rows={3}
                placeholder='e.g. "Feeling good", "Still swelling", "Need consultation"' />
            </div>
            <Button className="w-full gap-2" onClick={() => {
              if (responseOpen) recordRespMutation.mutate({
                id: responseOpen,
                data: { response_message: respMsg || undefined, response_status: respStatus }
              })
            }} disabled={recordRespMutation.isPending}>
              {recordRespMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Response
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function FollowUpCard({ f, statusColors, typeLabels, onDelete, onMarkDone, onCommunicate, onRecordResponse, isDeleting, isCompleting }: {
  f: any; statusColors: Record<string, string>; typeLabels: Record<string, string>;
  onDelete: (id: string) => void; onMarkDone: (id: string) => void;
  onCommunicate: (id: string) => void; onRecordResponse: (id: string) => void;
  isDeleting: boolean; isCompleting: boolean;
}) {
  const canAct = !["COMPLETED", "CANCELLED", "MISSED"].includes(f.status)
  return (
    <div className="rounded-lg border p-4 transition-colors hover:bg-gray-50">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{f.patient_name || `Patient #${f.patient_id?.slice(-6)}`}</span>
            {f.patient_id && <span className="text-[10px] text-gray-400 font-mono">#{f.patient_id.slice(-8)}</span>}
            {f.follow_up_type && (
              <Badge className="text-xs bg-gray-50 text-gray-600">{typeLabels[f.follow_up_type] || f.follow_up_type}</Badge>
            )}
            {f.case_id && (
              <Badge className="text-xs bg-amber-50 text-amber-700 border border-amber-200">Case</Badge>
            )}
            <Badge className={`text-xs ${statusColors[f.status] || "bg-gray-50 text-gray-600"}`}>{f.status}</Badge>
            <span className="ml-auto text-xs text-gray-400">
              {f.follow_up_date ? new Date(f.follow_up_date).toLocaleDateString() : ""}
              {f.follow_up_time ? ` ${f.follow_up_time}` : ""}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {f.patient_phone && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <PhoneCall className="h-3 w-3" /> {f.patient_phone}
              </div>
            )}
            {f.doctor_name && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Activity className="h-3 w-3" /> Dr. {f.doctor_name}
              </div>
            )}
            {f.treatment_name && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <FileText className="h-3 w-3" /> {f.treatment_name}
              </div>
            )}
            {f.invoice_number && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Tag className="h-3 w-3" /> {f.invoice_number}
              </div>
            )}
          </div>
          {f.notes && <p className="mt-1 text-sm text-gray-600">{f.notes}</p>}
          {f.whatsapp_sent_at && <p className="mt-1 text-xs text-green-600">WhatsApp sent {new Date(f.whatsapp_sent_at).toLocaleString()}</p>}
          {f.call_made_at && <p className="mt-1 text-xs text-blue-600">Call made {new Date(f.call_made_at).toLocaleString()}</p>}
          {f.completed_date && <p className="mt-1 text-xs text-gray-400">Completed: {new Date(f.completed_date).toLocaleString()}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canAct && (
            <>
              <Button variant="ghost" size="icon-sm" className="text-green-600" title="WhatsApp"
                onClick={(e) => { e.stopPropagation(); onCommunicate(f.id) }}>
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="text-blue-600" title="Call"
                onClick={(e) => { e.stopPropagation(); communicateCall(f) }}>
                <PhoneCall className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="text-purple-600" title="Record Response"
                onClick={(e) => { e.stopPropagation(); onRecordResponse(f.id) }}>
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="text-green-600" title="Mark Done"
                onClick={(e) => { e.stopPropagation(); onMarkDone(f.id) }}
                disabled={isCompleting}>
                <CheckCircle className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-sm" className="text-red-600" title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(f.id) }} disabled={isDeleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function communicateCall(f: any) {
  if (f.patient_phone) {
    window.open(`tel:${f.patient_phone}`, "_blank")
  }
}
