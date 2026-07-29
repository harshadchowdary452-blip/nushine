import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  MessageSquare, Phone, Send, UserPlus, CalendarCheck, UserCheck, FileText,
  Search, Filter, Loader2, ChevronLeft, ChevronRight, MoreHorizontal, MessageCircle,
  AlertCircle, Megaphone,
} from "lucide-react"
import { campaignsApi } from "@/services/endpoints"

import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { useToast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { appointmentsApi, usersApi } from "@/services/endpoints"

interface CampaignResponse {
  id: string
  patient_name?: string
  phone?: string
  campaign_name?: string
  campaign_id?: string
  message?: string
  status?: string
  reply_time?: string
  created_at?: string
  is_lead?: boolean
  lead_status?: string
  lead_id?: string
  lead_name?: string
  email?: string
  source?: string
  assigned_staff_name?: string
  assigned_staff_id?: string
  notes?: string
  next_action?: string
  patient_id?: string
}

interface CampaignItem {
  id: string
  name?: string
}

interface StaffUser {
  id: string
  full_name: string
  role: string
}

interface DoctorOption {
  id?: string
  doctor_id?: string
  full_name?: string
  doctor_name?: string
}

interface SlotItem {
  available?: boolean
  time?: string
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

const statusStyle: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700",
  READ: "bg-purple-50 text-purple-700",
  REPLIED: "bg-green-50 text-green-700",
  FOLLOW_UP: "bg-amber-50 text-amber-700",
  CLOSED: "bg-gray-50 text-gray-600",
  SPAM: "bg-red-50 text-red-600",
}

const leadStatusStyle: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700",
  CONTACTED: "bg-indigo-50 text-indigo-700",
  INTERESTED: "bg-emerald-50 text-emerald-700",
  FOLLOW_UP_REQUIRED: "bg-amber-50 text-amber-700",
  APPOINTMENT_BOOKED: "bg-cyan-50 text-cyan-700",
  VISITED: "bg-teal-50 text-teal-700",
  CONVERTED: "bg-green-50 text-green-700",
  LOST: "bg-red-50 text-red-600",
  NOT_INTERESTED: "bg-gray-50 text-gray-600",
  NO_RESPONSE: "bg-orange-50 text-orange-700",
}

