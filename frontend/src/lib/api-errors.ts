export interface ApiError {
  message: string
  field?: string
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "The information provided is invalid. Please check and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "This conflicts with an existing record. Please verify your input.",
  422: "Please correct the highlighted fields and try again.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again later.",
}

export function getApiErrorMessage(error: unknown): string {
  const err = error as {
    response?: { status?: number; data?: { detail?: string | ApiError[] } }
    message?: string
    code?: string
  }

  if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
    return "Request timed out. The server may be busy — please try again."
  }

  if (!err?.response) {
    return "Unable to reach the server. Please check your connection."
  }

  const status = err.response.status
  const data = err.response.data

  if (status === 422 && Array.isArray(data?.detail)) {
    const first = data.detail[0]
    if (first?.message) return first.message
  }

  if (data?.detail && typeof data.detail === "string") {
    return data.detail
  }

  return STATUS_MESSAGES[status || 0] || "An unexpected error occurred. Please try again."
}

export function getFieldErrors(error: unknown): Record<string, string> {
  const err = error as {
    response?: { status?: number; data?: { detail?: ApiError[] } }
  }

  if (err?.response?.status !== 422 || !Array.isArray(err?.response?.data?.detail)) {
    return {}
  }

  const fieldErrors: Record<string, string> = {}
  for (const item of err.response.data.detail) {
    if (item.field && item.message) {
      fieldErrors[item.field] = item.message
    }
  }
  return fieldErrors
}
