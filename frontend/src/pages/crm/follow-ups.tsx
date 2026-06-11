import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, CheckCircle, XCircle, Loader2, Plus } from "lucide-react"
import { crmApi, patientsApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

const statusBadge: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-gray-50 text-gray-500",
}

export default function FollowUps() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState("")
  const [followUpDate, setFollowUpDate] = useState("")
  const [notes, setNotes] = useState("")

  const { data: followUps, isLoading } = useQuery({
    queryKey: ["crm", "follow-ups"],
    queryFn: () => crmApi.followUps.list(),
  })

  const { data: patients } = useQuery({
    queryKey: ["patients", "follow-ups"],
    queryFn: () => patientsApi.list({ page_size: 200 }),
  })

  const patientList: any[] = patients?.items || patients || []

  const createMutation = useMutation({
    mutationFn: () =>
      crmApi.followUps.create({ patient_id: selectedPatient, follow_up_date: followUpDate, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "follow-ups"] })
      addToast({ title: "Created", description: "Follow-up scheduled", variant: "success" })
      setOpen(false); setSelectedPatient(""); setFollowUpDate(""); setNotes("")
    },
    onError: () => addToast({ title: "Error", description: "Failed to create follow-up", variant: "destructive" }),
  })

  const completeMutation = useMutation({
    mutationFn: (id: string) => crmApi.followUps.update(id, { status: "COMPLETED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "follow-ups"] })
      addToast({ title: "Completed", description: "Follow-up marked as done", variant: "success" })
    },
  })

  const items: any[] = followUps || []

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="Follow-Ups" description="Schedule and manage patient follow-ups">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Follow-Up</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule Follow-Up</DialogTitle>
            </DialogHeader>
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
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes..." />
              </div>
              <Button className="w-full gap-2" onClick={() => createMutation.mutate()} disabled={!selectedPatient || !followUpDate || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Schedule
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Follow-Ups</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No follow-ups scheduled</div>
          ) : (
            <div className="space-y-3">
              {items.map((f: any) => (
                <div key={f.id} className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-gray-50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">Patient #{f.patient_id?.slice(-6)}</span>
                      <Badge className={`text-xs ${statusBadge[f.status] || "bg-gray-50 text-gray-600"}`}>
                        {f.status || "PENDING"}
                      </Badge>
                      <span className="ml-auto text-xs text-gray-400">
                        {f.follow_up_date ? new Date(f.follow_up_date).toLocaleDateString() : ""}
                      </span>
                    </div>
                    {f.notes && <p className="mt-1 text-sm text-gray-600">{f.notes}</p>}
                    <p className="mt-1 text-xs text-gray-400">Created: {new Date(f.created_at).toLocaleDateString()}</p>
                  </div>
                  {f.status !== "COMPLETED" && f.status !== "CANCELLED" && (
                    <Button variant="ghost" size="icon-sm" className="shrink-0 text-green-600"
                      onClick={() => completeMutation.mutate(f.id)}
                      disabled={completeMutation.isPending}>
                      <CheckCircle className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
