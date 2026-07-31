import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Switch } from "../ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Loader2, Star, ThumbsUp, Clock, User, Heart, MessageSquare } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { crmApi } from "../../services/endpoints"

interface PatientFeedbackEnquiry {
  id: string
  display_name?: string
  patient?: {
    id: string
    name: string
    phone?: string
  }
  doctor?: {
    name?: string
  }
  treatment?: {
    treatment_name?: string
  }
  case?: {
    case_number?: string
  }
}

const RECOVERY_OPTIONS = [
  { value: "RECOVERING_WELL", label: "Recovering Well" },
  { value: "MINOR_ISSUES", label: "Minor Issues" },
  { value: "NEEDS_FOLLOW_UP", label: "Needs Follow-up" },
  { value: "FULLY_RECOVERED", label: "Fully Recovered" },
  { value: "COMPLICATIONS", label: "Complications" },
]

const RATING_LABELS = ["", "Poor", "Fair", "Average", "Good", "Excellent"]

interface Props {
  enquiry: PatientFeedbackEnquiry
  onSaved: () => void
  onCancel: () => void
}

function RatingField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? undefined : n)}
            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs transition-colors
              ${value && n <= value ? "bg-yellow-400 text-yellow-900" : "bg-[var(--ds-background-subtle)] text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)]"}`}
          >
            <Star className={`h-3.5 w-3.5 ${value && n <= value ? "fill-current" : ""}`} />
          </button>
        ))}
        {value && <span className="text-xs text-muted-foreground ml-2 self-center">{RATING_LABELS[value]}</span>}
      </div>
    </div>
  )
}

export function PatientFeedbackForm({ enquiry, onSaved, onCancel }: Props) {
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    consultation_experience: undefined as number | undefined,
    treatment_satisfaction: undefined as number | undefined,
    doctor_rating: undefined as number | undefined,
    staff_behaviour: undefined as number | undefined,
    waiting_time: undefined as number | undefined,
    billing_experience: undefined as number | undefined,
    facility_cleanliness: undefined as number | undefined,
    would_recommend: undefined as boolean | undefined,
    overall_rating: undefined as number | undefined,
    next_follow_up_required: false,
    recovery_status: "",
    additional_comments: "",
  })

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      await crmApi.patientFeedback.submit(enquiry.id, {
        consultation_experience: form.consultation_experience ?? null,
        treatment_satisfaction: form.treatment_satisfaction ?? null,
        doctor_rating: form.doctor_rating ?? null,
        staff_behaviour: form.staff_behaviour ?? null,
        waiting_time: form.waiting_time ?? null,
        billing_experience: form.billing_experience ?? null,
        facility_cleanliness: form.facility_cleanliness ?? null,
        would_recommend: form.would_recommend,
        overall_rating: form.overall_rating ?? null,
        next_follow_up_required: form.next_follow_up_required,
        recovery_status: form.recovery_status || null,
        additional_comments: form.additional_comments || null,
      })
      addToast({ title: "Patient feedback saved", variant: "success" })
      onSaved()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save feedback"
      addToast({ title: "Error", description: msg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Patient Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Patient Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{enquiry.patient?.name || enquiry.display_name || "-"}</span>
          </div>
          {enquiry.doctor?.name && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Doctor</span>
              <span>{enquiry.doctor.name}</span>
            </div>
          )}
          {enquiry.treatment?.treatment_name && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Treatment</span>
              <Badge variant="secondary">{enquiry.treatment.treatment_name}</Badge>
            </div>
          )}
          {enquiry.case?.case_number && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Case</span>
              <span>{enquiry.case.case_number}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ratings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            Service Ratings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RatingField label="Consultation Experience" value={form.consultation_experience} onChange={(v) => set("consultation_experience", v)} />
          <RatingField label="Treatment Satisfaction" value={form.treatment_satisfaction} onChange={(v) => set("treatment_satisfaction", v)} />
          <RatingField label="Doctor Rating" value={form.doctor_rating} onChange={(v) => set("doctor_rating", v)} />
          <RatingField label="Staff Behaviour" value={form.staff_behaviour} onChange={(v) => set("staff_behaviour", v)} />
          <RatingField label="Waiting Time" value={form.waiting_time} onChange={(v) => set("waiting_time", v)} />
          <RatingField label="Billing Experience" value={form.billing_experience} onChange={(v) => set("billing_experience", v)} />
          <RatingField label="Facility Cleanliness" value={form.facility_cleanliness} onChange={(v) => set("facility_cleanliness", v)} />
          <div className="border-t pt-3">
            <RatingField label="Overall Rating" value={form.overall_rating} onChange={(v) => set("overall_rating", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Recommendation & Recovery */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-primary" />
            Recommendation & Recovery
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Would Recommend</Label>
            <div className="flex gap-2">
              {[true, false, undefined].map((v) => (
                <Button
                  key={String(v)}
                  type="button"
                  variant={form.would_recommend === v ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => set("would_recommend", v)}
                >
                  {v === true ? "Yes" : v === false ? "No" : "Not Sure"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label><Heart className="h-3 w-3 inline mr-1" />Recovery Status</Label>
            <Select value={form.recovery_status} onValueChange={(v) => set("recovery_status", v)}>
              <SelectTrigger><SelectValue placeholder="Select recovery status" /></SelectTrigger>
              <SelectContent>
                {RECOVERY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.next_follow_up_required} onCheckedChange={(v) => set("next_follow_up_required", v)} />
            <Label className="text-sm"><Clock className="h-3 w-3 inline mr-1" />Next Follow-up Required</Label>
          </div>
        </CardContent>
      </Card>

      {/* Comments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Additional Comments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={form.additional_comments} onChange={(e) => set("additional_comments", e.target.value)} rows={3} placeholder="Any additional feedback..." />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Patient Feedback
        </Button>
      </div>
    </div>
  )
}
