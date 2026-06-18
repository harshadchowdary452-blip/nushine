import { useState, useRef, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { consentFormsApi } from "@/services/endpoints"
import { useToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ZoomIn, ZoomOut, Download, Printer, Maximize, Minimize, ArrowLeft, Trash2 } from "lucide-react"

export default function ConsentFormView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [zoom, setZoom] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: cf, isLoading } = useQuery({
    queryKey: ["consent-form", id],
    queryFn: () => consentFormsApi.get(id!),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => consentFormsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent-forms"] })
      addToast({ title: "Deleted", description: "Consent form moved to recycle bin" })
      navigate("/consent-forms")
    },
  })

  const pdfUrl = id ? consentFormsApi.getPdfUrl(id) : ""

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print()
  }

  const handleDownload = async () => {
    try {
      const blob = await consentFormsApi.downloadPdf(id!)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `consent_${cf?.consent_type?.replace(/\s+/g, "_")}_${id!.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      addToast({ title: "Error", description: "Download failed", variant: "destructive" })
    }
  }

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
    setIsFullscreen(!isFullscreen)
  }

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handleFsChange)
    return () => document.removeEventListener("fullscreenchange", handleFsChange)
  }, [])

  if (isLoading) return <div className="p-8 text-center">Loading...</div>
  if (!cf) return <div className="p-8 text-center">Consent form not found</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/consent-forms")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{cf.patient_name}</h1>
            <p className="text-sm text-muted-foreground">
              {cf.consent_type} {cf.op_number ? `- ${cf.op_number}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{cf.consent_type}</Badge>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div><span className="text-muted-foreground">Patient:</span> <span className="font-medium">{cf.patient_name}</span></div>
            {cf.op_number && <div><span className="text-muted-foreground">OP No:</span> {cf.op_number}</div>}
            {cf.phone && <div><span className="text-muted-foreground">Phone:</span> {cf.phone}</div>}
            {cf.doctor_name && <div><span className="text-muted-foreground">Doctor:</span> {cf.doctor_name}</div>}
            {cf.uploader_name && <div><span className="text-muted-foreground">Uploaded by:</span> {cf.uploader_name}</div>}
            <div><span className="text-muted-foreground">Date:</span> {cf.created_at ? new Date(cf.created_at).toLocaleString() : "-"}</div>
            {cf.remarks && <div><span className="text-muted-foreground">Remarks:</span> {cf.remarks}</div>}
          </CardContent>
        </Card>
      </div>

      <Card ref={containerRef} className="overflow-hidden">
        <CardContent className="p-0">
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              width: zoom < 1 ? `${100 / zoom}%` : "100%",
              height: "80vh",
            }}
          >
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              className="w-full h-full border-0"
              title="PDF Viewer"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
