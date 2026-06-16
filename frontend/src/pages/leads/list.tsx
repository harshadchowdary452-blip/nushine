import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Plus, Search, Eye, Phone, MessageSquare, Users, UserPlus, Calendar, MoreHorizontal, Star, ArrowUpDown, ChevronDown, Target, IndianRupee } from "lucide-react"
import { format } from "date-fns"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { leadsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import DentalEmptyState from "@/components/ui/dental-empty-state"
import { useAuthStore } from "@/store/authStore"
import type { Lead, LeadSource, LeadStatus } from "@/types"

const priorityColors: Record<string, string> = {
  HIGH: "text-red-600 bg-red-50",
  MEDIUM: "text-amber-600 bg-amber-50",
  LOW: "text-green-600 bg-green-50",
}

const statusColors: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700 ring-blue-600/20",
  CONTACTED: "bg-purple-50 text-purple-700 ring-purple-600/20",
  INTERESTED: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  FOLLOW_UP_REQUIRED: "bg-amber-50 text-amber-700 ring-amber-600/20",
  APPOINTMENT_BOOKED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  VISITED: "bg-teal-50 text-teal-700 ring-teal-600/20",
  CONVERTED: "bg-green-50 text-green-700 ring-green-600/20",
  LOST: "bg-red-50 text-red-700 ring-red-600/20",
  NOT_INTERESTED: "bg-gray-50 text-gray-600 ring-gray-500/20",
  NO_RESPONSE: "bg-orange-50 text-orange-700 ring-orange-600/20",
}

const sourceOptions: LeadSource[] = [
  "GOOGLE_SEARCH", "GOOGLE_MAPS", "INSTAGRAM", "FACEBOOK", "WHATSAPP",
  "WEBSITE", "WALK_IN", "REFERRAL", "DOCTOR_REFERRAL", "CLINIC_REFERRAL",
  "CAMPAIGN", "ADVERTISEMENT", "BANNER", "NEWSPAPER", "YOUTUBE", "EVENT", "OTHER",
]

const statusOptions: LeadStatus[] = [
  "NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_BOOKED",
  "VISITED", "CONVERTED", "LOST", "NOT_INTERESTED", "NO_RESPONSE",
]

