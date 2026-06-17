import { useState, useCallback } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format, differenceInDays } from "date-fns"
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, IndianRupee, Activity,
  MessageSquare, PhoneCall, Edit3, Trash2, Star, Target, Clock,
  CheckCircle2, XCircle, AlertTriangle, Plus, ChevronRight, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { leadsApi, doctorsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/store/authStore"
import type { Lead, LeadCall, LeadCommunication, LeadCallOutcome } from "@/types"

const statusStyles: Record<string, string> = {
  NEW: "bg-blue-600 text-white",
  CONTACTED: "bg-orange-500 text-white",
  INTERESTED: "bg-green-600 text-white",
  FOLLOW_UP_REQUIRED: "bg-amber-500 text-white",
  APPOINTMENT_BOOKED: "bg-purple-600 text-white",
  VISITED: "bg-teal-600 text-white",
  CONVERTED: "bg-emerald-600 text-white",
  LOST: "bg-red-600 text-white",
  NOT_INTERESTED: "bg-gray-500 text-white",
  NO_RESPONSE: "bg-slate-500 text-white",
}

const priorityStyles: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-green-50 text-green-700 border-green-200",
}

const statusOptions = [
  "NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_BOOKED",
  "VISITED", "CONVERTED", "LOST", "NOT_INTERESTED", "NO_RESPONSE",
] as const

