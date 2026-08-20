import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, XCircle, Phone, ShieldAlert } from "lucide-react"
import { useSubscriptionStore, type SubStatus } from "@/store/subscriptionStore"
import { useAuthStore } from "@/store/authStore"

interface SubscriptionStatusResponse {
  subscription_status: string
  detail?: string
}

function useMySubscriptionStatus() {
  return useQuery({
    queryKey: ["my-subscription-status"],
    queryFn: async (): Promise<SubscriptionStatusResponse | null> => {
      try {
        const { default: api } = await import("@/services/api")
        const res = await api.get("/subscriptions/me/status")
        return res.data
      } catch {
        return null
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

const BLOCKED_STATUSES: SubStatus[] = ["PAST_DUE", "NO_SUBSCRIPTION", "CANCELLED"]

function mergeStatus(pollStatus: string | null, storeStatus: SubStatus): SubStatus {
  if (storeStatus) return storeStatus
  if (pollStatus) return pollStatus as SubStatus
  return null
}

const STATUS_MESSAGES: Record<string, { title: string; detail: string; icon: React.ElementType; bg: string; border: string; text: string }> = {
  NO_SUBSCRIPTION: {
    title: "No Active Subscription",
    detail: "Your account is on read-only mode. You can view data but cannot create or modify records. Please contact the super admin to assign a subscription.",
    icon: ShieldAlert,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  PAST_DUE: {
    title: "Subscription Past Due",
    detail: "Your subscription payment is overdue. Your account is read-only until payment is recorded. Please contact the super admin.",
    icon: AlertTriangle,
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
  },
  CANCELLED: {
    title: "Subscription Cancelled",
    detail: "Your subscription has been cancelled. Your account is read-only. Please contact the super admin to restore access.",
    icon: AlertTriangle,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
  },
  EXPIRED: {
    title: "Subscription Expired",
    detail: "Your subscription has expired and access has been suspended. Please contact the super admin to reactivate.",
    icon: XCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
  },
}

export function SubscriptionReadOnlyBanner() {
  const role = useAuthStore((s) => s.user?.role)
  if (role === "SUPER_ADMIN") return null

  const { data: pollData } = useMySubscriptionStatus()
  const storeStatus = useSubscriptionStore((s) => s.status)

  const status = mergeStatus(pollData?.subscription_status ?? null, storeStatus)
  if (!status || !BLOCKED_STATUSES.includes(status)) return null

  const msg = STATUS_MESSAGES[status] ?? STATUS_MESSAGES.NO_SUBSCRIPTION
  const Icon = msg.icon

  return (
    <div className={`sticky top-0 z-50 flex items-center gap-3 ${msg.bg} border-b ${msg.border} px-4 py-2.5 text-sm ${msg.text}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <p className="flex-1">
        <span className="font-semibold">{msg.title}</span>{" "}
        {msg.detail}
      </p>
      <a href="mailto:superadmin@appointin.com" className="flex items-center gap-1 text-xs font-medium underline hover:no-underline shrink-0">
        <Phone className="h-3 w-3" /> Contact Admin
      </a>
    </div>
  )
}

export function SubscriptionExpiredOverlay() {
  const role = useAuthStore((s) => s.user?.role)
  if (role === "SUPER_ADMIN") return null

  const { data: pollData } = useMySubscriptionStatus()
  const storeStatus = useSubscriptionStore((s) => s.status)

  const status = mergeStatus(pollData?.subscription_status ?? null, storeStatus)
  if (status !== "EXPIRED") return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Subscription Expired</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your subscription has expired and all access has been suspended. You cannot view or modify any data.
        </p>
        <a
          href="mailto:superadmin@appointin.com"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Phone className="h-4 w-4" /> Contact Super Admin
        </a>
      </div>
    </div>
  )
}

export function useIsSubscriptionBlocked() {
  const role = useAuthStore((s) => s.user?.role)
  if (role === "SUPER_ADMIN") return false

  const { data: pollData } = useMySubscriptionStatus()
  const storeStatus = useSubscriptionStore((s) => s.status)
  const status = mergeStatus(pollData?.subscription_status ?? null, storeStatus)
  return status !== null && status !== "ACTIVE" && status !== "TRIAL"
}

export function useSubscriptionBlockedMessage(): { blocked: boolean; title: string; detail: string } | null {
  const role = useAuthStore((s) => s.user?.role)
  if (role === "SUPER_ADMIN") return null

  const { data: pollData } = useMySubscriptionStatus()
  const storeStatus = useSubscriptionStore((s) => s.status)
  const status = mergeStatus(pollData?.subscription_status ?? null, storeStatus)
  if (!status || status === "ACTIVE" || status === "TRIAL") return null
  const msg = STATUS_MESSAGES[status] ?? STATUS_MESSAGES.NO_SUBSCRIPTION
  return { blocked: true, title: msg.title, detail: msg.detail }
}
