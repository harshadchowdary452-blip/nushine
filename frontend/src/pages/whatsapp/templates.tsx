import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Plus, Edit3, Trash2, Copy, FileText, CheckCircle2 } from "lucide-react"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { whatsappTemplatesApi } from "@/services/endpoints"

interface WATemplate {
  id: string
  name: string
  message: string
  is_active: boolean
}

const DEFAULT_TEMPLATES = [
  { name: "Appointment Reminder", message: "Hello {PatientName},\n\nReminder:\nAppointment Date: {Date}\nAppointment Time: {Time}\nDoctor: {DoctorName}\nHospital: {HospitalName}\n\nRegards,\n{HospitalName}" },
  { name: "1-Day Enquiry", message: "Hello {PatientName},\n\nWe hope you are recovering well after your treatment.\nPlease reply if you have any discomfort or concerns.\n\nRegards,\n{HospitalName}" },
  { name: "6-Month Recall", message: "Hello {PatientName},\n\nIt has been 6 months since your treatment.\nWe recommend a routine dental check-up.\nPlease contact us to schedule an appointment.\n\nRegards,\n{HospitalName}" },
  { name: "Follow-Up Reminder", message: "Hello {PatientName},\n\nThis is a reminder regarding your follow-up visit.\nPlease contact us if you need assistance.\n\nRegards,\n{HospitalName}" },
  { name: "Lead Follow-Up", message: "Hello {PatientName},\n\nThank you for your interest in {HospitalName}.\nWe would like to follow up regarding your enquiry.\nPlease feel free to reach out.\n\nRegards,\n{HospitalName}" },
  { name: "Treatment Completion Thank You", message: "Hello {PatientName},\n\nThank you for completing your treatment at {HospitalName}.\nWe hope you are satisfied with the results.\nPlease contact us for any follow-up needs.\n\nRegards,\n{HospitalName}" },
  { name: "Festival Greeting", message: "Hello {PatientName},\n\nWishing you and your family a wonderful {FestivalName}!\nFrom the team at {HospitalName}" },
  { name: "Discount Offer", message: "Hello {PatientName},\n\nWe have a special discount offer for you at {HospitalName}.\nContact us to learn more!\n\nRegards,\n{HospitalName}" },
]

export default function WhatsAppTemplates() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => whatsappTemplatesApi.list(),
  })

  const allTemplates: WATemplate[] = Array.isArray(templates) ? templates : []

  const createMutation = useMutation({
    mutationFn: (data: { name: string; message: string }) => whatsappTemplatesApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }); addToast({ title: "Template created", variant: "success" }); setOpen(false); reset() },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; message: string } }) => whatsappTemplatesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }); addToast({ title: "Template updated", variant: "success" }); setOpen(false); reset() },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => whatsappTemplatesApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }); addToast({ title: "Template deleted", variant: "success" }) },
    onError: () => addToast({ title: "Error", variant: "destructive" }),
  })

  function reset() { setName(""); setMessage(""); setEditId(null) }

  function openCreate(t?: WATemplate) {
    if (t) { setName(t.name); setMessage(t.message); setEditId(t.id) }
    else { reset() }
    setOpen(true)
  }

  function handleSave() {
    if (!name.trim() || !message.trim()) { addToast({ title: "Validation", description: "Name and message required", variant: "destructive" }); return }
    if (editId) updateMutation.mutate({ id: editId, data: { name, message } })
    else createMutation.mutate({ name, message })
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader title="WhatsApp Templates" description="Manage message templates for WhatsApp communication">
        <Button onClick={() => openCreate()}><Plus className="h-4 w-4 mr-1.5" /> New Template</Button>
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {allTemplates.map((t: WATemplate) => (
              <Card key={t.id} className="border-gray-200">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    {t.name}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={`text-xs ${t.is_active ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3 mb-3">{t.message}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openCreate(t)}><Edit3 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => copyToClipboard(t.message, t.id)}>
                      {copiedId === t.id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Default Templates</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {DEFAULT_TEMPLATES.map((t, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800">{t.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => { setName(t.name); setMessage(t.message); setOpen(true) }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{t.message}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Template Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Appointment Reminder" /></div>
            <div><Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} placeholder="Type your message... Use {PatientName}, {HospitalName}, {Date}, {Time}, {DoctorName} as placeholders" />
              <p className="text-xs text-gray-400 mt-1">Available placeholders: {'{PatientName}'}, {'{HospitalName}'}, {'{Date}'}, {'{Time}'}, {'{DoctorName}'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset() }}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
