import { cn } from "@/lib/utils"

const statusColorMap: Record<string, string> = {
  NEW: "ds-badge-new",
  ACTIVE: "ds-badge-active",
  UNDER_TREATMENT: "ds-badge-progress",
  FOLLOW_UP: "ds-badge-followup",
  COMPLETED: "ds-badge-completed",
  INACTIVE: "ds-badge-inactive",
  OPEN: "ds-badge-new",
  SCHEDULED: "ds-badge-scheduled",
  IN_PROGRESS: "ds-badge-progress",
  CANCELLED: "ds-badge-cancelled",
  RESCHEDULED: "ds-badge-warning",
  PENDING: "ds-badge-pending",
  PLANNED: "ds-badge-default",
  GENERATED: "ds-badge-info",
  ASSIGNED: "ds-badge-primary",
  WAITING_PATIENT: "ds-badge-warning",
  WAITING_LAB: "ds-badge-warning",
  ON_HOLD: "ds-badge-default",
  DRAFT: "ds-badge-default",
  PENDING_APPROVAL: "ds-badge-warning",
  APPROVED: "ds-badge-success",
  REJECTED: "ds-badge-danger",
  TREATMENT_IN_PROGRESS: "ds-badge-progress",
  PAID: "ds-badge-paid",
  PARTIAL: "ds-badge-partial",
  OVERDUE: "ds-badge-overdue",
  REFUNDED: "ds-badge-refunded",
  diagnosis_pending: "ds-badge-progress",
  treatment_planned: "ds-badge-progress",
  treatment_completed: "ds-badge-completed",
  no_show: "ds-badge-danger",
  confirmed: "ds-badge-scheduled",
  follow_up: "ds-badge-followup",
  in_progress: "ds-badge-progress",
}

const labelMap: Record<string, string> = {
  NEW: "New",
  ACTIVE: "Active",
  UNDER_TREATMENT: "Under Treatment",
  FOLLOW_UP: "Follow-Up",
  COMPLETED: "Completed",
  INACTIVE: "Inactive",
  OPEN: "Open",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
  PENDING: "Pending",
  PLANNED: "Planned",
  GENERATED: "Generated",
  ASSIGNED: "Assigned",
  WAITING_PATIENT: "Waiting for Patient",
  WAITING_LAB: "Waiting for Lab",
  ON_HOLD: "On Hold",
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  TREATMENT_IN_PROGRESS: "Treatment In Progress",
  PAID: "Paid",
  PARTIAL: "Partial",
  OVERDUE: "Overdue",
  REFUNDED: "Refunded",
  diagnosis_pending: "Diagnosis Pending",
  treatment_planned: "Treatment Planned",
  treatment_completed: "Treatment Completed",
  no_show: "No Show",
  confirmed: "Confirmed",
  follow_up: "Follow-Up",
  in_progress: "In Progress",
}

interface StatusBadgeProps {
  status: string
  className?: string
  showDot?: boolean
}

export function StatusBadge({ status, className, showDot = false }: StatusBadgeProps) {
  const badgeClass = statusColorMap[status] || "ds-badge-default"
  const label = labelMap[status] || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <span className={cn("ds-badge", badgeClass, className)}>
      {showDot && <span className="ds-badge-dot" />}
      {label}
    </span>
  )
}
