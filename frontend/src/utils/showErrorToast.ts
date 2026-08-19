interface ApiErrorResponse {
  status?: number
  data?: Record<string, unknown>
}

interface ApiError {
  response?: ApiErrorResponse
}

function isSubscriptionApiError(err: unknown): boolean {
  const e = err as ApiError
  return e?.response?.status === 403 && typeof e?.response?.data?.subscription_status === "string"
}

function getSubscriptionStatus(err: unknown): string {
  return (err as ApiError).response?.data?.subscription_status as string
}

const SUBSCRIPTION_READ_MESSAGES: Record<string, string> = {
  NO_SUBSCRIPTION: "No active subscription. Your account is read-only. Contact the super admin.",
  PAST_DUE: "Subscription payment overdue. Your account is read-only. Contact the super admin.",
  CANCELLED: "Subscription cancelled. Your account is read-only. Contact the super admin.",
  EXPIRED: "Subscription expired. Access suspended. Contact the super admin.",
}

function extractErrorDetail(err: unknown): string {
  const data = (err as ApiError).response?.data
  if (!data) return "An unexpected error occurred"
  const detail = data.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length > 0)
    return detail.map((e: Record<string, unknown>) => e.msg).filter(Boolean).join(", ")
  return "An unexpected error occurred"
}

export function showErrorToast(
  err: unknown,
  addToast: (t: { title: string; description?: string; variant: "destructive" | "success" }) => void,
) {
  if (isSubscriptionApiError(err)) {
    const subStatus = getSubscriptionStatus(err)
    addToast({
      title: subStatus === "EXPIRED" ? "Subscription Expired" : "Subscription Required",
      description: SUBSCRIPTION_READ_MESSAGES[subStatus] || "Contact the super admin.",
      variant: "destructive",
    })
    return
  }
  addToast({ title: "Error", description: extractErrorDetail(err), variant: "destructive" })
}
