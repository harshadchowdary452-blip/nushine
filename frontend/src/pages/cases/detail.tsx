import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useRef, useMemo } from "react"
import { casesApi, treatmentApi, billingApi, consentFormsApi } from "@/services/endpoints"
import api from "@/services/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { formatIndianRupees } from "@/lib/currency"
import { useAuthStore } from "@/store/authStore"
import {
  ArrowLeft,
  Camera,
  Image,
  FileText,
  Stethoscope,
  User,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Pencil,
  Clock,
  Trash2,
} from "lucide-react"

function StatusBadge({ status }: { status: string }) {
  const cls = `status-badge status-badge-${status?.toLowerCase()}`
  return <span className={cls}>{status?.replace(/_/g, " ")}</span>
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const preOpInputRef = useRef<HTMLInputElement>(null)
  const preOpXrayInputRef = useRef<HTMLInputElement>(null)
  const postOpInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [uploadingPreOp, setUploadingPreOp] = useState(false)
  const [uploadingPreOpXray, setUploadingPreOpXray] = useState(false)
  const [uploadingPostOp, setUploadingPostOp] = useState(false)
  const [completionDialog, setCompletionDialog] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [editFindings, setEditFindings] = useState<any[]>([])
  const [editDoctorId, setEditDoctorId] = useState("")
  const currentUser = useAuthStore((s) => s.user)

  const { data: caseData, isLoading } = useQuery({
    queryKey: ["case", id],
    queryFn: () => casesApi.get(id!),
    enabled: !!id,
  })

  const { data: treatments } = useQuery({
    queryKey: ["case-treatments", id],
    queryFn: () => treatmentApi.list({ case_id: id }),
    enabled: !!id,
  })

  const { data: billings } = useQuery({
    queryKey: ["case-billings", id],
    queryFn: () => billingApi.list({ case_id: id }),
    enabled: !!id,
  })

  const { data: timelineData } = useQuery({
    queryKey: ["case-timeline", id],
    queryFn: () => casesApi.getTimeline(id!),
    enabled: !!id,
  })

  const { data: doctorsData } = useQuery({
    queryKey: ["doctors", "edit-case"],
    queryFn: () => api.get("/doctors", { params: { limit: 200, admin_group_id: currentUser?.admin_group_id || undefined } }).then((r) => r.data),
    enabled: editOpen,
  })

  const { data: preOps } = useQuery({
    queryKey: ["case-preops", id],
    queryFn: async () => {
      const r = await api.get(`/pre-ops/${id}`)
      return r.data
    },
    enabled: !!id,
  })

  const { data: postOps } = useQuery({
    queryKey: ["case-postops", id],
    queryFn: async () => {
      const r = await api.get(`/post-ops/${id}`)
      return r.data
    },
    enabled: !!id,
  })

  const statusMutation = useMutation({
    mutationFn: (status: string) => casesApi.update(id!, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", id] })
      queryClient.invalidateQueries({ queryKey: ["dash"], refetchType: "all" })
      addToast({ title: "Success", description: "Status updated" })
    },
    onError: (err: Error) => {
      addToast({ title: "Error", description: err.message, variant: "destructive" })
    },
  })

  const editMutation = useMutation({
    mutationFn: (data: any) => casesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", id] })
      queryClient.invalidateQueries({ queryKey: ["case-timeline", id] })
      addToast({ title: "Success", description: "Case updated" })
      setEditOpen(false)
    },
    onError: (err: any) => {
      addToast({ title: "Error", description: err?.response?.data?.detail || "Update failed", variant: "destructive" })
    },
  })

  const openEditDialog = () => {
    if (!caseData) return
    setEditForm({
      chief_complaint: caseData.chief_complaint || "",
      diagnosis: caseData.diagnosis || "",
      initial_treatment_plan: caseData.initial_treatment_plan || "",
      notes: caseData.notes || "",
      status: caseData.status,
    })
    setEditFindings((caseData.findings || []).map((f: any) => ({
      finding_type: f.finding_type,
      tooth_number: f.tooth_number || "",
      notes: f.notes || "",
    })))
    setEditDoctorId(caseData.doctor_id || "")
    setEditOpen(true)
  }

  const handleEditSubmit = () => {
    const payload: Record<string, any> = {}
    for (const [key, value] of Object.entries(editForm)) {
      if (value !== "" && value !== undefined) payload[key] = value
    }
    if (editDoctorId) payload.doctor_id = editDoctorId
    if (editFindings.length > 0) payload.findings = editFindings
    editMutation.mutate(payload)
  }

  const doctors = useMemo(() => {
    const d = Array.isArray(doctorsData) ? doctorsData : (doctorsData as any)?.items || []
    return d
  }, [doctorsData])

  const timeline = useMemo(() => Array.isArray(timelineData) ? timelineData : [], [timelineData])

  const preOpPhotos = preOps?.photo_urls
    ? preOps.photo_urls.split(",").filter(Boolean)
    : []
  const preOpXrays = preOps?.xray_urls
    ? preOps.xray_urls.split(",").filter(Boolean)
    : []
  const postOpPhotos = postOps?.photo_urls
    ? postOps.photo_urls.split(",").filter(Boolean)
    : []

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "COMPLETED" && postOpPhotos.length === 0) {
      setCompletionDialog(true)
      return
    }
    statusMutation.mutate(newStatus)
  }

  const downloadPdf = async () => {
    try {
      const r = await api.get(`/cases/${id}/pdf`, { responseType: "blob" })
      const url = window.URL.createObjectURL(r.data)
      const a = document.createElement("a")
      a.href = url
      a.download = `case_${id}.pdf`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 100)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download PDF"
      addToast({ title: "Error", description: msg, variant: "destructive" })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-text-secondary">Case not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/cases")}>
          Back to Cases
        </Button>
      </div>
    )
  }

  const treatmentsList = Array.isArray(treatments) ? treatments : []
  const billingsList = Array.isArray(billings) ? billings : []

  return (
    <div className="animate-fade-in space-y-6">
      <button
        onClick={() => navigate("/cases")}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Cases
      </button>

      <Card className="p-6 border-border shadow-card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary truncate max-w-md">
                {caseData.chief_complaint}
              </h1>
              <StatusBadge status={caseData.status} />
            </div>
            <p className="text-sm text-text-muted mt-1">
              Case ID: {caseData.id.slice(0, 8)}... | Created: {new Date(caseData.created_at).toLocaleDateString("en-IN")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Select
              value={caseData.status}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEW">New</SelectItem>
                <SelectItem value="DIAGNOSIS_PENDING">Diagnosis Pending</SelectItem>
                <SelectItem value="TREATMENT_PLANNED">Treatment Planned</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="bg-white border border-border rounded-xl p-1 overflow-x-auto flex-nowrap scroll-smooth">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="preop">Pre-Op Images</TabsTrigger>
          <TabsTrigger value="postop">Post-Op Images</TabsTrigger>
          <TabsTrigger value="treatments">Treatments</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="consent-forms">Consent Forms</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <div className="grid grid-cols-1 gap-6">
            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Chief Complaint
              </h3>
              <p className="text-text-secondary">{caseData.chief_complaint}</p>
            </Card>

            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold mb-4">Clinical Findings</h3>
              {(!caseData.findings || caseData.findings.length === 0) ? (
                <p className="text-text-secondary">No clinical findings recorded.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Tooth</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Finding</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caseData.findings.map((f: any) => (
                          <tr key={f.id} className="border-b last:border-b-0 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{f.tooth_number || "—"}</td>
                            <td className="px-4 py-2">{f.finding_type}</td>
                            <td className="px-4 py-2 text-gray-500">{f.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                    {(() => {
                      const counts: Record<string, number> = {}
                      caseData.findings.forEach((f: any) => {
                        counts[f.finding_type] = (counts[f.finding_type] || 0) + 1
                      })
                      return Object.entries(counts).map(([type, count]) => (
                        <span key={type} className="bg-gray-100 px-2 py-1 rounded"><strong>{type}:</strong> {count}</span>
                      ))
                    })()}
                  </div>
                </>
              )}
            </Card>

            {caseData.diagnosis && (
              <Card className="p-6 border-border shadow-card">
                <h3 className="text-lg font-semibold mb-4">Diagnosis</h3>
                <p className="text-text-secondary whitespace-pre-wrap">{caseData.diagnosis}</p>
              </Card>
            )}

            {caseData.initial_treatment_plan && (
              <Card className="p-6 border-border shadow-card">
                <h3 className="text-lg font-semibold mb-4">Initial Treatment Plan</h3>
                <p className="text-text-secondary whitespace-pre-wrap">{caseData.initial_treatment_plan}</p>
              </Card>
            )}

            {caseData.notes && (
              <Card className="p-6 border-border shadow-card">
                <h3 className="text-lg font-semibold mb-4">Doctor Notes</h3>
                <p className="text-text-secondary whitespace-pre-wrap">{caseData.notes}</p>
              </Card>
            )}

            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Case Info
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Status</dt>
                  <dd><StatusBadge status={caseData.status} /></dd>
                </div>
                {caseData.doctor_name && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Doctor</dt>
                    <dd className="font-medium">{caseData.doctor_name}</dd>
                  </div>
                )}
                {caseData.patient_name && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary flex items-center gap-2"><User className="h-4 w-4" /> Patient</dt>
                    <dd className="font-medium">{caseData.patient_name}</dd>
                  </div>
                )}
              </dl>
            </Card>

            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Case Timeline
              </h3>
              {timeline.length === 0 ? (
                <p className="text-text-secondary text-sm">No timeline entries yet.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map((entry: any) => (
                    <div key={entry.id} className="flex gap-3 pb-3 border-b last:border-b-0">
                      <div className="flex flex-col items-center gap-1">
                        <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 mt-1.5" />
                        <div className="w-px flex-1 bg-border" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <span>{entry.created_at ? new Date(entry.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                          {entry.performer_name && <span className="font-medium text-text-primary">by {entry.performer_name}</span>}
                        </div>
                        <p className="text-sm font-medium mt-0.5">{entry.action}</p>
                        {entry.old_value && entry.new_value && (
                          <div className="mt-1 text-xs space-y-0.5 bg-muted rounded p-2">
                            <p><span className="text-muted-foreground">Old:</span> <span className="line-through text-destructive">{entry.old_value}</span></p>
                            <p><span className="text-muted-foreground">New:</span> <span className="text-green-600 font-medium">{entry.new_value}</span></p>
                          </div>
                        )}
                        {entry.new_value && !entry.old_value && (
                          <p className="text-xs text-text-muted mt-0.5">{entry.new_value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preop" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <Card className="p-6 border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                Pre-Operative Images
              </h3>
              <input
                type="file"
                ref={preOpInputRef}
                className="hidden"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length === 0) return
                  setUploadingPreOp(true)
                  try {
                    const formData = new FormData()
                    for (const file of files) {
                        formData.append("xrays", file)
                      }
                      await api.post(`/pre-ops/${id}`, formData, {
                      headers: { "Content-Type": "multipart/form-data" },
                    })
                    queryClient.invalidateQueries({ queryKey: ["case-preops", id] })
                    addToast({ title: "Success", description: `${files.length} image(s) uploaded` })
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : "Upload failed"
                    addToast({ title: "Error", description: msg, variant: "destructive" })
                  } finally {
                    setUploadingPreOp(false)
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {preOpPhotos.length === 0 ? (
                <div
                  className="col-span-full flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors"
                  onClick={() => preOpInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 text-text-muted mb-2" />
                  <p className="text-text-secondary">
                    {uploadingPreOp ? "Uploading..." : "Click to upload Pre-Op images"}
                  </p>
                </div>
              ) : (
                <>
                  {preOpPhotos.map((url: string, i: number) => (
                    <div key={i} className="relative group">
                      <img
                        src={url.startsWith("http") ? url : url}
                        alt={`Pre-op ${i + 1}`}
                        className="w-full h-32 object-cover rounded-lg cursor-pointer"
                        onClick={() => setPreviewUrl(url.startsWith("http") ? url : `${url}`)}
                      />
                    </div>
                  ))}
                  <div
                    className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors"
                    onClick={() => preOpInputRef.current?.click()}
                  >
                    <Upload className="h-6 w-6 text-text-muted" />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Camera className="h-5 w-5 text-primary" />
                  X-Ray Images
                </h3>
                <input
                  type="file"
                  ref={preOpXrayInputRef}
                  className="hidden"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length === 0) return
                    setUploadingPreOpXray(true)
                    try {
                      const formData = new FormData()
                      for (const file of files) {
                        formData.append("xrays", file)
                      }
                      await api.post(`/pre-ops/${id}`, formData, {
                        headers: { "Content-Type": "multipart/form-data" },
                      })
                      queryClient.invalidateQueries({ queryKey: ["case-preops", id] })
                      addToast({ title: "Success", description: `${files.length} X-Ray(s) uploaded` })
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : "Upload failed"
                      addToast({ title: "Error", description: msg, variant: "destructive" })
                    } finally {
                      setUploadingPreOpXray(false)
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {preOpXrays.length === 0 ? (
                  <div
                    className="col-span-full flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors"
                    onClick={() => preOpXrayInputRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 text-text-muted mb-2" />
                    <p className="text-text-secondary">
                      {uploadingPreOpXray ? "Uploading..." : "Click to upload X-Ray images"}
                    </p>
                  </div>
                ) : (
                  <>
                    {preOpXrays.map((url: string, i: number) => (
                      <div key={i} className="relative group">
                        <img
                          src={url.startsWith("http") ? url : url}
                          alt={`X-Ray ${i + 1}`}
                          className="w-full h-32 object-cover rounded-lg cursor-pointer"
                          onClick={() => setPreviewUrl(url.startsWith("http") ? url : `${url}`)}
                        />
                      </div>
                    ))}
                    <div
                      className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors"
                      onClick={() => preOpXrayInputRef.current?.click()}
                    >
                      <Upload className="h-6 w-6 text-text-muted" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="postop" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <Card className="p-6 border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Image className="h-5 w-5 text-primary" />
                Post-Operative Images
              </h3>
              <input
                type="file"
                ref={postOpInputRef}
                className="hidden"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length === 0) return
                  setUploadingPostOp(true)
                  try {
                    const formData = new FormData()
                    for (const file of files) {
                      formData.append("photos", file)
                    }
                    await api.post(`/post-ops/${id}`, formData, {
                      headers: { "Content-Type": "multipart/form-data" },
                    })
                    queryClient.invalidateQueries({ queryKey: ["case-postops", id] })
                    addToast({ title: "Success", description: `${files.length} image(s) uploaded` })
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : "Upload failed"
                    addToast({ title: "Error", description: msg, variant: "destructive" })
                  } finally {
                    setUploadingPostOp(false)
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {postOpPhotos.length === 0 ? (
                <div
                  className="col-span-full flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors"
                  onClick={() => postOpInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 text-text-muted mb-2" />
                  <p className="text-text-secondary">
                    {uploadingPostOp ? "Uploading..." : "Click to upload Post-Op images"}
                  </p>
                </div>
              ) : (
                <>
                  {postOpPhotos.map((url: string, i: number) => (
                    <div key={i} className="relative group">
                      <img
                        src={url.startsWith("http") ? url : url}
                        alt={`Post-op ${i + 1}`}
                        className="w-full h-32 object-cover rounded-lg cursor-pointer"
                        onClick={() => setPreviewUrl(url.startsWith("http") ? url : `${url}`)}
                      />
                    </div>
                  ))}
                  <div
                    className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary transition-colors"
                    onClick={() => postOpInputRef.current?.click()}
                  >
                    <Upload className="h-6 w-6 text-text-muted" />
                  </div>
                </>
              )}
            </div>

            {preOpPhotos.length > 0 && postOpPhotos.length > 0 && (
              <div className="mt-8">
                <h4 className="text-base font-semibold mb-4">Before / After Comparison</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {postOpPhotos.map((postUrl: string, i: number) => {
                    const preUrl = preOpPhotos[i] || preOpPhotos[preOpPhotos.length - 1]
                    return (
                      <div key={i} className="flex gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-text-muted mb-1 text-center">Pre-Op</p>
                          <img
                            src={preUrl.startsWith("http") ? preUrl : preUrl}
                            alt={`Before ${i + 1}`}
                            className="w-full h-40 object-cover rounded-lg cursor-pointer"
                            onClick={() => setPreviewUrl(preUrl.startsWith("http") ? preUrl : preUrl)}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-text-muted mb-1 text-center">Post-Op</p>
                          <img
                            src={postUrl.startsWith("http") ? postUrl : postUrl}
                            alt={`After ${i + 1}`}
                            className="w-full h-40 object-cover rounded-lg cursor-pointer"
                            onClick={() => setPreviewUrl(postUrl.startsWith("http") ? postUrl : postUrl)}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="treatments" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          {treatmentsList.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-card">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No treatment plans for this case</p>
              <Button variant="outline" className="mt-4" onClick={() => navigate("/treatments")}>
                Go to Treatments
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {treatmentsList.map((t: Record<string, unknown>) => (
                <Link key={t.id as string} to={`/treatments/${t.id}`}>
                  <Card className="p-4 border-border shadow-card card-hover cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-text-primary">{t.treatment_name as string}</p>
                        <div className="flex gap-4 mt-1 text-sm text-text-muted">
                          {t.cost ? <span>{formatIndianRupees(t.cost as number)}</span> : null}
                          <span>Sittings: {(t as any).completed_sittings ?? "—"}/{(t as any).total_sittings ?? "—"}</span>
                        </div>
                      </div>
                      <StatusBadge status={t.status as string} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="billing" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          {billingsList.length === 0 ? (
            <Card className="p-12 text-center border-border shadow-card">
              <FileText className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">No billing records for this case</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-blue-50 p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total Billed</p>
                  <p className="text-lg font-bold text-blue-700">{formatIndianRupees(billingsList.reduce((s: number, b: any) => s + (b.total_amount || 0), 0))}</p>
                </div>
                <div className="rounded-xl bg-green-50 p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
                  <p className="text-lg font-bold text-green-700">{formatIndianRupees(billingsList.reduce((s: number, b: any) => s + (b.paid_amount || 0), 0))}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total Pending</p>
                  <p className="text-lg font-bold text-amber-700">{formatIndianRupees(billingsList.reduce((s: number, b: any) => s + (b.pending_amount || 0), 0))}</p>
                </div>
              </div>
              <div className="space-y-3">
                {billingsList.map((b: Record<string, unknown>) => (
                  <Card
                    key={b.id as string}
                    className="p-4 border-border shadow-card card-hover cursor-pointer"
                    onClick={() => navigate(`/billing/${b.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-text-primary">{formatIndianRupees(b.total_amount as number)}</p>
                        <div className="flex gap-4 mt-1 text-sm text-text-muted">
                          <span>Paid: {formatIndianRupees(b.paid_amount as number)}</span>
                          <span>Pending: {formatIndianRupees(b.pending_amount as number)}</span>
                        </div>
                      </div>
                      <StatusBadge status={b.payment_status as string} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="consent-forms" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          {caseData?.patient_id ? (
            <ConsentFormsSection patientId={caseData.patient_id} />
          ) : (
            <p className="text-center py-8 text-muted-foreground">No patient linked to this case</p>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Case</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Chief Complaint</Label>
              <Textarea value={editForm.chief_complaint || ""}
                onChange={(e) => setEditForm({ ...editForm, chief_complaint: e.target.value })}
                placeholder="Describe the patient's primary complaint..." />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Clinical Findings</Label>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => setEditFindings([...editFindings, { finding_type: "", tooth_number: "", notes: "" }])}>
                  + Add Finding
                </Button>
              </div>
              {editFindings.length === 0 && <p className="text-xs text-muted-foreground">No findings</p>}
              {editFindings.map((finding: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Finding {i + 1}</span>
                    <Button type="button" variant="ghost" size="icon-sm"
                      onClick={() => setEditFindings(editFindings.filter((_: any, j: number) => j !== i))}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-xs">Finding Type</Label>
                      <Select value={finding.finding_type}
                        onValueChange={(v: string) => {
                          const updated = [...editFindings]
                          updated[i] = { ...updated[i], finding_type: v }
                          setEditFindings(updated)
                        }}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {["Stains", "Calculus", "Decay", "Missing Tooth", "Mobility", "Fracture", "Impaction", "Sensitivity", "Gingivitis", "Periodontitis", "Other"].map((ft) => (
                            <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Tooth #</Label>
                      <Input value={finding.tooth_number}
                        onChange={(e) => {
                          const updated = [...editFindings]
                          updated[i] = { ...updated[i], tooth_number: e.target.value }
                          setEditFindings(updated)
                        }}
                        placeholder="e.g. 16, 46" />
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Notes</Label>
                    <Input value={finding.notes}
                      onChange={(e) => {
                        const updated = [...editFindings]
                        updated[i] = { ...updated[i], notes: e.target.value }
                        setEditFindings(updated)
                      }}
                      placeholder="e.g. Deep proximal decay" />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <Label>Diagnosis</Label>
              <Textarea value={editForm.diagnosis || ""}
                onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })}
                placeholder="Enter diagnosis..." />
            </div>
            <div className="grid gap-2">
              <Label>Initial Treatment Plan</Label>
              <Textarea value={editForm.initial_treatment_plan || ""}
                onChange={(e) => setEditForm({ ...editForm, initial_treatment_plan: e.target.value })}
                placeholder="Enter treatment plan..." rows={3} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={editForm.notes || ""}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Additional notes..." />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={editForm.status || caseData?.status}
                onValueChange={(v: string) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["NEW", "DIAGNOSIS_PENDING", "TREATMENT_PLANNED", "IN_PROGRESS", "FOLLOW_UP", "COMPLETED", "CANCELLED"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Assigned Doctor</Label>
              <Select value={editDoctorId}
                onValueChange={(v: string) => setEditDoctorId(v)}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSubmit} disabled={editMutation.isPending}>
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewUrl} onOpenChange={() => { setPreviewUrl(null); setZoom(1) }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Image Preview</DialogTitle>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-2">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="icon-sm" onClick={() => setZoom(z => Math.min(z + 0.25, 5))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setZoom(1)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          {previewUrl && (
            <div
              className="flex items-center justify-center overflow-auto max-h-[70vh] bg-gray-100 dark:bg-gray-900 rounded-lg cursor-grab active:cursor-grabbing select-none"
              onWheel={(e) => {
                e.preventDefault()
                setZoom(z => {
                  const delta = e.deltaY > 0 ? -0.1 : 0.1
                  return Math.max(0.25, Math.min(5, z + delta))
                })
              }}
              onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
            >
              <img
                src={previewUrl}
                alt="Preview"
                className="transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
                draggable={false}
                loading="lazy"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={completionDialog} onOpenChange={setCompletionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Post-Op Image Required</DialogTitle>
            <DialogDescription>
              This case cannot be marked as COMPLETED without a Post-Operative image.
              Please upload Post-Op images first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={() => {
              setCompletionDialog(false)
              const postOpTrigger = document.querySelector('[data-value="postop"]') as HTMLElement
              postOpTrigger?.click()
            }}>
              Upload Post-Op Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ConsentFormsSection({ patientId }: { patientId: string }) {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { data, isLoading } = useQuery({
    queryKey: ["case-consent-forms", patientId],
    queryFn: () => consentFormsApi.getByPatient(patientId),
    enabled: !!patientId,
  })

  const handleView = (id: string) => navigate(`/consent-forms/view/${id}`)
  const handleDownload = async (id: string) => {
    try {
      const blob = await consentFormsApi.downloadPdf(id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `consent_${id.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    } catch { addToast({ title: "Error", description: "Download failed", variant: "destructive" }) }
  }

  const items = Array.isArray(data) ? data : []
  return (
    <Card className="p-4">
      {isLoading ? (
        <p className="text-center py-4">Loading consent forms...</p>
      ) : items.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No consent forms for this patient</p>
      ) : (
        <div className="space-y-2">
          {items.map((cf: any) => (
            <div key={cf.id} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium text-sm">{cf.consent_type}</p>
                <p className="text-xs text-muted-foreground">{cf.created_at ? new Date(cf.created_at).toLocaleDateString() : ""} {cf.doctor_name ? `- ${cf.doctor_name}` : ""}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleView(cf.id)}>View</Button>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(cf.id)}>Download</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
