import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  Plus,
  Loader2,
  Edit3,
  Trash2,
  Copy,
  FileText,
  MessageCircle,
  MessageSquare,
  Mail,
} from "lucide-react"
import { PageHeader } from "@/design-system"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { campaignTemplatesApi } from "@/services/endpoints"
import { cn } from "@/lib/utils"

interface CampaignTemplate {
  id: string
  name: string
  channel: string
  category: string
  message: string
  is_active: boolean
}

interface CampaignTemplatePayload {
  name: string
  channel: string
  category: string
  message: string
}

const channelIcon: Record<string, React.ElementType> = {
  WHATSAPP: MessageCircle,
  SMS: MessageSquare,
  EMAIL: Mail,
}
const channelColors: Record<string, string> = {
  WHATSAPP: "bg-green-50 text-green-600",
  SMS: "bg-blue-50 text-blue-600",
  EMAIL: "bg-purple-50 text-purple-600",
}

export default function CampaignTemplates() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [channel, setChannel] = useState("WHATSAPP")
  const [category, setCategory] = useState("GENERAL")
  const [message, setMessage] = useState("")
  const [filterChannel, setFilterChannel] = useState("")

  const { data: templates, isLoading } = useQuery({
    queryKey: ["campaign-templates", filterChannel],
    queryFn: () => campaignTemplatesApi.list(filterChannel ? { channel: filterChannel } : {}),
  })
  const items: CampaignTemplate[] = Array.isArray(templates) ? templates : []

  const reset = () => {
    setName("")
    setChannel("WHATSAPP")
    setCategory("GENERAL")
    setMessage("")
    setEditId(null)
  }

  const createMutation = useMutation({
    mutationFn: (data: CampaignTemplatePayload) => campaignTemplatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-templates"] })
      addToast({ title: "Template created", variant: "success" })
      setOpen(false)
      reset()
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CampaignTemplatePayload }) =>
      campaignTemplatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-templates"] })
      addToast({ title: "Template updated", variant: "success" })
      setOpen(false)
      reset()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignTemplatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-templates"] })
      addToast({ title: "Deleted", variant: "success" })
    },
  })
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => campaignTemplatesApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-templates"] })
      addToast({ title: "Duplicated", variant: "success" })
    },
  })

  const openEdit = (t: CampaignTemplate) => {
    setEditId(t.id)
    setName(t.name)
    setChannel(t.channel)
    setCategory(t.category)
    setMessage(t.message)
    setOpen(true)
  }
  const openCreate = () => {
    reset()
    setOpen(true)
  }
  const handleSave = () => {
    if (!name || !message) return
    if (editId) updateMutation.mutate({ id: editId, data: { name, channel, category, message } })
    else createMutation.mutate({ name, channel, category, message })
  }

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <PageHeader
        title="Campaign Templates"
        description="Create and manage reusable message templates for campaigns"
        actions={
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Template
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Templates</CardTitle>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Channels</SelectItem>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileText className="mx-auto h-8 w-8 mb-2 opacity-40" />
              <p>No templates yet. Click "New Template" to create one.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((t: CampaignTemplate) => {
                const Icon = channelIcon[t.channel] || FileText
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border p-4 space-y-3 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            channelColors[t.channel] || "bg-gray-50 text-gray-600",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{t.name}</p>
                          <p className="text-xs text-gray-400">
                            {t.channel} · {t.category}
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={cn(
                          "text-xs shrink-0",
                          t.is_active ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-400",
                        )}
                      >
                        {t.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-3">{t.message}</p>
                    <div className="flex gap-1 pt-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-gray-500"
                        title="Edit"
                        onClick={() => openEdit(t)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-gray-500"
                        title="Duplicate"
                        onClick={() => duplicateMutation.mutate(t.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-red-600"
                        title="Delete"
                        onClick={() => {
                          if (confirm("Delete this template?")) deleteMutation.mutate(t.id)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset()
          setOpen(v)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer Promo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROMOTIONAL">Promotional</SelectItem>
                    <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                    <SelectItem value="RECALL">Recall</SelectItem>
                    <SelectItem value="APPOINTMENT_REMINDER">Appointment Reminder</SelectItem>
                    <SelectItem value="FESTIVAL_GREETING">Festival Greeting</SelectItem>
                    <SelectItem value="DENTAL_AWARENESS">Dental Awareness</SelectItem>
                    <SelectItem value="GENERAL">General</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message Body</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Hello {{patient_name}}, this is a message from {{hospital_name}}."
              />
              <p className="text-xs text-gray-400">
                Variables: {"{{patient_name}}"} {"{{doctor_name}}"} {"{{hospital_name}}"}{" "}
                {"{{appointment_date}}"} {"{{treatment_name}}"}
              </p>
            </div>
            {message && (
              <div className="rounded-lg border bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Preview:</p>
                <p className="text-sm text-gray-700">
                  {message.replace(/\{\{(\w+)\}\}/g, (_, v) => `[${v}]`)}
                </p>
              </div>
            )}
            <Button
              className="w-full gap-2"
              onClick={handleSave}
              disabled={!name || !message || createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {editId ? "Update" : "Create"} Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