export default function LeadList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const { user } = useAuthStore()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sourceFilter, setSourceFilter] = useState("")
  const [sortField, setSortField] = useState<string>("created_at")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [createOpen, setCreateOpen] = useState(false)
  const [leadName, setLeadName] = useState("")
  const [mobile, setMobile] = useState("")
  const [alternateMobile, setAlternateMobile] = useState("")
  const [email, setEmail] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("")
  const [city, setCity] = useState("")
  const [source, setSource] = useState("OTHER")
  const [interestedTreatment, setInterestedTreatment] = useState("")
  const [budget, setBudget] = useState("")
  const [preferredVisitDate, setPreferredVisitDate] = useState("")
  const [notes, setNotes] = useState("")

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", statusFilter, sourceFilter],
    queryFn: () => leadsApi.list({ status: statusFilter || undefined, source: sourceFilter || undefined }),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => leadsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
      addToast({ title: "Lead Created", variant: "success" })
      setCreateOpen(false); resetForm()
    },
    onError: () => addToast({ title: "Error", description: "Failed to create lead", variant: "destructive" }),
  })

  const items: Lead[] = Array.isArray(leads) ? leads : []

  const filtered = useMemo(() => {
    let result = items
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((l) =>
        l.lead_name.toLowerCase().includes(q) ||
        l.mobile.includes(q) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.city && l.city.toLowerCase().includes(q))
      )
    }
    result.sort((a, b) => {
      let cmp = 0
      if (sortField === "lead_name") cmp = a.lead_name.localeCompare(b.lead_name)
      else if (sortField === "created_at") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      else if (sortField === "lead_score") cmp = (a.lead_score ?? 0) - (b.lead_score ?? 0)
      else if (sortField === "next_follow_up_date") cmp = (a.next_follow_up_date || "").localeCompare(b.next_follow_up_date || "")
      else cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDir === "desc" ? -cmp : cmp
    })
    return result
  }, [items, search, sortField, sortDir])

  function resetForm() {
    setLeadName(""); setMobile(""); setAlternateMobile(""); setEmail("")
    setAge(""); setGender(""); setCity(""); setSource("OTHER")
    setInterestedTreatment(""); setBudget(""); setPreferredVisitDate(""); setNotes("")
  }

  function handleCreate() {
    if (!leadName.trim() || !mobile.trim()) {
      addToast({ title: "Validation", description: "Name and mobile are required", variant: "destructive" })
      return
    }
    createMutation.mutate({
      lead_name: leadName, mobile, alternate_mobile: alternateMobile || undefined,
      email: email || undefined, age: age ? parseInt(age) : undefined,
      gender: gender || undefined, city: city || undefined,
      source, interested_treatment: interestedTreatment || undefined,
      budget: budget ? parseFloat(budget) : undefined,
      preferred_visit_date: preferredVisitDate || undefined,
      notes: notes || undefined,
    })
  }

  function toggleSort(field: string) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortField(field); setSortDir("desc") }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <PageHeader title="Leads" description="Manage incoming patient inquiries and leads">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Lead
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input placeholder="Search by name, phone, email, city..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <DentalEmptyState
          icon={UserPlus}
          title="No leads yet"
          description="Add your first lead to start tracking inquiries"
          action={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Lead</Button>}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort("lead_name")}>
                  <div className="flex items-center gap-1">Lead Name <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Contact</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Source</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Treatment</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Priority</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort("next_follow_up_date")}>
                  <div className="flex items-center gap-1">Next Follow-up <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort("lead_score")}>
                  <div className="flex items-center gap-1">Score <ArrowUpDown className="h-3 w-3" /></div>
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
                <th className="text-right px-3 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-[#E0F2FE] flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-[#0EA5E9]" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 truncate max-w-[160px]">{lead.lead_name}</p>
                        <p className="text-xs text-gray-400">#{lead.id.slice(-6).toUpperCase()}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-gray-700">{lead.mobile}</p>
                    {lead.email && <p className="text-xs text-gray-400 truncate max-w-[140px]">{lead.email}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">{lead.source?.replace(/_/g, " ")}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs text-gray-600">{lead.interested_treatment || "—"}</span>
                  </td>
                  <td className="px-3 py-3">
                    {lead.priority && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${priorityColors[lead.priority] || priorityColors.MEDIUM}`}>
                        <Star className="h-3 w-3" fill={lead.priority === "HIGH" ? "currentColor" : "none"} />
                        {lead.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {lead.next_follow_up_date ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span className={new Date(lead.next_follow_up_date) < new Date() ? "text-red-600 font-medium" : "text-gray-600"}>
                          {format(new Date(lead.next_follow_up_date), "dd MMM")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-12 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-[#0EA5E9] rounded-full" style={{ width: `${Math.min((lead.lead_score ?? 0) / 100 * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-600">{lead.lead_score ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusColors[lead.status] || statusColors.NEW}`}>
                      {lead.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}>
                          <Eye className="h-4 w-4 mr-2" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}>
                          <Phone className="h-4 w-4 mr-2" /> Log Call
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}>
                          <MessageSquare className="h-4 w-4 mr-2" /> Send Message
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}>
                          <Calendar className="h-4 w-4 mr-2" /> Schedule Follow-up
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}>
                          <Calendar className="h-4 w-4 mr-2" /> Book Appointment
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {lead.status !== "CONVERTED" && lead.status !== "LOST" && lead.status !== "NOT_INTERESTED" && lead.status !== "NO_RESPONSE" && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`) }}>
                            <Target className="h-4 w-4 mr-2" /> Convert
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Lead</DialogTitle>
            <DialogDescription>Enter the lead details below</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2"><Label>Lead Name *</Label><Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Full name" /></div>
            <div><Label>Mobile *</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Phone number" /></div>
            <div><Label>Alternate Mobile</Label><Input value={alternateMobile} onChange={(e) => setAlternateMobile(e.target.value)} placeholder="Alt phone" /></div>
            <div className="col-span-2"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" /></div>
            <div><Label>Age</Label><Input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" /></div>
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
            <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" /></div>
            <div><Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Interested Treatment</Label><Input value={interestedTreatment} onChange={(e) => setInterestedTreatment(e.target.value)} placeholder="e.g. Root Canal" /></div>
            <div><Label>Budget (if known)</Label><Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Amount" /></div>
            <div className="col-span-2"><Label>Preferred Visit Date</Label><Input type="date" value={preferredVisitDate} onChange={(e) => setPreferredVisitDate(e.target.value)} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
