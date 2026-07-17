import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, CheckCircle, Loader2, Phone, MessageCircle, User, FileText, RefreshCw } from "lucide-react"
import { recallsApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { extractDetail } from "@/types"

interface RecallItem {
  id: string
  patient_name: string
  follow_up_type: string
  status: string
  patient_phone: string | null
  doctor_name: string | null
  treatment_name: string | null
  follow_up_date: string
  treatment_completed_date: string | null
  outcome: string | null
}

interface RecallCompletePayload {
  outcome: string
  notes?: string
  next_recall_date?: string
}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const typeLabels: Record<string, string> = {
  "6_MONTH_RECALL": "6-Month Recall",
  "12_MONTH_RECALL": "12-Month Recall",
  "CUSTOM_RECALL": "Custom Recall",
}

const outcomeOptions = [
  { value: "DOING_WELL", label: "Doing Well" },
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "NEEDS_APPOINTMENT", label: "Needs Appointment" },
  { value: "TREATMENT_SUCCESSFUL", label: "Treatment Successful" },
  { value: "NO_RESPONSE", label: "No Response" },
]

const statusColors: Record<string, string> = {
  OPEN: "bg-yellow-50 text-yellow-700",
  SCHEDULED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
}

export default function Recalls() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState("open")
  const [typeFilter, setTypeFilter] = useState("")
  const [completeOpen, setCompleteOpen] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("DOING_WELL")
  const [outcomeNotes, setOutcomeNotes] = useState("")
  const [nextRecallDate, setNextRecallDate] = useState("")

  const { data: recalls, isLoading } = useQuery({
    queryKey: ["recalls", activeTab, typeFilter],
    queryFn: () => recallsApi.list({
      status: activeTab === "open" ? undefined : activeTab === "overdue" ? undefined : "COMPLETED",
      overdue_only: activeTab === "overdue" || undefined,
      type: typeFilter || undefined,
    }),
  })
  const items: RecallItem[] = recalls || []

  const { data: stats } = useQuery({
    queryKey: ["recalls", "stats"],
    queryFn: () => recallsApi.stats(),
  })

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecallCompletePayload }) => recallsApi.complete(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recalls"] })
      addToast({ title: "Completed", variant: "success" })
      setCompleteOpen(null); setOutcome("DOING_WELL"); setOutcomeNotes(""); setNextRecallDate("")
    },
    onError: (err: unknown) => addToast({ title: "Error", description: extractDetail(err) || "Failed", variant: "destructive" }),
  })

  const generateMutation = useMutation({
    mutationFn: () => recallsApi.generate(),
    onSuccess: (data: { created: number }) => {
      queryClient.invalidateQueries({ queryKey: ["recalls"] })
      addToast({ title: "Generated", description: `${data.created} recalls created`, variant: "success" })
    },
    onError: (err: unknown) => addToast({ title: "Error", description: extractDetail(err) || "Failed", variant: "destructive" }),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Patient Recalls" description="6-month and 12-month recall management">
        <Button variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
          <RefreshCw className="h-4 w-4 mr-1" /> Generate Recalls
        </Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{stats?.total || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Open</p><p className="text-xl font-bold text-amber-600">{stats?.open || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-xl font-bold text-red-600">{stats?.overdue || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold text-green-600">{stats?.completed || 0}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs outline-none focus:border-primary ml-2">
          <option value="">All Types</option>
          <option value="6_MONTH_RECALL">6-Month Recall</option>
          <option value="12_MONTH_RECALL">12-Month Recall</option>
          <option value="CUSTOM_RECALL">Custom Recall</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No recalls found</div>
          ) : (
            <div className="space-y-3 max-h-[700px] overflow-y-auto">
              {items.map((r) => (
                <div key={r.id} className="rounded-lg border p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{r.patient_name}</span>
                        <Badge variant="outline" className="text-[10px]">{typeLabels[r.follow_up_type] || r.follow_up_type}</Badge>
                        <Badge className={`text-[10px] ${statusColors[r.status] || ""}`}>{r.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {r.patient_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {r.patient_phone}</div>}
                        {r.doctor_name && <div className="flex items-center gap-1"><User className="h-3 w-3" /> Dr. {r.doctor_name}</div>}
                        {r.treatment_name && <div className="flex items-center gap-1"><FileText className="h-3 w-3" /> {r.treatment_name}</div>}
                        <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Recall: {r.follow_up_date}</div>
                        {r.treatment_completed_date && <div>Tx: {r.treatment_completed_date}</div>}
                        {r.outcome && <div>Outcome: {r.outcome}</div>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {r.status !== "COMPLETED" && (
                        <>
                          {r.patient_phone && (
                            <Button variant="ghost" size="icon-sm" className="text-green-600" onClick={() => window.open(`tel:${r.patient_phone}`)} title="Call">
                              <Phone className="h-4 w-4" />
                            </Button>
                          )}
                          {r.patient_phone && (
                            <Button variant="ghost" size="icon-sm" className="text-blue-600" onClick={() => window.open(`https://wa.me/${r.patient_phone}`)} title="WhatsApp">
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" className="text-green-600"
                            onClick={() => { setCompleteOpen(r.id); setOutcome(""); setOutcomeNotes(""); setNextRecallDate("") }} title="Complete">
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

      <Dialog open={!!completeOpen} onOpenChange={(o) => { if (!o) setCompleteOpen(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Complete Recall</DialogTitle></DialogHeader>
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
            <div className="space-y-2">
              <Label>Next Recall Date (optional)</Label>
              <Input type="date" value={nextRecallDate} onChange={(e) => setNextRecallDate(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => {
              if (completeOpen) completeMutation.mutate({
                id: completeOpen,
                data: { outcome, notes: outcomeNotes || undefined, next_recall_date: nextRecallDate || undefined }
              })
            }} disabled={!outcome}>
              Complete Recall
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