const callOutcomes: LeadCallOutcome[] = [
  "INTERESTED", "NOT_INTERESTED", "NO_ANSWER", "BUSY", "CALL_BACK_LATER", "APPOINTMENT_REQUESTED", "CONVERTED",
]

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState("overview")

  const [editOpen, setEditOpen] = useState(false)
  const [callOutcomeOpen, setCallOutcomeOpen] = useState(false)
  const [commOpen, setCommOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [apptOpen, setApptOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [leadName, setLeadName] = useState("")
  const [mobile, setMobile] = useState("")
  const [email, setEmail] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("")
  const [city, setCity] = useState("")
  const [source, setSource] = useState("")
  const [interestedTreatment, setInterestedTreatment] = useState("")
  const [budget, setBudget] = useState("")
  const [preferredVisitDate, setPreferredVisitDate] = useState("")
  const [notes, setNotes] = useState("")
  const [leadScore, setLeadScore] = useState("")
  const [priority, setPriority] = useState("")

  const [callOutcome, setCallOutcome] = useState("")
  const [callNotes, setCallNotes] = useState("")
  const [callFollowUp, setCallFollowUp] = useState("")
  const [callDuration, setCallDuration] = useState("")

  const [commChannel, setCommChannel] = useState("WHATSAPP")
  const [commMessage, setCommMessage] = useState("")

  const [fuDate, setFuDate] = useState("")
  const [fuTime, setFuTime] = useState("")
  const [fuReason, setFuReason] = useState("")
  const [fuNotes, setFuNotes] = useState("")

  const [apptDate, setApptDate] = useState("")
  const [apptTime, setApptTime] = useState("")
  const [apptDoctor, setApptDoctor] = useState("")
  const [apptNotes, setApptNotes] = useState("")

  const [convertPatientName, setConvertPatientName] = useState("")
  const [convertAge, setConvertAge] = useState("")
  const [convertGender, setConvertGender] = useState("")
  const [convertPhone, setConvertPhone] = useState("")
  const [convertEmail, setConvertEmail] = useState("")
  const [convertCity, setConvertCity] = useState("")
  const [convertNotes, setConvertNotes] = useState("")

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => leadsApi.get(id!),
    enabled: !!id,
  })

  const { data: calls } = useQuery({
    queryKey: ["lead-calls", id],
    queryFn: () => leadsApi.getCalls(id!),
    enabled: !!id,
  })

  const { data: communications } = useQuery({
    queryKey: ["lead-communications", id],
    queryFn: () => leadsApi.getCommunications(id!),
    enabled: !!id,
  })

  const { data: followUps } = useQuery({
    queryKey: ["lead-followups", id],
    queryFn: () => leadsApi.getFollowUps(id!),
    enabled: !!id,
  })

  const currentUser = useAuthStore((s) => s.user)
  const { data: doctorsData } = useQuery({
    queryKey: ["doctors", "leads-dropdown", currentUser?.admin_group_id],
    queryFn: () => doctorsApi.list({ page_size: 200, admin_group_id: currentUser?.admin_group_id || undefined }),
    enabled: !!currentUser,
  })
  const doctors: any[] = Array.isArray(doctorsData) ? doctorsData : doctorsData?.items || []

  const statusMutation = useMutation({
    mutationFn: (status: string) => leadsApi.updateStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      addToast({ title: "Status updated", variant: "success" })
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => leadsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      addToast({ title: "Updated", variant: "success" })
      setEditOpen(false)
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.delete(id!),
    onSuccess: () => {
      addToast({ title: "Lead deleted", variant: "success" })
      navigate("/leads?" + searchParams.toString())
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to delete lead", variant: "destructive" }),
  })

  const callMutation = useMutation({
    mutationFn: (data: any) => leadsApi.addCall(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-calls", id] })
      addToast({ title: "Call recorded", variant: "success" })
      setCallOutcomeOpen(false); setCallOutcome(""); setCallNotes(""); setCallFollowUp(""); setCallDuration("")
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const commMutation = useMutation({
    mutationFn: (data: any) => leadsApi.addCommunication(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-communications", id] })
      addToast({ title: "Message sent", variant: "success" })
      setCommOpen(false); setCommMessage("")
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const followUpMutation = useMutation({
    mutationFn: (data: any) => leadsApi.createFollowUp(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-followups", id] })
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      addToast({ title: "Follow-up scheduled", variant: "success" })
      setFollowUpOpen(false); setFuDate(""); setFuTime(""); setFuReason(""); setFuNotes("")
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const apptMutation = useMutation({
    mutationFn: (data: any) => leadsApi.bookAppointment(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      addToast({ title: "Appointment booked", variant: "success" })
      setApptOpen(false); setApptDate(""); setApptTime(""); setApptDoctor(""); setApptNotes("")
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const convertMutation = useMutation({
    mutationFn: (data: any) => leadsApi.convert(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      addToast({ title: "Lead converted", variant: "success" })
      setConvertOpen(false)
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Conversion failed", variant: "destructive" }),
  })

  const cycleStatus = useCallback(() => {
    if (!lead) return
    const idx = statusOptions.indexOf(lead.status as typeof statusOptions[number])
    if (idx < 0 || idx >= statusOptions.length - 1) return
    const next = statusOptions[idx + 1]
    if (next === "CONVERTED") {
      openConvert(lead)
      return
    }
    statusMutation.mutate(next)
  }, [lead, statusMutation])

  function openEdit(l: Lead) {
    setLeadName(l.lead_name); setMobile(l.mobile); setEmail(l.email || "")
    setAge(l.age?.toString() || ""); setGender(l.gender || ""); setCity(l.city || "")
    setSource(l.source); setInterestedTreatment(l.interested_treatment || "")
    setBudget(l.budget?.toString() || ""); setPreferredVisitDate(l.preferred_visit_date || "")
    setNotes(l.notes || ""); setLeadScore(l.lead_score?.toString() || ""); setPriority(l.priority || "")
    setEditOpen(true)
  }

  function handleUpdate() {
    updateMutation.mutate({
      lead_name: leadName, mobile, email: email || undefined,
      age: age ? parseInt(age) : undefined, gender: gender || undefined,
      city: city || undefined, source, interested_treatment: interestedTreatment || undefined,
      budget: budget ? parseFloat(budget) : undefined,
      preferred_visit_date: preferredVisitDate || undefined, notes: notes || undefined,
      lead_score: leadScore ? parseInt(leadScore) : undefined, priority: priority || undefined,
    })
  }

  function openConvert(l: Lead) {
    setConvertPatientName(l.lead_name); setConvertAge(l.age?.toString() || "")
    setConvertGender(l.gender || ""); setConvertPhone(l.mobile); setConvertEmail(l.email || "")
    setConvertCity(l.city || ""); setConvertNotes(""); setConvertOpen(true)
  }

  function handleCall() {
    if (lead?.mobile) {
      window.location.href = `tel:${lead.mobile}`
    }
    setTimeout(() => setCallOutcomeOpen(true), 500)
  }

  const callItems: LeadCall[] = Array.isArray(calls) ? calls : []
  const commItems: LeadCommunication[] = Array.isArray(communications) ? communications : []
  const fuItems: any[] = Array.isArray(followUps) ? followUps : []

  if (isLoading) return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  )
  if (!lead) return <div className="p-4 text-gray-500">Lead not found</div>

  const daysSinceCreated = differenceInDays(new Date(), new Date(lead.created_at))
  const conversionProbability = lead.lead_score != null ? `${Math.min(lead.lead_score + 10, 95)}%` : "—"
  const timelineItems = [
    { type: "created", label: "Lead created", date: lead.created_at, color: "bg-blue-500" },
    ...callItems.map((c) => ({ type: "call", label: `Call: ${c.outcome?.replace(/_/g, " ") || "Unknown"}`, date: c.created_at, color: "bg-purple-500" })),
    ...commItems.map((c) => ({ type: "comm", label: `Message sent via ${c.channel}`, date: c.created_at, color: "bg-green-500" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
        <button onClick={() => navigate("/leads?" + searchParams.toString())} className="flex items-center gap-1 hover:text-[#0EA5E9] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Leads
        </button>
        <ChevronRight className="h-3 w-3 text-gray-300" />
        <span className="text-gray-700 font-medium truncate">{lead.lead_name}</span>
      </div>

      <Card className="sticky top-0 z-10 shadow-sm border-gray-200">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-gray-900">{lead.lead_name}</h1>
                  <span className="text-xs text-gray-400 font-mono">#{lead.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.mobile}</span>
                  <span>{lead.source?.replace(/_/g, " ")}</span>
                  {lead.assigned_staff_id && <span>Staff: {lead.assigned_staff_id.slice(0, 8)}</span>}
                  <span>Created: {format(new Date(lead.created_at), "dd MMM yyyy")}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button onClick={handleCall} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium bg-[#0EA5E9] text-white hover:bg-[#0284C7] transition-colors">
                <Phone className="h-3.5 w-3.5" /> Call
              </button>
              {lead.mobile && (
                <a href={`https://wa.me/${lead.mobile.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                  `Hi ${lead.lead_name},\n\nThank you for your interest in our dental services. How can we help you today?\n\nRegards,\nOur Clinic`
                )}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors">
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </a>
              )}
              <Button size="sm" variant="outline" onClick={() => { setApptOpen(true); setActiveTab("appointments") }}>
                <Calendar className="h-3.5 w-3.5 mr-1" /> Appointment
              </Button>
                {lead.status !== "CONVERTED" && lead.status !== "LOST" && lead.status !== "NOT_INTERESTED" && lead.status !== "NO_RESPONSE" && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openConvert(lead)}>
                    <Target className="h-3.5 w-3.5 mr-1" /> Convert
                  </Button>
                )}
              <Button size="sm" variant="outline" onClick={() => openEdit(lead)}>
                <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Lead Score</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#0EA5E9] rounded-full" style={{ width: `${Math.min((lead.lead_score ?? 0), 100)}%` }} />
              </div>
              <span className="text-sm font-bold text-gray-800">{lead.lead_score ?? 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Days Since Created</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{daysSinceCreated}d</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Last Contacted</p>
            <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">
              {lead.last_contacted_at ? format(new Date(lead.last_contacted_at), "dd MMM") : "Never"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Next Follow-up</p>
            <p className={`text-sm font-medium mt-0.5 truncate ${lead.next_follow_up_date && new Date(lead.next_follow_up_date) < new Date() ? "text-red-600" : "text-gray-800"}`}>
              {lead.next_follow_up_date ? format(new Date(lead.next_follow_up_date), "dd MMM") : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Expected Revenue</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5">{lead.budget ? `\u20B9${lead.budget.toLocaleString()}` : "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Conversion Prob.</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{conversionProbability}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start border-b border-gray-200 rounded-none bg-transparent p-0 h-auto space-x-1">
          {["overview", "communication", "follow-ups", "appointments", "timeline", "conversion"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#0EA5E9] data-[state=active]:text-[#0EA5E9] px-4 py-2.5 text-sm font-medium capitalize bg-transparent data-[state=active]:bg-transparent"
            >
              {tab.replace("-", " ")}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-800">Contact Information</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Status:</span>
                      <button
                        onClick={cycleStatus}
                        disabled={lead.status === "CONVERTED" || lead.status === "LOST"}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${statusStyles[lead.status] || "bg-gray-100 text-gray-700"} ${lead.status !== "CONVERTED" && lead.status !== "LOST" ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                        title="Click to advance to next status"
                      >
                        {lead.status.replace(/_/g, " ")}
                        {(lead.status !== "CONVERTED" && lead.status !== "LOST") && <ChevronRight className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-[11px] text-gray-400 font-medium">Phone</Label>
                      <p className="flex items-center gap-1.5 mt-0.5"><Phone className="h-3.5 w-3.5 text-gray-400" /> {lead.mobile}</p>
                      {lead.alternate_mobile && <p className="flex items-center gap-1.5 text-gray-500 mt-0.5"><Phone className="h-3.5 w-3.5" /> {lead.alternate_mobile}</p>}
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-400 font-medium">Email</Label>
                      <p className="flex items-center gap-1.5 mt-0.5"><Mail className="h-3.5 w-3.5 text-gray-400" /> {lead.email || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-400 font-medium">Age / Gender</Label>
                      <p className="flex items-center gap-1.5 mt-0.5"><span className="h-3.5 w-3.5 inline-flex items-center justify-center text-gray-400">#</span> {lead.age ? `${lead.age} yrs` : "—"} {lead.gender ? `/ ${lead.gender}` : ""}</p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-400 font-medium">City</Label>
                      <p className="flex items-center gap-1.5 mt-0.5"><MapPin className="h-3.5 w-3.5 text-gray-400" /> {lead.city || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-400 font-medium">Interested Treatment</Label>
                      <p className="flex items-center gap-1.5 mt-0.5"><Activity className="h-3.5 w-3.5 text-gray-400" /> {lead.interested_treatment || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-400 font-medium">Budget</Label>
                      <p className="flex items-center gap-1.5 mt-0.5"><IndianRupee className="h-3.5 w-3.5 text-gray-400" /> {lead.budget ? `\u20B9${lead.budget.toLocaleString()}` : "—"}</p>
                    </div>
                    {lead.preferred_visit_date && (
                      <div>
                        <Label className="text-[11px] text-gray-400 font-medium">Preferred Visit</Label>
                        <p className="flex items-center gap-1.5 mt-0.5"><Calendar className="h-3.5 w-3.5 text-gray-400" /> {format(new Date(lead.preferred_visit_date), "dd MMM yyyy")}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-[11px] text-gray-400 font-medium">Priority</Label>
                      <div className="mt-0.5">
                        {lead.priority ? (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${priorityStyles[lead.priority] || priorityStyles.MEDIUM}`}>
                            <Star className="h-3 w-3" fill={lead.priority === "HIGH" ? "currentColor" : "none"} />
                            {lead.priority}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </div>
                    </div>
                  </div>
                  {lead.notes && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <Label className="text-[11px] text-gray-400 font-medium">Notes</Label>
                      <p className="text-gray-600 whitespace-pre-wrap text-sm mt-0.5">{lead.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-gray-200">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Lead Details</h3>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[12px]">Source</span>
                      <span className="text-gray-700 text-[12px] font-medium">{lead.source?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[12px]">Priority</span>
                      {lead.priority ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border ${priorityStyles[lead.priority] || priorityStyles.MEDIUM}`}>
                          <Star className="h-2.5 w-2.5" fill={lead.priority === "HIGH" ? "currentColor" : "none"} />
                          {lead.priority}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[12px]">Lead Score</span>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0EA5E9] rounded-full" style={{ width: `${Math.min((lead.lead_score ?? 0), 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700">{lead.lead_score ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[12px]">Last Contacted</span>
                      <span className="text-[12px] text-gray-700">{lead.last_contacted_at ? format(new Date(lead.last_contacted_at), "dd MMM hh:mm a") : "—"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[12px]">Next Follow-up</span>
                      <span className={`text-[12px] ${lead.next_follow_up_date && new Date(lead.next_follow_up_date) < new Date() ? "text-red-600 font-medium" : "text-gray-700"}`}>
                        {lead.next_follow_up_date ? format(new Date(lead.next_follow_up_date), "dd MMM yyyy") : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-[12px]">Created</span>
                      <span className="text-[12px] text-gray-700">{format(new Date(lead.created_at), "dd MMM yyyy")}</span>
                    </div>
                    {lead.assigned_staff_id && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-[12px]">Assigned Staff</span>
                        <span className="text-[12px] text-gray-700 font-mono">{lead.assigned_staff_id.slice(0, 8)}</span>
                      </div>
                    )}
                    {lead.assigned_doctor_id && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-[12px]">Assigned Doctor</span>
                        <span className="text-[12px] text-gray-700 font-mono">{lead.assigned_doctor_id.slice(0, 8)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 border-gray-300" onClick={handleCall}>
                  <PhoneCall className="h-3.5 w-3.5 mr-1" /> Log Call
                </Button>
                <Button size="sm" variant="outline" className="flex-1 border-gray-300" onClick={() => { setCommOpen(true); setActiveTab("communication") }}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1" /> Message
                </Button>
              </div>
              <Button size="sm" variant="outline" className="w-full border-gray-300" onClick={() => { setFollowUpOpen(true); setActiveTab("follow-ups") }}>
                <Calendar className="h-3.5 w-3.5 mr-1" /> Schedule Follow-up
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="communication" className="space-y-4">
          <Card className="border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Communications</h3>
              <Button size="sm" variant="outline" onClick={() => setCommOpen(true)}>
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> Send Message
              </Button>
            </div>
            <CardContent className="p-4">
              {commItems.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">No communications yet</p>
              ) : (
                <div className="space-y-2">
                  {commItems.map((c) => (
                    <div key={c.id} className="rounded-lg border border-gray-100 p-3 text-sm bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${c.channel === "WHATSAPP" ? "bg-green-50 text-green-700" : c.channel === "SMS" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>{c.channel}</span>
                        <span className="text-[11px] text-gray-400">{format(new Date(c.created_at), "dd MMM hh:mm a")}</span>
                      </div>
                      <p className="text-gray-700 text-[13px]">{c.message}</p>
                      {c.status && <p className="text-[11px] text-gray-400 mt-1">Status: {c.status}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="follow-ups" className="space-y-4">
          <Card className="border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Follow-Ups</h3>
              <Button size="sm" variant="outline" onClick={() => setFollowUpOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Schedule Follow-up
              </Button>
            </div>
            <CardContent className="p-4">
              {fuItems.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">No follow-ups scheduled</p>
              ) : (
                <div className="space-y-2">
                  {fuItems.map((fu: any) => (
                    <div key={fu.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 text-sm bg-white">
                      <div className="flex items-center gap-3">
                        {fu.status === "COMPLETED" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        ) : fu.status === "MISSED" ? (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-gray-700 text-[13px]">{fu.follow_up_date ? format(new Date(fu.follow_up_date), "dd MMM yyyy") : "—"}{fu.follow_up_time ? ` at ${fu.follow_up_time.slice(0, 5)}` : ""}</p>
                          {fu.notes && <p className="text-[12px] text-gray-500">{fu.notes}</p>}
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">{fu.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-4">
          <Card className="border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Appointments</h3>
              <Button size="sm" variant="outline" onClick={() => setApptOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Book Appointment
              </Button>
            </div>
            <CardContent className="p-4">
              {lead.status !== "APPOINTMENT_BOOKED" && lead.status !== "VISITED" ? (
                <p className="text-xs text-gray-400 py-8 text-center">No appointments booked yet</p>
              ) : (
                <p className="text-xs text-gray-500 py-4">Appointment booked for this lead.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-gray-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800">Call Log</h3>
                  <Button size="sm" variant="outline" onClick={() => setCallOutcomeOpen(true)}>
                    <PhoneCall className="h-3.5 w-3.5 mr-1" /> Log Call
                  </Button>
                </div>
                <CardContent className="p-4">
                  {callItems.length === 0 ? (
                    <p className="text-xs text-gray-400 py-8 text-center">No calls logged yet</p>
                  ) : (
                    <div className="space-y-2">
                      {callItems.map((c) => (
                        <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 text-sm bg-white">
                          <div>
                            <div className="flex items-center gap-2">
                              <PhoneCall className="h-3.5 w-3.5 text-gray-400" />
                              <span className="font-medium text-gray-700 text-[13px]">{c.outcome?.replace(/_/g, " ") || "Unknown"}</span>
                              {c.duration_seconds && <span className="text-[11px] text-gray-400">({Math.floor(c.duration_seconds / 60)}m {c.duration_seconds % 60}s)</span>}
                            </div>
                            {c.notes && <p className="text-gray-500 text-[12px] mt-0.5 ml-6">{c.notes}</p>}
                          </div>
                          <span className="text-[11px] text-gray-400">{format(new Date(c.created_at), "dd MMM hh:mm a")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-gray-200">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800">Activity Timeline</h3>
                </div>
                <CardContent className="p-4">
                  {timelineItems.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No activity yet</p>
                  ) : (
                    <div className="space-y-0">
                      {timelineItems.map((item, i) => (
                        <div key={`${item.type}-${i}`} className="flex gap-3 text-sm">
                          <div className="flex flex-col items-center">
                            <div className={`h-2 w-2 rounded-full ${item.color} shrink-0`} />
                            {i < timelineItems.length - 1 && <div className="w-px flex-1 bg-gray-200 min-h-[24px]" />}
                          </div>
                          <div className="pb-4">
                            <p className="font-medium text-gray-700 text-[13px]">{item.label}</p>
                            <p className="text-[11px] text-gray-400">{format(new Date(item.date), "dd MMM yyyy hh:mm a")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="conversion" className="space-y-4">
          {lead.status === "CONVERTED" ? (
            <Card className="border-gray-200">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-1">Lead Converted</h3>
                <p className="text-sm text-gray-500 mb-4">
                  This lead was converted to patient {lead.converted_patient_id ? `#${lead.converted_patient_id.slice(-6).toUpperCase()}` : ""}
                </p>
                {lead.converted_patient_id && (
                  <Button onClick={() => navigate(`/patients/${lead.converted_patient_id}`)}>
                    <Users className="h-4 w-4 mr-1.5" /> View Patient
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : lead.status === "LOST" || lead.status === "NOT_INTERESTED" || lead.status === "NO_RESPONSE" ? (
            <Card className="border-gray-200">
              <CardContent className="py-8 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-1">Lead Inactive</h3>
                <p className="text-sm text-gray-500">This lead was marked as {lead.status.replace(/_/g, " ").toLowerCase()}.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800">Convert to Patient</h3>
              </div>
              <CardContent className="p-4 space-y-4">
                <p className="text-sm text-gray-500">Converting this lead will create a new patient record and case.</p>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openConvert(lead)}>
                  <Target className="h-4 w-4 mr-1.5" /> Convert Now
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2"><Label>Name</Label><Input value={leadName} onChange={(e) => setLeadName(e.target.value)} /></div>
            <div><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
            <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Age</Label><Input type="number" value={age} onChange={(e) => setAge(e.target.value)} /></div>
            <div><Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div><Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["GOOGLE_SEARCH","GOOGLE_MAPS","INSTAGRAM","FACEBOOK","WHATSAPP","WEBSITE","WALK_IN","REFERRAL","DOCTOR_REFERRAL","CLINIC_REFERRAL","CAMPAIGN","ADVERTISEMENT","BANNER","NEWSPAPER","YOUTUBE","EVENT","OTHER"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Interested Treatment</Label><Input value={interestedTreatment} onChange={(e) => setInterestedTreatment(e.target.value)} /></div>
            <div><Label>Budget</Label><Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
            <div><Label>Lead Score</Label><Input type="number" min="0" max="100" value={leadScore} onChange={(e) => setLeadScore(e.target.value)} /></div>
            <div><Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Preferred Visit Date</Label><Input type="date" value={preferredVisitDate} onChange={(e) => setPreferredVisitDate(e.target.value)} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={callOutcomeOpen} onOpenChange={setCallOutcomeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Call Outcome</DialogTitle>
            <DialogDescription>How did the call go? Select an outcome below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Outcome *</Label>
              <Select value={callOutcome} onValueChange={setCallOutcome}>
                <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                <SelectContent>
                  {callOutcomes.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Duration (seconds)</Label><Input type="number" value={callDuration} onChange={(e) => setCallDuration(e.target.value)} placeholder="e.g. 120" /></div>
            <div><Label>Follow-up Date</Label><Input type="date" value={callFollowUp} onChange={(e) => setCallFollowUp(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} rows={3} placeholder="Call notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallOutcomeOpen(false)}>Skip</Button>
            <Button onClick={() => callMutation.mutate({ outcome: callOutcome, notes: callNotes || undefined, follow_up_date: callFollowUp || undefined, duration_seconds: callDuration ? parseInt(callDuration) : undefined })} disabled={callMutation.isPending || !callOutcome}>
              {callMutation.isPending ? "Saving..." : "Save Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={commOpen} onOpenChange={setCommOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Message</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Channel</Label>
              <Select value={commChannel} onValueChange={setCommChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Message</Label><Textarea value={commMessage} onChange={(e) => setCommMessage(e.target.value)} rows={4} placeholder="Type your message..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommOpen(false)}>Cancel</Button>
            <Button onClick={() => commMutation.mutate({ channel: commChannel, message: commMessage })} disabled={commMutation.isPending || !commMessage.trim()}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Follow-up</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Date *</Label><Input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} /></div>
            <div><Label>Time</Label><Input type="time" value={fuTime} onChange={(e) => setFuTime(e.target.value)} /></div>
            <div><Label>Reason</Label><Input value={fuReason} onChange={(e) => setFuReason(e.target.value)} placeholder="e.g. Follow up on treatment interest" /></div>
            <div><Label>Notes</Label><Textarea value={fuNotes} onChange={(e) => setFuNotes(e.target.value)} rows={3} placeholder="Additional notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>Cancel</Button>
            <Button onClick={() => followUpMutation.mutate({ follow_up_date: fuDate, follow_up_time: fuTime || undefined, reason: fuReason || undefined, notes: fuNotes || undefined })} disabled={followUpMutation.isPending || !fuDate}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={apptOpen} onOpenChange={setApptOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Book Appointment</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Date *</Label><Input type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} /></div>
            <div><Label>Time</Label><Input type="time" value={apptTime} onChange={(e) => setApptTime(e.target.value)} /></div>
            <div><Label>Doctor</Label>
              <Select value={apptDoctor} onValueChange={setApptDoctor}>
                <SelectTrigger><SelectValue placeholder="Select doctor (optional)" /></SelectTrigger>
                <SelectContent>
                  {doctors.length > 0 ? doctors.map((doc: any) => (
                    <SelectItem key={doc.id} value={doc.id}>{doc.full_name}</SelectItem>
                  )) : <SelectItem value="" disabled>No doctors available</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={apptNotes} onChange={(e) => setApptNotes(e.target.value)} rows={3} placeholder="Appointment notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApptOpen(false)}>Cancel</Button>
            <Button onClick={() => apptMutation.mutate({ appointment_date: apptDate, appointment_time: apptTime || undefined, doctor_id: apptDoctor || undefined, notes: apptNotes || undefined })} disabled={apptMutation.isPending || !apptDate}>Book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Convert Lead to Patient</DialogTitle>
            <DialogDescription>A new patient record and case will be created. The lead history will be preserved.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2"><Label>Patient Name</Label><Input value={convertPatientName} onChange={(e) => setConvertPatientName(e.target.value)} placeholder="Full name" /></div>
            <div><Label>Phone</Label><Input value={convertPhone} onChange={(e) => setConvertPhone(e.target.value)} /></div>
            <div><Label>Email</Label><Input value={convertEmail} onChange={(e) => setConvertEmail(e.target.value)} /></div>
            <div><Label>Age</Label><Input type="number" value={convertAge} onChange={(e) => setConvertAge(e.target.value)} /></div>
            <div><Label>Gender</Label>
              <Select value={convertGender} onValueChange={setConvertGender}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>City</Label><Input value={convertCity} onChange={(e) => setConvertCity(e.target.value)} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
              const data: Record<string, any> = {}
              if (convertPatientName) data.patient_name = convertPatientName
              if (convertAge) data.age = parseInt(convertAge)
              if (convertGender) data.gender = convertGender
              if (convertPhone) data.phone = convertPhone
              if (convertEmail) data.email = convertEmail
              if (convertCity) data.city = convertCity
              if (convertNotes) data.notes = convertNotes
              convertMutation.mutate(data)
            }} disabled={convertMutation.isPending}>
              {convertMutation.isPending ? "Converting..." : "Convert to Patient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {lead.lead_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
