import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2, Printer, PenLine, ArrowLeft, Send
} from "lucide-react"
import { format } from "date-fns"
import { casesApi, treatmentPlanItemsApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Case, TreatmentPlanItem, TreatmentPlan, CaseTimeline } from "@/types"
import ProfessionalOdontogram from "@/components/toothchart/ProfessionalOdontogram"
import CaseReportForm, { apiToFinding } from "@/components/cases/CaseReportForm"
import type { TreatmentItem } from "@/components/cases/TreatmentPlanSection"

const statusColors: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  ON_HOLD: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)] border-[var(--ds-border-strong)]",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
}


export default function CaseReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [editing, setEditing] = useState(false)
  const [activeTab, setActiveTab] = useState("clinical")

  const { data: caseData, isFetching } = useQuery({
    queryKey: ["case", id],
    queryFn: () => casesApi.get(id!),
    enabled: !!id,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const c: Case | undefined = caseData

  const { data: planItems } = useQuery({
    queryKey: ["treatment-plan-items", id],
    queryFn: () => treatmentPlanItemsApi.listByCase(id!),
    enabled: !!id,
  })
  const itemList: TreatmentPlanItem[] = Array.isArray(planItems) ? planItems : (planItems?.items || [])
  const isApproved = c?.treatment_plan_status === "APPROVED" || c?.treatment_plan_status === "TREATMENT_IN_PROGRESS" || c?.treatment_plan_status === "COMPLETED"

  async function handleSave(payload: Record<string, unknown>) {
    if (!id) return
    await casesApi.update(id, payload)

    const txItems = payload.treatment_plan_items
    if (Array.isArray(txItems) && txItems.length > 0 && itemList.length > 0) {
      await treatmentPlanItemsApi.create({
        case_id: id,
        items: (txItems as TreatmentItem[]).map((item) => ({
          procedure_name: item.name || "",
          tooth_numbers: item.toothNumbers || [],
          estimated_visits: item.estimatedVisits ? Number(item.estimatedVisits) : 1,
          estimated_cost: item.estimatedCost ? Number(item.estimatedCost) : 0,
          remarks: item.remarks || "",
        })),
      })
    }

    queryClient.invalidateQueries({ queryKey: ["case", id] })
    queryClient.invalidateQueries({ queryKey: ["case-timeline", id] })
    queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", id] })
    addToast({ title: "Case report updated", variant: "success" })
    setEditing(false)
  }

  if (isFetching) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }
  if (!c) {
    return <div className="py-20 text-center text-muted-foreground">Case report not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/cases")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Case Report</h1>
            <p className="text-sm text-muted-foreground">
              #{c.case_number || c.id.slice(0, 8)} | {c.patient_name || "—"}
              {c.patient?.op_no && <> | OP: {c.patient.op_no}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs ${statusColors[c.status] || ""}`}>{c.status}</Badge>
          <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${id}/print`)}>
            <Printer className="h-4 w-4 mr-1" /> Print Preview
          </Button>
          {(() => {
            const hasTreatmentPlan =
              (itemList.length > 0) ||
              (c.treatment_plans && c.treatment_plans.length > 0) ||
              (c.initial_treatment_plan && c.initial_treatment_plan.length > 0)
            const planStatus = c.treatment_plan_status
            if (planStatus === "DRAFT" && hasTreatmentPlan) {
              return (
                <Button size="sm" onClick={() => navigate(`/treatments/approve/${id}`)}>
                  <Send className="h-4 w-4 mr-1" /> Assign Doctors & Submit
                </Button>
              )
            }
            if (planStatus === "PENDING_APPROVAL") {
              return (
                <Button size="sm" variant="outline" onClick={() => navigate(`/treatments/approve/${id}`)}>
                  <Send className="h-4 w-4 mr-1" /> View Approval
                </Button>
              )
            }
            if (planStatus === "REJECTED") {
              return (
                <Button size="sm" onClick={() => navigate(`/treatments/approve/${id}`)}>
                  <Send className="h-4 w-4 mr-1" /> Resubmit
                </Button>
              )
            }
            return null
          })()}
          {c.treatment_plan_status === "APPROVED" && (
            <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-1 text-xs font-medium">Treatment Approved</span>
          )}
          {c.treatment_plan_status === "PENDING_APPROVAL" && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-1 text-xs font-medium">Pending Approval</span>
          )}
          {c.treatment_plan_status === "REJECTED" && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-1 text-xs font-medium">Rejected</span>
          )}
          <Button size="sm" onClick={() => setEditing(!editing)} disabled={isApproved}>
            <PenLine className="h-4 w-4 mr-1" /> {editing ? "Cancel" : isApproved ? "Locked After Approval" : "Edit"}
          </Button>
        </div>
      </div>

      {/* Patient, Doctor & Audit Info */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="py-3"><CardTitle className="text-sm">Patient Information</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-muted-foreground">Patient Name:</span> {c.patient_name || "—"}</p>
              <p><span className="text-muted-foreground">OP Number:</span> {c.patient?.op_no || "—"}</p>
              <p><span className="text-muted-foreground">Age / Gender:</span> {[c.patient?.age, c.patient?.gender].filter(Boolean).join(" / ") || "—"}</p>
              <p><span className="text-muted-foreground">Mobile:</span> {c.patient?.phone || "—"}</p>
              <p><span className="text-muted-foreground">ABHA ID:</span> {c.patient?.abha_id || "—"}</p>
              <p><span className="text-muted-foreground">Address:</span> {c.patient?.address || "—"}</p>
              <p><span className="text-muted-foreground">Doctor:</span> Dr. {c.doctor_name || c.doctor?.full_name || "—"}</p>
              <p><span className="text-muted-foreground">Visit Date:</span> {c.appointment_date ? format(new Date(c.appointment_date), "dd MMM yyyy") : c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "—"}</p>
              <p><span className="text-muted-foreground">Case Number:</span> #{c.case_number || c.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Doctor Details</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            <p><span className="text-muted-foreground">Name:</span> Dr. {c.doctor_name || c.doctor?.full_name || "—"}</p>
            <p><span className="text-muted-foreground">Qualification:</span> {c.doctor?.specialization || c.doctor_specialization || "—"}</p>
            <p><span className="text-muted-foreground">Specialization:</span> {c.doctor_specialization || c.doctor?.specialization || "—"}</p>
            <p><span className="text-muted-foreground">Reg No:</span> {c.doctor_registration_number || c.doctor?.license_number || "—"}</p>
            <p><span className="text-muted-foreground">Mobile:</span> {c.doctor?.phone || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Visit Details</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            <p><span className="text-muted-foreground">Date:</span> {c.appointment_date ? format(new Date(c.appointment_date), "dd MMM yyyy") : c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "—"}</p>
            {c.appointment_time && <p><span className="text-muted-foreground">Time:</span> {c.appointment_time}</p>}
            <p><span className="text-muted-foreground">Doctor:</span> Dr. {c.doctor_name || c.doctor?.full_name || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Audit</CardTitle></CardHeader>
          <CardContent className="py-2 text-sm space-y-1">
            <p><span className="text-muted-foreground">Created By:</span> {c.created_by?.full_name || "—"}</p>
            <p><span className="text-muted-foreground">Updated By:</span> {c.updated_by?.full_name || "—"}</p>
            <p><span className="text-muted-foreground">Created:</span> {c.created_at ? format(new Date(c.created_at), "dd MMM yyyy hh:mm a") : "—"}</p>
            <p><span className="text-muted-foreground">Updated:</span> {c.updated_at ? format(new Date(c.updated_at), "dd MMM yyyy hh:mm a") : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Clinical Sections */}
      {editing ? (
        <CaseReportForm
          mode="edit"
          initialData={{
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
            clinical_findings_summary: "",
            periodontal_examination: c.periodontal_examination || "",
            investigations: c.investigations || "",
            provisional_diagnosis: c.provisional_diagnosis || "",
            final_diagnosis: c.final_diagnosis || "",
            diagnosis: c.diagnosis || "",
            initial_treatment_plan: c.initial_treatment_plan || "",
            treatment_plan_estimated_cost: c.treatment_plan_estimated_cost || "",
            treatment_plan_estimated_visits: c.treatment_plan_estimated_visits || "",
            patient_instructions: c.patient_instructions || "",
            medicines_prescribed: c.medicines_prescribed || "",
            follow_up_instructions: c.follow_up_instructions || "",
            next_review_date: c.next_review_date || "",
            doctor_registration_number: c.doctor_registration_number || "",
            doctor_specialization: c.doctor_specialization || "",
            notes: c.notes || "",
            doctor_id: c.doctor_id || "",
            ...(itemList.length > 0 ? {
              treatment_plan_items: itemList.map((item, i) => ({
                id: item.id || `api-${i}`,
                name: item.procedure_name || "",
                toothNumbers: Array.isArray(item.tooth_numbers) ? item.tooth_numbers : (typeof item.tooth_numbers === "string" ? (() => { try { return JSON.parse(item.tooth_numbers) } catch { return [] } })() : []),
                estimatedVisits: item.estimated_visits ?? "",
                estimatedCost: item.estimated_cost ?? "",
                remarks: item.remarks || "",
              })),
            } : {}),
          }}
          initialFindings={(c.findings || []).map(apiToFinding)}
          onSubmit={handleSave}
          onCancel={() => setEditing(false)}
          patientName={c?.patient_name}
          opNumber={c?.patient?.op_no ?? undefined}
          doctorName={c?.doctor_name}
          visitDate={c?.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : undefined}
        />
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
              findings={(c.findings || []).map(apiToFinding)}
              onFindingsChange={() => {}}
              readonly
              patientDateOfBirth={c?.patient?.date_of_birth ?? undefined}
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
            <TreatmentPlanView caseData={c} itemList={itemList} />
            {(c.treatment_plan_status === "APPROVED" || c.treatment_plan_approved) && c.treatment_plans && c.treatment_plans.length > 0 && (
              <GeneratedTreatmentsView treatmentPlans={c.treatment_plans} />
            )}
            {c.patient_instructions && <SectionCard title="Patient Instructions" content={c.patient_instructions} />}
            {c.medicines_prescribed && <SectionCard title="Medicines Prescribed" content={c.medicines_prescribed} />}
            {c.follow_up_instructions && <SectionCard title="Follow-Up Instructions" content={c.follow_up_instructions} />}
            {c.next_review_date && (
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm">Next Review Date</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {format(new Date(c.next_review_date), "dd MMM yyyy")}
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

interface ParsedPlanItem {
  name: string
  toothNumbers: string[]
  estimatedVisits: number | string
  estimatedCost: number | string
  remarks: string
  status?: string
  assignedDoctor?: string | null
}

function parseTreatmentItems(c: Case, itemList: TreatmentPlanItem[]): ParsedPlanItem[] {
  if (itemList && itemList.length > 0) {
    return itemList.map((item) => ({
      name: item.procedure_name || "—",
      toothNumbers: Array.isArray(item.tooth_numbers) ? item.tooth_numbers : (typeof item.tooth_numbers === "string" ? (() => { try { return JSON.parse(item.tooth_numbers) } catch { return [] } })() : []),
      estimatedVisits: item.estimated_visits || "",
      estimatedCost: item.estimated_cost || "",
      remarks: item.remarks || "",
      status: c.treatment_plan_status || "DRAFT",
      assignedDoctor: item.assigned_doctor_name || null,
    }))
  }
  const raw = c.initial_treatment_plan
  if (raw && typeof raw === "string" && raw.startsWith("_JSON_")) {
    try {
      const parsed = JSON.parse(raw.slice(6))
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch { /* ignore */ }
  }
  if (c.treatment_plans && c.treatment_plans.length > 0) {
    return c.treatment_plans.map((tp) => ({
      name: tp.treatment_name || "—",
      toothNumbers: [],
      estimatedVisits: tp.total_sittings || "",
      estimatedCost: tp.cost || "",
      remarks: tp.notes || "",
    }))
  }
  return []
}

function TreatmentPlanView({ caseData, itemList }: { caseData: Case; itemList: TreatmentPlanItem[] }) {
  const items = parseTreatmentItems(caseData, itemList)
  if (items.length === 0 && !caseData.initial_treatment_plan) return null

  const allTeeth = new Set<string>()
  const totalVisits = items.reduce((s, it) => s + (parseInt(String(it.estimatedVisits)) || 0), 0)
  const totalCost = items.reduce((s, it) => s + (parseFloat(String(it.estimatedCost)) || 0), 0)
  items.forEach((it) => (it.toothNumbers || []).forEach((t) => allTeeth.add(t)))

  return (
    <Card>
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Treatment Plan</CardTitle>
        {caseData.treatment_plan_approved && (
          <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">Approved</span>
        )}
      </CardHeader>
      <CardContent className="py-2 space-y-3">
        {items.length > 0 ? (
          <>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-4 rounded-md border border-[var(--ds-border-light)] bg-[var(--ds-background-subtle)]/50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--ds-text)]">{it.name || "—"}</span>
                      {it.status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${it.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]"}`}>
                          {it.status}
                        </span>
                      )}
                    </div>
                    {it.toothNumbers && it.toothNumbers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {it.toothNumbers.map((t: string) => (
                          <span key={t} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">{t}</span>
                        ))}
                      </div>
                    )}
                    {it.assignedDoctor && <div className="text-xs text-blue-600 mt-0.5">Dr. {it.assignedDoctor}</div>}
                    {it.remarks && <div className="text-xs text-[var(--ds-text-secondary)] mt-0.5">{it.remarks}</div>}
                  </div>
                  <div className="text-right shrink-0 text-xs text-[var(--ds-text-secondary)] space-y-0.5">
                    {it.estimatedVisits ? <div>{it.estimatedVisits} visit{Number(it.estimatedVisits) !== 1 ? "s" : ""}</div> : null}
                    {it.estimatedCost ? <div className="font-medium text-[var(--ds-text)]">₹{Number(it.estimatedCost).toLocaleString("en-IN")}</div> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 pt-2 border-t border-[var(--ds-border-light)] text-xs text-[var(--ds-text-secondary)]">
              <span><strong className="text-[var(--ds-text)]">{items.length}</strong> procedure{items.length !== 1 ? "s" : ""}</span>
              {allTeeth.size > 0 && <span><strong className="text-[var(--ds-text)]">{allTeeth.size}</strong> tooth{allTeeth.size !== 1 ? "teeth" : ""}</span>}
              {totalVisits > 0 && <span><strong className="text-[var(--ds-text)]">{totalVisits}</strong> estimated visit{totalVisits !== 1 ? "s" : ""}</span>}
              {totalCost > 0 && <span><strong className="text-[var(--ds-text)]">₹{totalCost.toLocaleString("en-IN")}</strong> estimated cost</span>}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--ds-text-secondary)]">{caseData.initial_treatment_plan || "No treatment plan recorded."}</p>
        )}
      </CardContent>
    </Card>
  )
}

function TimelineView({ caseId }: { caseId: string }) {
  const { data: entries } = useQuery({
    queryKey: ["case-timeline", caseId],
    queryFn: () => casesApi.getTimeline(caseId),
  })
  const timeline: CaseTimeline[] = Array.isArray(entries) ? entries : []

  if (timeline.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No timeline entries yet.</p>
  }

  return (
    <div className="space-y-3">
      {timeline.map((entry, idx) => (
        <div key={entry.id || idx} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
            {idx < timeline.length - 1 && <div className="w-px flex-1 bg-[var(--ds-surface-secondary)]" />}
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

function GeneratedTreatmentsView({ treatmentPlans }: { treatmentPlans: TreatmentPlan[] }) {
  if (!treatmentPlans || treatmentPlans.length === 0) return null
  const totalCost = treatmentPlans.reduce((s, tp) => s + (tp.cost || 0), 0)
  const allCompleted = treatmentPlans.every((tp) => tp.status === "COMPLETED")

  return (
    <Card className="border-green-200">
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          Treatment Summary ({treatmentPlans.length})
          {allCompleted && (
            <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-medium">ALL COMPLETED</span>
          )}
        </CardTitle>
        <span className="text-[10px] text-muted-foreground">Read-only — managed in Treatment Workspace</span>
      </CardHeader>
      <CardContent className="py-2">
        <div className="space-y-2">
          {treatmentPlans.map((tp) => {
            const completed = tp.completed_sittings || 0
            const total = tp.total_sittings || 1
            const remaining = tp.remaining_sittings ?? (total - completed)
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0
            const pending = (tp.cost || 0) - (tp.paid_amount || 0)
            const toothNumbers = (() => {
              if (!tp.tooth_numbers) return null
              try {
                const parsed = typeof tp.tooth_numbers === "string" ? JSON.parse(tp.tooth_numbers) : tp.tooth_numbers
                return Array.isArray(parsed) ? parsed.join(", ") : parsed
              } catch { return tp.tooth_numbers }
            })()

            return (
              <div key={tp.id} className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3 text-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--ds-text)]">{tp.treatment_name || "—"}</p>
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        tp.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                        tp.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" :
                        tp.status === "WAITING_PATIENT" || tp.status === "WAITING_LAB" ? "bg-yellow-100 text-yellow-700" :
                        tp.status === "OVERDUE" ? "bg-red-100 text-red-700" :
                        tp.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                        "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]"
                      }`}>
                        {tp.status || "GENERATED"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {toothNumbers && <span>Tooth: {toothNumbers}</span>}
                      {tp.assigned_doctor_name && <span className="text-blue-600 font-medium">Dr. {tp.assigned_doctor_name}</span>}
                      {tp.assistant_doctor_name && <span>Asst: Dr. {tp.assistant_doctor_name}</span>}
                      {tp.priority && (
                        <span className={tp.priority === "HIGH" ? "text-red-600" : tp.priority === "MEDIUM" ? "text-amber-600" : "text-green-600"}>
                          {tp.priority}
                        </span>
                      )}
                      {tp.treatment_number && <span className="font-mono">{tp.treatment_number}</span>}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs h-7"
                    onClick={() => window.location.href = `/treatments/${tp.id}`}
                  >
                    Open Workspace
                  </Button>
                </div>

                {/* Visit Progress */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1 text-muted-foreground">
                      <span>{completed} / {total} visits</span>
                      {remaining > 0 && <span>{remaining} remaining</span>}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--ds-background-subtle)]">
                      <div
                        className={`h-1.5 rounded-full transition-all ${tp.status === "COMPLETED" ? "bg-green-500" : "bg-blue-500"}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Cost Summary */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-[var(--ds-border-light)] pt-2">
                  <span>Est. Cost: <strong className="text-[var(--ds-text)]">₹{(tp.cost || 0).toLocaleString("en-IN")}</strong></span>
                  <span>Collected: <strong className="text-green-700">₹{(tp.paid_amount || 0).toLocaleString("en-IN")}</strong></span>
                  {pending > 0 && <span>Pending: <strong className="text-amber-600">₹{pending.toLocaleString("en-IN")}</strong></span>}
                  {tp.next_appointment_date && (
                    <span className="text-blue-600">Next: {format(new Date(tp.next_appointment_date), "dd MMM yyyy")}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t text-sm">
          <span className="text-muted-foreground">Total Estimated Cost</span>
          <span className="font-semibold">₹{totalCost.toLocaleString("en-IN")}</span>
        </div>
      </CardContent>
    </Card>
  )
}
