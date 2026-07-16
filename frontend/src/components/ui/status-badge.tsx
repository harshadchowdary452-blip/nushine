import { Badge } from "@/components/ui/badge"

const statusColorMap: Record<string, { variant: "primary" | "success" | "info" | "warning" | "danger" | "default" | "secondary" | "destructive" | "outline", label: string }> = {
  NEW: { variant: "primary", label: "New" },
  ACTIVE: { variant: "success", label: "Active" },
  UNDER_TREATMENT: { variant: "info", label: "Under Treatment" },
  FOLLOW_UP: { variant: "warning", label: "Follow-Up" },
  COMPLETED: { variant: "success", label: "Completed" },
  INACTIVE: { variant: "default", label: "Inactive" },
  OPEN: { variant: "primary", label: "Open" },
  SCHEDULED: { variant: "primary", label: "Scheduled" },
  IN_PROGRESS: { variant: "info", label: "In Progress" },
  CANCELLED: { variant: "danger", label: "Cancelled" },
  RESCHEDULED: { variant: "warning", label: "Rescheduled" },
  PENDING: { variant: "warning", label: "Pending" },
  PLANNED: { variant: "secondary", label: "Planned" },
  GENERATED: { variant: "info", label: "Generated" },
  ASSIGNED: { variant: "primary", label: "Assigned" },
  WAITING_PATIENT: { variant: "warning", label: "Waiting for Patient" },
  WAITING_LAB: { variant: "warning", label: "Waiting for Lab" },
  ON_HOLD: { variant: "secondary", label: "On Hold" },
  DRAFT: { variant: "secondary", label: "Draft" },
  PENDING_APPROVAL: { variant: "warning", label: "Pending Approval" },
  APPROVED: { variant: "success", label: "Approved" },
  REJECTED: { variant: "danger", label: "Rejected" },
  TREATMENT_IN_PROGRESS: { variant: "info", label: "Treatment In Progress" },
  PAID: { variant: "success", label: "Paid" },
  PARTIAL: { variant: "warning", label: "Partial" },
  OVERDUE: { variant: "danger", label: "Overdue" },
  REFUNDED: { variant: "secondary", label: "Refunded" },
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusColorMap[status] || { variant: "default" as const, label: status }
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}