export default function CampaignResponses() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  // Filters
  const [search, setSearch] = useState("")
  const [campaignFilter, setCampaignFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Pagination
  const [page, setPage] = useState(1)
  const limit = 10

  // Dialogs
  const [replyOpen, setReplyOpen] = useState<null | { id: string; message: string; phone?: string; patientName?: string }>(null)
  const [notesOpen, setNotesOpen] = useState<null | { id: string; currentNotes?: string }>(null)
  const [assignOpen, setAssignOpen] = useState<null | { id: string; currentStaffId?: string }>(null)
  const [appointmentOpen, setAppointmentOpen] = useState<null | {
    id: string; patientId?: string; patientName?: string; phone?: string; campaignId?: string
  }>(null)
  const [convertOpen, setConvertOpen] = useState<null | {
    id: string; leadId?: string; leadName?: string; phone?: string; email?: string; source?: string; campaignId?: string
  }>(null)

  // Sub-states for dialogs
  const [replyText, setReplyText] = useState("")
  const [notesText, setNotesText] = useState("")
  const [selectedStaffId, setSelectedStaffId] = useState("")
  const [apptDoctorId, setApptDoctorId] = useState("")
  const [apptDate, setApptDate] = useState("")
  const [apptTime, setApptTime] = useState("")
  const [apptNotes, setApptNotes] = useState("")
  const [availSlots, setAvailSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  // Convert dialog sub-states
  const [convName, setConvName] = useState("")
  const [convPhone, setConvPhone] = useState("")
  const [convEmail, setConvEmail] = useState("")
  const [convGender, setConvGender] = useState("")
  const [convAge, setConvAge] = useState("")
  const [convAddress, setConvAddress] = useState("")
  const [convCreateAppt, setConvCreateAppt] = useState(false)

  // Local notes store (per response)
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  // Local staff assignments (per response)
  const [localStaff, setLocalStaff] = useState<Record<string, { id: string; name: string }>>({})

  const params: Record<string, unknown> = { skip: (page - 1) * limit, limit }
  if (search) params.search = search
  if (campaignFilter !== "all") params.campaign_id = campaignFilter
  if (statusFilter !== "all") params.status = statusFilter

  const { data: responsesData, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaign-responses", search, campaignFilter, statusFilter, page],
    queryFn: () => campaignsApi.responses(params),
    refetchInterval: 10000,
  })

  const { data: campaignsData } = useQuery({
    queryKey: ["campaigns", "list"],
    queryFn: () => campaignsApi.list(),
  })

  const { data: usersData } = useQuery({
    queryKey: ["users", "doctors-admins"],
    queryFn: () => usersApi.list({ role: "DOCTOR,HOSPITAL_ADMIN" }),
  })

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors", "available"],
    queryFn: () => campaignsApi.availableDoctors({ date: apptDate || new Date().toISOString().split("T")[0] }),
    enabled: !!apptDate,
  })

  const responses: CampaignResponse[] = Array.isArray(responsesData) ? responsesData : responsesData?.items || responsesData?.data || []
  const totalItems = responsesData?.total ?? (Array.isArray(responsesData) ? responsesData.length : 0)
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))
  const campaigns: CampaignItem[] = Array.isArray(campaignsData) ? campaignsData : campaignsData?.items || campaignsData?.data || []
  const users: StaffUser[] = Array.isArray(usersData) ? usersData : usersData?.items || usersData?.data || []
  const doctors: DoctorOption[] = Array.isArray(doctorsData) ? doctorsData : doctorsData?.items || doctorsData?.data || []

  const replyMutation = useMutation({
    mutationFn: (data: { campaignId: string; recipientId: string; message: string }) =>
      campaignsApi.recordResponse(data.campaignId, data.recipientId, { message: data.message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-responses"] })
      addToast({ title: "Reply Sent", description: "Your reply has been sent successfully", variant: "success" })
      setReplyOpen(null)
      setReplyText("")
    },
    onError: () => addToast({ title: "Error", description: "Failed to send reply", variant: "destructive" }),
  })

  const convertMutation = useMutation({
    mutationFn: (data: { campaignId: string; leadId: string; patientData: Record<string, unknown> }) =>
      campaignsApi.convertLead(data.campaignId, { lead_id: data.leadId, patient_data: data.patientData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-responses"] })
      addToast({ title: "Converted", description: "Lead converted to patient successfully", variant: "success" })
      setConvertOpen(null)
    },
    onError: () => addToast({ title: "Error", description: "Failed to convert lead", variant: "destructive" }),
  })

  const createApptMutation = useMutation({
    mutationFn: (data: { campaignId: string; patientId: string; doctorId: string; date: string; time: string; notes?: string }) =>
      campaignsApi.createAppointment(data.campaignId, {
        patient_id: data.patientId,
        doctor_id: data.doctorId,
        appointment_date: data.date,
        appointment_time: data.time,
        notes: data.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-responses"] })
      addToast({ title: "Appointment Created", description: "Appointment has been booked successfully", variant: "success" })
      setAppointmentOpen(null)
      setApptDoctorId("")
      setApptDate("")
      setApptTime("")
      setApptNotes("")
      setAvailSlots([])
    },
    onError: () => addToast({ title: "Error", description: "Failed to create appointment", variant: "destructive" }),
  })

  const handleSaveNotes = (responseId: string) => {
    setLocalNotes((prev) => ({ ...prev, [responseId]: notesText }))
    addToast({ title: "Notes Saved", description: "Notes have been updated", variant: "success" })
    setNotesOpen(null)
    setNotesText("")
  }

  const handleAssignStaff = (responseId: string) => {
    const user = users.find((u: StaffUser) => u.id === selectedStaffId)
    if (!user) return
    setLocalStaff((prev) => ({ ...prev, [responseId]: { id: user.id, name: user.full_name } }))
    addToast({ title: "Staff Assigned", description: `Assigned to ${user.full_name}`, variant: "success" })
    setAssignOpen(null)
    setSelectedStaffId("")
  }

  const handleLoadSlots = async (doctorId: string, date: string) => {
    if (!doctorId || !date) return
    setSlotsLoading(true)
    try {
      const result = await appointmentsApi.slots({ doctor_id: doctorId, date })
      const data: SlotItem[] = Array.isArray(result) ? result : result?.slots || []
      const available = data.filter((s: SlotItem) => s.available !== false).map((s: SlotItem) => String(s.time || s))
      setAvailSlots(available.length > 0 ? available : [])
    } catch {
      setAvailSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }

  useEffect(() => {
    if (apptDoctorId && apptDate) {
      handleLoadSlots(apptDoctorId, apptDate)
    }
  }, [apptDoctorId, apptDate])

  const handleOpenNotes = (resp: CampaignResponse) => {
    setNotesText(localNotes[resp.id] || resp.notes || "")
    setNotesOpen({ id: resp.id, currentNotes: localNotes[resp.id] || resp.notes })
  }

  const handleOpenAssign = (resp: CampaignResponse) => {
    setSelectedStaffId(localStaff[resp.id]?.id || resp.assigned_staff_id || "")
    setAssignOpen({ id: resp.id, currentStaffId: localStaff[resp.id]?.id || resp.assigned_staff_id })
  }

  const handleOpenAppointment = (resp: CampaignResponse) => {
    setApptDoctorId("")
    setApptDate("")
    setApptTime("")
    setApptNotes("")
    setAvailSlots([])
    setAppointmentOpen({
      id: resp.id,
      patientId: resp.patient_id,
      patientName: resp.patient_name,
      phone: resp.phone,
      campaignId: resp.campaign_id,
    })
  }

  const handleOpenConvert = (resp: CampaignResponse) => {
    setConvName(resp.patient_name || "")
    setConvPhone(resp.phone || "")
    setConvEmail("")
    setConvGender("")
    setConvAge("")
    setConvAddress("")
    setConvCreateAppt(false)
    setConvertOpen({
      id: resp.id,
      leadId: resp.lead_id,
      leadName: resp.patient_name,
      phone: resp.phone,
      email: resp.email,
      source: resp.source || "CAMPAIGN",
      campaignId: resp.campaign_id,
    })
  }

  const handleConvert = () => {
    if (!convertOpen) return
    const patientData: Record<string, unknown> = {
      full_name: convName || convertOpen.leadName,
      phone: convPhone || convertOpen.phone,
      email: convEmail || convertOpen.email || undefined,
      gender: convGender || undefined,
      age: convAge ? parseInt(convAge, 10) : undefined,
      address: convAddress || undefined,
      source: "CAMPAIGN",
      source_campaign_id: convertOpen.campaignId,
    }
    convertMutation.mutate({
      campaignId: convertOpen.campaignId || convertOpen.id,
      leadId: convertOpen.leadId || "",
      patientData,
    })
  }

  const handleReply = () => {
    if (!replyOpen || !replyText.trim()) return
    replyMutation.mutate({
      campaignId: replyOpen.id,
      recipientId: replyOpen.id,
      message: replyText,
    })
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
  }

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "-"
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
        " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    } catch {
      return dateStr
    }
  }

  const getStatusBadge = (status?: string, map?: Record<string, string>) => {
    const m = map || statusStyle
    return m[status || ""] || "bg-gray-50 text-gray-600"
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <p className="text-sm text-gray-500">
          Showing {Math.min((page - 1) * limit + 1, totalItems)} to {Math.min(page * limit, totalItems)} of {totalItems}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="icon-sm"
                onClick={() => handlePageChange(p)}
                className={cn(p === page && "bg-blue-600 text-white hover:bg-blue-700")}
              >
                {p}
              </Button>
            )
          })}
          <Button variant="ghost" size="icon-sm" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="Campaign Responses" description="Track and manage all campaign replies" />

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by sender name or phone..."
                className="pl-10"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select value={campaignFilter} onValueChange={(v) => { setCampaignFilter(v); setPage(1) }}>
                <SelectTrigger className="w-44">
                  <Megaphone className="h-4 w-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="All Campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map((c: CampaignItem) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="w-36">
                  <Filter className="h-4 w-4 mr-2 text-gray-400" />
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="READ">Read</SelectItem>
                  <SelectItem value="REPLIED">Replied</SelectItem>
                  <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="SPAM">Spam</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Responses Table */}
      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-lg">Responses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <AlertCircle className="h-10 w-10 mb-2" />
              <p className="text-sm">Failed to load responses</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : responses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <MessageSquare className="h-10 w-10 mb-2" />
              <p className="text-sm">
                {search || campaignFilter !== "all" || statusFilter !== "all"
                  ? "No responses match your filters"
                  : "No campaign responses yet"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sender</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead className="max-w-xs">Message</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reply Time</TableHead>
                      <TableHead>Lead Status</TableHead>
                      <TableHead>Assigned Staff</TableHead>
                      <TableHead>Next Action</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responses.map((resp: CampaignResponse) => {
                      const assigned = localStaff[resp.id]
                      const staffName = assigned?.name || resp.assigned_staff_name || "-"
                      const respNotes = localNotes[resp.id] || resp.notes
                      return (
                        <TableRow key={resp.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm text-gray-900">{resp.patient_name || "-"}</span>
                              {resp.phone && <span className="text-xs text-gray-400">{resp.phone}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-gray-700">{resp.campaign_name || "-"}</span>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <p className="truncate text-sm text-gray-600" title={resp.message}>{resp.message}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs", getStatusBadge(resp.status))}>
                              {resp.status || "NEW"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(resp.reply_time || resp.created_at)}</span>
                          </TableCell>
                          <TableCell>
                            {resp.is_lead ? (
                              <Badge variant="outline" className={cn("text-xs", getStatusBadge(resp.lead_status, leadStatusStyle))}>
                                {resp.lead_status || "NEW"}
                              </Badge>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-gray-700">{staffName}</span>
                          </TableCell>
                          <TableCell>
                            {resp.next_action ? (
                              <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5">{resp.next_action}</span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => window.open(`tel:${resp.phone}`, "_self")} disabled={!resp.phone}>
                                  <Phone className="h-4 w-4 mr-2" /> Call
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => window.open(`https://wa.me/${resp.phone?.replace(/[^0-9]/g, "")}`, "_blank")}
                                  disabled={!resp.phone}
                                >
                                  <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setReplyText(""); setReplyOpen({ id: resp.id, message: resp.message || "", phone: resp.phone, patientName: resp.patient_name }) }}>
                                  <Send className="h-4 w-4 mr-2" /> Reply
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenNotes(resp)}>
                                  <FileText className="h-4 w-4 mr-2" /> Add Notes{respNotes ? " (has notes)" : ""}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenAssign(resp)}>
                                  <UserCheck className="h-4 w-4 mr-2" /> Assign Staff
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenAppointment(resp)} disabled={!resp.patient_id && !resp.lead_id}>
                                  <CalendarCheck className="h-4 w-4 mr-2" /> Create Appointment
                                </DropdownMenuItem>
                                {resp.is_lead && (
                                  <DropdownMenuItem onClick={() => handleOpenConvert(resp)}>
                                    <UserPlus className="h-4 w-4 mr-2" /> Convert To Patient
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {renderPagination()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Reply Dialog */}
      <Dialog open={!!replyOpen} onOpenChange={(o) => { if (!o) { setReplyOpen(null); setReplyText("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reply to {replyOpen?.patientName || "Sender"}</DialogTitle>
            <DialogDescription>Send a reply message</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {replyOpen && (
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  <p className="font-medium text-gray-800 mb-1">Original message:</p>
                  <p>{replyOpen.message}</p>
                </div>
                <div className="space-y-2">
                  <Label>Your Reply</Label>
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={4}
                    placeholder="Type your reply..."
                  />
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReplyOpen(null); setReplyText("") }}>Cancel</Button>
            <Button onClick={handleReply} disabled={!replyText.trim() || replyMutation.isPending} className="gap-2">
              {replyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" /> Send Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={!!notesOpen} onOpenChange={(o) => { if (!o) { setNotesOpen(null); setNotesText("") } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Notes</DialogTitle>
            <DialogDescription>Internal notes for this response</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={5}
                placeholder="Enter your notes..."
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNotesOpen(null); setNotesText("") }}>Cancel</Button>
            <Button onClick={() => notesOpen && handleSaveNotes(notesOpen.id)} disabled={!notesText.trim()} className="gap-2">
              <FileText className="h-4 w-4" /> Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Staff Dialog */}
      <Dialog open={!!assignOpen} onOpenChange={(o) => { if (!o) { setAssignOpen(null); setSelectedStaffId("") } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Staff</DialogTitle>
            <DialogDescription>Select a staff member to handle this response</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Label>Staff Member</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {users.length === 0 ? (
                    <SelectItem value="_none" disabled>No staff available</SelectItem>
                  ) : (
                    users.map((u: StaffUser) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.role.replace(/_/g, " ")})</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignOpen(null); setSelectedStaffId("") }}>Cancel</Button>
            <Button onClick={() => assignOpen && handleAssignStaff(assignOpen.id)} disabled={!selectedStaffId} className="gap-2">
              <UserCheck className="h-4 w-4" /> Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Appointment Dialog */}
      <Dialog open={!!appointmentOpen} onOpenChange={(o) => { if (!o) { setAppointmentOpen(null); setAvailSlots([]) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Appointment</DialogTitle>
            <DialogDescription>Book an appointment for this patient</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {appointmentOpen && (
              <div className="space-y-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-800">{appointmentOpen.patientName || "Patient"}</p>
                  {appointmentOpen.phone && <p className="text-xs text-gray-500">{appointmentOpen.phone}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Doctor</Label>
                  <Select value={apptDoctorId} onValueChange={setApptDoctorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select doctor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.length === 0 ? (
                        <SelectItem value="_none" disabled>No doctors available</SelectItem>
                      ) : (
                        doctors.map((d: DoctorOption) => (
                          <SelectItem key={d.id || d.doctor_id} value={d.id || d.doctor_id || ""}>
                            {d.full_name || d.doctor_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <input
                    type="date"
                    value={apptDate}
                    onChange={(e) => setApptDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time Slot</Label>
                  {slotsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading slots...
                    </div>
                  ) : availSlots.length === 0 && apptDoctorId && apptDate ? (
                    <p className="text-sm text-amber-600">No available slots for this date/doctor</p>
                  ) : (
                    <Select value={apptTime} onValueChange={setApptTime} disabled={availSlots.length === 0}>
                      <SelectTrigger>
                        <SelectValue placeholder={availSlots.length === 0 ? "Select doctor & date first..." : "Select time..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {availSlots.map((slot: string) => (
                          <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={apptNotes}
                    onChange={(e) => setApptNotes(e.target.value)}
                    rows={2}
                    placeholder="Any special notes for the appointment..."
                  />
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAppointmentOpen(null); setAvailSlots([]) }}>Cancel</Button>
            <Button
              onClick={() => appointmentOpen && createApptMutation.mutate({
                campaignId: appointmentOpen.campaignId || appointmentOpen.id,
                patientId: appointmentOpen.patientId || "",
                doctorId: apptDoctorId,
                date: apptDate,
                time: apptTime,
                notes: apptNotes || undefined,
              })}
              disabled={!apptDoctorId || !apptDate || !apptTime || createApptMutation.isPending}
              className="gap-2"
            >
              {createApptMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <CalendarCheck className="h-4 w-4" /> Create Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert To Patient Dialog */}
      <Dialog open={!!convertOpen} onOpenChange={(o) => { if (!o) setConvertOpen(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convert To Patient</DialogTitle>
            <DialogDescription>Convert this lead into a patient record</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {convertOpen && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 p-3 border border-amber-200">
                  <p className="text-sm font-medium text-amber-800 mb-1">Lead Information</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-amber-700">
                    <span>Name: {convertOpen.leadName || "-"}</span>
                    <span>Phone: {convertOpen.phone || "-"}</span>
                    <span>Email: {convertOpen.email || "-"}</span>
                    <span>Source: {convertOpen.source || "CAMPAIGN"}</span>
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <p className="text-sm font-medium text-gray-700">Patient Details</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full Name *</Label>
                      <Input value={convName} onChange={(e) => setConvName(e.target.value)} placeholder="Patient name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone *</Label>
                      <Input value={convPhone} onChange={(e) => setConvPhone(e.target.value)} placeholder="Phone number" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={convEmail} onChange={(e) => setConvEmail(e.target.value)} placeholder="Email address" />
                    </div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Select value={convGender} onValueChange={setConvGender}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MALE">Male</SelectItem>
                          <SelectItem value="FEMALE">Female</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Age</Label>
                      <NumericInput value={convAge} onChange={(v) => setConvAge(v)} placeholder="Age" mode="integer" min={0} max={150} />
                    </div>
                    <div className="space-y-2">
                      <Label>OP Number</Label>
                      <Input value="Auto-generated" disabled className="text-gray-400" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Textarea value={convAddress} onChange={(e) => setConvAddress(e.target.value)} rows={2} placeholder="Full address" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="create-appt"
                      checked={convCreateAppt}
                      onChange={(e) => setConvCreateAppt(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <Label htmlFor="create-appt" className="text-sm cursor-pointer">Create Appointment after conversion</Label>
                  </div>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(null)}>Cancel</Button>
            <Button
              onClick={handleConvert}
              disabled={!convName || !convPhone || convertMutation.isPending}
              className="gap-2"
            >
              {convertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <UserPlus className="h-4 w-4" /> Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
