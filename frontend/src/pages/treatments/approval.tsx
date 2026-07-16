/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, AlertTriangle, User, Stethoscope,
  Send, Phone, Mail, Heart, MapPin, Shield, ChevronDown, Calendar,
  Clock, Save, AlertCircle, Check, Loader, CircleDot, FileText, Eye,
  Activity, UserPlus, RefreshCw,
} from "lucide-react"
import PageHeader from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { casesApi, treatmentPlanItemsApi, doctorsApi, appointmentsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { useAuthStore } from "@/store/authStore"
import { formatIndianRupees } from "@/lib/currency"
import { cn } from "@/lib/utils"

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

const PROCEDURE_SPECIALIZATION_MAP: Record<string, string[]> = {
  "root canal": ["Endodontist", "Endodontics", "Conservative Dentistry"],
  "extraction": ["Oral Surgeon", "Oral and Maxillofacial Surgery", "Oral Surgery"],
  "bridge": ["Prosthodontist", "Prosthodontics", "Crown and Bridge"],
  "crown": ["Prosthodontist", "Prosthodontics", "Crown and Bridge"],
  "scaling": ["Periodontist", "Periodontics", "Periodontology"],
  "implant": ["Oral Surgeon", "Implantologist", "Prosthodontist"],
  "orthodont": ["Orthodontist", "Orthodontics"],
  "braces": ["Orthodontist", "Orthodontics"],
  "whitening": ["Cosmetic Dentist", "Cosmetic Dentistry", "Conservative Dentistry"],
  "filling": ["Conservative Dentist", "Conservative Dentistry", "Endodontist"],
  "rct": ["Endodontist", "Endodontics", "Conservative Dentistry"],
  "RCT": ["Endodontist", "Endodontics", "Conservative Dentistry"],
}

function getRecommendedSpecializations(procedureName: string): string[] {
  if (!procedureName) return []
  const lower = procedureName.toLowerCase()
  for (const [keyword, specs] of Object.entries(PROCEDURE_SPECIALIZATION_MAP)) {
    if (lower.includes(keyword.toLowerCase())) return specs
  }
  return []
}

function sortDoctorsByRelevance(doctors: { id: string; name: string; specialization: string | null }[], procedureName: string) {
  const specs = getRecommendedSpecializations(procedureName)
  if (specs.length === 0) return doctors
  const recommended: typeof doctors = []
  const others: typeof doctors = []
  for (const doc of doctors) {
    const spec = (doc.specialization || "").toLowerCase()
    if (specs.some(s => spec.includes(s.toLowerCase()))) {
      recommended.push(doc)
    } else {
      others.push(doc)
    }
  }
  return [...recommended, ...others]
}

type SaveStatus = "idle" | "saving" | "saved" | "error"

interface RowEdit {
  primary: string
  assistant: string
  priority: string
}

function SaveStatusIcon({ status }: { status: SaveStatus }) {
  if (status === "saving") return <Loader className="h-3 w-3 animate-spin text-blue-500" />
  if (status === "saved") return <Check className="h-3 w-3 text-green-600" />
  if (status === "error") return <AlertCircle className="h-3 w-3 text-red-500" />
  return null
}

function SaveStatusLabel({ status }: { status: SaveStatus }) {
  if (status === "saving") return <span className="text-[10px] text-blue-600">Saving...</span>
  if (status === "saved") return <span className="text-[10px] text-green-600">Saved</span>
  if (status === "error") return <span className="text-[10px] text-red-500">Save Failed</span>
  return null
}

export default function TreatmentPlanApproval() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [requestChangesDialogOpen, setRequestChangesDialogOpen] = useState(false)
  const [requestChangesReason, setRequestChangesReason] = useState("")

  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({})
  const [rowStatuses, setRowStatuses] = useState<Record<string, SaveStatus>>({})
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [firstAppointment, setFirstAppointment] = useState<{
    treatment_item_id: string
    doctor_id: string
    date: string
    time: string
    future_ready: boolean
    chair: string
    room: string
  } | null>(null)

  const { data: caseData, isLoading: caseLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => casesApi.get(caseId!),
    enabled: !!caseId,
  })

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["treatment-plan-items", caseId],
    queryFn: () => treatmentPlanItemsApi.listByCase(caseId!),
    enabled: !!caseId,
  })

  const c = caseData as any
  const patient = c?.patient as any
  const hospitalId = patient?.hospital_id

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors", hospitalId],
    queryFn: () => doctorsApi.list({ hospital_id: hospitalId, limit: 200 }),
    enabled: !!hospitalId,
  })

  const { data: patientCasesData } = useQuery({
    queryKey: ["patient-cases-count", patient?.id],
    queryFn: () => casesApi.list({ patient_id: patient?.id, limit: 200 }),
    enabled: !!patient?.id,
  })

  const doctorList = useMemo(() => {
    const raw = Array.isArray(doctorsData) ? doctorsData : (doctorsData?.items || [])
    return raw.filter((d: any) => d.is_active !== false).map((d: any) => ({
      id: d.id,
      name: d.full_name || d.name || d.email,
      specialization: d.specialization || null,
    }))
  }, [doctorsData])

  const itemList = useMemo(() => (Array.isArray(items) ? items : (items?.items || [])), [items])
  const totalCost = itemList.reduce((sum: number, item: any) => sum + (item.estimated_cost || 0), 0)
  const totalVisits = itemList.reduce((sum: number, item: any) => sum + (item.estimated_visits || 0), 0)
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === "HOSPITAL_ADMIN" || user?.role === "SUPER_ADMIN"

  const getEdit = useCallback((itemId: string): RowEdit => {
    const item = itemList.find((i: any) => i.id === itemId)
    return rowEdits[itemId] || {
      primary: item?.assigned_doctor_id || "",
      assistant: item?.assistant_doctor_id || "",
      priority: item?.priority || "",
    }
  }, [rowEdits, itemList])

  const getPrimaryDoctor = useCallback((item: any) => getEdit(item.id).primary, [getEdit])
  const getAssistantDoctor = useCallback((item: any) => getEdit(item.id).assistant, [getEdit])
  const getPriority = useCallback((item: any) => getEdit(item.id).priority, [getEdit])

  const isItemModified = useCallback((itemId: string) => {
    const item = itemList.find((i: any) => i.id === itemId)
    if (!item) return false
    const edit = getEdit(itemId)
    return edit.primary !== (item.assigned_doctor_id || "") ||
      edit.assistant !== (item.assistant_doctor_id || "") ||
      edit.priority !== (item.priority || "")
  }, [itemList, getEdit])

  const hasAnyModifications = useMemo(() => {
    return itemList.some((item: any) => isItemModified(item.id))
  }, [itemList, isItemModified])

  const allItemsHaveDoctor = useMemo(() => {
    return itemList.length > 0 && itemList.every((item: any) => {
      const edit = getEdit(item.id)
      return edit.primary
    })
  }, [itemList, getEdit])

  const allItemsSaved = useMemo(() => {
    if (itemList.length === 0) return false
    return itemList.every((item: any) => {
      const status = rowStatuses[item.id]
      if (status === "saving" || status === "error") return false
      if (isItemModified(item.id)) return false
      return true
    })
  }, [itemList, rowStatuses, isItemModified])

  const setRowEdit = useCallback((itemId: string, field: keyof RowEdit, value: string) => {
    setRowEdits(prev => {
      const current = prev[itemId] || { primary: "", assistant: "", priority: "" }
      return { ...prev, [itemId]: { ...current, [field]: value } }
    })
    setRowStatuses(prev => ({ ...prev, [itemId]: "idle" as SaveStatus }))

    if (debounceTimers.current[itemId]) clearTimeout(debounceTimers.current[itemId])
    debounceTimers.current[itemId] = setTimeout(() => {
      triggerAutoSave(itemId)
    }, 500)
  }, [])

  const assignMutation = useMutation({
    mutationFn: async (assignments: { item_id: string; assigned_doctor_id?: string; assistant_doctor_id?: string; priority?: string }[]) => {
      if (assignments.length === 0) return []
      return treatmentPlanItemsApi.assignDoctors(assignments)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", caseId] })
      variables.forEach((a: any) => {
        setRowStatuses(prev => ({ ...prev, [a.item_id]: "saved" }))
      })
      setTimeout(() => {
        variables.forEach((a: any) => {
          setRowStatuses(prev => {
            if (prev[a.item_id] === "saved") return { ...prev, [a.item_id]: "idle" }
            return prev
          })
        })
      }, 2000)
    },
    onError: (_err: any, variables: any) => {
      variables.forEach((a: any) => {
        setRowStatuses(prev => ({ ...prev, [a.item_id]: "error" }))
      })
      addToast({ title: "Save Failed", description: "Could not save doctor assignment. Click to retry.", variant: "destructive" })
    },
  })

  const triggerAutoSave = useCallback((itemId: string) => {
    const item = itemList.find((i: any) => i.id === itemId)
    if (!item) return
    const edit = getEdit(itemId)
    if (!isItemModified(itemId)) return

    setRowStatuses(prev => ({ ...prev, [itemId]: "saving" }))
    assignMutation.mutate([{
      item_id: itemId,
      assigned_doctor_id: edit.primary || undefined,
      assistant_doctor_id: edit.assistant || undefined,
      priority: edit.priority || undefined,
    }])
  }, [itemList, getEdit, isItemModified, assignMutation])

  const retrySave = useCallback((itemId: string) => {
    triggerAutoSave(itemId)
  }, [triggerAutoSave])

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!caseId) throw new Error("Case ID is required")
      if (hasAnyModifications) {
        const assignments = itemList.map((item: any) => {
          const edit = getEdit(item.id)
          return {
            item_id: item.id,
            assigned_doctor_id: edit.primary || undefined,
            assistant_doctor_id: edit.assistant || undefined,
            priority: edit.priority || undefined,
          }
        })
        await assignMutation.mutateAsync(assignments)
      }
      return casesApi.submitTreatmentPlan(caseId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", caseId] })
      setRowEdits({})
      setRowStatuses({})
      addToast({ title: "Submitted for Approval", variant: "success" })
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to submit", variant: "destructive" }),
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!caseId) throw new Error("Case ID is required")
      if (hasAnyModifications) {
        const assignments = itemList.map((item: any) => {
          const edit = getEdit(item.id)
          return {
            item_id: item.id,
            assigned_doctor_id: edit.primary || undefined,
            assistant_doctor_id: edit.assistant || undefined,
            priority: edit.priority || undefined,
          }
        })
        await assignMutation.mutateAsync(assignments)
      }
      if (firstAppointment) {
        const apptData: any = {
          patient_id: patient?.id,
          doctor_id: firstAppointment.doctor_id,
          appointment_date: firstAppointment.date,
          appointment_time: firstAppointment.time,
          appointment_type: "TREATMENT",
          notes: `First appointment for treatment plan — ${firstAppointment.future_ready ? "Future Ready" : ""}${firstAppointment.chair ? ` | Chair: ${firstAppointment.chair}` : ""}${firstAppointment.room ? ` | Room: ${firstAppointment.room}` : ""}`,
        }
        await appointmentsApi.create(apptData)
      }
      return casesApi.approveTreatmentPlan(caseId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", caseId] })
      setApproveDialogOpen(false)
      setRowEdits({})
      setRowStatuses({})
      setFirstAppointment(null)
      addToast({ title: "Treatment Plan Approved", description: "Treatments generated. Redirecting to Treatment Workspace.", variant: "success" })
      navigate("/treatments")
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to approve", variant: "destructive" }),
  })

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!caseId) throw new Error("Case ID is required")
      return casesApi.rejectTreatmentPlan(caseId, rejectReason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] })
      queryClient.invalidateQueries({ queryKey: ["treatment-plan-items", caseId] })
      setRejectDialogOpen(false)
      setRejectReason("")
      addToast({ title: "Treatment Plan Rejected", variant: "success" })
      navigate(`/cases/${caseId}`)
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to reject", variant: "destructive" }),
  })

  const requestChangesMutation = useMutation({
    mutationFn: async () => {
      if (!caseId) throw new Error("Case ID is required")
      return casesApi.rejectTreatmentPlan(caseId, requestChangesReason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] })
      setRequestChangesDialogOpen(false)
      setRequestChangesReason("")
      addToast({ title: "Changes Requested", variant: "success" })
      navigate(`/cases/${caseId}`)
    },
    onError: (err: any) => addToast({ title: "Error", description: err?.response?.data?.detail || "Failed to request changes", variant: "destructive" }),
  })

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [])

  const isLoading = caseLoading || itemsLoading
  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      </div>
    </div>
  )
  if (!c) return <div className="py-20 text-center text-muted-foreground">Case not found</div>

  const planStatus = c.treatment_plan_status
  const isApproved = planStatus === "APPROVED"
  const isRejected = planStatus === "REJECTED"
  const isPending = planStatus === "PENDING_APPROVAL"
  const isDraft = planStatus === "DRAFT" || !planStatus
  const isEditable = isDraft || isRejected

  const patientAge = patient?.age ?? calcAge(patient?.date_of_birth)
  const patientCases = Array.isArray(patientCasesData) ? patientCasesData : (patientCasesData?.items || [])
  const activeCases = patientCases.filter((pc: any) => pc.status !== "COMPLETED" && pc.status !== "CANCELLED")
  const completedCases = patientCases.filter((pc: any) => pc.status === "COMPLETED")

  const findings = c.findings || []
  const diagnoses = [c.provisional_diagnosis, c.final_diagnosis, c.diagnosis].filter(Boolean)

  const readinessChecks = [
    { label: "Doctors Assigned", done: allItemsHaveDoctor, detail: `${itemList.filter((_: any, i: number) => getPrimaryDoctor(itemList[i])).length} / ${itemList.length}` },
    { label: "Treatment Items Saved", done: allItemsSaved, detail: allItemsSaved ? "All saved" : "Some unsaved" },
    { label: "Estimated Visits Complete", done: itemList.every((item: any) => item.estimated_visits > 0), detail: `${totalVisits} total visits` },
    { label: "Estimated Costs Complete", done: itemList.every((item: any) => item.estimated_cost > 0), detail: formatIndianRupees(totalCost) },
    { label: "First Appointment Configured", done: !!firstAppointment?.doctor_id && !!firstAppointment?.date && !!firstAppointment?.time },
    { label: "Validation Passed", done: allItemsHaveDoctor && allItemsSaved && itemList.length > 0 },
  ]
  const allChecksPassed = readinessChecks.every(c => c.done)

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-32">
        <PageHeader title="Clinical Treatment Approval" description={`Case ${c.case_number || caseId!.slice(0, 8)}`}>
          <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${caseId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Case
          </Button>
        </PageHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ─── LEFT PANEL: Patient Clinical Snapshot ─── */}
          <div className="space-y-4">
            {/* Patient Identity */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" /> Patient Clinical Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 space-y-4">
                {patient ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Patient Name</span>
                        <p className="font-medium">{patient.full_name || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">OP Number</span>
                        <p className="font-medium font-mono">{patient.op_no || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Age</span>
                        <p className="font-medium">{patientAge != null ? `${patientAge} years` : "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Gender</span>
                        <p className="font-medium">{patient.gender ? patient.gender.charAt(0) + patient.gender.slice(1).toLowerCase() : "—"}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground text-xs">Phone</span>
                          <p className="font-medium">{patient.phone || "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground text-xs">Email</span>
                          <p className="font-medium text-xs truncate">{patient.email || "—"}</p>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Blood Group</span>
                        <p className="font-medium">{patient.blood_group || "—"}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground text-xs">ABHA ID</span>
                          <p className="font-medium font-mono text-xs">{patient.abha_id || "—"}</p>
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground text-xs">Address</span>
                          <p className="font-medium text-xs">{patient.address || "—"}</p>
                        </div>
                      </div>
                    </div>

                    {(patient.bp || patient.sugar || patient.spo2) && (
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs">
                        <span className="text-blue-700 font-medium">Vitals:</span>{" "}
                        <span className="text-blue-800">
                          {patient.bp && `BP: ${patient.bp}`}
                          {patient.bp && patient.sugar && " · "}
                          {patient.sugar && `Sugar: ${patient.sugar}`}
                          {(patient.bp || patient.sugar) && patient.spo2 && " · "}
                          {patient.spo2 && `SpO2: ${patient.spo2}`}
                        </span>
                      </div>
                    )}

                    {patient.medical_history && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs">
                        <span className="flex items-center gap-1 text-amber-700 font-medium mb-1">
                          <Heart className="h-3 w-3" /> Medical Alerts / Allergies
                        </span>
                        <p className="text-amber-800">{patient.medical_history}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="rounded-md bg-slate-50 p-2">
                        <span className="font-medium text-slate-700">Active Cases</span>
                        <p className="text-lg font-semibold text-slate-900">{activeCases.length}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 p-2">
                        <span className="font-medium text-slate-700">Completed Cases</span>
                        <p className="text-lg font-semibold text-slate-900">{completedCases.length}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Patient data not available</p>
                )}
              </CardContent>
            </Card>

            {/* Chief Complaint */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" /> Chief Complaint
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 text-sm space-y-2">
                <p className="font-medium">{c.chief_complaint || "—"}</p>
                {c.chief_complaint_duration && (
                  <p className="text-muted-foreground text-xs">Duration: {c.chief_complaint_duration}</p>
                )}
                {c.chief_complaint_severity && (
                  <p className="text-muted-foreground text-xs">Severity: {c.chief_complaint_severity}</p>
                )}
                {c.chief_complaint_associated_symptoms && (
                  <p className="text-muted-foreground text-xs">Associated: {c.chief_complaint_associated_symptoms}</p>
                )}
              </CardContent>
            </Card>

            {/* Medical History */}
            {c.medical_history && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Heart className="h-4 w-4" /> Medical History
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 text-sm">
                  <p>{c.medical_history}</p>
                </CardContent>
              </Card>
            )}

            {/* Clinical Findings */}
            {findings.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Clinical Findings ({findings.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <div className="space-y-2">
                    {findings.map((f: any) => (
                      <div key={f.id} className="flex items-start gap-2 text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0">
                        <Badge variant={f.severity === "severe" ? "danger" : f.severity === "moderate" ? "warning" : "secondary"} className="shrink-0 text-[10px]">
                          {f.finding_type}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">Tooth {f.tooth_number || "—"}</p>
                          {f.notes && <p className="text-muted-foreground truncate">{f.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Diagnosis */}
            {diagnoses.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Diagnosis
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 text-sm space-y-1">
                  {c.provisional_diagnosis && (
                    <div><span className="text-muted-foreground text-xs">Provisional:</span> <span className="font-medium">{c.provisional_diagnosis}</span></div>
                  )}
                  {c.final_diagnosis && (
                    <div><span className="text-muted-foreground text-xs">Final:</span> <span className="font-medium">{c.final_diagnosis}</span></div>
                  )}
                  {!c.provisional_diagnosis && !c.final_diagnosis && c.diagnosis && (
                    <p className="font-medium">{c.diagnosis}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Investigations */}
            {c.investigations && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4" /> Investigations
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 text-sm">
                  <p>{c.investigations}</p>
                </CardContent>
              </Card>
            )}

            {/* Clinical Progress Notes */}
            {c.clinical_progress_notes && c.clinical_progress_notes.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Clinical Progress Notes ({c.clinical_progress_notes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 text-xs space-y-2">
                  {c.clinical_progress_notes.map((n: any) => (
                    <div key={n.id} className="border-l-2 border-blue-200 pl-2">
                      <p className="text-muted-foreground">{new Date(n.note_date).toLocaleDateString()}</p>
                      <p>{n.clinical_note}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ─── RIGHT PANEL ─── */}
          <div className="space-y-4">
            {/* Treatment Plan Review Table */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Treatment Plan Review ({itemList.length} items)
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                {itemList.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No treatment plan items found.</p>
                ) : (
                  <div className="space-y-3">
                    {!allItemsHaveDoctor && isEditable && (
                      <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Every procedure must have a Primary Doctor assigned.
                      </div>
                    )}
                    {itemList.map((item: any) => {
                      const edit = getEdit(item.id)
                      const saveStatus = rowStatuses[item.id] || "idle"
                      const modified = isItemModified(item.id)
                      return (
                        <div key={item.id} className={cn(
                          "rounded-lg border p-4 text-sm space-y-3 transition-colors",
                          modified && "border-blue-200 bg-blue-50/30",
                          saveStatus === "error" && "border-red-200 bg-red-50/30",
                        )}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{item.procedure_name || "—"}</p>
                                {!edit.primary && isEditable && (
                                  <Badge variant="warning" className="text-[10px]">No Doctor</Badge>
                                )}
                                {item.priority && (
                                  <Badge variant={item.priority === "HIGH" ? "danger" : item.priority === "MEDIUM" ? "warning" : "secondary"} className="text-[10px]">
                                    {item.priority}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Tooth: {Array.isArray(item.tooth_numbers) ? item.tooth_numbers.join(", ") : item.tooth_numbers || "—"}
                                {" · "}{item.estimated_visits} visit(s)
                                {" · "}{formatIndianRupees(item.estimated_cost || 0)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <SaveStatusIcon status={modified ? saveStatus : "saved"} />
                              <SaveStatusLabel status={modified ? saveStatus : (saveStatus === "error" ? "error" : "idle")} />
                              {saveStatus === "error" && (
                                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => retrySave(item.id)}>
                                  <RefreshCw className="h-3 w-3" /> Retry
                                </Button>
                              )}
                              {!modified && saveStatus !== "error" && item.assigned_doctor_id && (
                                <span className="text-[10px] text-green-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> Saved</span>
                              )}
                            </div>
                          </div>

                          {isEditable ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">Primary Doctor *</Label>
                                {(() => {
                                  const sorted = sortDoctorsByRelevance(doctorList, item.procedure_name)
                                  const specs = getRecommendedSpecializations(item.procedure_name)
                                  const hasSpecialists = sorted.length > 0 && specs.length > 0 && sorted.some((d: any) => d.specialization && specs.some((s: string) => d.specialization.toLowerCase().includes(s.toLowerCase())))
                                  return (
                                    <>
                                      {specs.length > 0 && (
                                        <p className="text-[10px] text-blue-600 mt-0.5">
                                          {hasSpecialists ? `Recommended: ${specs[0]}` : "No specialist available"}
                                        </p>
                                      )}
                                      <select
                                        className={cn(
                                          "mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm",
                                          "focus:outline-none focus:ring-1 focus:ring-ring",
                                          !edit.primary && "border-yellow-300"
                                        )}
                                        value={edit.primary}
                                        onChange={(e) => setRowEdit(item.id, "primary", e.target.value)}
                                        onBlur={() => triggerAutoSave(item.id)}
                                      >
                                        <option value="">Select Doctor *</option>
                                        {sorted.map((doc: any) => {
                                          const isRecommended = specs.length > 0 && doc.specialization && specs.some((s: string) => doc.specialization.toLowerCase().includes(s.toLowerCase()))
                                          return (
                                            <option key={doc.id} value={doc.id}>
                                              {isRecommended ? "* " : ""}Dr. {doc.name}{doc.specialization ? ` (${doc.specialization})` : ""}
                                            </option>
                                          )
                                        })}
                                      </select>
                                    </>
                                  )
                                })()}
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Assistant (Optional)</Label>
                                <select
                                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                  value={edit.assistant}
                                  onChange={(e) => setRowEdit(item.id, "assistant", e.target.value)}
                                  onBlur={() => triggerAutoSave(item.id)}
                                >
                                  <option value="">None</option>
                                  {doctorList.filter((d: any) => d.id !== edit.primary).map((doc: any) => (
                                    <option key={doc.id} value={doc.id}>Dr. {doc.name}{doc.specialization ? ` (${doc.specialization})` : ""}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Priority</Label>
                                <select
                                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                  value={edit.priority}
                                  onChange={(e) => setRowEdit(item.id, "priority", e.target.value)}
                                  onBlur={() => triggerAutoSave(item.id)}
                                >
                                  <option value="">Select Priority</option>
                                  <option value="HIGH">High</option>
                                  <option value="MEDIUM">Medium</option>
                                  <option value="LOW">Low</option>
                                </select>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                              {item.assigned_doctor_name && (
                                <span className="text-blue-600 font-medium">Primary: Dr. {item.assigned_doctor_name}</span>
                              )}
                              {item.assistant_doctor_name && (
                                <span>Assistant: Dr. {item.assistant_doctor_name}</span>
                              )}
                              {item.priority && (
                                <span className={cn(
                                  "font-medium",
                                  item.priority === "HIGH" && "text-red-600",
                                  item.priority === "MEDIUM" && "text-amber-600",
                                  item.priority === "LOW" && "text-green-600",
                                )}>{item.priority}</span>
                              )}
                            </div>
                          )}
                          {item.remarks && (
                            <p className="text-xs text-muted-foreground italic">{item.remarks}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {itemList.length > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <div className="text-right">
                      <span className="font-semibold">{formatIndianRupees(totalCost)}</span>
                      <span className="text-muted-foreground ml-2 text-xs">({totalVisits} visits)</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* First Appointment */}
            {isEditable && itemList.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> First Appointment
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 text-sm space-y-3">
                  <p className="text-xs text-muted-foreground">Configure the first appointment after approval. Future appointments are created during Treatment Execution.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Treatment</Label>
                      <select
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={firstAppointment?.treatment_item_id || ""}
                        onChange={(e) => setFirstAppointment(prev => ({ ...prev, treatment_item_id: e.target.value, doctor_id: prev?.doctor_id || "", date: prev?.date || "", time: prev?.time || "", future_ready: prev?.future_ready || false, chair: prev?.chair || "", room: prev?.room || "" }))}
                      >
                        <option value="">Select Treatment</option>
                        {itemList.map((item: any) => (
                          <option key={item.id} value={item.id}>{item.procedure_name} (Tooth {Array.isArray(item.tooth_numbers) ? item.tooth_numbers.join(", ") : item.tooth_numbers || "—"})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Doctor *</Label>
                      <select
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={firstAppointment?.doctor_id || ""}
                        onChange={(e) => setFirstAppointment(prev => ({ ...prev, doctor_id: e.target.value, treatment_item_id: prev?.treatment_item_id || "", date: prev?.date || "", time: prev?.time || "", future_ready: prev?.future_ready || false, chair: prev?.chair || "", room: prev?.room || "" }))}
                      >
                        <option value="">Select Doctor</option>
                        {doctorList.map((doc: any) => (
                          <option key={doc.id} value={doc.id}>Dr. {doc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Date *</Label>
                      <input
                        type="date"
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={firstAppointment?.date || ""}
                        onChange={(e) => setFirstAppointment(prev => ({ ...prev, date: e.target.value, treatment_item_id: prev?.treatment_item_id || "", doctor_id: prev?.doctor_id || "", time: prev?.time || "", future_ready: prev?.future_ready || false, chair: prev?.chair || "", room: prev?.room || "" }))}
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Time *</Label>
                      <input
                        type="time"
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={firstAppointment?.time || ""}
                        onChange={(e) => setFirstAppointment(prev => ({ ...prev, time: e.target.value, treatment_item_id: prev?.treatment_item_id || "", doctor_id: prev?.doctor_id || "", date: prev?.date || "", future_ready: prev?.future_ready || false, chair: prev?.chair || "", room: prev?.room || "" }))}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        id="future_ready"
                        className="h-4 w-4"
                        checked={firstAppointment?.future_ready || false}
                        onChange={(e) => setFirstAppointment(prev => ({ ...prev, future_ready: e.target.checked, treatment_item_id: prev?.treatment_item_id || "", doctor_id: prev?.doctor_id || "", date: prev?.date || "", time: prev?.time || "", chair: prev?.chair || "", room: prev?.room || "" }))}
                      />
                      <Label htmlFor="future_ready" className="text-xs text-muted-foreground cursor-pointer">Future Ready</Label>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Chair</Label>
                      <input
                        type="text"
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={firstAppointment?.chair || ""}
                        onChange={(e) => setFirstAppointment(prev => ({ ...prev, chair: e.target.value, treatment_item_id: prev?.treatment_item_id || "", doctor_id: prev?.doctor_id || "", date: prev?.date || "", time: prev?.time || "", future_ready: prev?.future_ready || false, room: prev?.room || "" }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Room</Label>
                      <input
                        type="text"
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        value={firstAppointment?.room || ""}
                        onChange={(e) => setFirstAppointment(prev => ({ ...prev, room: e.target.value, treatment_item_id: prev?.treatment_item_id || "", doctor_id: prev?.doctor_id || "", date: prev?.date || "", time: prev?.time || "", future_ready: prev?.future_ready || false, chair: prev?.chair || "" }))}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Treatment Readiness */}
            <Card className={cn("border-2", allChecksPassed ? "border-green-200" : "border-amber-200")}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {allChecksPassed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  Treatment Plan Readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-2">
                  {readinessChecks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {check.done ? (
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className={cn(check.done ? "text-green-700" : "text-amber-700")}>{check.label}</span>
                      {check.detail && <span className="text-xs text-muted-foreground ml-auto">{check.detail}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Available Doctors */}
            {isEditable && doctorList.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-xs flex items-center gap-2">
                    <UserPlus className="h-3 w-3" /> Available Doctors ({doctorList.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {doctorList.map((doc: any) => (
                      <div key={doc.id} className="text-xs flex items-center gap-2 py-0.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        <span className="font-medium">Dr. {doc.name}</span>
                        {doc.specialization && <span className="text-muted-foreground">({doc.specialization})</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Case Status Info */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Case Status</CardTitle>
              </CardHeader>
              <CardContent className="py-2 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Case</span>
                  <span className="font-mono font-medium">#{c.case_number || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Doctor</span>
                  <span className="font-medium">Dr. {c.doctor_name || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={c.status === "OPEN" ? "info" : c.status === "IN_PROGRESS" ? "success" : "default"}>{c.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Plan Status</span>
                  <Badge variant={isApproved ? "success" : isRejected ? "danger" : isPending ? "warning" : "default"}>
                    {planStatus || "DRAFT"}
                  </Badge>
                </div>
                {isApproved && c.treatment_plan_approved_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Approved</span>
                    <span className="text-xs">{new Date(c.treatment_plan_approved_at).toLocaleDateString()}</span>
                  </div>
                )}
                {isRejected && c.treatment_plan_rejection_reason && (
                  <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                    Rejection reason: {c.treatment_plan_rejection_reason}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ─── STICKY APPROVAL FOOTER ─── */}
      <div className="sticky bottom-0 z-40 border-t bg-white shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 text-xs">
                <span className={cn("flex items-center gap-1", allItemsHaveDoctor ? "text-green-600" : "text-amber-600")}>
                  {allItemsHaveDoctor ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  Doctors Assigned
                </span>
                <span className={cn("flex items-center gap-1", allItemsSaved ? "text-green-600" : "text-amber-600")}>
                  {allItemsSaved ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  Data Saved
                </span>
                <span className={cn("flex items-center gap-1", allChecksPassed ? "text-green-600" : "text-amber-600")}>
                  {allChecksPassed ? <Check className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  Validation Passed
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isApproved ? "Treatment Plan Approved" : isRejected ? "Treatment Plan Rejected" : "Treatment Plan Ready"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isApproved ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Approved</span>
                </div>
              ) : isRejected ? (
                <>
                  {isAdmin && itemList.length > 0 && (
                    <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !allItemsHaveDoctor} size="sm">
                      <Send className="h-4 w-4 mr-1" /> {submitMutation.isPending ? "Submitting..." : "Resubmit"}
                    </Button>
                  )}
                </>
              ) : isPending ? (
                <>
                  {isAdmin && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setRequestChangesDialogOpen(true)}>
                        Request Changes
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setRejectDialogOpen(true)}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => setApproveDialogOpen(true)} disabled={!allItemsHaveDoctor || !allItemsSaved}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve & Generate
                      </Button>
                    </>
                  )}
                </>
              ) : isDraft ? (
                <>
                  {itemList.length > 0 ? (
                    <Button size="sm" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !allItemsHaveDoctor || !allItemsSaved}>
                      <Send className="h-4 w-4 mr-1" /> {submitMutation.isPending ? "Submitting..." : `Submit (${itemList.length} items)`}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">No items to submit</p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ─── APPROVE DIALOG ─── */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" /> Confirm Approval
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will approve the treatment plan, generate executable treatments, and book the first appointment. This action locks the current version.
          </p>
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm space-y-1">
            <p className="font-medium text-green-800">{itemList.length} procedure(s) → treatments</p>
            <p className="text-xs text-green-600">Total cost: {formatIndianRupees(totalCost)} · Total visits: {totalVisits}</p>
            {firstAppointment?.doctor_id && firstAppointment?.date && (
              <p className="text-xs text-green-600">First appointment: {firstAppointment.date} at {firstAppointment.time}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Approve & Generate Treatments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── REJECT DIALOG ─── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" /> Reject Treatment Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will reject all {itemList.length} procedure items and send back to DRAFT.</p>
            <Label>Reason for rejection *</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this plan being rejected?" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectReason("") }}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={!rejectReason || rejectMutation.isPending}>
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── REQUEST CHANGES DIALOG ─── */}
      <Dialog open={requestChangesDialogOpen} onOpenChange={setRequestChangesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> Request Changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Describe what changes are needed in the treatment plan.</p>
            <Label>Changes Required *</Label>
            <Textarea value={requestChangesReason} onChange={(e) => setRequestChangesReason(e.target.value)} placeholder="What needs to be changed?" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRequestChangesDialogOpen(false); setRequestChangesReason("") }}>Cancel</Button>
            <Button onClick={() => requestChangesMutation.mutate()} disabled={!requestChangesReason || requestChangesMutation.isPending}>
              {requestChangesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
