import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

import { Send, ExternalLink, AlertTriangle, CheckCircle2, XCircle, User, Phone, Stethoscope, Building2, CalendarDays, Pill, Heart } from "lucide-react"

interface PreviewData {
  patient_id: string
  patient_name: string
  patient_phone: string | null
  doctor_name: string | null
  hospital_name: string | null
  rendered_message: string
  resolved_variables: Record<string, string>
  unresolved_variables: string[]
  validation: Record<string, boolean>
  variables_panel: Record<string, Record<string, string | undefined>>
}

interface Props {
  open: boolean
  onClose: () => void
  preview: PreviewData | null
  loading?: boolean
  onSend: (mode: "redirect" | "api") => void
  sending?: boolean
}

const statusIcon = (ok: boolean) =>
  ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-red-400" />

export default function WhatsAppPreviewModal({ open, onClose, preview, loading, onSend, sending }: Props) {
  if (!preview) return null

  const noUnresolved = preview.validation.no_unresolved ?? preview.unresolved_variables.length === 0
  const isValid = preview.validation.patient_exists && preview.validation.has_phone && noUnresolved

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-green-500" />
            WhatsApp Message Preview
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--ds-text-tertiary)]">Loading preview...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-background-subtle)]/50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--ds-text-secondary)] mb-2">
                    <User className="h-3.5 w-3.5" /> Patient
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700 text-sm font-semibold">
                      {preview.patient_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--ds-text)]">{preview.patient_name}</p>
                      <p className="text-xs text-[var(--ds-text-secondary)] flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {preview.patient_phone || "No phone"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-background-subtle)]/50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--ds-text-secondary)] mb-2">
                    <Stethoscope className="h-3.5 w-3.5" /> Doctor
                  </div>
                  <p className="text-sm font-medium text-[var(--ds-text)]">{preview.doctor_name || "Not assigned"}</p>
                </div>
                <div className="rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-background-subtle)]/50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--ds-text-secondary)] mb-2">
                    <Building2 className="h-3.5 w-3.5" /> Hospital
                  </div>
                  <p className="text-sm font-medium text-[var(--ds-text)]">{preview.hospital_name || "Not set"}</p>
                </div>
                <div className="rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-background-subtle)]/50 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--ds-text-secondary)] mb-2">
                    <CalendarDays className="h-3.5 w-3.5" /> Appointment
                  </div>
                  <p className="text-sm font-medium text-[var(--ds-text)]">
                    {preview.variables_panel?.appointment?.date
                      ? `${preview.variables_panel.appointment.date} ${preview.variables_panel.appointment.time || ""}`
                      : "No upcoming"}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                  Validation
                  {isValid ? (
                    <Badge variant="success" className="text-xs">Ready to Send</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">Cannot Send</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(preview.validation).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                      {statusIcon(val)}
                      <span className={val ? "text-[var(--ds-text-secondary)]" : "text-red-500"}>
                        {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
                {preview.unresolved_variables.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Unresolved variables: {preview.unresolved_variables.join(", ")}. Resolve or remove them before sending.</span>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--ds-text-secondary)] mb-2">
                  <Heart className="h-4 w-4 text-green-500" />
                  Rendered Message
                </div>
                <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 shadow-sm">
                  <div className="relative">
                    <div className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold shadow-sm">N</div>
                    <div className="ml-3 space-y-2">
                      <p className="text-sm text-[var(--ds-text-tertiary)]">NuShine Dental</p>
                      <p className="text-sm text-[var(--ds-text)] whitespace-pre-wrap leading-relaxed">{preview.rendered_message}</p>
                      <p className="text-xs text-[var(--ds-text-tertiary)] pt-1">{preview.hospital_name || "NuShine Dental"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-[var(--ds-background-subtle)] border border-[var(--ds-border-light)] p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--ds-text-secondary)] mb-2">
                  <Pill className="h-3.5 w-3.5" /> Resolved Variables
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(preview.resolved_variables).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                      <span className="text-[var(--ds-text-tertiary)] font-mono">{key.replace(/[{}]/g, "")}</span>
                      <span className="text-[var(--ds-text-secondary)]">→</span>
                      <span className="text-[var(--ds-text)] font-medium truncate">{val || "(empty)"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onSend("redirect")}
              disabled={!isValid || sending}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open in WhatsApp
            </Button>
            <Button
              onClick={() => onSend("api")}
              disabled={!isValid || sending}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {sending ? "Sending..." : <><Send className="h-4 w-4" /> Send via API</>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
