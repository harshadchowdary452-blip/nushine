import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Printer, Download, ArrowLeft } from "lucide-react"
import { casesApi } from "@/services/endpoints"
import api from "@/services/api"
import { Button } from "@/components/ui/button"
import CaseReportPrint from "./CaseReportPrint"

export default function CasePrintPreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: c, isFetching } = useQuery({
    queryKey: ["case", id],
    queryFn: () => casesApi.get(id!),
    enabled: !!id,
  })

  if (isFetching) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!c) return <div className="py-20 text-center text-muted-foreground">Case report not found</div>

  const hn = c.hospital?.name || ""

  const handlePrint = () => {
    const orig = document.title
    document.title = hn || "Dental Case Report"
    window.print()
    setTimeout(() => { document.title = orig }, 100)
  }

  const handleDownloadPdf = async () => {
    if (!id) return
    try {
      const resp = await api.get(`/cases/${id}/pdf`, { responseType: "blob" })

      const blob = new Blob([resp.data], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `CaseReport_${c.patient?.op_no || ""}_${(c.patient?.full_name || "Patient").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert("PDF download failed: " + (err?.message || "Unknown error"))
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="nop sticky top-0 z-50 bg-white border-b shadow-sm px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="text-sm font-medium text-muted-foreground">Print Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">Case #{c.case_number || c.id.slice(0, 8).toUpperCase()}</span>
          <Button size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}><Download className="h-4 w-4 mr-1" /> Download PDF</Button>
        </div>
      </div>

      <CaseReportPrint c={c} />
    </div>
  )
}
