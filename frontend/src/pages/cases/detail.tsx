import { useState, useEffect, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Loader2, ChevronDown, ChevronRight, Download, Printer, History,
  Save, Plus, X, FileText, ExternalLink, PenLine, ArrowLeft
} from "lucide-react"
import { format } from "date-fns"
import { casesApi, doctorsApi, patientsApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Case } from "@/types"
import ProfessionalOdontogram from "@/components/toothchart/ProfessionalOdontogram"
import type { ToothFinding } from "@/components/toothchart/types"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5173/api/v1"

const statusColors: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  ON_HOLD: "bg-gray-50 text-gray-600 border-gray-300",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
}


function CollapsibleSection({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <Card>
      <CardHeader className="py-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="text-sm flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {title}
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}

// Adapter: API ClinicalFinding → ToothFinding
function apiFindingToLocal(api: any): ToothFinding {
  const typeMap: Record<string, string> = {
    'Dental Caries': 'Decayed',
    'Dental caries': 'Decayed',
    'dental caries': 'Decayed',
    'Filling Amalgam': 'Restored',
    'Filling Composite': 'Restored',
    'Missing Tooth': 'Missing',
    'Missing tooth': 'Missing',
    'MissingTooth': 'Missing',
  }
  const condition = (typeMap[api.finding_type] || api.finding_type) as ToothFinding['condition']
  return {
    id: api.id || `api-${Date.now()}`,
    toothNumber: parseInt(api.tooth_number) || 0,
    condition: ['Decayed', 'Restored', 'Defective', 'Missing', 'Erupt', 'Implant', 'Impacted', 'Bridge', 'Denture'].includes(condition) ? condition : 'Decayed',
    surfaces: api.surface ? [api.surface as any] : undefined,
    material: api.material || undefined,
    description: api.notes || api.description || undefined,
    date: (api.created_at || new Date().toISOString()).split('T')[0],
  }
}

export default function CaseHistoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("clinical")

  // Form state
  const [form, setForm] = useState<Record<string, any>>({})
  const [findings, setFindings] = useState<ToothFinding[]>([])

  const { data: caseData, isFetching } = useQuery({
    queryKey: ["case", id],
    queryFn: () => casesApi.get(id!),
    enabled: !!id,
  })
  const c: Case | undefined = caseData

  useEffect(() => {
    if (c) {
      setForm({
        chief_complaint: c.chief_complaint || "",
        chief_complaint_duration: c.chief_complaint_duration || "",
        chief_complaint_severity: c.chief_complaint_severity || "",
        chief_complaint_associated_symptoms: c.chief_complaint_associated_symptoms || "",
        hpi: c.hpi || "",
        personal_history: c.personal_history || "",
        family_history: c.family_history || "",
        medical_history: c.medical_history || "",
        dental_history: c.dental_history || "",
        extra_oral_examination: c.extra_oral_examination || "",
        intra_oral_examination: c.intra_oral_examination || "",
        clinical_findings_summary: c.clinical_findings_summary || "",
        periodontal_examination: c.periodontal_examination || "",
        investigations: c.investigations || "",
        provisional_diagnosis: c.provisional_diagnosis || "",
        final_diagnosis: c.final_diagnosis || "",
        diagnosis: c.diagnosis || "",
        initial_treatment_plan: c.initial_treatment_plan || "",
        treatment_plan_estimated_cost: c.treatment_plan_estimated_cost || "",
        treatment_plan_estimated_visits: c.treatment_plan_estimated_visits || "",
        doctor_registration_number: c.doctor_registration_number || "",
        doctor_specialization: c.doctor_specialization || "",
        notes: c.notes || "",
        doctor_id: c.doctor_id || "",
      })
      setFindings((c.findings || []).map(apiFindingToLocal))
    }
  }, [c])

  async function handleSave() {
    if (!id) return
    setSaving(true)
    try {
      const findingsSummary = computeFindingsSummary(findings)
      const payload = { ...form }
      payload.clinical_findings_summary = payload.clinical_findings_summary || (findings.length > 0 ? findingsSummary : null)
      payload.treatment_plan_estimated_cost = payload.treatment_plan_estimated_cost ? Number(payload.treatment_plan_estimated_cost) : null
      payload.treatment_plan_estimated_visits = payload.treatment_plan_estimated_visits ? Number(payload.treatment_plan_estimated_visits) : null
      payload.findings = findings.length > 0 ? findings.map((f) => ({
        finding_type: f.condition,
        tooth_number: String(f.toothNumber) || undefined,
        severity: undefined,
        notes: f.description || undefined,
      })) : undefined
      Object.keys(payload).forEach((k) => { if (payload[k] === "" || payload[k] === undefined || payload[k] === null) delete payload[k] })
      await casesApi.update(id, payload)
      queryClient.invalidateQueries({ queryKey: ["case", id] })
      addToast({ title: "Case history updated", variant: "success" })
      setEditing(false)
    } catch (err: any) {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Save failed", variant: "destructive" })
    }
    setSaving(false)
  }

  async function handleDownloadPdf() {
    if (!id) return
    try {
      const resp = await fetch(`${API_BASE}/cases/${id}/pdf`, { credentials: "include" })
      if (!resp.ok) throw new Error("PDF generation failed")
      const blob = await resp.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `case_history_${id.slice(0, 8)}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      addToast({ title: "Error", description: err.message || "PDF failed", variant: "destructive" })
    }
  }

  function handlePrint() { window.print() }

  // Auto-generate findings summary
  function computeFindingsSummary(f: ToothFinding[]) {
    if (f.length === 0) return ""
    const groups: Record<string, string[]> = {}
    for (const f2 of f) {
      const key = `Tooth ${f2.toothNumber}`
      if (!groups[key]) groups[key] = []
      groups[key].push(f2.condition + (f2.description ? ` (${f2.description})` : ""))
    }
    return Object.entries(groups).map(([tooth, types]) => `${tooth} - ${types.join(", ")}`).join("\n")
  }

  const findingsSummary = useMemo(() => computeFindingsSummary(findings), [findings])

  // Sync summary to form
  useEffect(() => {
    if (findingsSummary && !form.clinical_findings_summary) {
      setForm((prev: any) => ({ ...prev, clinical_findings_summary: findingsSummary }))
    }
  }, [findingsSummary])

  if (isFetching) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
  if (!c) {
    return <div className="py-20 text-center text-muted-foreground">Case history not found</div>
  }

  const r = (v: any) => v || "—"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cases")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Case History</h1>
            <p className="text-sm text-muted-foreground">
              #{c.case_number || c.id.slice(0, 8)} | {c.patient_name || "—"}
              {c.patient?.op_no && <> | OP: {c.patient.op_no}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs ${statusColors[c.status] || ""}`}>{c.status}</Badge>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button size="sm" onClick={() => setEditing(!editing)}>
            <PenLine className="h-4 w-4 mr-1" /> {editing ? "Cancel" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Patient, Doctor & Audit Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Patient Details</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            <p><span className="text-muted-foreground">Name:</span> {c.patient_name || "—"}</p>
            <p><span className="text-muted-foreground">OP No:</span> {c.patient?.op_no || "—"}</p>
            <p><span className="text-muted-foreground">ABHA ID:</span> {c.patient?.abha_id || "—"}</p>
            <p><span className="text-muted-foreground">Phone:</span> {c.patient?.phone || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Doctor Details</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            <p><span className="text-muted-foreground">Name:</span> Dr. {c.doctor_name || "—"}</p>
            <p><span className="text-muted-foreground">Reg No:</span> {c.doctor_registration_number || "—"}</p>
            <p><span className="text-muted-foreground">Specialization:</span> {c.doctor_specialization || "—"}</p>
            <p><span className="text-muted-foreground">Date:</span> {c.created_at ? format(new Date(c.created_at), "dd MMM yyyy HH:mm") : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Created By</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            <p><span className="text-muted-foreground">Name:</span> {c.created_by?.full_name || "—"}</p>
            <p><span className="text-muted-foreground">Role:</span> {c.created_by?.role || "—"}</p>
            <p><span className="text-muted-foreground">Date:</span> {c.created_at ? format(new Date(c.created_at), "dd MMM yyyy HH:mm") : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Last Updated By</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            <p><span className="text-muted-foreground">Name:</span> {c.updated_by?.full_name || "—"}</p>
            <p><span className="text-muted-foreground">Role:</span> {c.updated_by?.role || "—"}</p>
            <p><span className="text-muted-foreground">Date:</span> {c.updated_at ? format(new Date(c.updated_at), "dd MMM yyyy HH:mm") : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Clinical Sections */}
      {editing ? (
        <div className="space-y-3">
          <CollapsibleSection title="1. Chief Complaint" defaultOpen>
            <div className="space-y-3">
              <div><Label>Chief Complaint *</Label><textarea value={form.chief_complaint || ""} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Duration</Label><Input value={form.chief_complaint_duration || ""} onChange={(e) => setForm({ ...form, chief_complaint_duration: e.target.value })} placeholder="e.g. 2 weeks" /></div>
                <div><Label>Severity</Label><Input value={form.chief_complaint_severity || ""} onChange={(e) => setForm({ ...form, chief_complaint_severity: e.target.value })} placeholder="e.g. Moderate" /></div>
              </div>
              <div><Label>Associated Symptoms</Label><textarea value={form.chief_complaint_associated_symptoms || ""} onChange={(e) => setForm({ ...form, chief_complaint_associated_symptoms: e.target.value })}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px]" /></div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="2. History of Present Illness (HPI)">
            <textarea value={form.hpi || ""} onChange={(e) => setForm({ ...form, hpi: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[100px]"
              placeholder="Present illness, duration, progression, previous treatment, pain history, swelling, bleeding, sensitivity..." />
          </CollapsibleSection>

          <CollapsibleSection title="3. Personal History">
            <textarea value={form.personal_history || ""} onChange={(e) => setForm({ ...form, personal_history: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
              placeholder="Smoking, Alcohol, Tobacco, Pan Chewing, Betel Nut, Diet, Oral Hygiene Habits, Brushing Frequency, Flossing..." />
          </CollapsibleSection>

          <CollapsibleSection title="4. Family History">
            <textarea value={form.family_history || ""} onChange={(e) => setForm({ ...form, family_history: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
              placeholder="Diabetes, Hypertension, Heart Disease, Cancer, Periodontal Disease, Genetic Disorders..." />
          </CollapsibleSection>

          <CollapsibleSection title="5. Medical History">
            <textarea value={form.medical_history || ""} onChange={(e) => setForm({ ...form, medical_history: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]" />
          </CollapsibleSection>

          <CollapsibleSection title="6. Dental History">
            <textarea value={form.dental_history || ""} onChange={(e) => setForm({ ...form, dental_history: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]" />
          </CollapsibleSection>

          <CollapsibleSection title="7. Extra Oral Examination">
            <textarea value={form.extra_oral_examination || ""} onChange={(e) => setForm({ ...form, extra_oral_examination: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
              placeholder="Face Symmetry, TMJ, Lymph Nodes, Swelling, Tenderness, Mouth Opening, Profile, Skin, Lips..." />
          </CollapsibleSection>

          <CollapsibleSection title="8. Intra Oral Examination">
            <textarea value={form.intra_oral_examination || ""} onChange={(e) => setForm({ ...form, intra_oral_examination: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
              placeholder="Soft Tissue, Tongue, Palate, Floor of Mouth, Buccal Mucosa, Gingiva, Occlusion, Saliva..." />
          </CollapsibleSection>

          <CollapsibleSection title="9. Clinical Findings — Interactive Odontogram" defaultOpen>
            <ProfessionalOdontogram
              findings={findings}
              onFindingsChange={(updated) => setFindings(updated)}
              patientName={c?.patient_name}
              opNumber={c?.patient?.op_no ?? undefined}
              doctorName={c?.doctor_name}
              visitDate={c?.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : undefined}
            />
            <div className="mt-4">
              <Label>Clinical Findings Summary</Label>
              <textarea value={form.clinical_findings_summary || findingsSummary}
                onChange={(e) => setForm({ ...form, clinical_findings_summary: e.target.value })}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] font-mono text-xs mt-1"
                placeholder="Auto-generated from findings above. Edit if needed." />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="10. Periodontal Examination">
            <textarea value={form.periodontal_examination || ""} onChange={(e) => setForm({ ...form, periodontal_examination: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
              placeholder="Pocket Depth, Clinical Attachment Loss, Bleeding On Probing, Plaque Index, Calculus Index, Gingival Index, Mobility Grade, Furcation, Recession, Missing Teeth..." />
          </CollapsibleSection>

          <CollapsibleSection title="11. Investigations">
            <textarea value={form.investigations || ""} onChange={(e) => setForm({ ...form, investigations: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
              placeholder="IOPA, OPG, CBCT, X-Ray, Blood Tests, Photographs..." />
          </CollapsibleSection>

          <CollapsibleSection title="12. Provisional Diagnosis">
            <textarea value={form.provisional_diagnosis || ""} onChange={(e) => setForm({ ...form, provisional_diagnosis: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px]" />
          </CollapsibleSection>

          <CollapsibleSection title="13. Final Diagnosis">
            <textarea value={form.final_diagnosis || ""} onChange={(e) => setForm({ ...form, final_diagnosis: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px]" />
          </CollapsibleSection>

          <CollapsibleSection title="14. Initial Treatment Plan">
            <div className="space-y-3">
              <textarea value={form.initial_treatment_plan || ""} onChange={(e) => setForm({ ...form, initial_treatment_plan: e.target.value })}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
                placeholder="Recommended procedures..." />
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Estimated Visits</Label><Input type="number" value={form.treatment_plan_estimated_visits || ""} onChange={(e) => setForm({ ...form, treatment_plan_estimated_visits: e.target.value })} /></div>
                <div><Label>Estimated Cost</Label><Input type="number" value={form.treatment_plan_estimated_cost || ""} onChange={(e) => setForm({ ...form, treatment_plan_estimated_cost: e.target.value })} /></div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="15. Clinical Notes">
            <textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]" />
          </CollapsibleSection>

          {/* Save button */}
          <div className="sticky bottom-4 flex gap-3 bg-background/95 backdrop-blur p-3 rounded-lg border shadow-lg">
            <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Save className="h-4 w-4 mr-2" /> Save Changes
            </Button>
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="clinical">Clinical</TabsTrigger>
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
            <TabsTrigger value="treatment">Treatment Plan</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="clinical" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionCard title="Chief Complaint" content={c.chief_complaint} />
              {c.chief_complaint_duration && <SectionCard title="Duration" content={c.chief_complaint_duration} />}
              {c.chief_complaint_severity && <SectionCard title="Severity" content={c.chief_complaint_severity} />}
              {c.chief_complaint_associated_symptoms && <SectionCard title="Associated Symptoms" content={c.chief_complaint_associated_symptoms} />}
              {c.hpi && <SectionCard title="HPI" content={c.hpi} />}
              {c.personal_history && <SectionCard title="Personal History" content={c.personal_history} />}
              {c.family_history && <SectionCard title="Family History" content={c.family_history} />}
              {c.medical_history && <SectionCard title="Medical History" content={c.medical_history} />}
              {c.dental_history && <SectionCard title="Dental History" content={c.dental_history} />}
              {c.extra_oral_examination && <SectionCard title="Extra Oral Examination" content={c.extra_oral_examination} />}
              {c.intra_oral_examination && <SectionCard title="Intra Oral Examination" content={c.intra_oral_examination} />}
              {c.periodontal_examination && <SectionCard title="Periodontal Examination" content={c.periodontal_examination} />}
              {c.investigations && <SectionCard title="Investigations" content={c.investigations} />}
              {c.notes && <SectionCard title="Clinical Notes" content={c.notes} />}
            </div>
          </TabsContent>

          <TabsContent value="findings" className="mt-4">
            <ProfessionalOdontogram
              findings={(c.findings || []).map(apiFindingToLocal)}
              onFindingsChange={() => {}}
              readonly
            />
          </TabsContent>

          <TabsContent value="diagnosis" className="mt-4 space-y-4">
            {c.provisional_diagnosis && <SectionCard title="Provisional Diagnosis" content={c.provisional_diagnosis} />}
            {c.final_diagnosis && <SectionCard title="Final Diagnosis" content={c.final_diagnosis} />}
            {c.diagnosis && <SectionCard title="Legacy Diagnosis" content={c.diagnosis} />}
            {!c.provisional_diagnosis && !c.final_diagnosis && !c.diagnosis && (
              <p className="text-muted-foreground text-sm py-4">No diagnosis recorded.</p>
            )}
          </TabsContent>

          <TabsContent value="treatment" className="mt-4 space-y-4">
            {c.initial_treatment_plan && <SectionCard title="Treatment Plan" content={c.initial_treatment_plan} />}
            {(c.treatment_plan_estimated_visits || c.treatment_plan_estimated_cost) && (
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm">Plan Details</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {c.treatment_plan_estimated_visits && <p>Estimated Visits: <strong>{c.treatment_plan_estimated_visits}</strong></p>}
                  {c.treatment_plan_estimated_cost && <p>Estimated Cost: <strong>₹{c.treatment_plan_estimated_cost}</strong></p>}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <TimelineView caseId={id!} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function SectionCard({ title, content }: { title: string; content: string }) {
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="py-2">
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </CardContent>
    </Card>
  )
}

function TimelineView({ caseId }: { caseId: string }) {
  const { data: entries } = useQuery({
    queryKey: ["case-timeline", caseId],
    queryFn: () => casesApi.getTimeline(caseId),
  })
  const timeline: any[] = Array.isArray(entries) ? entries : []

  if (timeline.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No timeline entries yet.</p>
  }

  return (
    <div className="space-y-3">
      {timeline.map((entry: any, idx: number) => (
        <div key={entry.id || idx} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
            {idx < timeline.length - 1 && <div className="w-px flex-1 bg-gray-200" />}
          </div>
          <div className="flex-1 pb-4">
            <div className="text-xs text-muted-foreground">
              {entry.created_at ? format(new Date(entry.created_at), "dd MMM yyyy HH:mm") : ""}
              {entry.performer_name && <> by {entry.performer_name}</>}
              {entry.performer_role && <span className="ml-1">({entry.performer_role})</span>}
            </div>
            <div className="text-sm font-medium">{entry.action}</div>
            {(entry.old_value || entry.new_value) && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {entry.old_value && <span className="line-through mr-2">{entry.old_value}</span>}
                {entry.new_value && <span>{entry.new_value}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
