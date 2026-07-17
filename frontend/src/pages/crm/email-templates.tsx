import { useState } from "react"
import { motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Edit3, Mail, Loader2, Trash2 } from "lucide-react"
import { crmApi } from "@/services/endpoints"
import PageHeader from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
}

export default function EmailTemplates() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")

  const { data: templates, isLoading } = useQuery({
    queryKey: ["crm", "templates"],
    queryFn: () => crmApi.templates.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => crmApi.templates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "templates"] })
      addToast({ title: "Deleted", description: "Template deleted", variant: "success" })
    },
    onError: () => addToast({ title: "Error", description: "Failed to delete template", variant: "destructive" }),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      editId
        ? crmApi.templates.update(editId, { name, subject, body })
        : crmApi.templates.create({ name, subject, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm", "templates"] })
      addToast({ title: editId ? "Updated" : "Created", description: "Email template saved", variant: "success" })
      setOpen(false); resetForm()
    },
    onError: () => addToast({ title: "Error", description: "Failed to save template", variant: "destructive" }),
  })

  function resetForm() { setName(""); setSubject(""); setBody(""); setEditId(null) }

  function editTemplate(t: any) {
    setEditId(t.id); setName(t.name); setSubject(t.subject); setBody(t.body); setOpen(true)
  }

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="show">
      <PageHeader title="Email Templates" description="Manage email templates for patient communication">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Template</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Template" : "New Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Appointment Reminder" />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" />
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Email body content..." />
                <p className="text-xs text-gray-400">Use {`{name}`}, {`{doctor}`} as placeholders.</p>
              </div>
              <Button className="w-full gap-2" onClick={() => saveMutation.mutate()} disabled={!name || !subject || !body || saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          </div>
        ) : !templates || templates.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400">No templates yet. Create your first template.</div>
        ) : (
          templates.map((t: any) => (
            <Card key={t.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-base">{t.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => editTemplate(t)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => { if (confirm("Delete this template?")) deleteMutation.mutate(t.id) }}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-1 text-sm font-medium text-gray-700">{t.subject}</p>
                <p className="line-clamp-3 text-sm text-gray-500">{t.body}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </motion.div>
  )
}
