import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./dialog"
import { Button } from "./button"
import { Textarea } from "./textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { Label } from "./label"
import api from "@/services/api"
import { extractDetail } from "@/types"

interface ChangeStatusDialogProps {
  entityType: "patient" | "case" | "appointment" | "treatment" | "follow_up" | "billing"
  entityId: string
  currentStatus: string
  statusOptions: string[]
  onStatusChanged?: () => void
  children?: React.ReactNode
}

/** Override dialog for any entity's status, requiring a reason. */
export function ChangeStatusDialog({
  entityType,
  entityId,
  currentStatus,
  statusOptions,
  onStatusChanged,
  children,
}: ChangeStatusDialogProps) {
  const [open, setOpen] = useState(false)
  const [newStatus, setNewStatus] = useState(currentStatus)
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Reason is required")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const response = await api.post("/status/override", {
        entity_type: entityType,
        entity_id: entityId,
        new_status: newStatus,
        reason: reason.trim(),
      })
      if (response.status === 200 || response.status === 201) {
        setOpen(false)
        onStatusChanged?.()
      }
    } catch (err: unknown) {
      setError(extractDetail(err) || "Failed to update status")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button variant="outline" size="sm">Change Status</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="ds-form-label">Current Status</Label>
            <p className="ds-body-sm text-[var(--ds-text-tertiary)]">{currentStatus}</p>
          </div>
          <div>
            <Label className="ds-form-label">New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="ds-form-label">
              Reason <span className="text-[var(--ds-danger)]">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for status change"
              rows={3}
            />
          </div>
          {error && <p className="ds-body-sm text-[var(--ds-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Updating..." : "Update Status"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
