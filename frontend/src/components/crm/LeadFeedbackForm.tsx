import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Label } from "../ui/label"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Switch } from "../ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Loader2, Phone, MessageSquare, User, ThumbsUp } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { crmApi } from "../../services/endpoints"

interface LeadFeedbackEnquiry {
  id: string
  display_name?: string
  lead?: {
    id: string
    name: string
    mobile: string
    source?: string
    interested_treatment?: string
    status?: string
  }
}

const RESPONSE_STATUS_OPTIONS = [
  { value: "CONTACTED", label: "Contacted" },
  { value: "INTERESTED", label: "Interested" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "FOLLOW_UP_REQUIRED", label: "Follow-up Required" },
  { value: "NO_RESPONSE", label: "No Response" },
  { value: "APPOINTMENT_BOOKED", label: "Appointment Booked" },
  { value: "LOST", label: "Lost" },
]

const CALL_OUTCOME_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "INTERESTED", label: "Interested" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "NO_ANSWER", label: "No Answer" },
  { value: "BUSY", label: "Busy" },
  { value: "CALL_BACK_LATER", label: "Call Back Later" },
  { value: "APPOINTMENT_REQUESTED", label: "Appointment Requested" },
  { value: "CONVERTED", label: "Converted" },
]

interface Props {
  enquiry: LeadFeedbackEnquiry
  onSaved: () => void
  onCancel: () => void
}

export function LeadFeedbackForm({ enquiry, onSaved, onCancel }: Props) {
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    response_status: "CONTACTED",
    interested: false,
    follow_up_required: true,
    reason_not_interested: "",
    competitor_chosen: "",
    call_outcome: "",
    whatsapp_replied: false,
    callback_requested: false,
    notes: "",
  })

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        response_status: form.response_status,
        interested: form.interested,
        follow_up_required: form.follow_up_required,
        reason_not_interested: form.reason_not_interested || null,
        competitor_chosen: form.competitor_chosen || null,
        call_outcome: form.call_outcome === "NONE" ? null : form.call_outcome,
        whatsapp_replied: form.whatsapp_replied,
        callback_requested: form.callback_requested,
        notes: form.notes || null,
      }
      await crmApi.leadFeedback.submit(enquiry.id, payload)
      addToast({ title: "Lead feedback saved", variant: "success" })
      onSaved()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save feedback"
      addToast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const lead = enquiry.lead
  const statusColor =
    lead?.status === "INTERESTED" ? "bg-green-100 text-green-700" :
    lead?.status === "LOST" || lead?.status === "NOT_INTERESTED" ? "bg-red-100 text-red-700" :
    "bg-blue-100 text-blue-700"

  return (
    <div className="space-y-5">
      {/* Lead Information */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Lead Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{lead?.name || enquiry.display_name || "-"}</span>
          </div>
          {lead?.interested_treatment && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Treatment Interest</span>
              <Badge variant="secondary">{lead.interested_treatment}</Badge>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Source</span>
            <span>{lead?.source?.replace(/_/g, " ") || "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge className={statusColor}>{lead?.status || "-"}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Response Details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-primary" />
            Response Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Response Status</Label>
            <Select value={form.response_status} onValueChange={(v) => set("response_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPONSE_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.interested} onCheckedChange={(v) => set("interested", v)} />
              <Label className="text-sm">Interested</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.follow_up_required} onCheckedChange={(v) => set("follow_up_required", v)} />
              <Label className="text-sm">Follow-up Required</Label>
            </div>
          </div>

          {form.response_status === "NOT_INTERESTED" && (
            <>
              <div className="space-y-1.5">
                <Label>Reason Not Interested</Label>
                <Textarea value={form.reason_not_interested} onChange={(e) => set("reason_not_interested", e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Competitor Chosen</Label>
                <Input value={form.competitor_chosen} onChange={(e) => set("competitor_chosen", e.target.value)} placeholder="Competitor name" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Communication */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Communication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Call Outcome</Label>
            <Select value={form.call_outcome} onValueChange={(v) => set("call_outcome", v)}>
              <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
              <SelectContent>
                {CALL_OUTCOME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.whatsapp_replied} onCheckedChange={(v) => set("whatsapp_replied", v)} />
              <Label className="text-sm"><MessageSquare className="h-3 w-3 inline mr-1" />WhatsApp Replied</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.callback_requested} onCheckedChange={(v) => set("callback_requested", v)} />
              <Label className="text-sm">Callback Requested</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Internal notes..." />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Lead Feedback
        </Button>
      </div>
    </div>
  )
}
