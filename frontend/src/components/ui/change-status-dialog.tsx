import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import api from "@/services/api"

interface ChangeStatusDialogProps {
  entityType: "patient" | "case" | "appointment" | "treatment" | "follow_up" | "billing"
  entityId: string
  currentStatus: string
  statusOptions: string[]
  onStatusChanged?: () => void
  children?: React.ReactNode
}

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
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to update status")
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
            <label className="text-sm font-medium">Current Status</label>
            <p className="text-sm text-muted-foreground">{currentStatus}</p>
          </div>
          <div>
            <label className="text-sm font-medium">New Status</label>
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
            <label className="text-sm font-medium">Reason <span className="text-red-500">*</span></label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for status change"
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
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
