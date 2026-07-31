export const CRM_CHANNELS = ["WHATSAPP", "SMS", "EMAIL", "PHONE", "TASK", "NOTIFICATION"] as const;
export type CRMChannel = typeof CRM_CHANNELS[number];

export const CRM_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type CRMPriority = typeof CRM_PRIORITIES[number];

export const CRM_ROLES = ["RECEPTION", "DOCTOR", "CRM_EXECUTIVE", "HOSPITAL_ADMIN"] as const;
export type CRMRole = typeof CRM_ROLES[number];

export const TRIGGER_EVENTS = [
  "PATIENT_REGISTERED",
  "APPOINTMENT_COMPLETED",
  "APPOINTMENT_MISSED",
  "TREATMENT_STARTED",
  "VISIT_COMPLETED",
  "TREATMENT_COMPLETED",
  "BILL_GENERATED",
  "PAYMENT_OVERDUE",
  "PATIENT_INACTIVE",
  "PATIENT_BIRTHDAY",
  "MANUAL",
] as const;
export type TriggerEvent = typeof TRIGGER_EVENTS[number];

export const FOLLOW_UP_STATUSES = [
  "PENDING", "CONTACTED", "COMPLETED", "CANCELLED", "RESCHEDULED",
  "SKIPPED", "FAILED", "SCHEDULED", "NO_SHOW", "OVERDUE", "ESCALATED",
  "INTERESTED", "NOT_INTERESTED", "NEEDS_MORE_TIME", "REQUESTED_CALLBACK",
  "BUSY", "NO_RESPONSE", "WRONG_NUMBER", "TREATMENT_COMPLETED", "NEEDS_REVIEW", "DONE",
] as const;

export const LEAD_STATUSES = [
  "NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_BOOKED",
  "VISITED", "CONVERTED", "LOST", "NOT_INTERESTED", "NO_RESPONSE",
] as const;

export const CAMPAIGN_STATUSES = [
  "DRAFT", "SCHEDULED", "SENDING", "SENT", "PAUSED", "CANCELLED", "COMPLETED",
] as const;

export const FOLLOW_UP_TYPES = [
  "OPD_FOLLOW_UP", "TREATMENT_FOLLOW_UP", "RECALL", "POST_SURGERY",
  "CUSTOM_FOLLOW_UP", "LEAD_FOLLOW_UP", "ENQUIRY_FOLLOW_UP",
] as const;

export const channelColors: Record<string, string> = {
  WHATSAPP: "bg-green-50 text-green-700",
  SMS: "bg-blue-50 text-blue-700",
  EMAIL: "bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)]",
  PHONE: "bg-amber-50 text-amber-700",
  TASK: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  NOTIFICATION: "bg-[var(--ds-primary-50)] text-[var(--ds-primary-700)]",
  IN_PERSON: "bg-teal-50 text-teal-700",
};

export const priorityColors: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  LOW: "bg-green-50 text-green-700",
};

export const followUpStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  CONTACTED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  RESCHEDULED: "bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)]",
  SKIPPED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-tertiary)]",
  FAILED: "bg-red-50 text-red-700",
  SCHEDULED: "bg-[var(--ds-primary-50)] text-[var(--ds-primary-700)]",
  NO_SHOW: "bg-orange-50 text-orange-700",
  OVERDUE: "bg-red-50 text-red-700",
  ESCALATED: "bg-red-100 text-red-800",
  INTERESTED: "bg-green-50 text-green-700",
  NOT_INTERESTED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  NEEDS_MORE_TIME: "bg-yellow-50 text-yellow-700",
  REQUESTED_CALLBACK: "bg-blue-50 text-blue-700",
  BUSY: "bg-orange-50 text-orange-700",
  NO_RESPONSE: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  WRONG_NUMBER: "bg-red-50 text-red-600",
  TREATMENT_COMPLETED: "bg-green-50 text-green-700",
  NEEDS_REVIEW: "bg-amber-50 text-amber-700",
  DONE: "bg-green-50 text-green-700",
};

export const leadStatusColors: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-700",
  CONTACTED: "bg-[var(--ds-accent-50)] text-[var(--ds-accent-700)]",
  INTERESTED: "bg-emerald-50 text-emerald-700",
  FOLLOW_UP_REQUIRED: "bg-amber-50 text-amber-700",
  APPOINTMENT_BOOKED: "bg-[var(--ds-primary-50)] text-[var(--ds-primary-700)]",
  VISITED: "bg-teal-50 text-teal-700",
  CONVERTED: "bg-green-100 text-green-800",
  LOST: "bg-red-50 text-red-700",
  NOT_INTERESTED: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  NO_RESPONSE: "bg-orange-50 text-orange-700",
};

export const campaignStatusColors: Record<string, string> = {
  DRAFT: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
  SCHEDULED: "bg-blue-50 text-blue-700",
  SENDING: "bg-amber-50 text-amber-700",
  SENT: "bg-green-50 text-green-700",
  PAUSED: "bg-orange-50 text-orange-700",
  CANCELLED: "bg-red-50 text-red-700",
  COMPLETED: "bg-green-100 text-green-800",
};

export function formatLabel(str: string): string {
  if (!str) return "";
  return str
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PAGE_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
} as const;
