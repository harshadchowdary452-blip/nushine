import { useState, useEffect, useMemo } from "react"
import type { ReactNode } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  FlaskConical, Plus, Download, FileText, FileSpreadsheet, FileDown,
  MessageCircle, Phone, Pencil, Trash2, Eye, Send,
  ChevronLeft, ChevronRight, RefreshCw, Package, CheckCircle2,
  Building2, Activity, ClipboardList, Clock, AlertTriangle,
} from "lucide-react"
import {
  PageContainer, PageHeader, PageTabs, SectionCard, MetricCard,
  Button, Input, Label, Textarea, StatusBadge,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DetailDrawer, DrawerSection, DrawerStatusPill, Timeline,
  ConfirmDialog, DeleteDialog,
  SearchBar, EmptyState, LoadingSkeleton, useToast, NumericInput,
} from "@/design-system"
import { formatIndianRupees } from "@/lib/currency"
import { laboratoriesApi, labCasesApi } from "@/services/endpoints"
import { useAuthStore } from "@/store/authStore"
import type {
  Laboratory, LabCase, LabCandidate, LabMonthlyReport, LabStatus,
  LabCaseEvent, PaginatedResponse,
} from "@/types"
import { showErrorToast } from "@/utils/showErrorToast"
import { extractDetail } from "@/types"

const LAB_STATUSES: LabStatus[] = ["PENDING", "SENT", "RECEIVED", "CANCELLED", "RESENT"]

const STATUS_TONE: Record<string, "primary" | "accent" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  PENDING: "warning",
  SENT: "info",
  RECEIVED: "success",
  CANCELLED: "danger",
  RESENT: "accent",
  IN_PROGRESS: "accent",
  READY: "success",
  RETURNED: "success",
}

const RESPONSE_MARKER = "\n\n[Response]\n"

function parseWhatsAppNote(note: string | null): { message: string; response: string | null } {
  if (!note) return { message: "", response: null }
  const idx = note.indexOf(RESPONSE_MARKER)
  if (idx === -1) return { message: note, response: null }
  return {
    message: note.slice(0, idx),
    response: note.slice(idx + RESPONSE_MARKER.length),
  }
}

