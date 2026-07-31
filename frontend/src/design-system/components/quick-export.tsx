import { useState } from "react"
import { Download, FileSpreadsheet, File as FilePdf, Loader2 } from "lucide-react"
import { Button } from "./button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "./dropdown-menu"
import { exportsApi } from "@/services/endpoints"
import { useToast } from "./toast"

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

interface QuickExportProps {
  module: string
  label?: string
  period?: string
  startDate?: string
  endDate?: string
}

/** Dropdown export button for CSV / Excel / PDF reports. */
export default function QuickExport({ module, label, period, startDate, endDate }: QuickExportProps) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const handleExport = async (format: string) => {
    setLoading(format)
    try {
      const params: Record<string, string> = { format, period: period || "this_month" }
      if (period === "custom" && startDate) params.start_date = startDate
      if (period === "custom" && endDate) params.end_date = endDate
      const blob = await exportsApi.exportData(module, format, params)
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "_")
      const name = (label || module).toLowerCase().replace(/\s+/g, "_")
      downloadBlob(blob, `${name}_${dateStr}.${format}`)
      addToast({ title: "Export Complete", variant: "success" })
    } catch {
      addToast({ title: "Export Failed", description: `Failed to export ${format.toUpperCase()}`, variant: "destructive" })
    } finally {
      setLoading(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" aria-hidden="true" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("csv")} disabled={loading !== null}>
          {loading === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("excel")} disabled={loading !== null}>
          {loading === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Export Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={loading !== null}>
          {loading === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePdf className="h-4 w-4" />}
          Export PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
