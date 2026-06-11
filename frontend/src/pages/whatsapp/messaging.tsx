import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Send, MessageSquare, Users as UsersIcon, Search, Loader2, CheckCircle, XCircle } from "lucide-react"
import { patientsApi, whatsappApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Patient } from "@/types"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

const templates = [
  { label: "Appointment Reminder", message: "Dear {name}, this is a reminder about your upcoming dental appointment. Please arrive 15 minutes early. - NuShine Dental" },
  { label: "Follow-Up", message: "Dear {name}, this is a follow-up reminder for your dental visit. Please contact us to schedule. - NuShine Dental" },
  { label: "Payment Reminder", message: "Dear {name}, this is a gentle reminder about your pending payment. Please clear it at your earliest convenience. - NuShine Dental" },
  { label: "Custom", message: "" },
]

export default function WhatsAppMessaging() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [mode, setMode] = useState<"single" | "broadcast">("single")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<string>("")
  const [selectedPatients, setSelectedPatients] = useState<string[]>([])
  const [template, setTemplate] = useState("")

  const { data: patients } = useQuery({
    queryKey: ["patients", "whatsapp"],
    queryFn: () => patientsApi.list({ page_size: 200 }),
  })

  const patientList: Patient[] = patients?.items || patients || []

  const sendMutation = useMutation({
    mutationFn: () => whatsappApi.send({ phone, message, patient_id: selectedPatient || undefined }),
    onSuccess: () => {
      addToast({ title: "Sent!", description: "WhatsApp message sent successfully", variant: "success" })
      setPhone(""); setMessage(""); setSelectedPatient("")
    },
    onError: () => addToast({ title: "Error", description: "Failed to send message", variant: "destructive" }),
  })

  const broadcastMutation = useMutation({
    mutationFn: () => whatsappApi.broadcast({ patient_ids: selectedPatients, message }),
    onSuccess: (res) => {
      addToast({ title: "Broadcast complete", description: `${res.sent} sent, ${res.failed} failed`, variant: "success" })
      setSelectedPatients([]); setMessage("")
    },
    onError: () => addToast({ title: "Error", description: "Broadcast failed", variant: "destructive" }),
  })

  function applyTemplate(t: string) {
    const found = templates.find((x) => x.label === t)
    if (found) setMessage(found.message)
  }

  function togglePatient(id: string) {
    setSelectedPatients((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="WhatsApp Messaging" description="Send automated WhatsApp messages to patients">
        <div className="flex gap-2">
          <Button variant={mode === "single" ? "default" : "outline"} size="sm" onClick={() => setMode("single")}>
            <Send className="h-4 w-4" /> Single
          </Button>
          <Button variant={mode === "broadcast" ? "default" : "outline"} size="sm" onClick={() => setMode("broadcast")}>
            <UsersIcon className="h-4 w-4" /> Broadcast
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-green-500" />
              Compose Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={template} onValueChange={(v) => { setTemplate(v); applyTemplate(v) }}>
                <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "single" && (
              <div className="space-y-2">
                <Label>Patient (optional)</Label>
                <Select value={selectedPatient} onValueChange={(v) => {
                  setSelectedPatient(v)
                  const p = patientList.find((x: any) => x.id === v)
                  if (p) setPhone(p.phone || "")
                }}>
                  <SelectTrigger><SelectValue placeholder="Search patient..." /></SelectTrigger>
                  <SelectContent>
                    {patientList.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name} - {p.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "single" && (
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  placeholder="+911234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Type your message here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
              />
              <p className="text-xs text-gray-400">Use {`{name}`} to insert the patient's name.</p>
            </div>

            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => mode === "single" ? sendMutation.mutate() : broadcastMutation.mutate()}
              disabled={(mode === "single" ? !phone : !selectedPatients.length) || !message || sendMutation.isPending || broadcastMutation.isPending}
            >
              {(sendMutation.isPending || broadcastMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {mode === "single" ? "Send Message" : `Send to ${selectedPatients.length} patients`}
            </Button>
          </CardContent>
        </Card>

        {mode === "broadcast" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UsersIcon className="h-5 w-5 text-blue-500" />
                Select Patients ({selectedPatients.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input placeholder="Search patients..." className="pl-10" />
              </div>
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {patientList.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => togglePatient(p.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedPatients.includes(p.id) ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                    }`}
                  >
                    {selectedPatients.includes(p.id) ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-blue-600" />
                    ) : (
                      <div className="h-4 w-4 shrink-0 rounded-full border-2 border-gray-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.full_name}</p>
                      <p className="truncate text-xs text-gray-500">{p.phone || "No phone"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </motion.div>
  )
}
