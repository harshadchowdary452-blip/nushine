import { useParams, useNavigate, Link } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useRef } from "react"
import { casesApi, treatmentApi, billingApi } from "@/services/endpoints"
import api from "@/services/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
        </TabsList>

        <TabsContent value="overview" className="mt-6 overflow-y-auto scroll-smooth" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Case Information
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Chief Complaint</dt>
                  <dd className="font-medium text-right max-w-[60%]">{caseData.chief_complaint}</dd>
                </div>
                {caseData.diagnosis && (
                  <div className="flex justify-between">
                    <dt className="text-text-secondary">Diagnosis</dt>
                    <dd className="font-medium text-right max-w-[60%]">{caseData.diagnosis}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Status</dt>
                  <dd><StatusBadge status={caseData.status} /></dd>
                </div>
              </dl>
            </Card>

            <Card className="p-6 border-border shadow-card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                People
              </h3>
              <dl className="space-y-3">
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

            {caseData.notes && (
              <Card className="p-6 border-border shadow-card md:col-span-2">
                <h3 className="text-lg font-semibold mb-4">Notes</h3>
                <p className="text-text-secondary whitespace-pre-wrap">{caseData.notes}</p>
              </Card>
            )}
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
                    for (const file of files) {
                      const formData = new FormData()
                      formData.append("photos", file)
                      await api.post(`/pre-ops/${id}`, formData, {
                        headers: { "Content-Type": "multipart/form-data" },
                      })
                    }
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
                      for (const file of files) {
                        const formData = new FormData()
                        formData.append("xrays", file)
                        await api.post(`/pre-ops/${id}`, formData, {
                          headers: { "Content-Type": "multipart/form-data" },
                        })
                      }
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
                    for (const file of files) {
                      const formData = new FormData()
                      formData.append("photos", file)
                      await api.post(`/post-ops/${id}`, formData, {
                        headers: { "Content-Type": "multipart/form-data" },
                      })
                    }
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
      </Tabs>

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