const EVENT_ICON: Record<string, typeof Activity> = {
  STATUS_CHANGE: Activity,
  WHATSAPP: MessageCircle,
  CALL: Phone,
  NOTE: ClipboardList,
  CASE_CREATED: CheckCircle2,
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function formatDate(v: string | null | undefined): string {
  if (!v) return "—"
  try {
    return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return "—"
  }
}

function formatDateTime(v: string | null | undefined): string {
  if (!v) return "—"
  try {
    return new Date(v).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function isOverdue(labCase: LabCase): boolean {
  if (!labCase.due_date || labCase.returned_date) return false
  if (labCase.lab_status === "RECEIVED" || labCase.lab_status === "CANCELLED") return false
  return new Date(labCase.due_date + "T23:59:59").getTime() < Date.now()
}

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

function buildWhatsAppMessage(labCase: LabCase): string {
  const lines = [
    `Hello ${labCase.laboratory_name || "Lab Team"},`,
    "",
    "Lab case details:",
  ]
  if (labCase.order_number) lines.push(`Order: ${labCase.order_number}`)
  if (labCase.patient_name) lines.push(`Patient: ${labCase.patient_name}`)
  if (labCase.op_number) lines.push(`OP: ${labCase.op_number}`)
  if (labCase.treatment_name) lines.push(`Treatment: ${labCase.treatment_name}`)
  if (labCase.tooth_number) lines.push(`Tooth: ${labCase.tooth_number}`)
  if (labCase.material) lines.push(`Material: ${labCase.material}`)
  lines.push(`Status: ${labCase.lab_status.replace(/_/g, " ")}`)
  return lines.join("\n")
}

function buildBatchMessage(
  candidates: LabCandidate[],
  laboratoryName: string,
  dueDate: string | null,
  hospitalName: string | null,
): string {
  const lines = [`Hello ${laboratoryName} Team,`, "", "Please process the following dental laboratory work:"]
  candidates.forEach((c, i) => {
    const parts = []
    if (c.patient_name) parts.push(`Patient: ${c.patient_name}`)
    if (c.op_number) parts.push(`OP: ${c.op_number}`)
    if (c.treatment_name) parts.push(`Treatment: ${c.treatment_name}`)
    if (c.tooth_number) parts.push(`Tooth: ${c.tooth_number}`)
    lines.push(`${i + 1}) ${parts.join(" | ")}`)
  })
  if (dueDate) {
    lines.push("", `Expected return date: ${dueDate}`)
  }
  lines.push("", `Regards,${hospitalName || "Dental Clinic"}`)
  return lines.join("\n")
}

function eventTitle(e: LabCaseEvent): string {
  switch (e.event_type) {
    case "STATUS_CHANGE":
      return `Status changed from ${e.from_status?.replace(/_/g, " ") || "—"} to ${e.to_status?.replace(/_/g, " ") || "—"}`
    case "WHATSAPP":
      return "WhatsApp sent to laboratory"
    case "CALL":
      return "Phone call logged"
    case "CASE_CREATED":
      return "Lab case created"
    case "NOTE":
      return "Note added"
    default:
      return e.event_type.replace(/_/g, " ")
  }
}

function useRole() {
  const { user } = useAuthStore()
  const role = user?.role ?? "DOCTOR"
  return {
    role,
    canManageLabs: role === "SUPER_ADMIN" || role === "GROUP_ADMIN" || role === "HOSPITAL_ADMIN",
    canDeleteLabCase: role === "SUPER_ADMIN" || role === "GROUP_ADMIN" || role === "HOSPITAL_ADMIN",
  }
}

function useLabs() {
  return useQuery({
    queryKey: ["laboratories", "all"],
    queryFn: () => laboratoriesApi.list({ page: 1, page_size: 200 }),
  })
}

interface PaginationBarProps {
  page: number
  pages: number
  total: number
  onPage: (page: number) => void
}

function PaginationBar({ page, pages, total, onPage }: PaginationBarProps) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3">
      <p className="ds-caption text-[var(--ds-text-secondary)]">
        {total} {total === 1 ? "record" : "records"}
      </p>
      <div className="ds-cluster ds-cluster-sm">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="ds-caption ds-numeric px-1 text-[var(--ds-text-secondary)]">
          Page {page} of {Math.max(pages, 1)}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages || pages === 0} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/* ── WhatsApp dialog ──────────────────────────────────────────────────── */

function WhatsAppDialog({
  labCase,
  open,
  onOpenChange,
  onSent,
}: {
  labCase: LabCase | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  const { addToast } = useToast()
  const [message, setMessage] = useState("")
  const [phone, setPhone] = useState("")

  const mutation = useMutation({
    mutationFn: (payload: { message: string; phone?: string }) =>
      labCasesApi.whatsapp(labCase!.id, payload),
    onSuccess: (result: { success: boolean; deep_link: string }) => {
      onSent()
      onOpenChange(false)
      if (result.deep_link) {
        window.open(result.deep_link, "_blank")
      }
      addToast({
        title: result.success ? "WhatsApp sent" : "WhatsApp ready to send",
        description: result.success ? "Message sent to laboratory" : "Opening WhatsApp with a ready message",
        variant: result.success ? "success" : "default",
      })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  useEffect(() => {
    if (open && labCase) {
      setMessage(buildWhatsAppMessage(labCase))
      setPhone(labCase.laboratory_whatsapp_number || labCase.laboratory_phone || "")
    }
  }, [open, labCase])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[var(--ds-primary)]" aria-hidden="true" />
            Send WhatsApp to Laboratory
          </DialogTitle>
          <DialogDescription>
            {labCase?.patient_name ? `${labCase.patient_name} · ${labCase.treatment_name || "Treatment"}` : "Draft a message to the laboratory"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="ds-stack">
            <div>
              <Label className="ds-form-label">Phone Number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="WhatsApp number of laboratory"
              />
            </div>
            <div>
              <Label className="ds-form-label">Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate({ message, phone: phone || undefined })}
            loading={mutation.isPending}
            disabled={!message.trim()}
          >
            <Send className="h-4 w-4" />
            Send & Open WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Call log dialog ──────────────────────────────────────────────────── */

function CallDialog({
  labCase,
  open,
  onOpenChange,
  onLogged,
}: {
  labCase: LabCase | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogged: () => void
}) {
  const { addToast } = useToast()
  const [note, setNote] = useState("")
  const [duration, setDuration] = useState("")

  const mutation = useMutation({
    mutationFn: (payload: { note?: string; duration_seconds?: number }) =>
      labCasesApi.call(labCase!.id, payload),
    onSuccess: () => {
      onLogged()
      onOpenChange(false)
      addToast({ title: "Call logged", description: "Phone call recorded in the lab case timeline", variant: "success" })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-[var(--ds-primary)]" aria-hidden="true" />
            Log Phone Call
          </DialogTitle>
          <DialogDescription>
            {labCase?.laboratory_name ? `Call with ${labCase.laboratory_name}` : "Record a call with the laboratory"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="ds-stack">
            <div>
              <Label className="ds-form-label">Duration (seconds, optional)</Label>
              <NumericInput
                mode="integer"
                value={duration}
                onChange={setDuration}
                placeholder="e.g. 180"
                min={0}
              />
            </div>
            <div>
              <Label className="ds-form-label">Notes</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="What was discussed?"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              mutation.mutate({
                note: note || undefined,
                duration_seconds: duration ? parseInt(duration, 10) : undefined,
              })
            }
            loading={mutation.isPending}
          >
            <Phone className="h-4 w-4" />
            Log Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Status change dialog ─────────────────────────────────────────────── */

function StatusDialog({
  labCase,
  open,
  onOpenChange,
  onChanged,
}: {
  labCase: LabCase | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const { addToast } = useToast()
  const [status, setStatus] = useState<LabStatus>("PENDING")
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: (payload: { status: LabStatus; note?: string }) =>
      labCasesApi.setStatus(labCase!.id, payload.status, payload.note),
    onSuccess: () => {
      onChanged()
      onOpenChange(false)
      addToast({ title: "Status updated", description: `Lab case marked ${status.replace(/_/g, " ")}`, variant: "success" })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  useEffect(() => {
    if (open && labCase) {
      setStatus(labCase.lab_status)
      setNote("")
    }
  }, [open, labCase])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Lab Status</DialogTitle>
          <DialogDescription>
            {labCase?.patient_name ? `${labCase.patient_name} · ${labCase.treatment_name || ""}` : "Update the laboratory workflow status"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="ds-stack">
            <div>
              <Label className="ds-form-label">New Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as LabStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="ds-form-label">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Optional note about this change"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate({ status, note: note || undefined })}
            loading={mutation.isPending}
            disabled={status === labCase?.lab_status}
          >
            Update Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Lab case edit dialog ─────────────────────────────────────────────── */

function LabCaseEditDialog({
  labCase,
  labs,
  open,
  onOpenChange,
  onSaved,
}: {
  labCase: LabCase | null
  labs: Laboratory[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { addToast } = useToast()
  const [form, setForm] = useState({
    laboratory_id: "",
    order_number: "",
    tooth_number: "",
    material: "",
    sent_date: "",
    due_date: "",
    returned_date: "",
    lab_cost: "",
    remarks: "",
  })

  useEffect(() => {
    if (open && labCase) {
      setForm({
        laboratory_id: labCase.laboratory_id || "",
        order_number: labCase.order_number || "",
        tooth_number: labCase.tooth_number || "",
        material: labCase.material || "",
        sent_date: labCase.sent_date || "",
        due_date: labCase.due_date || "",
        returned_date: labCase.returned_date || "",
        lab_cost: labCase.lab_cost != null ? String(labCase.lab_cost) : "",
        remarks: labCase.remarks || "",
      })
    }
  }, [open, labCase])

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => labCasesApi.update(labCase!.id, payload),
    onSuccess: () => {
      onSaved()
      onOpenChange(false)
      addToast({ title: "Lab case updated", variant: "success" })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const set = (key: string) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Lab Case</DialogTitle>
          <DialogDescription>
            {labCase?.patient_name ? `${labCase.patient_name} · ${labCase.treatment_name || ""}` : "Update laboratory details"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="ds-form-label">Laboratory</Label>
              <Select value={form.laboratory_id} onValueChange={set("laboratory_id")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select laboratory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {labs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="ds-form-label">Order Number</Label>
              <Input value={form.order_number} onChange={(e) => set("order_number")(e.target.value)} placeholder="e.g. PO-1001" />
            </div>
            <div>
              <Label className="ds-form-label">Tooth Number</Label>
              <Input value={form.tooth_number} onChange={(e) => set("tooth_number")(e.target.value)} placeholder="e.g. 11, 12" />
            </div>
            <div>
              <Label className="ds-form-label">Material</Label>
              <Input value={form.material} onChange={(e) => set("material")(e.target.value)} placeholder="e.g. PFM, Zirconia" />
            </div>
            <div>
              <Label className="ds-form-label">Lab Cost (₹)</Label>
              <NumericInput mode="currency" value={form.lab_cost} onChange={set("lab_cost")} min={0} />
            </div>
            <div>
              <Label className="ds-form-label">Sent Date</Label>
              <Input type="date" value={form.sent_date} onChange={(e) => set("sent_date")(e.target.value)} />
            </div>
            <div>
              <Label className="ds-form-label">Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set("due_date")(e.target.value)} />
            </div>
            <div>
              <Label className="ds-form-label">Returned Date</Label>
              <Input type="date" value={form.returned_date} onChange={(e) => set("returned_date")(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="ds-form-label">Remarks</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => set("remarks")(e.target.value)}
                rows={3}
                placeholder="Instructions or notes for the laboratory"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                ...(form.laboratory_id && form.laboratory_id !== "none" ? { laboratory_id: form.laboratory_id } : {}),
                order_number: form.order_number,
                tooth_number: form.tooth_number,
                material: form.material,
                sent_date: form.sent_date || undefined,
                due_date: form.due_date || undefined,
                returned_date: form.returned_date || undefined,
                lab_cost: form.lab_cost ? parseFloat(form.lab_cost) : undefined,
                remarks: form.remarks,
              })
            }
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Laboratory create/edit dialog ────────────────────────────────────── */

function LaboratoryDialog({
  laboratory,
  open,
  onOpenChange,
}: {
  laboratory: Laboratory | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: "",
    code: "",
    contact_person: "",
    phone: "",
    whatsapp_number: "",
    email: "",
    address: "",
    status: "ACTIVE",
    notes: "",
  })

  useEffect(() => {
    if (open) {
      setForm({
        name: laboratory?.name || "",
        code: laboratory?.code || "",
        contact_person: laboratory?.contact_person || "",
        phone: laboratory?.phone || "",
        whatsapp_number: laboratory?.whatsapp_number || "",
        email: laboratory?.email || "",
        address: laboratory?.address || "",
        status: laboratory?.status || "ACTIVE",
        notes: laboratory?.notes || "",
      })
    }
  }, [open, laboratory])

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      laboratory ? laboratoriesApi.update(laboratory.id, payload) : laboratoriesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["laboratories"] })
      onOpenChange(false)
      addToast({
        title: laboratory ? "Laboratory updated" : "Laboratory added",
        description: form.name,
        variant: "success",
      })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const set = (key: string) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{laboratory ? "Edit Laboratory" : "Add Laboratory"}</DialogTitle>
          <DialogDescription>
            {laboratory ? `Update ${laboratory.name}` : "Register a new dental laboratory"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="ds-form-label">
                Laboratory Name <span className="text-[var(--ds-danger)]">*</span>
              </Label>
              <Input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. ProLab Dental Studio" />
            </div>
            <div>
              <Label className="ds-form-label">Code</Label>
              <Input value={form.code} onChange={(e) => set("code")(e.target.value)} placeholder="e.g. PL-001" />
            </div>
            <div>
              <Label className="ds-form-label">Contact Person</Label>
              <Input value={form.contact_person} onChange={(e) => set("contact_person")(e.target.value)} placeholder="e.g. Ravi Kumar" />
            </div>
            <div>
              <Label className="ds-form-label">Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="e.g. 9876501234" />
            </div>
            <div>
              <Label className="ds-form-label">WhatsApp Number</Label>
              <Input value={form.whatsapp_number} onChange={(e) => set("whatsapp_number")(e.target.value)} placeholder="e.g. 9876501234" />
            </div>
            <div>
              <Label className="ds-form-label">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="lab@example.com" />
            </div>
            <div>
              <Label className="ds-form-label">Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="ds-form-label">Address</Label>
              <Textarea value={form.address} onChange={(e) => set("address")(e.target.value)} rows={2} placeholder="Street, city" />
            </div>
            <div className="sm:col-span-2">
              <Label className="ds-form-label">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder="Any additional notes" />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!form.name.trim()}
            onClick={() =>
              mutation.mutate({
                name: form.name.trim(),
                code: form.code || undefined,
                contact_person: form.contact_person || undefined,
                phone: form.phone || undefined,
                whatsapp_number: form.whatsapp_number || undefined,
                email: form.email || undefined,
                address: form.address || undefined,
                status: form.status,
                notes: form.notes || undefined,
              })
            }
          >
            {laboratory ? "Save Changes" : "Add Laboratory"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Send to lab dialog (from candidates) ─────────────────────────────── */

function SendToLabDialog({
  candidate,
  labs,
  open,
  onOpenChange,
  onCreated,
}: {
  candidate: LabCandidate | null
  labs: Laboratory[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { addToast } = useToast()
  const [form, setForm] = useState({
    laboratory_id: "",
    order_number: "",
    tooth_number: "",
    material: "",
    sent_date: "",
    due_date: "",
    lab_cost: "",
    remarks: "",
  })

  useEffect(() => {
    if (open && candidate) {
      const today = new Date()
      const due = new Date(today)
      due.setDate(due.getDate() + 7)
      const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      setForm({
        laboratory_id: "",
        order_number: "",
        tooth_number: candidate.tooth_number || "",
        material: "",
        sent_date: iso(today),
        due_date: iso(due),
        lab_cost: "",
        remarks: "",
      })
    }
  }, [open, candidate])

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      labCasesApi.fromTreatment(candidate!.treatment_plan_id, payload),
    onSuccess: () => {
      onCreated()
      onOpenChange(false)
      addToast({ title: "Lab case created", description: `${candidate?.patient_name || "Patient"} sent to laboratory`, variant: "success" })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const set = (key: string) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-[var(--ds-primary)]" aria-hidden="true" />
            Send to Laboratory
          </DialogTitle>
          <DialogDescription>
            {candidate?.patient_name
              ? `${candidate.patient_name} · ${candidate.treatment_name || ""}${candidate.case_number ? ` · Case ${candidate.case_number}` : ""}`
              : "Create a lab case from this waiting treatment"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="ds-form-label">
                Laboratory <span className="text-[var(--ds-danger)]">*</span>
              </Label>
              <Select value={form.laboratory_id} onValueChange={set("laboratory_id")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select laboratory" />
                </SelectTrigger>
                <SelectContent>
                  {labs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="ds-form-label">Order Number</Label>
              <Input value={form.order_number} onChange={(e) => set("order_number")(e.target.value)} placeholder="e.g. PO-1001" />
            </div>
            <div>
              <Label className="ds-form-label">Tooth Number</Label>
              <Input value={form.tooth_number} onChange={(e) => set("tooth_number")(e.target.value)} placeholder="e.g. 11, 12" />
            </div>
            <div>
              <Label className="ds-form-label">Material</Label>
              <Input value={form.material} onChange={(e) => set("material")(e.target.value)} placeholder="e.g. PFM, Zirconia" />
            </div>
            <div>
              <Label className="ds-form-label">Lab Cost (₹)</Label>
              <NumericInput mode="currency" value={form.lab_cost} onChange={set("lab_cost")} min={0} />
            </div>
            <div>
              <Label className="ds-form-label">Sent Date</Label>
              <Input type="date" value={form.sent_date} onChange={(e) => set("sent_date")(e.target.value)} />
            </div>
            <div>
              <Label className="ds-form-label">Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set("due_date")(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="ds-form-label">Remarks</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => set("remarks")(e.target.value)}
                rows={3}
                placeholder="Instructions for the laboratory"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!form.laboratory_id}
            onClick={() =>
              mutation.mutate({
                laboratory_id: form.laboratory_id,
                order_number: form.order_number,
                tooth_number: form.tooth_number,
                material: form.material,
                sent_date: form.sent_date || undefined,
                due_date: form.due_date || undefined,
                lab_cost: form.lab_cost ? parseFloat(form.lab_cost) : undefined,
                remarks: form.remarks,
              })
            }
          >
            <Send className="h-4 w-4" />
            Create Lab Case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Batch send dialog (from candidates) ──────────────────────────────── */

function BatchSendDialog({
  candidates,
  labs,
  open,
  onOpenChange,
  onSent,
}: {
  candidates: LabCandidate[]
  labs: Laboratory[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: () => void
}) {
  const { addToast } = useToast()
  const [form, setForm] = useState({
    laboratory_id: "",
    due_date: "",
    phone: "",
    message: "",
    messageTouched: false,
  })

  const selectedLab = labs.find((l) => l.id === form.laboratory_id)
  const hospitalName = candidates.find((c) => c.hospital_name)?.hospital_name ?? null
  const preview = buildBatchMessage(candidates, selectedLab?.name || "Lab", form.due_date || null, hospitalName)
  const message = form.messageTouched ? form.message : preview

  useEffect(() => {
    if (open) {
      const today = new Date()
      const due = new Date(today)
      due.setDate(due.getDate() + 7)
      const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      setForm({
        laboratory_id: "",
        due_date: iso(due),
        phone: "",
        message: "",
        messageTouched: false,
      })
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: (payload: {
      treatment_plan_ids: string[]
      laboratory_id: string
      due_date?: string | null
      phone?: string | null
      message?: string | null
    }) => labCasesApi.batchSend(payload),
    onSuccess: (result: { success: boolean; deep_link: string }) => {
      onSent()
      onOpenChange(false)
      if (result.deep_link) {
        window.open(result.deep_link, "_blank")
      }
      addToast({
        title: result.success ? "Batch WhatsApp sent" : "Batch WhatsApp ready to send",
        description: result.success ? `${candidates.length} item(s) sent to ${selectedLab?.name || "laboratory"}` : "Opening WhatsApp with a ready message",
        variant: result.success ? "success" : "default",
      })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-[var(--ds-primary)]" aria-hidden="true" />
            Send {candidates.length} Item{candidates.length === 1 ? "" : "s"} to Laboratory
          </DialogTitle>
          <DialogDescription>
            One WhatsApp message covering all selected treatments, then the items are marked Sent.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="ds-form-label">
                Laboratory <span className="text-[var(--ds-danger)]">*</span>
              </Label>
              <Select
                value={form.laboratory_id}
                onValueChange={(v) => {
                  const lab = labs.find((l) => l.id === v)
                  setForm((prev) => ({
                    ...prev,
                    laboratory_id: v,
                    phone: lab?.whatsapp_number || lab?.phone || "",
                    messageTouched: false,
                  }))
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select laboratory" />
                </SelectTrigger>
                <SelectContent>
                  {labs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="ds-form-label">Expected Return Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value, messageTouched: false }))} />
            </div>
            <div>
              <Label className="ds-form-label">WhatsApp / Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Number of the laboratory" />
            </div>
            <div className="sm:col-span-2">
              <Label className="ds-form-label">Message Preview</Label>
              <Textarea
                value={message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value, messageTouched: true }))}
                rows={9}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!form.laboratory_id || !message.trim()}
            onClick={() =>
              mutation.mutate({
                treatment_plan_ids: candidates.map((c) => c.treatment_plan_id),
                laboratory_id: form.laboratory_id,
                due_date: form.due_date || null,
                phone: form.phone || null,
                message: message.trim(),
              })
            }
          >
            <Send className="h-4 w-4" />
            Send Batch WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Lab case detail drawer ───────────────────────────────────────────── */

function LabCaseDrawer({
  labCase,
  open,
  onOpenChange,
  onWhatsApp,
  onCall,
  onStatus,
  onEdit,
  onDelete,
  canDelete,
}: {
  labCase: LabCase | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onWhatsApp: (labCase: LabCase) => void
  onCall: (labCase: LabCase) => void
  onStatus: (labCase: LabCase) => void
  onEdit: (labCase: LabCase) => void
  onDelete: (labCase: LabCase) => void
  canDelete: boolean
}) {
  const events = labCase?.events ?? []
  const timelineItems = [...events].reverse().map((e) => {
    let description = e.note || undefined
    let details: ReactNode | undefined
    if (e.event_type === "WHATSAPP") {
      const { message, response } = parseWhatsAppNote(e.note)
      description = message || undefined
      if (response) {
        details = (
          <div className="mt-2 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] p-3">
            <p className="ds-caption mb-1 font-medium text-[var(--ds-text-secondary)]">WhatsApp response</p>
            <pre className="ds-caption whitespace-pre-wrap font-mono text-[var(--ds-text-secondary)]">{response}</pre>
          </div>
        )
      }
    }
    return {
      id: e.id,
      title: eventTitle(e),
      description,
      details,
      date: formatDateTime(e.created_at),
      actor: e.actor_name || undefined,
      tone: STATUS_TONE[e.to_status || e.event_type] || "neutral",
      icon: EVENT_ICON[e.event_type] || Activity,
      status: e.to_status || undefined,
    }
  })

  return (
    <DetailDrawer
      open={open}
      onClose={() => onOpenChange(false)}
      title={labCase?.patient_name || "Lab Case"}
      subtitle={labCase?.treatment_name || "Treatment"}
      eyebrow={labCase?.order_number || "Lab Case"}
      widthClassName="w-full max-w-2xl"
      actions={
        labCase && (
          <>
            <Button size="icon-sm" variant="outline" onClick={() => onWhatsApp(labCase)} aria-label="WhatsApp laboratory">
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => onCall(labCase)} aria-label="Log phone call">
              <Phone className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => onEdit(labCase)} aria-label="Edit lab case">
              <Pencil className="h-4 w-4" />
            </Button>
            {canDelete && (
              <Button size="icon-sm" variant="outline" onClick={() => onDelete(labCase)} aria-label="Delete lab case">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        )
      }
      footer={
        labCase && (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => onStatus(labCase)}>
              <RefreshCw className="h-4 w-4" />
              Change Status
            </Button>
            <div className="ds-cluster ds-cluster-sm">
              <Button variant="outline" size="sm" onClick={() => onWhatsApp(labCase)}>
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              <Button variant="outline" size="sm" onClick={() => onCall(labCase)}>
                <Phone className="h-4 w-4" />
                Log Call
              </Button>
            </div>
          </div>
        )
      }
    >
      {labCase && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <StatusBadge status={labCase.lab_status} />
            {isOverdue(labCase) && <StatusBadge status="OVERDUE" />}
            <DrawerStatusPill tone="info">{labCase.hospital_name || "Hospital"}</DrawerStatusPill>
          </div>

          <DrawerSection title="Patient & Treatment">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Patient" value={labCase.patient_name || "—"} />
              <Field label="OP Number" value={labCase.op_number || "—"} />
              <Field label="Case" value={labCase.case_number || "—"} />
              <Field label="Treatment" value={labCase.treatment_name || "—"} />
              <Field label="Doctor" value={labCase.doctor_name || "—"} />
              <Field label="Tooth" value={labCase.tooth_number || "—"} />
            </div>
          </DrawerSection>

          <DrawerSection title="Laboratory Details">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Laboratory" value={labCase.laboratory_name || "Unassigned"} />
              <Field label="Order Number" value={labCase.order_number || "—"} />
              <Field label="Material" value={labCase.material || "—"} />
              <Field label="Sent Date" value={formatDate(labCase.sent_date)} />
              <Field label="Due Date" value={formatDate(labCase.due_date)} />
              <Field label="Returned Date" value={formatDate(labCase.returned_date)} />
              <Field label="Lab Cost" value={labCase.lab_cost != null ? formatIndianRupees(labCase.lab_cost) : "—"} />
              <Field label="Phone" value={labCase.laboratory_phone || "—"} />
              <Field label="WhatsApp" value={labCase.laboratory_whatsapp_number || "—"} />
            </div>
            {labCase.remarks && (
              <p className="ds-secondary-text mt-3 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] px-3 py-2 text-[var(--ds-text-secondary)]">
                {labCase.remarks}
              </p>
            )}
          </DrawerSection>

          <DrawerSection
            title={`Activity · ${events.length} ${events.length === 1 ? "event" : "events"}`}
            description="Timeline of activity on this single lab case (status changes, WhatsApp, calls, notes) — not separate lab records."
          >
            <Timeline items={timelineItems} emptyTitle="No activity yet" emptyDescription="Events will appear here as the case progresses." />
          </DrawerSection>
        </>
      )}
    </DetailDrawer>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ds-min-w-0">
      <dt className="ds-caption text-[var(--ds-text-tertiary)]">{label}</dt>
      <dd className="ds-body ds-truncate mt-0.5 font-medium text-[var(--ds-text)]">{value}</dd>
    </div>
  )
}

/* ── Monthly report view ──────────────────────────────────────────────── */

function ReportView() {
  const { addToast } = useToast()
  const [month, setMonth] = useState(currentMonth())
  const [exporting, setExporting] = useState<string | null>(null)

  const reportQuery = useQuery({
    queryKey: ["lab-report", month],
    queryFn: () => labCasesApi.report(month) as Promise<LabMonthlyReport>,
  })

  const report = reportQuery.data

  const runExport = async (format: "pdf" | "excel" | "csv") => {
    setExporting(format)
    try {
      const blob = await labCasesApi.reportBlob(month, format)
      downloadBlob(blob, `lab_report_${month}.${format}`)
      addToast({ title: "Export Complete", description: `Laboratory report (${format.toUpperCase()}) downloaded`, variant: "success" })
    } catch (err) {
      showErrorToast(err, addToast)
    } finally {
      setExporting(null)
    }
  }

  const summary = report?.summary ?? []
  const summaryMap = Object.fromEntries(summary.map((s) => [s.label, s.value]))
  const maxStatus = Math.max(1, ...Object.values(report?.status_breakdown ?? {}))

  return (
    <div className="ds-stack">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label className="ds-form-label">Report Month</Label>
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="ds-cluster ds-cluster-sm">
          <Button variant="outline" loading={exporting === "pdf"} onClick={() => runExport("pdf")}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" loading={exporting === "excel"} onClick={() => runExport("excel")}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" loading={exporting === "csv"} onClick={() => runExport("csv")}>
            <FileDown className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {reportQuery.isLoading && <LoadingSkeleton rows={4} variant="metrics" />}

      {reportQuery.isError && (
        <EmptyState
          icon={FlaskConical}
          title="Could not load report"
          description={extractDetail(reportQuery.error)}
          action={
            <Button variant="outline" onClick={() => reportQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          }
        />
      )}

      {report && (
        <>
          <div className="ds-auto-metrics">
            <MetricCard title="Total Cases" value={summaryMap["Total Cases"] ?? report.total_cases} icon={Package} />
            <MetricCard title="Total Lab Cost" value={summaryMap["Total Lab Cost"] ?? formatIndianRupees(report.total_cost)} icon={Building2} />
            <MetricCard title="Returned" value={summaryMap["Returned"] ?? 0} icon={CheckCircle2} />
            <MetricCard title="In Lab" value={summaryMap["In Lab"] ?? 0} icon={Activity} />
            <MetricCard title="Pending" value={summaryMap["Pending"] ?? 0} icon={Clock} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Status Breakdown">
              <div className="ds-stack-sm">
                {LAB_STATUSES.map((s) => {
                  const count = report.status_breakdown[s] ?? 0
                  if (count === 0) return null
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <StatusBadge status={s} />
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--ds-surface-secondary)]">
                        <div
                          className="h-full rounded-full bg-[var(--ds-primary)]"
                          style={{ width: `${(count / maxStatus) * 100}%` }}
                        />
                      </div>
                      <span className="ds-numeric w-8 text-right text-sm font-medium text-[var(--ds-text)]">{count}</span>
                    </div>
                  )
                })}
                {Object.values(report.status_breakdown).every((c) => c === 0) && (
                  <p className="ds-caption text-[var(--ds-text-tertiary)]">No cases recorded for this month.</p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="By Laboratory">
              <div className="overflow-hidden rounded-[var(--ds-table-radius)] border border-[var(--ds-border)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Laboratory</TableHead>
                      <TableHead className="text-right">Cases</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.lab_breakdown.map((lab) => (
                      <TableRow key={lab.laboratory_id || lab.laboratory_name}>
                        <TableCell className="font-medium text-[var(--ds-text)]">{lab.laboratory_name}</TableCell>
                        <TableCell className="text-right ds-numeric">{lab.cases}</TableCell>
                        <TableCell className="text-right ds-numeric">{formatIndianRupees(lab.total_cost)}</TableCell>
                      </TableRow>
                    ))}
                    {report.lab_breakdown.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-[var(--ds-text-tertiary)]">
                          No lab work for this month.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Monthly Report" description={`${month} · ${report.total_cases} lab cases`} flush>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {report.headers.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="whitespace-nowrap ds-caption">
                          {j === row.length - 1 && typeof cell === "number" ? formatIndianRupees(cell) : String(cell)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {report.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={report.headers.length} className="py-8 text-center text-[var(--ds-text-tertiary)]">
                        No lab cases for {month}.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}

/* ── Lab cases view ───────────────────────────────────────────────────── */

function LabCasesView({
  onOpenDetail,
  onWhatsApp,
  onCall,
}: {
  onOpenDetail: (labCase: LabCase) => void
  onWhatsApp: (labCase: LabCase) => void
  onCall: (labCase: LabCase) => void
}) {
  const [search, setSearch] = useState("")
  const [labStatus, setLabStatus] = useState("all")
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ["lab-cases", "list", page, search, labStatus, overdueOnly],
    queryFn: () =>
      labCasesApi.list({
        page,
        page_size: 15,
        ...(search ? { search } : {}),
        ...(labStatus !== "all" ? { lab_status: labStatus } : {}),
        ...(overdueOnly ? { overdue_only: true } : {}),
      }) as Promise<PaginatedResponse<LabCase>>,
  })

  const data = query.data
  const items = useMemo(() => {
    const seen = new Set<string>()
    return (data?.items ?? []).filter((lc) => {
      if (seen.has(lc.id)) return false
      seen.add(lc.id)
      return true
    })
  }, [data?.items])

  return (
    <div className="ds-stack">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1 sm:max-w-sm">
          <SearchBar value={search} onChange={setSearch} placeholder="Search patient, treatment, order…" />
        </div>
        <Select value={labStatus} onValueChange={(v) => {
          setLabStatus(v)
          setPage(1)
        }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {LAB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={overdueOnly ? "primary" : "outline"}
          size="sm"
          onClick={() => {
            setOverdueOnly((v) => !v)
            setPage(1)
          }}
        >
          <AlertTriangle className="h-4 w-4" />
          Overdue only
        </Button>
      </div>

      {query.isLoading && <LoadingSkeleton rows={8} variant="table" />}

      {query.isError && (
        <EmptyState
          icon={FlaskConical}
          title="Could not load lab cases"
          description={extractDetail(query.error)}
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          }
        />
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          icon={FlaskConical}
          title={search || labStatus !== "all" || overdueOnly ? "No lab cases match your filters" : "No lab cases yet"}
          description={
            search || labStatus !== "all" || overdueOnly
              ? "Try adjusting the filters."
              : "Lab cases are created automatically when a treatment moves to Waiting for Lab."
          }
        />
      )}

      {items.length > 0 && (
        <SectionCard flush>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Laboratory</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order No.</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((lc) => (
                  <TableRow key={lc.id} className="cursor-pointer" onClick={() => onOpenDetail(lc)}>
                    <TableCell>
                      <div className="font-medium text-[var(--ds-text)]">{lc.patient_name || "—"}</div>
                      <div className="ds-caption text-[var(--ds-text-tertiary)]">
                        {lc.op_number ? `OP ${lc.op_number}` : lc.case_number || ""}
                      </div>
                    </TableCell>
                    <TableCell className="ds-caption">{lc.treatment_name || "—"}</TableCell>
                    <TableCell>
                      <div className="ds-caption font-medium text-[var(--ds-text)]">{lc.laboratory_name || "Unassigned"}</div>
                      <div className="ds-caption text-[var(--ds-text-tertiary)]">{lc.order_number || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="ds-cluster ds-cluster-sm">
                        <StatusBadge status={lc.lab_status} />
                        {isOverdue(lc) && <StatusBadge status="OVERDUE" />}
                      </div>
                    </TableCell>
                    <TableCell className="ds-caption ds-numeric">{lc.order_number || "—"}</TableCell>
                    <TableCell className="ds-caption">{formatDate(lc.sent_date)}</TableCell>
                    <TableCell className="ds-caption">{formatDate(lc.due_date)}</TableCell>
                    <TableCell className="ds-caption ds-numeric text-right">
                      {lc.lab_cost != null ? formatIndianRupees(lc.lab_cost) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="ds-cluster ds-cluster-sm justify-end">
                        <Button size="icon-sm" variant="ghost" aria-label="View lab case" onClick={(e) => {
                          e.stopPropagation()
                          onOpenDetail(lc)
                        }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="WhatsApp laboratory" onClick={(e) => {
                          e.stopPropagation()
                          onWhatsApp(lc)
                        }}>
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Log call" onClick={(e) => {
                          e.stopPropagation()
                          onCall(lc)
                        }}>
                          <Phone className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationBar page={data?.page ?? 1} pages={data?.pages ?? 0} total={data?.total ?? 0} onPage={setPage} />
        </SectionCard>
      )}
    </div>
  )
}

/* ── Laboratories view ────────────────────────────────────────────────── */

function LaboratoriesView({
  onEdit,
  onDelete,
  onAdd,
  canManage,
}: {
  onEdit: (lab: Laboratory) => void
  onDelete: (lab: Laboratory) => void
  onAdd: () => void
  canManage: boolean
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ["laboratories", "list", page, search, statusFilter],
    queryFn: () =>
      laboratoriesApi.list({
        page,
        page_size: 15,
        ...(search ? { search } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      }) as Promise<PaginatedResponse<Laboratory>>,
  })

  const data = query.data
  const items = useMemo(() => {
    const seen = new Set<string>()
    return (data?.items ?? []).filter((lab) => {
      if (seen.has(lab.id)) return false
      seen.add(lab.id)
      return true
    })
  }, [data?.items])

  return (
    <div className="ds-stack">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1 sm:max-w-sm">
          <SearchBar value={search} onChange={setSearch} placeholder="Search laboratories…" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => {
          setStatusFilter(v)
          setPage(1)
        }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {canManage && (
          <Button onClick={onAdd} className="ml-auto">
            <Plus className="h-4 w-4" />
            Add Laboratory
          </Button>
        )}
      </div>

      {query.isLoading && <LoadingSkeleton rows={6} variant="table" />}

      {query.isError && (
        <EmptyState
          icon={Building2}
          title="Could not load laboratories"
          description={extractDetail(query.error)}
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          }
        />
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          icon={Building2}
          title={search || statusFilter !== "all" ? "No laboratories match your filters" : "No laboratories yet"}
          description={
            search || statusFilter !== "all"
              ? "Try adjusting the search or filters."
              : "Add a laboratory to start tracking lab cases."
          }
          action={canManage && !search ? <Button onClick={onAdd}><Plus className="h-4 w-4" />Add Laboratory</Button> : undefined}
        />
      )}

      {items.length > 0 && (
        <SectionCard flush>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Laboratory</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((lab) => (
                  <TableRow key={lab.id}>
                    <TableCell>
                      <div className="font-medium text-[var(--ds-text)]">{lab.name}</div>
                      <div className="ds-caption text-[var(--ds-text-tertiary)]">{lab.code || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="ds-caption font-medium text-[var(--ds-text)]">{lab.contact_person || "—"}</div>
                      <div className="ds-caption text-[var(--ds-text-tertiary)]">{lab.address || "—"}</div>
                    </TableCell>
                    <TableCell className="ds-caption">{lab.phone || "—"}</TableCell>
                    <TableCell className="ds-caption">{lab.email || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={lab.status} />
                    </TableCell>
                    <TableCell>
                      <div className="ds-cluster ds-cluster-sm justify-end">
                        {canManage && (
                          <>
                            <Button size="icon-sm" variant="ghost" aria-label="Edit laboratory" onClick={() => onEdit(lab)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label="Delete laboratory" onClick={() => onDelete(lab)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationBar page={data?.page ?? 1} pages={data?.pages ?? 0} total={data?.total ?? 0} onPage={setPage} />
        </SectionCard>
      )}
    </div>
  )
}

/* ── Candidates view ──────────────────────────────────────────────────── */

function CandidatesView({
  onSend,
  onBatchSend,
}: {
  onSend: (candidate: LabCandidate) => void
  onBatchSend: (candidates: LabCandidate[]) => void
}) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const query = useQuery({
    queryKey: ["lab-candidates", search],
    queryFn: () => labCasesApi.candidates(search ? { search } : {}) as Promise<LabCandidate[]>,
  })

  const items = query.data ?? []
  const selectedItems = items.filter((c) => selected.has(c.treatment_plan_id))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      if (items.length > 0 && items.every((c) => prev.has(c.treatment_plan_id))) {
        return new Set()
      }
      return new Set(items.map((c) => c.treatment_plan_id))
    })
  }

  return (
    <div className="ds-stack">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1 sm:max-w-sm">
          <SearchBar value={search} onChange={setSearch} placeholder="Search patient or treatment…" />
        </div>
        {selectedItems.length > 0 && (
          <Button onClick={() => onBatchSend(selectedItems)} className="ml-auto">
            <Send className="h-4 w-4" />
            Send {selectedItems.length} to Lab via WhatsApp
          </Button>
        )}
      </div>

      {query.isLoading && <LoadingSkeleton rows={6} variant="table" />}

      {query.isError && (
        <EmptyState
          icon={Send}
          title="Could not load candidates"
          description={extractDetail(query.error)}
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          }
        />
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          icon={Send}
          title="No treatments waiting for lab"
          description={
            search
              ? "No waiting treatments match your search."
              : "Treatments marked 'Waiting for Lab' will appear here so you can send them to a laboratory."
          }
        />
      )}

      {items.length > 0 && (
        <SectionCard flush>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={items.length > 0 && items.every((c) => selected.has(c.treatment_plan_id))}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-[var(--ds-border)] accent-[var(--ds-primary)]"
                    />
                  </TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Tooth</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.treatment_plan_id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.patient_name || "treatment"}`}
                        checked={selected.has(c.treatment_plan_id)}
                        onChange={() => toggle(c.treatment_plan_id)}
                        className="h-4 w-4 rounded border-[var(--ds-border)] accent-[var(--ds-primary)]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-[var(--ds-text)]">{c.patient_name || "—"}</div>
                      <div className="ds-caption text-[var(--ds-text-tertiary)]">
                        {c.op_number ? `OP ${c.op_number}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="ds-caption">{c.treatment_name || "—"}</TableCell>
                    <TableCell className="ds-caption">{c.case_number || "—"}</TableCell>
                    <TableCell className="ds-caption">{c.doctor_name || "—"}</TableCell>
                    <TableCell className="ds-caption">{c.tooth_number || "—"}</TableCell>
                    <TableCell>
                      <div className="ds-cluster ds-cluster-sm justify-end">
                        <Button size="sm" onClick={() => onSend(c)}>
                          <Send className="h-4 w-4" />
                          Send to Lab
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

/* ── Main page ────────────────────────────────────────────────────────── */

export default function LaboratoryPage() {
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const { canManageLabs, canDeleteLabCase } = useRole()

  const [activeTab, setActiveTab] = useState("overview")

  const [detail, setDetail] = useState<LabCase | null>(null)
  const [whatsAppTarget, setWhatsAppTarget] = useState<LabCase | null>(null)
  const [callTarget, setCallTarget] = useState<LabCase | null>(null)
  const [statusTarget, setStatusTarget] = useState<LabCase | null>(null)
  const [editTarget, setEditTarget] = useState<LabCase | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LabCase | null>(null)
  const [deleteLabTarget, setDeleteLabTarget] = useState<Laboratory | null>(null)
  const [labDialog, setLabDialog] = useState<{ open: boolean; editing: Laboratory | null }>({ open: false, editing: null })
  const [sendToLabTarget, setSendToLabTarget] = useState<LabCandidate | null>(null)
  const [batchSendTargets, setBatchSendTargets] = useState<LabCandidate[]>([])

  const labsQuery = useLabs()
  const labs = labsQuery.data?.items ?? []

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["lab-cases"] })
    queryClient.invalidateQueries({ queryKey: ["laboratories"] })
    queryClient.invalidateQueries({ queryKey: ["lab-candidates"] })
    queryClient.invalidateQueries({ queryKey: ["lab-report"] })
    queryClient.invalidateQueries({ queryKey: ["treatment-plan"] })
    queryClient.invalidateQueries({ queryKey: ["treatment-plans"] })
    queryClient.invalidateQueries({ queryKey: ["treatment-plans-board"] })
  }

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => labCasesApi.remove(id),
    onSuccess: () => {
      refreshAll()
      setDeleteTarget(null)
      setDetail(null)
      addToast({ title: "Lab case deleted", variant: "success" })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  const deleteLabMutation = useMutation({
    mutationFn: (id: string) => laboratoriesApi.delete(id),
    onSuccess: () => {
      refreshAll()
      setDeleteLabTarget(null)
      addToast({ title: "Laboratory deleted", variant: "success" })
    },
    onError: (err: unknown) => {
      showErrorToast(err, addToast)
    },
  })

  return (
    <PageContainer density="tight">
      <PageHeader
        title="Laboratory"
        description="Track lab cases, laboratories and monthly laboratory reports"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setActiveTab("overview")
            }}
          >
            <Download className="h-4 w-4" />
            Monthly Report
          </Button>
        }
      />

      <PageTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        label="Laboratory sections"
        tabs={[
          { key: "overview", label: "Overview", icon: ClipboardList },
          { key: "lab-cases", label: "Lab Cases", icon: FlaskConical },
          { key: "laboratories", label: "Laboratories", icon: Building2 },
          { key: "candidates", label: "Send to Lab", icon: Send },
        ]}
      />

      <div className="mt-6" role="tabpanel" id={`tabpanel-${activeTab}`}>
        {activeTab === "overview" && <ReportView />}

        {activeTab === "lab-cases" && (
          <LabCasesView
            onOpenDetail={setDetail}
            onWhatsApp={setWhatsAppTarget}
            onCall={setCallTarget}
          />
        )}

        {activeTab === "laboratories" && (
          <LaboratoriesView
            canManage={canManageLabs}
            onAdd={() => setLabDialog({ open: true, editing: null })}
            onEdit={(lab) => setLabDialog({ open: true, editing: lab })}
            onDelete={setDeleteLabTarget}
          />
        )}

        {activeTab === "candidates" && (
          <CandidatesView
            onSend={setSendToLabTarget}
            onBatchSend={(candidates) => setBatchSendTargets(candidates)}
          />
        )}
      </div>

      <LabCaseDrawer
        labCase={detail}
        open={!!detail}
        onOpenChange={(o) => {
          if (!o) setDetail(null)
        }}
        onWhatsApp={setWhatsAppTarget}
        onCall={setCallTarget}
        onStatus={setStatusTarget}
        onEdit={setEditTarget}
        onDelete={(lc) => {
          setDetail(null)
          setDeleteTarget(lc)
        }}
        canDelete={canDeleteLabCase}
      />

      <WhatsAppDialog
        labCase={whatsAppTarget}
        open={!!whatsAppTarget}
        onOpenChange={(o) => {
          if (!o) setWhatsAppTarget(null)
        }}
        onSent={refreshAll}
      />

      <CallDialog
        labCase={callTarget}
        open={!!callTarget}
        onOpenChange={(o) => {
          if (!o) setCallTarget(null)
        }}
        onLogged={refreshAll}
      />

      <StatusDialog
        labCase={statusTarget}
        open={!!statusTarget}
        onOpenChange={(o) => {
          if (!o) setStatusTarget(null)
        }}
        onChanged={refreshAll}
      />

      <LabCaseEditDialog
        labCase={editTarget}
        labs={labs}
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null)
        }}
        onSaved={refreshAll}
      />

      <LaboratoryDialog
        laboratory={labDialog.editing}
        open={labDialog.open}
        onOpenChange={(o) => setLabDialog({ open: o, editing: labDialog.editing })}
      />

      <SendToLabDialog
        candidate={sendToLabTarget}
        labs={labs}
        open={!!sendToLabTarget}
        onOpenChange={(o) => {
          if (!o) setSendToLabTarget(null)
        }}
        onCreated={refreshAll}
      />

      <BatchSendDialog
        candidates={batchSendTargets}
        labs={labs}
        open={batchSendTargets.length > 0}
        onOpenChange={(o) => {
          if (!o) setBatchSendTargets([])
        }}
        onSent={refreshAll}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Delete this lab case?"
        description={deleteTarget ? `${deleteTarget.patient_name || "Patient"} · ${deleteTarget.treatment_name || ""} will be removed. This cannot be undone.` : undefined}
        confirmLabel="Delete lab case"
        tone="danger"
        loading={deleteCaseMutation.isPending}
        onConfirm={() => deleteTarget && deleteCaseMutation.mutate(deleteTarget.id)}
      />

      <DeleteDialog
        open={!!deleteLabTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteLabTarget(null)
        }}
        itemName={deleteLabTarget?.name || "Laboratory"}
        description="The laboratory and its reference will be removed. Lab cases already using it will be left unassigned."
        loading={deleteLabMutation.isPending}
        onConfirm={() => deleteLabTarget && deleteLabMutation.mutate(deleteLabTarget.id)}
      />
    </PageContainer>
  )
}
