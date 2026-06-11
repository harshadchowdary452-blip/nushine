import { Badge } from "@/components/ui/badge"

const statusColorMap: Record<string, { variant: "primary" | "success" | "info" | "warning" | "danger" | "default" | "secondary" | "destructive" | "outline", label: string }> = {
  NEW: { variant: "primary", label: "New" },
  ACTIVE: { variant: "success", label: "Active" },
  UNDER_TREATMENT: { variant: "info", label: "Under Treatment" },
  FOLLOW_UP: { variant: "warning", label: "Follow-Up" },
  COMPLETED: { variant: "success", label: "Completed" },
  INACTIVE: { variant: "default", label: "Inactive" },
  SCHEDULED: { variant: "primary", label: "Scheduled" },
  CONFIRMED: { variant: "success", label: "Confirmed" },
  IN_PROGRESS: { variant: "info", label: "In Progress" },
  CANCELLED: { variant: "danger", label: "Cancelled" },
  NO_SHOW: { variant: "danger", label: "No Show" },
  MISSED: { variant: "danger", label: "Missed" },
  RESCHEDULED: { variant: "warning", label: "Rescheduled" },
  PENDING: { variant: "warning", label: "Pending" },
  PLANNED: { variant: "secondary", label: "Planned" },
  DIAGNOSIS_PENDING: { variant: "info", label: "Diagnosis Pending" },
  TREATMENT_PLANNED: { variant: "info", label: "Treatment Planned" },
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
