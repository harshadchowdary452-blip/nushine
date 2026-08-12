import { useState, useCallback } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { format, differenceInDays } from "date-fns"
import {
  ArrowLeft, ArrowRight, Phone, Mail, MapPin, Calendar, IndianRupee, Activity,
  MessageSquare, PhoneCall, Edit3, Trash2, Star, Target,
  CheckCircle2, XCircle, AlertTriangle, Plus, ChevronRight, Users,
  MessageCircle, FileText, User,
  RefreshCw, MoreHorizontal, ExternalLink,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import SearchableSelect from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { leadsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useTrackRecent } from "@/hooks/useTrackRecent"
import LeadTimeline from "./components/lead-timeline"
import type { Lead, LeadCall, LeadCommunication, LeadCallOutcome, ApiError } from "@/types"
import { extractDetail } from "@/types"

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  NEW: { bg: "bg-blue-500", text: "text-white", label: "New" },
  CONTACTED: { bg: "bg-[var(--ds-accent-500)]", text: "text-white", label: "Contacted" },
  INTERESTED: { bg: "bg-emerald-500", text: "text-white", label: "Interested" },
  FOLLOW_UP_REQUIRED: { bg: "bg-amber-500", text: "text-white", label: "Follow-up Required" },
  APPOINTMENT_BOOKED: { bg: "bg-[var(--ds-primary-500)]", text: "text-white", label: "Appointment Booked" },
  VISITED: { bg: "bg-teal-500", text: "text-white", label: "Visited" },
  CONVERTED: { bg: "bg-green-600", text: "text-white", label: "Converted" },
  LOST: { bg: "bg-red-500", text: "text-white", label: "Lost" },
  NOT_INTERESTED: { bg: "bg-[var(--ds-text-tertiary)]", text: "text-white", label: "Not Interested" },
  NO_RESPONSE: { bg: "bg-orange-500", text: "text-white", label: "No Response" },
}

const priorityConfig: Record<string, { bg: string; text: string; label: string }> = {
  HIGH: { bg: "bg-red-50", text: "text-red-700 border-red-200", label: "High" },
  MEDIUM: { bg: "bg-amber-50", text: "text-amber-700 border-amber-200", label: "Medium" },
  LOW: { bg: "bg-green-50", text: "text-green-700 border-green-200", label: "Low" },
}

const statusOptions = [
  "NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_BOOKED",
  "VISITED", "CONVERTED", "LOST", "NOT_INTERESTED", "NO_RESPONSE",
] as const

const callOutcomes: LeadCallOutcome[] = [
  "INTERESTED", "NOT_INTERESTED", "NO_ANSWER", "BUSY", "CALL_BACK_LATER", "APPOINTMENT_REQUESTED", "CONVERTED",
]

