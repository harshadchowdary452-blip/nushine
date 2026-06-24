import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, CheckCircle, Loader2, Phone, MessageCircle, MessageSquare, Clock, User, FileText } from "lucide-react"
import { format } from "date-fns"
import { crmApi, treatmentFollowUpsApi, patientsApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const typeLabels: Record<string, string> = {
  "1_DAY_POST_TREATMENT": "1-Day Post Tx",
  "7_DAY_POST_TREATMENT": "7-Day Post Tx",
  "6_MONTH_RECALL": "6-Month Recall",
  "12_MONTH_RECALL": "12-Month Recall",
  "CUSTOM_RECALL": "Custom Recall",
  "TREATMENT_FOLLOW_UP": "Treatment FU",
  "ENQUIRY": "Enquiry",
  "MANUAL": "Manual",
}

const outcomeOptions = [
  { value: "DOING_WELL", label: "Doing Well" },
  { value: "MINOR_PAIN", label: "Minor Pain" },
  { value: "MAJOR_PAIN", label: "Major Pain" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "NEEDS_APPOINTMENT", label: "Needs Appointment" },
  { value: "TREATMENT_SUCCESSFUL", label: "Treatment Successful" },
  { value: "NO_RESPONSE", label: "No Response" },
]

const statusColors: Record<string, string> = {
  OPEN: "bg-yellow-50 text-yellow-700",
  SCHEDULED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-gray-50 text-gray-500",
}

const filterOptions = [
  { value: "", label: "All Types" },
  { value: "1_DAY_POST_TREATMENT", label: "1-Day Post Tx" },
  { value: "7_DAY_POST_TREATMENT", label: "7-Day Post Tx" },
  { value: "MANUAL", label: "Manual" },
  { value: "TREATMENT_FOLLOW_UP", label: "Treatment FU" },
]

export default function FollowUps() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [open, setOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [notes, setNotes] = useState("")
  const [outcomeOpen, setOutcomeOpen] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("DOING_WELL")
  const [outcomeNotes, setOutcomeNotes] = useState("")

  const { data: followUps, isLoading } = useQuery({
    queryKey: ["treatment-follow-ups", typeFilter, statusFilter],
    queryFn: () => treatmentFollowUpsApi.list({ type: typeFilter || undefined, status: statusFilter || undefined }),
  })
  const items: any[] = followUps || []

  const { data: patients } = useQuery({
    queryKey: ["patients", "follow-ups"],
    queryFn: () => patientsApi.list({ page_size: 200 }),
  })
  const patientList: any[] = patients?.items || patients || []

  const createMutation = useMutation({
    mutationFn: () => crmApi.followUps.create({
      patient_id: selectedPatient,
      follow_up_date: followUpDate,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-follow-ups"] })
      addToast({ title: "Created", variant: "success" })
      setOpen(false); setSelectedPatient(""); setFollowUpDate(""); setNotes("")
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => treatmentFollowUpsApi.complete(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-follow-ups"] })
      addToast({ title: "Completed", variant: "success" })
      setOutcomeOpen(null); setOutcome("DOING_WELL"); setOutcomeNotes("")
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" }),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Follow-Ups" description="Treatment follow-ups & post-treatment checks">
        <Button onClick={() => setOpen(true)}><CalendarDays className="h-4 w-4 mr-1" /> New Follow-Up</Button>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-primary">
          {filterOptions.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-primary">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No follow-ups found</div>
          ) : (
            <div className="space-y-3 max-h-[700px] overflow-y-auto">
              {items.map((f: any) => (
                <div key={f.id} className="rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{f.patient_name}</span>
                        <Badge variant="outline" className="text-[10px]">{typeLabels[f.follow_up_type] || f.follow_up_type}</Badge>
                        <Badge className={`text-[10px] ${statusColors[f.status] || ""}`}>{f.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {f.patient_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {f.patient_phone}</div>}
                        {f.doctor_name && <div className="flex items-center gap-1"><User className="h-3 w-3" /> Dr. {f.doctor_name}</div>}
                        {f.treatment_name && <div className="flex items-center gap-1"><FileText className="h-3 w-3" /> {f.treatment_name}</div>}
                        <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Due: {f.follow_up_date}</div>
                        {f.treatment_completed_date && <div>Tx completed: {f.treatment_completed_date}</div>}
                        {f.outcome && <div>Outcome: {f.outcome}</div>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {f.status !== "COMPLETED" && (
                        <>
                          {f.patient_phone && (
                            <Button variant="ghost" size="icon-sm" className="text-green-600" onClick={() => window.open(`tel:${f.patient_phone}`)} title="Call">
                              <Phone className="h-4 w-4" />
                            </Button>
                          )}
                          {f.patient_phone && (
                            <Button variant="ghost" size="icon-sm" className="text-blue-600" onClick={() => window.open(`https://wa.me/${f.patient_phone}`)} title="WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" className="text-green-600"
                            onClick={() => { setOutcomeOpen(f.id); setOutcome(""); setOutcomeNotes("") }} title="Complete">
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Follow-Up</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Patient</Label>
              <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                <SelectTrigger><SelectValue placeholder="Select patient..." /></SelectTrigger>
                <SelectContent>
                  {patientList.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Follow-Up Date</Label>
              <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!selectedPatient || !followUpDate}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!outcomeOpen} onOpenChange={(o) => { if (!o) setOutcomeOpen(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Record Outcome</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {outcomeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} rows={2} />
            </div>
            <Button className="w-full" onClick={() => { if (outcomeOpen) completeMutation.mutate({ id: outcomeOpen, data: { outcome, notes: outcomeNotes || undefined } }) }} disabled={!outcome}>
              Save Outcome & Complete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
