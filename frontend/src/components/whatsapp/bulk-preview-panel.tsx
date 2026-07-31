import { useState } from "react"

import { Button } from "@/components/ui/button"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, XCircle, AlertTriangle, Send, ExternalLink, Smartphone, Loader2 } from "lucide-react"

interface BulkItem {
  patient_id: string
  patient_name: string
  patient_phone: string | null
  rendered_message: string
  resolved_variables: Record<string, string>
  unresolved_variables: string[]
  validation: Record<string, boolean>
  has_phone: boolean
  is_valid: boolean
}

interface BulkPreviewData {
  items: BulkItem[]
  totals: { total: number; valid: number; invalid: number; with_phone: number; without_phone: number }
  message: string
}

interface Props {
  preview: BulkPreviewData | null
  onSendAll: (mode: "redirect" | "api") => void
  onBack: () => void
  sending?: boolean
}

export default function BulkPreviewPanel({ preview, onSendAll, onBack, sending }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!preview) return null

  const { totals } = preview

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-blue-50 p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{totals.total}</p>
          <p className="text-xs text-blue-600/70">Total</p>
        </div>
        <div className="rounded-lg bg-green-50 p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{totals.valid}</p>
          <p className="text-xs text-green-600/70">Valid</p>
        </div>
        <div className="rounded-lg bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{totals.invalid}</p>
          <p className="text-xs text-red-600/70">Invalid</p>
        </div>
        <div className="rounded-lg bg-[var(--ds-accent-50)] p-3 text-center">
          <p className="text-2xl font-bold text-[var(--ds-accent-600)]">{totals.with_phone}</p>
          <p className="text-xs text-[var(--ds-accent-600)]">With Phone</p>
        </div>
      </div>

      {totals.invalid > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{totals.invalid} patient(s) have missing data and will be skipped.</span>
        </div>
      )}

      <Separator />

      <ScrollArea className="max-h-96">
        <div className="space-y-2">
          {preview.items.map((item) => (
            <div key={item.patient_id}>
              <button
                onClick={() => setExpanded(expanded === item.patient_id ? null : item.patient_id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                  item.is_valid ? "hover:bg-[var(--ds-surface-hover)]" : "bg-red-50/50"
                } ${expanded === item.patient_id ? "ring-1 ring-green-300" : ""}`}
              >
                {item.is_valid ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--ds-text)] truncate">{item.patient_name}</p>
                  <p className="text-xs text-[var(--ds-text-secondary)]">{item.patient_phone || "No phone"}</p>
                </div>
                <div className="flex gap-1">
                  {item.has_phone && <Smartphone className="h-3.5 w-3.5 text-green-400" />}
                  {!item.is_valid && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                </div>
              </button>
              {expanded === item.patient_id && (
                <div className="ml-7 rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-background-subtle)] p-3 mt-1">
                  <p className="text-xs text-[var(--ds-text-secondary)] mb-1">Message:</p>
                  <p className="text-sm text-[var(--ds-text)] whitespace-pre-wrap">{item.rendered_message}</p>
                  {item.unresolved_variables.length > 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Unresolved: {item.unresolved_variables.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onBack} disabled={sending} className="flex-1">Back to Compose</Button>
        <Button
          variant="outline"
          onClick={() => onSendAll("redirect")}
          disabled={totals.valid === 0 || sending}
          className="flex-1 gap-2"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Open All ({totals.valid})
        </Button>
        <Button
          onClick={() => onSendAll("api")}
          disabled={totals.valid === 0 || sending}
          className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send API ({totals.valid})
        </Button>
      </div>
    </div>
  )
}