const quickActions = [
  { key: "call", icon: Phone, label: "Call", color: "bg-blue-500 hover:bg-blue-600" },
  { key: "whatsapp", icon: MessageCircle, label: "WhatsApp", color: "bg-green-500 hover:bg-green-600" },
  { key: "email", icon: Mail, label: "Email", color: "bg-[var(--ds-accent-500)] hover:bg-[var(--ds-accent-600)]" },
  { key: "convert", icon: Target, label: "Convert", color: "bg-emerald-500 hover:bg-emerald-600" },
  { key: "note", icon: FileText, label: "Note", color: "bg-[var(--ds-text-tertiary)] hover:bg-[var(--ds-text-secondary)]" },
  { key: "feedback", icon: Star, label: "Feedback", color: "bg-amber-500 hover:bg-amber-600" },
]

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState("overview")
  const [statusChangeOpen, setStatusChangeOpen] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [callOutcomeOpen, setCallOutcomeOpen] = useState(false)
  const [commOpen, setCommOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
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
  const [priority, setPriority] = useState("")

  const [callOutcome, setCallOutcome] = useState("")
  const [callNotes, setCallNotes] = useState("")
  const [callFollowUp, setCallFollowUp] = useState("")
  const [callDuration, setCallDuration] = useState("")

  const [commChannel, setCommChannel] = useState("WHATSAPP")
  const [commMessage, setCommMessage] = useState("")

  const [noteText, setNoteText] = useState("")

  const [feedbackRating, setFeedbackRating] = useState<number>(0)
  const [feedbackComment, setFeedbackComment] = useState("")

  const [convertStep, setConvertStep] = useState(1)
  const [convertForm, setConvertForm] = useState({
    full_name: "", email: "", phone: "", gender: "", age: "",
    patient_source: "", source_campaign_name: "", source_campaign_id: "",
    source_campaign_date: "", address: "", medical_history: "", abha_id: "",
    height: "", weight: "", bp: "", sugar: "", spo2: "", op_no: "",
  })

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => leadsApi.get(id!),
    enabled: !!id,
  })

  useTrackRecent(
    "lead",
    lead?.id,
    lead,
    (l) => l?.lead_name || "Lead",
    (l) => l?.mobile || l?.email || undefined
  )

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

  const statusMutation = useMutation({
    mutationFn: (status: string) => leadsApi.updateStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      queryClient.invalidateQueries({ queryKey: ["lead-analytics"] })
      queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
      addToast({ title: "Status updated", variant: "success" })
      setStatusChangeOpen(false)
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => leadsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      addToast({ title: "Lead updated", variant: "success" })
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
    onError: (err: ApiError) => addToast({
      title: "Error",
      description: err?.response?.data?.detail as string || "Failed to delete lead",
      variant: "destructive",
    }),
  })

  const callMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => leadsApi.addCall(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-calls", id] })
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      addToast({ title: "Call recorded", variant: "success" })
      setCallOutcomeOpen(false)
      setCallOutcome(""); setCallNotes(""); setCallFollowUp(""); setCallDuration("")
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const commMutation = useMutation({
    mutationFn: (data: { channel: string; message: string }) => leadsApi.addCommunication(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-communications", id] })
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      addToast({ title: "Message sent", variant: "success" })
      setCommOpen(false)
      setCommMessage("")
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const noteMutation = useMutation({
    mutationFn: (note: string) => leadsApi.addCommunication(id!, { channel: "NOTE", message: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-communications", id] })
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      addToast({ title: "Note added", variant: "success" })
      setNoteOpen(false)
      setNoteText("")
    },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const convertMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => leadsApi.convert(id!, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] })
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      queryClient.invalidateQueries({ queryKey: ["lead-analytics"] })
      queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["patients"] })
      addToast({ title: "Lead converted successfully", variant: "success" })
      setConvertOpen(false)
      const patientId = (result as Record<string, unknown>)?.patient_id as string
      if (patientId) {
        navigate(`/patients/${patientId}`)
      }
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      addToast({
        title: "Conversion failed",
        description: err?.response?.data?.detail || "Failed to convert lead",
        variant: "destructive",
      })
    },
  })

  const openEdit = useCallback((l: Lead) => {
    setLeadName(l.lead_name)
    setMobile(l.mobile)
    setEmail(l.email || "")
    setAge(l.age?.toString() || "")
    setGender(l.gender || "")
    setCity(l.city || "")
    setSource(l.source)
    setInterestedTreatment(l.interested_treatment || "")
    setBudget(l.budget?.toString() || "")
    setPreferredVisitDate(l.preferred_visit_date || "")
    setNotes(l.notes || "")
    setPriority(l.priority || "")
    setEditOpen(true)
  }, [])

  const handleCall = useCallback(() => {
    if (lead?.mobile) {
      window.location.href = `tel:${lead.mobile}`
    }
  }, [lead])

  const handleWhatsApp = useCallback(() => {
    if (lead?.mobile) {
      const phone = lead.mobile.replace(/[^0-9]/g, "")
      const hospitalName = lead.hospital_name || "our dental clinic"
      const msg =
        `Hello ${lead.lead_name},\n\n` +
        `Thank you for contacting ${hospitalName}.\n\n` +
        `We appreciate your interest in our dental services. Our team has received your enquiry regarding **${lead.interested_treatment || "dental treatment"}**.\n\n` +
        `One of our patient care executives will contact you shortly to understand your requirements and assist you in planning your visit.\n\n` +
        `If you have any immediate questions, feel free to reply to this message or call us.\n\n` +
        `We look forward to welcoming you to ${hospitalName} and providing you with the highest standard of dental care.\n\n` +
        `Warm Regards,\n${hospitalName}\nPatient Care Team`
      const encodedMsg = encodeURIComponent(msg)
      leadsApi.addCommunication(lead.id, {
        channel: "WHATSAPP",
        message: msg,
        template_name: "GREETING",
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["lead-communications", lead.id] })
        queryClient.invalidateQueries({ queryKey: ["lead", lead.id] })
        queryClient.invalidateQueries({ queryKey: ["lead-analytics"] })
        queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
        queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
      }).catch((err: unknown) => {
        addToast({ title: "Could not log WhatsApp message", description: extractDetail(err), variant: "destructive" })
      }).finally(() => {
        window.open(`https://wa.me/${phone}?text=${encodedMsg}`, "_blank")
      })
    }
  }, [lead, queryClient, addToast])

  const handleEmail = useCallback(() => {
    if (lead?.email) {
      const hospitalName = lead.hospital_name || "Our Dental Clinic"
      const subject = encodeURIComponent(`${hospitalName} - Inquiry Regarding ${lead.interested_treatment || "Dental Treatment"}`)
      const body = encodeURIComponent(
        `Dear ${lead.lead_name},\n\n` +
        `Thank you for contacting ${hospitalName}.\n\n` +
        `We have received your enquiry regarding ${lead.interested_treatment || "dental treatment"}.\n\n` +
        `Lead Source: ${lead.source?.replace(/_/g, " ") || "N/A"}\n\n` +
        `One of our patient care executives will reach out to you shortly to assist with your requirements and help schedule a consultation.\n\n` +
        `If you have any immediate questions, please feel free to contact us.\n\n` +
        `Warm Regards,\n${hospitalName}\nPatient Care Team`
      )
      window.open(`mailto:${lead.email}?subject=${subject}&body=${body}`, "_blank")
    }
  }, [lead])

  const callItems: LeadCall[] = Array.isArray(calls) ? calls : []
  const commItems: LeadCommunication[] = Array.isArray(communications) ? communications : []

  if (isLoading) return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )

  if (!lead) return (
    <div className="p-12 text-center">
      <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-[var(--ds-text-tertiary)]" />
      <p className="text-[var(--ds-text-secondary)] font-medium">Lead not found</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/leads")}>
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Leads
      </Button>
    </div>
  )

  const daysSinceCreated = differenceInDays(new Date(), new Date(lead.created_at))

  const handleQuickAction = (key: string) => {
    switch (key) {
      case "call": handleCall(); break
      case "whatsapp": handleWhatsApp(); break
      case "email": handleEmail(); break
      case "convert":
        if (lead.status === "CONVERTED") {
          addToast({ title: "Already converted", variant: "success" })
        } else {
          setConvertForm({
            full_name: lead.lead_name, email: lead.email || "", phone: lead.mobile,
            gender: lead.gender || "", age: lead.age?.toString() || "",
            patient_source: lead.source || "", source_campaign_name: "",
            source_campaign_id: "", source_campaign_date: "", address: lead.city || "",
            medical_history: lead.notes || "", abha_id: "",
            height: "", weight: "", bp: "", sugar: "", spo2: "", op_no: "",
          })
          setConvertOpen(true)
        }
        break
      case "note": setNoteOpen(true); break
      case "feedback": setActiveTab("feedback"); break
    }
  }

  const statusInfo = statusConfig[lead.status] || statusConfig.NEW

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)] mb-2">
        <button
          onClick={() => navigate("/leads?" + searchParams.toString())}
          className="flex items-center gap-1 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Leads
        </button>
        <ChevronRight className="h-3 w-3 text-[var(--ds-text-tertiary)]" />
        <span className="text-[var(--ds-text-secondary)] font-medium truncate">{lead.lead_name}</span>
      </div>

      <Card className="sticky top-0 z-[var(--ds-z-sticky)] shadow-sm border-[var(--ds-border)]">
        <CardContent className="p-0">
          <div className="p-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center shrink-0 ring-2 ring-white shadow-sm">
                  <span className="text-xl font-bold text-blue-600">
                    {lead.lead_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl font-bold text-[var(--ds-text)]">{lead.lead_name}</h1>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                      {statusInfo.label}
                    </span>
                    {lead.priority && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                        priorityConfig[lead.priority]?.text || "text-[var(--ds-text-secondary)]"
                      } ${priorityConfig[lead.priority]?.bg || "bg-[var(--ds-background-subtle)]"}`}>
                        <Star className="h-3 w-3" fill={lead.priority === "HIGH" ? "currentColor" : "none"} />
                        {priorityConfig[lead.priority]?.label || lead.priority}
                      </span>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {lead.source?.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-[var(--ds-text-tertiary)] font-mono mt-1">
                      #{lead.id.slice(-6).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-sm text-[var(--ds-text-secondary)] flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                      {lead.mobile}
                    </span>
                    {lead.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                        {lead.email}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                      Created {format(new Date(lead.created_at), "dd MMM yyyy")}
                    </span>
                    {lead.interested_treatment && (
                      <span className="flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                        {lead.interested_treatment}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <TooltipProvider>
                  {quickActions.map((action) => (
                    <Tooltip key={action.key}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleQuickAction(action.key)}
                          className={`h-9 w-9 rounded-lg ${action.color} text-white flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-sm`}
                        >
                          <action.icon className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">{action.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
                <div className="h-8 w-px bg-[var(--ds-surface-secondary)] mx-1" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 bg-[var(--ds-surface)] shadow-lg border-[var(--ds-border)]">
                    <DropdownMenuItem onClick={() => openEdit(lead)} className="cursor-pointer">
                      <Edit3 className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> Edit Lead
                    </DropdownMenuItem>
                    {!lead.converted_patient_id && (
                      <DropdownMenuItem onClick={() => setStatusChangeOpen(true)} className="cursor-pointer">
                        <RefreshCw className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> Change Status
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator className="bg-[var(--ds-background-subtle)]" />
                    <DropdownMenuItem onClick={() => setCallOutcomeOpen(true)} className="cursor-pointer">
                      <PhoneCall className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> Log Call Outcome
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConvertOpen(true)} className="cursor-pointer">
                      <Target className="h-4 w-4 mr-2.5 text-[var(--ds-text-secondary)]" /> Convert to Patient
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-[var(--ds-background-subtle)]" />
                    {!lead.converted_patient_id && (
                      <DropdownMenuItem
                        className="text-red-600 cursor-pointer focus:text-red-700 focus:bg-red-50"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="h-4 w-4 mr-2.5" /> Delete Lead
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-[var(--ds-border)]">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wide">Age</p>
            <p className="text-lg font-bold text-[var(--ds-text)] mt-0.5">{daysSinceCreated}d</p>
          </CardContent>
        </Card>
        <Card className="border-[var(--ds-border)]">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wide">Last Contacted</p>
            <p className="text-sm font-medium text-[var(--ds-text)] mt-0.5 truncate">
              {lead.last_contacted_at ? format(new Date(lead.last_contacted_at), "dd MMM") : "Never"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--ds-border)]">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wide">Next Follow-up</p>
            <p className={`text-sm font-medium mt-0.5 truncate ${lead.next_follow_up_date && new Date(lead.next_follow_up_date) < new Date() ? "text-red-600" : "text-[var(--ds-text)]"}`}>
              {lead.next_follow_up_date ? format(new Date(lead.next_follow_up_date), "dd MMM") : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--ds-border)]">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wide">Budget</p>
            <p className="text-sm font-bold text-[var(--ds-text)] mt-0.5">{lead.budget ? `₹${lead.budget.toLocaleString()}` : "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-[var(--ds-border)]">
          <CardContent className="p-3">
            <p className="text-[11px] font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wide">Automation</p>
            <p className="text-sm font-bold text-[var(--ds-text)] mt-0.5">
              {lead.automation_status === "ACTIVE" && lead.current_attempt != null && lead.total_attempts
                ? `Attempt ${lead.current_attempt} of ${lead.total_attempts}`
                : lead.automation_status === "STOPPED"
                ? "Stopped"
                : lead.automation_status === "CLOSED"
                ? "Closed"
                : "—"}
            </p>
            {lead.automation_status && lead.automation_status !== "ACTIVE" && (
              <p className="text-[10px] text-[var(--ds-text-tertiary)] mt-0.5">{lead.automation_closure_reason?.replace(/_/g, " ") || ""}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start border-b border-[var(--ds-border)] rounded-none bg-transparent p-0 h-auto space-x-1 overflow-x-auto">
          {["overview", "timeline", "communication", "notes", "feedback", "conversion"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-600 px-4 py-2.5 text-sm font-medium capitalize bg-transparent data-[state=active]:bg-transparent whitespace-nowrap"
            >
              {tab === "conversion" ? "Conversion" : tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card className="border-[var(--ds-border)]">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-[var(--ds-text)]">Contact & Lead Information</h3>
                    <Button size="sm" variant="outline" onClick={() => openEdit(lead)}>
                      <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                    <div>
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Phone</Label>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Phone className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)] shrink-0" />
                        <span className="text-[var(--ds-text)]">{lead.mobile}</span>
                        <button onClick={handleCall} className="ml-1 text-blue-500 hover:text-blue-700">
                          <Phone className="h-3 w-3" />
                        </button>
                        <button onClick={handleWhatsApp} className="text-green-500 hover:text-green-700">
                          <MessageCircle className="h-3 w-3" />
                        </button>
                      </div>
                      {lead.alternate_mobile && (
                        <div className="flex items-center gap-1.5 mt-1 text-[var(--ds-text-secondary)]">
                          <Phone className="h-3 w-3 text-[var(--ds-text-tertiary)]" />
                          <span className="text-xs">{lead.alternate_mobile}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Email</Label>
                      <p className="flex items-center gap-1.5 mt-0.5">
                        <Mail className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                        <span className="text-[var(--ds-text)]">{lead.email || "—"}</span>
                        {lead.email && (
                          <button onClick={handleEmail} className="ml-1 text-[var(--ds-accent-500)] hover:text-[var(--ds-accent-700)]">
                            <Mail className="h-3 w-3" />
                          </button>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Age / Gender</Label>
                      <p className="mt-0.5 text-[var(--ds-text)]">
                        {lead.age ? `${lead.age} yrs` : "—"} {lead.gender ? `/ ${lead.gender}` : ""}
                      </p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">City</Label>
                      <p className="flex items-center gap-1.5 mt-0.5">
                        <MapPin className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                        <span className="text-[var(--ds-text)]">{lead.city || "—"}</span>
                      </p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Interested Treatment</Label>
                      <p className="flex items-center gap-1.5 mt-0.5">
                        <Activity className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                        <span className="text-[var(--ds-text)] font-medium">{lead.interested_treatment || "—"}</span>
                      </p>
                    </div>
                    <div>
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Budget</Label>
                      <p className="flex items-center gap-1.5 mt-0.5">
                        <IndianRupee className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                        <span className="text-[var(--ds-text)] font-medium">{lead.budget ? `₹${lead.budget.toLocaleString()}` : "—"}</span>
                      </p>
                    </div>
                    {lead.preferred_visit_date && (
                      <div>
                        <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Preferred Visit</Label>
                        <p className="flex items-center gap-1.5 mt-0.5">
                          <Calendar className="h-3.5 w-3.5 text-[var(--ds-text-tertiary)]" />
                          <span className="text-[var(--ds-text)]">{format(new Date(lead.preferred_visit_date), "dd MMM yyyy")}</span>
                        </p>
                      </div>
                    )}
                    <div>
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Lead Source</Label>
                      <p className="mt-0.5">
                        <Badge variant="outline">{lead.source?.replace(/_/g, " ")}</Badge>
                      </p>
                    </div>
                  </div>
                  {lead.notes && (
                    <div className="mt-4 pt-4 border-t border-[var(--ds-border-light)]">
                      <Label className="text-[11px] text-[var(--ds-text-tertiary)] font-medium">Notes</Label>
                      <p className="text-[var(--ds-text-secondary)] whitespace-pre-wrap text-sm mt-1">{lead.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-[var(--ds-border)]">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-[var(--ds-text)] mb-3">Lead Details</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--ds-text-tertiary)] text-xs">Status</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--ds-text-tertiary)] text-xs">Priority</span>
                      {lead.priority ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${
                          priorityConfig[lead.priority]?.text
                        } ${priorityConfig[lead.priority]?.bg}`}>
                          <Star className="h-2.5 w-2.5" fill={lead.priority === "HIGH" ? "currentColor" : "none"} />
                          {priorityConfig[lead.priority]?.label}
                        </span>
                      ) : <span className="text-[var(--ds-text-tertiary)]">—</span>}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--ds-text-tertiary)] text-xs">Created</span>
                      <span className="text-xs text-[var(--ds-text-secondary)]">{format(new Date(lead.created_at), "dd MMM yyyy")}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--ds-text-tertiary)] text-xs">Last Contacted</span>
                      <span className="text-xs text-[var(--ds-text-secondary)]">
                        {lead.last_contacted_at ? format(new Date(lead.last_contacted_at), "dd MMM hh:mm a") : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--ds-text-tertiary)] text-xs">Next Follow-up</span>
                      <span className={`text-xs ${lead.next_follow_up_date && new Date(lead.next_follow_up_date) < new Date() ? "text-red-600 font-medium" : "text-[var(--ds-text-secondary)]"}`}>
                        {lead.next_follow_up_date ? format(new Date(lead.next_follow_up_date), "dd MMM yyyy") : "—"}
                      </span>
                    </div>
                    {lead.assigned_staff_id && (
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--ds-text-tertiary)] text-xs">Assigned Staff</span>
                        <span className="text-xs text-[var(--ds-text-secondary)] font-mono">{lead.assigned_staff_id.slice(0, 8)}</span>
                      </div>
                    )}
                    {lead.assigned_doctor_id && (
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--ds-text-tertiary)] text-xs">Assigned Doctor</span>
                        <span className="text-xs text-[var(--ds-text-secondary)] font-mono">{lead.assigned_doctor_id.slice(0, 8)}</span>
                      </div>
                    )}
                    {lead.converted_patient_id && (
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--ds-text-tertiary)] text-xs">Converted Patient</span>
                        <button
                          onClick={() => navigate(`/patients/${lead.converted_patient_id}`)}
                          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> View
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {lead.status !== "CONVERTED" && lead.status !== "LOST" && lead.status !== "NOT_INTERESTED" && (
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setConvertOpen(true)}
                >
                  <Target className="h-3.5 w-3.5 mr-1" /> Convert to Patient
                </Button>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card className="border-[var(--ds-border)]">
            <div className="px-5 py-4 border-b border-[var(--ds-border-light)]">
              <h3 className="text-sm font-semibold text-[var(--ds-text)]">Activity Timeline</h3>
            </div>
            <CardContent className="p-5">
              <LeadTimeline lead={lead} calls={callItems} communications={commItems} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communication" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 space-y-4">
              <Card className="border-[var(--ds-border)]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ds-border-light)]">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-[var(--ds-text)]">Communications</h3>
                    <span className="text-xs text-[var(--ds-text-tertiary)] bg-[var(--ds-background-subtle)] px-2 py-0.5 rounded-full">{commItems.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleWhatsApp}>
                      <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCommOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Send Message
                    </Button>
                  </div>
                </div>
                <CardContent className="p-0">
                  {commItems.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="h-16 w-16 rounded-full bg-[var(--ds-background-subtle)] flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="h-8 w-8 text-[var(--ds-text-tertiary)]" />
                      </div>
                      <p className="text-sm font-medium text-[var(--ds-text-secondary)]">No communications yet</p>
                      <p className="text-xs text-[var(--ds-text-tertiary)] mt-1">Send your first message using the buttons above</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--ds-border-light)]">
                      {commItems.map((c) => (
                        <div key={c.id} className="px-5 py-4 hover:bg-[var(--ds-background-subtle)]/50 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                c.channel === "WHATSAPP" ? "bg-green-50" :
                                c.channel === "EMAIL" ? "bg-[var(--ds-accent-50)]" :
                                c.channel === "NOTE" ? "bg-[var(--ds-background-subtle)]" :
                                c.channel === "FEEDBACK" ? "bg-amber-50" :
                                "bg-blue-50"
                              }`}>
                                {c.channel === "WHATSAPP" ? <MessageCircle className="h-4 w-4 text-green-600" /> :
                                 c.channel === "EMAIL" ? <Mail className="h-4 w-4 text-[var(--ds-accent-600)]" /> :
                                 c.channel === "NOTE" ? <FileText className="h-4 w-4 text-[var(--ds-text-secondary)]" /> :
                                 c.channel === "FEEDBACK" ? <Star className="h-4 w-4 text-amber-600" /> :
                                 <MessageSquare className="h-4 w-4 text-blue-600" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                                    c.channel === "WHATSAPP" ? "bg-green-50 text-green-700" :
                                    c.channel === "EMAIL" ? "bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)]" :
                                    c.channel === "NOTE" ? "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]" :
                                    c.channel === "FEEDBACK" ? "bg-amber-50 text-amber-700" :
                                    "bg-blue-50 text-blue-700"
                                  }`}>{c.channel}</span>
                                  {c.delivery_status && c.channel === "WHATSAPP" && (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      c.delivery_status === "SENT" ? "bg-green-50 text-green-700" :
                                      c.delivery_status === "DELIVERED" ? "bg-blue-50 text-blue-700" :
                                      c.delivery_status === "READ" ? "bg-emerald-50 text-emerald-700" :
                                      c.delivery_status === "FAILED" ? "bg-red-50 text-red-700" :
                                      "bg-amber-50 text-amber-700"
                                    }`}>
                                      {c.delivery_status === "SENT" && <CheckCircle2 className="h-3 w-3" />}
                                      {c.delivery_status === "DELIVERED" && <CheckCircle2 className="h-3 w-3" />}
                                      {c.delivery_status === "READ" && <CheckCircle2 className="h-3 w-3" />}
                                      {c.delivery_status === "FAILED" && <XCircle className="h-3 w-3" />}
                                      {c.delivery_status}
                                    </span>
                                  )}
                                  {c.channel !== "WHATSAPP" && c.status && c.status !== "PENDING" && (
                                    <Badge variant={c.status === "SENT" || c.status === "STORED" ? "success" : c.status === "FAILED" ? "danger" : "warning"} className="text-[10px]">
                                      {c.status}
                                    </Badge>
                                  )}
                                  {c.template_name && (
                                    <Badge variant="outline" className="text-[10px] text-[var(--ds-text-tertiary)]">
                                      {c.template_name}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-[var(--ds-text-secondary)] mt-1.5 whitespace-pre-wrap line-clamp-3">{c.message}</p>
                                <div className="flex items-center gap-3 mt-1.5">
                                  <span className="text-[11px] text-[var(--ds-text-tertiary)]">
                                    {format(new Date(c.created_at), "dd MMM yyyy, hh:mm a")}
                                  </span>
                                  {c.sent_by_name && (
                                    <span className="text-[11px] text-[var(--ds-text-tertiary)] flex items-center gap-1">
                                      <User className="h-3 w-3" /> {c.sent_by_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {c.channel === "WHATSAPP" && !c.provider_message_id && (
                                <button
                                  onClick={() => {
                                    const phone = lead?.mobile?.replace(/[^0-9]/g, "")
                                    if (phone) {
                                      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(c.message)}`, "_blank")
                                    }
                                  }}
                                  className="h-7 w-7 rounded-lg hover:bg-green-50 flex items-center justify-center text-[var(--ds-text-tertiary)] hover:text-green-600 transition-colors"
                                  title="Open in WhatsApp"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-[var(--ds-border)]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ds-border-light)]">
                  <h3 className="text-sm font-semibold text-[var(--ds-text)]">Call Log</h3>
                  <span className="text-xs text-[var(--ds-text-tertiary)] bg-[var(--ds-background-subtle)] px-2 py-0.5 rounded-full">{callItems.length}</span>
                </div>
                <CardContent className="p-0">
                  {callItems.length === 0 ? (
                    <div className="py-8 text-center">
                      <PhoneCall className="h-8 w-8 mx-auto mb-2 text-[var(--ds-text-tertiary)]" />
                      <p className="text-sm text-[var(--ds-text-tertiary)]">No calls logged</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--ds-border-light)]">
                      {callItems.map((c) => (
                        <div key={c.id} className="px-4 py-3 hover:bg-[var(--ds-background-subtle)]/50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                              c.outcome === "INTERESTED" || c.outcome === "CONVERTED" ? "bg-green-50" :
                              c.outcome === "NOT_INTERESTED" ? "bg-red-50" :
                              "bg-[var(--ds-background-subtle)]"
                            }`}>
                              <PhoneCall className={`h-4 w-4 ${
                                c.outcome === "INTERESTED" || c.outcome === "CONVERTED" ? "text-green-600" :
                                c.outcome === "NOT_INTERESTED" ? "text-red-600" :
                                "text-[var(--ds-text-secondary)]"
                              }`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[var(--ds-text-secondary)] text-[13px]">{c.outcome?.replace(/_/g, " ") || "Unknown"}</span>
                                {c.duration_seconds && (
                                  <span className="text-[10px] text-[var(--ds-text-tertiary)] bg-[var(--ds-background-subtle)] px-1.5 py-0.5 rounded font-mono">
                                    {Math.floor(c.duration_seconds / 60)}m {c.duration_seconds % 60}s
                                  </span>
                                )}
                              </div>
                              {c.notes && <p className="text-[var(--ds-text-secondary)] text-[12px] mt-0.5 line-clamp-2">{c.notes}</p>}
                              <span className="text-[10px] text-[var(--ds-text-tertiary)] mt-1 block">
                                {format(new Date(c.created_at), "dd MMM, hh:mm a")}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-[var(--ds-border)]">
                <CardContent className="p-4 space-y-2">
                  <Button size="sm" className="w-full" onClick={handleCall}>
                    <Phone className="h-3.5 w-3.5 mr-1.5" /> Call Now
                  </Button>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setCallOutcomeOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Log Call Outcome
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <Card className="border-[var(--ds-border)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ds-border-light)]">
              <h3 className="text-sm font-semibold text-[var(--ds-text)]">Notes</h3>
              <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
              </Button>
            </div>
            <CardContent className="p-5">
              {commItems.filter((c) => c.channel === "NOTE").length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="h-10 w-10 mx-auto mb-3 text-[var(--ds-text-tertiary)]" />
                  <p className="text-sm text-[var(--ds-text-tertiary)]">No notes yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {commItems.filter((c) => c.channel === "NOTE").map((note) => (
                    <div key={note.id} className="rounded-lg border border-[var(--ds-border-light)] p-3 bg-[var(--ds-surface)] hover:border-[var(--ds-border)] transition-colors">
                      <p className="text-sm text-[var(--ds-text-secondary)] whitespace-pre-wrap">{note.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--ds-text-tertiary)]">
                        <span>{format(new Date(note.created_at), "dd MMM yyyy, hh:mm a")}</span>
                        <Badge variant="outline" className="text-[10px]">Staff Note</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <Card className="border-[var(--ds-border)]">
            <div className="px-5 py-4 border-b border-[var(--ds-border-light)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--ds-text)]">Lead Feedback</h3>
            </div>
            <CardContent className="p-5">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Rating</Label>
                  <div className="flex gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackRating(star)}
                        className={`h-10 w-10 rounded-lg flex items-center justify-center transition-all ${
                          star <= feedbackRating
                            ? "bg-amber-100 text-amber-500 scale-110"
                            : "bg-[var(--ds-background-subtle)] text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)]"
                        }`}
                      >
                        <Star className="h-5 w-5" fill={star <= feedbackRating ? "currentColor" : "none"} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Comment</Label>
                  <Textarea
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    rows={4}
                    placeholder="Share your feedback about this lead..."
                    className="mt-2"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (!feedbackComment.trim()) {
                      addToast({ title: "Validation", description: "Please enter feedback", variant: "destructive" })
                      return
                    }
                    leadsApi.addCommunication(lead.id, {
                      channel: "FEEDBACK",
                      message: JSON.stringify({ rating: feedbackRating, comment: feedbackComment }),
                    }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] })
                      queryClient.invalidateQueries({ queryKey: ["lead-communications", lead.id] })
                      queryClient.invalidateQueries({ queryKey: ["lead-analytics"] })
                      queryClient.invalidateQueries({ queryKey: ["crm-dashboard"] })
                      queryClient.invalidateQueries({ queryKey: ["crm-enhanced-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["crm-command-center"], refetchType: "all" })
                      addToast({ title: "Feedback recorded", variant: "success" })
                      setFeedbackRating(0)
                      setFeedbackComment("")
                    }).catch(() => {
                      addToast({ title: "Error", description: "Failed to save feedback", variant: "destructive" })
                    })
                  }}
                  disabled={!feedbackComment.trim()}
                >
                  <Star className="h-4 w-4 mr-1.5" /> Submit Feedback
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversion" className="space-y-4">
          {lead.status === "CONVERTED" ? (
            <Card className="border-[var(--ds-border)]">
              <CardContent className="py-8 text-center">
                <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--ds-text)] mb-1">Lead Converted</h3>
                <p className="text-sm text-[var(--ds-text-secondary)] mb-4">
                  This lead was successfully converted to a patient
                  {lead.converted_patient_id ? ` (#${lead.converted_patient_id.slice(-6).toUpperCase()})` : ""}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {lead.converted_patient_id && (
                    <Button onClick={() => navigate(`/patients/${lead.converted_patient_id}`)}>
                      <Users className="h-4 w-4 mr-1.5" /> View Patient Profile
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : lead.status === "LOST" || lead.status === "NOT_INTERESTED" ? (
            <Card className="border-[var(--ds-border)]">
              <CardContent className="py-8 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-[var(--ds-text)] mb-1">Lead Inactive</h3>
                <p className="text-sm text-[var(--ds-text-secondary)]">
                  This lead was marked as {lead.status === "NOT_INTERESTED" ? "closed" : lead.status.toLowerCase()}.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setStatusChangeOpen(true)}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Change Status
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[var(--ds-border)]">
              <div className="px-5 py-4 border-b border-[var(--ds-border-light)]">
                <h3 className="text-sm font-semibold text-[var(--ds-text)]">Convert to Patient</h3>
              </div>
              <CardContent className="p-5 space-y-4">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
                  <div className="flex items-start gap-3">
                    <Target className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium mb-1">Ready to convert this lead?</p>
                      <p className="text-emerald-700">
                        Converting will create a new patient record and OP registration.
                        The original lead will be preserved for audit purposes.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-[var(--ds-background-subtle)]">
                    <p className="text-xs text-[var(--ds-text-secondary)]">Patient Name</p>
                    <p className="font-medium text-[var(--ds-text)]">{lead.lead_name}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--ds-background-subtle)]">
                    <p className="text-xs text-[var(--ds-text-secondary)]">Phone</p>
                    <p className="font-medium text-[var(--ds-text)]">{lead.mobile}</p>
                  </div>
                  {lead.email && (
                    <div className="p-3 rounded-lg bg-[var(--ds-background-subtle)]">
                      <p className="text-xs text-[var(--ds-text-secondary)]">Email</p>
                      <p className="font-medium text-[var(--ds-text)]">{lead.email}</p>
                    </div>
                  )}
                  {lead.interested_treatment && (
                    <div className="p-3 rounded-lg bg-[var(--ds-background-subtle)]">
                      <p className="text-xs text-[var(--ds-text-secondary)]">Treatment Interest</p>
                      <p className="font-medium text-[var(--ds-text)]">{lead.interested_treatment}</p>
                    </div>
                  )}
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    setConvertForm({
                      full_name: lead.lead_name, email: lead.email || "", phone: lead.mobile,
                      gender: lead.gender || "", age: lead.age?.toString() || "",
                      patient_source: lead.source || "", source_campaign_name: "",
                      source_campaign_id: "", source_campaign_date: "", address: lead.city || "",
                      medical_history: lead.notes || "", abha_id: "",
                      height: "", weight: "", bp: "", sugar: "", spo2: "", op_no: "",
                    })
                    setConvertOpen(true)
                  }}
                >
                  <Target className="h-4 w-4 mr-1.5" /> Convert Now
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={statusChangeOpen} onOpenChange={setStatusChangeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Lead Status</DialogTitle>
            <DialogDescription>Select the new status for this lead</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>New Status</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s} disabled={s === lead.status}>
                    <span className="flex items-center gap-2">
                      {s === lead.status && <Check className="h-3.5 w-3.5 text-green-600" />}{s.replace(/_/g, " ")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangeOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedStatus && statusMutation.mutate(selectedStatus)}
              disabled={!selectedStatus || statusMutation.isPending}
            >
              {statusMutation.isPending ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2"><Label>Name</Label><Input value={leadName} onChange={(e) => setLeadName(e.target.value)} /></div>
            <div><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
            <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Age</Label><NumericInput mode="integer" min={0} max={150} value={age} onChange={(v) => setAge(v)} /></div>
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
            <div><Label>Budget</Label><NumericInput mode="currency" prefix="₹" value={budget} onChange={(v) => setBudget(v)} /></div>
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
            <Button onClick={() => {
              updateMutation.mutate({
                lead_name: leadName, mobile, email: email || undefined,
                age: age ? parseInt(age) : undefined, gender: gender || undefined,
                city: city || undefined, source,
                interested_treatment: interestedTreatment || undefined,
                budget: budget ? parseFloat(budget) : undefined,
                preferred_visit_date: preferredVisitDate || undefined,
                notes: notes || undefined,
                priority: priority || undefined,
              })
            }} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={callOutcomeOpen} onOpenChange={setCallOutcomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Call Outcome</DialogTitle>
            <DialogDescription>How did the call go?</DialogDescription>
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
            <div><Label>Duration (seconds)</Label><NumericInput mode="integer" value={callDuration} onChange={(v) => setCallDuration(v)} placeholder="e.g. 120" /></div>
            <div><Label>Follow-up Date</Label><Input type="date" value={callFollowUp} onChange={(e) => setCallFollowUp(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} rows={3} placeholder="Call notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallOutcomeOpen(false)}>Cancel</Button>
            <Button onClick={() => callMutation.mutate({
              outcome: callOutcome, notes: callNotes || undefined,
              follow_up_date: callFollowUp || undefined,
              duration_seconds: callDuration ? parseInt(callDuration) : undefined,
            })} disabled={callMutation.isPending || !callOutcome}>
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

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Record an internal note about this lead</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Note</Label><Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="Enter your note..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNoteOpen(false); setNoteText("") }}>Cancel</Button>
            <Button onClick={() => noteText.trim() && noteMutation.mutate(noteText.trim())} disabled={!noteText.trim() || noteMutation.isPending}>
              {noteMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={(o) => { if (!o) { setConvertStep(1) } setConvertOpen(o) }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Target className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <DialogTitle>Convert Lead to Patient</DialogTitle>
                <DialogDescription>
                  {convertStep === 1 ? "Review lead information and complete patient details" : "Confirm the conversion before proceeding"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {convertStep === 1 && (
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-blue-600" />
                    <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider">Lead Information</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Name</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.full_name || lead.lead_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Phone</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.phone || lead.mobile}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Email</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.email || lead.email || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Source</span>
                      <span className="font-medium text-[var(--ds-text)]">{lead.source?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Treatment</span>
                      <span className="font-medium text-[var(--ds-text)]">{lead.interested_treatment || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Budget</span>
                      <span className="font-medium text-[var(--ds-text)]">{lead.budget ? `₹${lead.budget.toLocaleString()}` : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Status</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Patient Profile</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Name</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.full_name || lead.lead_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Phone</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.phone || lead.mobile}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Email</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.email || lead.email || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Gender</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.gender || lead.gender || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Age</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.age || lead.age?.toString() || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">Source</span>
                      <span className="font-medium text-[var(--ds-text)]">Lead Conversion</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--ds-text-secondary)]">OP No.</span>
                      <span className="font-medium text-[var(--ds-text)]">{convertForm.op_no || "Auto-generated"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--ds-border-light)] pt-4">
                <h4 className="text-xs font-semibold text-[var(--ds-text-secondary)] uppercase tracking-wider mb-3">Patient Registration Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="conv-name" className="text-xs">Full Name <span className="text-red-500">*</span></Label>
                    <Input id="conv-name" className="h-9" value={convertForm.full_name} onChange={(e) => setConvertForm({ ...convertForm, full_name: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="conv-phone" className="text-xs">Phone <span className="text-red-500">*</span></Label>
                    <Input id="conv-phone" className="h-9" value={convertForm.phone} onChange={(e) => setConvertForm({ ...convertForm, phone: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="conv-email" className="text-xs">Email</Label>
                    <Input id="conv-email" type="email" className="h-9" value={convertForm.email} onChange={(e) => setConvertForm({ ...convertForm, email: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="conv-gender" className="text-xs">Gender</Label>
                    <select id="conv-gender" value={convertForm.gender} onChange={(e) => setConvertForm({ ...convertForm, gender: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Select</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="conv-age" className="text-xs">Age</Label>
                    <NumericInput id="conv-age" mode="integer" min={0} max={150} className="h-9" value={convertForm.age} onChange={(v) => setConvertForm({ ...convertForm, age: v })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="conv-address" className="text-xs">Address</Label>
                    <Input id="conv-address" className="h-9" value={convertForm.address} onChange={(e) => setConvertForm({ ...convertForm, address: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="conv-op-no" className="text-xs">OP No.</Label>
                    <Input id="conv-op-no" className="h-9" value={convertForm.op_no} onChange={(e) => setConvertForm({ ...convertForm, op_no: e.target.value })} placeholder="Auto" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="conv-abha-id" className="text-xs">ABHA ID</Label>
                    <Input id="conv-abha-id" className="h-9" value={convertForm.abha_id} onChange={(e) => setConvertForm({ ...convertForm, abha_id: e.target.value })} placeholder="14-digit" maxLength={20} />
                  </div>
                  <div className="col-span-2 grid gap-2">
                    <Label htmlFor="conv-source" className="text-xs">How Did You Hear About Us?</Label>
                    <SearchableSelect value={convertForm.patient_source} onValueChange={(v) => setConvertForm({ ...convertForm, patient_source: v })}
                      options={["Walk-In","Google Search","Google Maps","Instagram","Facebook","WhatsApp","Website","Referral - Existing Patient","Referral - Doctor","Referral - Clinic","Advertisement","Banner","Newspaper","YouTube","Campaign","Event","Lead","Other"]}
                      placeholder="Search or select source..." />
                  </div>
                  {convertForm.patient_source === "Campaign" && (
                    <div className="col-span-2 grid grid-cols-3 gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <div className="grid gap-1">
                        <Label className="text-xs">Campaign Name</Label>
                        <Input className="h-8 text-xs" placeholder="Campaign name" value={convertForm.source_campaign_name}
                          onChange={(e) => setConvertForm({ ...convertForm, source_campaign_name: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Campaign ID</Label>
                        <Input className="h-8 text-xs" placeholder="ID" value={convertForm.source_campaign_id}
                          onChange={(e) => setConvertForm({ ...convertForm, source_campaign_id: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Campaign Date</Label>
                        <Input type="date" className="h-8 text-xs" value={convertForm.source_campaign_date}
                          onChange={(e) => setConvertForm({ ...convertForm, source_campaign_date: e.target.value })} />
                      </div>
                    </div>
                  )}
                  <div className="col-span-2 grid gap-2">
                    <Label htmlFor="conv-medical-history" className="text-xs">Medical History</Label>
                    <Textarea id="conv-medical-history" value={convertForm.medical_history}
                      onChange={(e) => setConvertForm({ ...convertForm, medical_history: e.target.value })}
                      placeholder="Past medical history, allergies, medications..." rows={2} />
                  </div>
                  <div className="col-span-2 border-t pt-3">
                    <p className="text-xs font-semibold text-[var(--ds-text-secondary)] mb-2">Vitals (Optional)</p>
                    <div className="grid grid-cols-5 gap-3">
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Height (cm)</Label>
                        <NumericInput mode="decimal" decimalPlaces={1} suffix="cm" className="h-8 text-xs" value={convertForm.height} onChange={(v) => setConvertForm({ ...convertForm, height: v })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Weight (kg)</Label>
                        <NumericInput mode="decimal" decimalPlaces={1} suffix="kg" className="h-8 text-xs" value={convertForm.weight} onChange={(v) => setConvertForm({ ...convertForm, weight: v })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">BP</Label>
                        <Input className="h-8 text-xs" placeholder="120/80" value={convertForm.bp} onChange={(e) => setConvertForm({ ...convertForm, bp: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">Sugar</Label>
                        <Input className="h-8 text-xs" placeholder="mg/dL" value={convertForm.sugar} onChange={(e) => setConvertForm({ ...convertForm, sugar: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px]">SpO2 (%)</Label>
                        <NumericInput mode="decimal" decimalPlaces={1} suffix="%" className="h-8 text-xs" placeholder="98" value={convertForm.spo2} onChange={(v) => setConvertForm({ ...convertForm, spo2: v })} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {convertStep === 2 && (
            <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">Please confirm the conversion</p>
                    <p className="text-amber-700 text-xs">
                      The lead will be converted to a patient and a welcome message will be sent.
                      The original lead record will be preserved for audit purposes.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-[var(--ds-border)] p-4">
                  <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <User className="h-3.5 w-3.5" /> Lead Record
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-[var(--ds-border-light)]">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Name</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{lead.lead_name}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--ds-border-light)]">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Phone</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{lead.mobile}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--ds-border-light)]">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Status</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Source</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{lead.source?.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--ds-border)] p-4">
                  <h4 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" /> Patient Record
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-[var(--ds-border-light)]">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Name</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{convertForm.full_name || lead.lead_name}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--ds-border-light)]">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Phone</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{convertForm.phone || lead.mobile}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--ds-border-light)]">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Gender</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{convertForm.gender || lead.gender || "—"}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[var(--ds-text-secondary)] text-xs">Age</span>
                      <span className="font-medium text-[var(--ds-text)] text-xs">{convertForm.age || lead.age?.toString() || "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-semibold text-emerald-800">Post-Conversion Welcome Message</h4>
                </div>
                <p className="text-xs text-emerald-700 whitespace-pre-wrap">
                  Hello {convertForm.full_name || lead.lead_name},{'\n\n'}
                  Welcome to {lead.hospital_name || "our hospital"}.{'\n\n'}
                  Your registration has been successfully completed and your enquiry has been converted into a patient profile.{'\n\n'}
                  Thank you for choosing {lead.hospital_name || "our hospital"}.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="px-6 pb-6 pt-2 shrink-0 border-t border-[var(--ds-border-light)]">
            {convertStep === 1 ? (
              <>
                <Button variant="outline" onClick={() => { setConvertOpen(false); setConvertStep(1) }}>Cancel</Button>
                <Button onClick={() => setConvertStep(2)}>
                  <ArrowRight className="h-4 w-4 mr-1.5" /> Continue to Review
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConvertStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={convertMutation.isPending}
                  onClick={() => {
                    const cleaned: Record<string, unknown> = {}
                    for (const [key, value] of Object.entries(convertForm)) {
                      if (value !== "" && value !== undefined) {
                        if (key === "height" || key === "weight") cleaned[key] = Number(value)
                        else cleaned[key] = value
                      }
                    }
                    convertMutation.mutate(cleaned)
                  }}
                >
                  {convertMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Converting...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Conversion</>
                  )}
                </Button>
              </>
            )}
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
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
