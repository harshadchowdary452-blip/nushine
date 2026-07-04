import { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"
import {
  Search, Plus, Filter, ArrowUpDown, Loader2, Eye, Trash2, FileText,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FolderOpen, Printer,
  ChevronDown, ChevronRight as ChevronRightIcon, Save
} from "lucide-react"
import { format } from "date-fns"
import { casesApi, patientsApi, doctorsApi } from "@/services/endpoints"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import PageHeader from "@/components/layout/page-header"
import type { Case, ClinicalFinding } from "@/types"

const FINDING_TYPES = [
  "Decay", "Missing", "Root Stump", "Filled", "Crown", "Bridge", "Implant",
  "Mobility", "Calculus", "Stains", "Fracture", "Attrition", "Abrasion",
  "Erosion", "Impaction", "RCT Done", "RCT Required", "Caries", "Pocket",
  "Tenderness", "Periapical Lesion", "Healthy", "Other",
]

const findingColors: Record<string, string> = {
  Decay: "#8B4513", Missing: "#666", "Root Stump": "#A0522D",
  Filled: "#4169E1", Crown: "#DAA520", Bridge: "#9370DB",
  Implant: "#C0C0C0", Mobility: "#FF8C00", Calculus: "#D2B48C",
  Stains: "#A0825A", Fracture: "#DC143C", Attrition: "#BDB76B",
  Abrasion: "#CD853F", Erosion: "#DEB887", Impaction: "#8B008B",
  "RCT Done": "#228B22", "RCT Required": "#006400", Caries: "#8B4513",
  Pocket: "#FF4500", Tenderness: "#FF1493", "Periapical Lesion": "#800000",
  Healthy: "#90EE90", Other: "#808080",
}

const upperJaw = [
  { num: 18, label: "18" }, { num: 17, label: "17" }, { num: 16, label: "16" }, { num: 15, label: "15" },
  { num: 14, label: "14" }, { num: 13, label: "13" }, { num: 12, label: "12" }, { num: 11, label: "11" },
  { num: 21, label: "21" }, { num: 22, label: "22" }, { num: 23, label: "23" }, { num: 24, label: "24" },
  { num: 25, label: "25" }, { num: 26, label: "26" }, { num: 27, label: "27" }, { num: 28, label: "28" },
]
const lowerJaw = [
  { num: 48, label: "48" }, { num: 47, label: "47" }, { num: 46, label: "46" }, { num: 45, label: "45" },
  { num: 44, label: "44" }, { num: 43, label: "43" }, { num: 42, label: "42" }, { num: 41, label: "41" },
  { num: 31, label: "31" }, { num: 32, label: "32" }, { num: 33, label: "33" }, { num: 34, label: "34" },
  { num: 35, label: "35" }, { num: 36, label: "36" }, { num: 37, label: "37" }, { num: 38, label: "38" },
]

function CollapsibleSection({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <Card>
      <CardHeader className="py-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="text-xs flex items-center gap-2">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
          {title}
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}

function ToothChart({ findings, onToggle }: { findings: ClinicalFinding[]; onToggle: (toothNum: string, findingType: string) => void }) {
  const getToothFindings = (num: number) => findings.filter((f) => f.tooth_number === String(num))

  const renderTooth = (t: { num: number; label: string }) => {
    const tf = getToothFindings(t.num)
    const hasFindings = tf.length > 0
    const toothColor = tf.length > 0 ? findingColors[tf[0].finding_type] || "#90EE90" : "#f8f8f8"
    const isHealthy = tf.some((f) => f.finding_type === "Healthy")
    return (
      <div key={t.num} className="relative group">
        <div
          className={`w-7 h-9 rounded border flex items-center justify-center text-[8px] font-bold cursor-pointer transition-all
            ${hasFindings ? "text-white" : "text-gray-400 hover:border-primary"}
            ${isHealthy ? "ring-2 ring-green-300" : ""}
            hover:scale-110`}
          style={{ backgroundColor: hasFindings ? toothColor : undefined, borderColor: hasFindings ? toothColor : undefined }}
          onClick={() => onToggle(String(t.num), "")}
          title={`Tooth ${t.label}: ${tf.map((f) => f.finding_type).join(", ") || "Healthy"}`}
        >
          {t.label}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-0.5 justify-center">{upperJaw.map(renderTooth)}</div>
      <div className="flex gap-0.5 justify-center">{lowerJaw.map(renderTooth)}</div>
    </div>
  )
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
]

const statusColors: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 border-blue-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  ON_HOLD: "bg-gray-50 text-gray-600 border-gray-300",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-red-50 text-red-700 border-red-200",
}

export default function CaseHistoryList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [doctorFilter, setDoctorFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [sortBy, setSortBy] = useState("created_at")
  const [sortDesc, setSortDesc] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: items, isFetching } = useQuery({
    queryKey: ["case-history-list", page, pageSize, search, statusFilter, doctorFilter, dateFrom, dateTo, sortBy, sortDesc],
    queryFn: () => casesApi.list({
      skip: page * pageSize,
      limit: pageSize,
      search: search || undefined,
      status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
      doctor_id: doctorFilter && doctorFilter.trim() ? doctorFilter : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort_by: sortBy,
      sort_desc: sortDesc,
    }),
  })
  const cases: Case[] = Array.isArray(items) ? items : []

  const { data: doctors } = useQuery({
    queryKey: ["doctors-for-filter"],
    queryFn: () => doctorsApi.list({ limit: 200 }).then((r: any) => {
      if (Array.isArray(r)) return r
      if (r?.users) return r.users
      if (r?.data) return r.data
      return []
    }),
  })
  const doctorsList: any[] = Array.isArray(doctors) ? doctors : []

  const totalPages = Math.ceil((cases.length || 1) / pageSize)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => casesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-history-list"] })
      addToast({ title: "Case History deleted", variant: "success" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Delete failed", variant: "destructive" }),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Case History" description="Manage patient case histories">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Case History
        </Button>
      </PageHeader>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient name or OP no..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                className="pl-8 h-9 text-sm" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0) }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={doctorFilter} onValueChange={(v) => { setDoctorFilter(v); setPage(0) }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Doctors" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Doctors</SelectItem>
                {doctorsList.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name || d.name || d.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="h-9 text-sm" placeholder="From date" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="h-9 text-sm" placeholder="To date" />
          </div>
        </CardContent>
      </Card>

      {/* Sort controls */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span>Sort by:</span>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Created</SelectItem>
            <SelectItem value="updated_at">Last Updated</SelectItem>
            <SelectItem value="patient_name">Patient Name</SelectItem>
            <SelectItem value="doctor">Doctor</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSortDesc(!sortDesc)}>
          {sortDesc ? "Newest First" : "Oldest First"}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isFetching ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : cases.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No case histories found
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case #</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>OP No</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Chief Complaint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/cases/${c.id}`)}>
                      <TableCell className="font-mono text-xs">{c.case_number || c.id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{c.patient_name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.patient?.op_no || "—"}</TableCell>
                      <TableCell className="text-xs">{c.doctor_name || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{c.chief_complaint}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusColors[c.status] || "bg-gray-50"}`}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {c.created_at ? format(new Date(c.created_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7" asChild>
                            <Link to={`/cases/${c.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-red-500"
                            onClick={(e) => { e.stopPropagation(); if (confirm("Delete this case history?")) deleteMutation.mutate(c.id) }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{cases.length} case(s)</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(0)}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm px-2">Page {page + 1}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(totalPages - 1)}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Create Dialog (reuses existing CaseCreate dialog) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>New Case History</DialogTitle></DialogHeader>
          <CreateCaseForm onSuccess={() => { setCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["case-history-list"] }) }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateCaseForm({ onSuccess }: { onSuccess: () => void }) {
  const { addToast } = useToast()
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [doctorId, setDoctorId] = useState("")
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<Record<string, any>>({})
  const [findings, setFindings] = useState<ClinicalFinding[]>([])
  const [toothModal, setToothModal] = useState<string | null>(null)

  const { data: patientResults } = useQuery({
    queryKey: ["patient-search", patientSearch],
    queryFn: () => patientsApi.search({ q: patientSearch, limit: 10 }),
    enabled: patientSearch.length >= 2,
  })
  const patients: any[] = Array.isArray(patientResults)
    ? patientResults
    : patientResults?.data || patientResults?.patients || []

  const { data: doctors } = useQuery({
    queryKey: ["doctors-create"],
    queryFn: () => doctorsApi.list({ limit: 200 }).then((r: any) => {
      if (Array.isArray(r)) return r
      if (r?.users) return r.users
      return []
    }),
  })
  const doctorsList: any[] = Array.isArray(doctors) ? doctors : []

  const findingsSummary = useMemo(() => {
    if (findings.length === 0) return ""
    const byTooth: Record<string, string[]> = {}
    findings.forEach((f) => {
      const key = f.tooth_number || "General"
      if (!byTooth[key]) byTooth[key] = []
      byTooth[key].push(f.finding_type)
    })
    return Object.entries(byTooth)
      .sort(([a], [b]) => (a === "General" ? 1 : b === "General" ? -1 : Number(a) - Number(b)))
      .map(([tooth, types]) => `Tooth ${tooth}: ${types.join(", ")}`)
      .join("\n")
  }, [findings])

  function handleToothToggle(toothNum: string) {
    setToothModal((prev) => (prev === toothNum ? null : toothNum))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPatient || !form.chief_complaint) return
    setSaving(true)
    try {
      const summary = form.clinical_findings_summary || (findings.length > 0 ? findingsSummary : null)
      const payload: Record<string, any> = {
        patient_id: selectedPatient.id,
        doctor_id: doctorId || undefined,
        ...form,
        clinical_findings_summary: summary,
        treatment_plan_estimated_cost: form.treatment_plan_estimated_cost ? Number(form.treatment_plan_estimated_cost) : null,
        treatment_plan_estimated_visits: form.treatment_plan_estimated_visits ? Number(form.treatment_plan_estimated_visits) : null,
        findings: findings.length > 0 ? findings.map((f) => ({
          tooth_number: f.tooth_number,
          finding_type: f.finding_type,
          severity: f.severity,
          notes: f.notes,
        })) : undefined,
      }
      Object.keys(payload).forEach((k) => { if (payload[k] === "" || payload[k] === undefined || payload[k] === null) delete payload[k] })
      await casesApi.create(payload)
      addToast({ title: "Case history created", variant: "success" })
      onSuccess()
    } catch (err: any) {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Failed", variant: "destructive" })
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <Label className="text-xs">Patient Name <span className="text-red-500">*</span></Label>
        <Input placeholder="Search patient by name or OP number..." value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)} className="h-8 text-sm" />
        {patientSearch.length >= 2 && patients.length > 0 && (
          <div className="border rounded-md max-h-[120px] overflow-y-auto">
            {patients.map((p: any) => (
              <div key={p.id} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-muted flex justify-between ${selectedPatient?.id === p.id ? "bg-muted font-medium" : ""}`}
                onClick={() => { setSelectedPatient(p); setPatientSearch(p.full_name || "") }}>
                <span>{p.full_name || "Unknown"}</span>
                <span className="text-muted-foreground">{p.op_no || "—"}</span>
              </div>
            ))}
          </div>
        )}
        {selectedPatient && (
          <div className="text-[10px] text-muted-foreground">
            OP No: <strong>{selectedPatient.op_no || "—"}</strong>
            {selectedPatient.phone && <> | Phone: <strong>{selectedPatient.phone}</strong></>}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Doctor</Label>
        <Select value={doctorId} onValueChange={setDoctorId}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select doctor" /></SelectTrigger>
          <SelectContent>
            {doctorsList.map((d: any) => (
              <SelectItem key={d.id} value={d.id}>{d.full_name || d.name || d.username}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CollapsibleSection title="1. Chief Complaint" defaultOpen>
        <div className="space-y-2">
          <div><Label className="text-[10px]">Chief Complaint *</Label><textarea value={form.chief_complaint || ""} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })}
            className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px]">Duration</Label><Input value={form.chief_complaint_duration || ""} onChange={(e) => setForm({ ...form, chief_complaint_duration: e.target.value })} placeholder="e.g. 2 weeks" className="h-7 text-xs" /></div>
            <div><Label className="text-[10px]">Severity</Label><Input value={form.chief_complaint_severity || ""} onChange={(e) => setForm({ ...form, chief_complaint_severity: e.target.value })} placeholder="e.g. Moderate" className="h-7 text-xs" /></div>
          </div>
          <div><Label className="text-[10px]">Associated Symptoms</Label><textarea value={form.chief_complaint_associated_symptoms || ""} onChange={(e) => setForm({ ...form, chief_complaint_associated_symptoms: e.target.value })}
            className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]" /></div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="2. History of Present Illness (HPI)">
        <textarea value={form.hpi || ""} onChange={(e) => setForm({ ...form, hpi: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[60px]"
          placeholder="Present illness, duration, progression..." />
      </CollapsibleSection>

      <CollapsibleSection title="3. Personal History">
        <textarea value={form.personal_history || ""} onChange={(e) => setForm({ ...form, personal_history: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]"
          placeholder="Smoking, Alcohol, Diet, Oral hygiene habits..." />
      </CollapsibleSection>

      <CollapsibleSection title="4. Family History">
        <textarea value={form.family_history || ""} onChange={(e) => setForm({ ...form, family_history: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]"
          placeholder="Diabetes, Hypertension, Genetic disorders..." />
      </CollapsibleSection>

      <CollapsibleSection title="5. Medical History">
        <textarea value={form.medical_history || ""} onChange={(e) => setForm({ ...form, medical_history: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]" />
      </CollapsibleSection>

      <CollapsibleSection title="6. Dental History">
        <textarea value={form.dental_history || ""} onChange={(e) => setForm({ ...form, dental_history: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]" />
      </CollapsibleSection>

      <CollapsibleSection title="7. Extra Oral Examination">
        <textarea value={form.extra_oral_examination || ""} onChange={(e) => setForm({ ...form, extra_oral_examination: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]"
          placeholder="Face Symmetry, TMJ, Lymph Nodes, Swelling..." />
      </CollapsibleSection>

      <CollapsibleSection title="8. Intra Oral Examination">
        <textarea value={form.intra_oral_examination || ""} onChange={(e) => setForm({ ...form, intra_oral_examination: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]"
          placeholder="Soft Tissue, Tongue, Palate, Gingiva, Occlusion..." />
      </CollapsibleSection>

      <CollapsibleSection title="9. Clinical Findings — Tooth Chart">
        <ToothChart findings={findings} onToggle={handleToothToggle} />
        {toothModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setToothModal(null)}>
            <div className="bg-white rounded-lg p-3 max-w-xs w-full mx-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-sm mb-2">Tooth {toothModal}</h3>
              <div className="grid grid-cols-3 gap-1 max-h-[250px] overflow-y-auto">
                {FINDING_TYPES.map((ft) => {
                  const active = findings.some((f) => f.tooth_number === toothModal && f.finding_type === ft)
                  return (
                    <Button key={ft} variant={active ? "default" : "outline"} size="sm" className="text-[9px] h-7 px-1"
                      style={active ? { backgroundColor: findingColors[ft] || undefined } : undefined}
                      onClick={() => {
                        if (active) {
                          setFindings((prev) => prev.filter((f) => !(f.tooth_number === toothModal && f.finding_type === ft)))
                        } else {
                          setFindings((prev) => [...prev, { id: "", case_id: "", tooth_number: toothModal, finding_type: ft, severity: null, notes: null, created_at: new Date().toISOString() }])
                        }
                      }}>
                      {ft}
                    </Button>
                  )
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setToothModal(null)}>Done</Button>
                <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs" onClick={() => { setFindings((prev) => prev.filter((f) => f.tooth_number !== toothModal)); setToothModal(null) }}>Clear</Button>
              </div>
            </div>
          </div>
        )}
        <div className="mt-2">
          <Label className="text-[10px]">Findings Summary</Label>
          <textarea value={form.clinical_findings_summary || findingsSummary}
            onChange={(e) => setForm({ ...form, clinical_findings_summary: e.target.value })}
            className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[40px]" />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="10. Periodontal Examination">
        <textarea value={form.periodontal_examination || ""} onChange={(e) => setForm({ ...form, periodontal_examination: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]"
          placeholder="Pocket Depth, Bleeding On Probing, Mobility..." />
      </CollapsibleSection>

      <CollapsibleSection title="11. Investigations">
        <textarea value={form.investigations || ""} onChange={(e) => setForm({ ...form, investigations: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]"
          placeholder="IOPA, OPG, CBCT, X-Ray, Blood Tests..." />
      </CollapsibleSection>

      <CollapsibleSection title="12. Provisional Diagnosis">
        <textarea value={form.provisional_diagnosis || ""} onChange={(e) => setForm({ ...form, provisional_diagnosis: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]" />
      </CollapsibleSection>

      <CollapsibleSection title="13. Final Diagnosis">
        <textarea value={form.final_diagnosis || ""} onChange={(e) => setForm({ ...form, final_diagnosis: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]" />
      </CollapsibleSection>

      <CollapsibleSection title="14. Initial Treatment Plan">
        <div className="space-y-2">
          <textarea value={form.initial_treatment_plan || ""} onChange={(e) => setForm({ ...form, initial_treatment_plan: e.target.value })}
            className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]"
            placeholder="Recommended procedures..." />
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px]">Estimated Visits</Label><Input type="number" value={form.treatment_plan_estimated_visits || ""} onChange={(e) => setForm({ ...form, treatment_plan_estimated_visits: e.target.value })} className="h-7 text-xs" /></div>
            <div><Label className="text-[10px]">Estimated Cost</Label><Input type="number" value={form.treatment_plan_estimated_cost || ""} onChange={(e) => setForm({ ...form, treatment_plan_estimated_cost: e.target.value })} className="h-7 text-xs" /></div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="15. Clinical Notes">
        <textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[50px]" />
      </CollapsibleSection>

      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-[10px]">Doctor Reg No.</Label><Input value={form.doctor_registration_number || ""} onChange={(e) => setForm({ ...form, doctor_registration_number: e.target.value })} className="h-7 text-xs" /></div>
        <div><Label className="text-[10px]">Specialization</Label><Input value={form.doctor_specialization || ""} onChange={(e) => setForm({ ...form, doctor_specialization: e.target.value })} className="h-7 text-xs" /></div>
      </div>

      <Button type="submit" className="w-full h-9 text-sm" disabled={!selectedPatient || !form.chief_complaint || saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        <Save className="h-4 w-4 mr-2" /> Create Case History
      </Button>
    </form>
  )
}
