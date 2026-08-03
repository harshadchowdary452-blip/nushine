import axios from "axios"
import { useAuthStore, getTokenExpiry } from "@/store/authStore"
import { queryClient } from "@/lib/queryClient"

// Same-origin ("/api/v1") in dev via the Vite proxy. For deployments where the
// frontend and backend are served from different origins (e.g. behind a CDN or
// tunnel), set VITE_API_BASE_URL to the backend's public URL (must be allow-listed
// in CORS_ORIGINS on the backend).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api/v1"

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
})

let refreshPromise: Promise<string> | null = null

function isTokenExpired(token: string, bufferSec = 15): boolean {
  const exp = getTokenExpiry(token)
  if (exp === null) return true
  return Date.now() / 1000 >= exp - bufferSec
}

async function ensureValidToken(): Promise<string | null> {
  const { accessToken, refreshToken } = useAuthStore.getState()
  if (!accessToken) return null
  if (!isTokenExpired(accessToken)) return accessToken

  if (!refreshToken) return null

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
      .then((res) => {
        const { access_token, refresh_token } = res.data
        useAuthStore.getState().setTokens(access_token, refresh_token)
        return access_token as string
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// Attach Authorization header with proactive token refresh
let requestCounter = 0
api.interceptors.request.use(async (config) => {
  const token = await ensureValidToken()
  if (token) {
    config.headers.Authorization = "Bearer " + token
  }
  config.headers["X-Request-ID"] = `req-${++requestCounter}-${Date.now().toString(36)}`
  const hospitalOverride = localStorage.getItem("hospital-override")
  if (hospitalOverride) {
    config.headers["X-Hospital-ID"] = hospitalOverride
  }
  return config
})

// Expose request ID from response for debugging
api.interceptors.response.use((response) => {
  const requestId = response.headers["x-request-id"]
  const responseTime = response.headers["x-response-time"]
  if (requestId && responseTime) {
    const resp = response as { requestId?: string; responseTime?: string }
    resp.requestId = requestId
    resp.responseTime = responseTime
  }
  return response
})

const forceLogout = () => {
  queryClient.clear()
  useAuthStore.getState().logout()
  if (window.location.pathname !== "/login") {
    window.location.assign("/login")
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as
      (typeof error.config & { _retry?: boolean; _contextRetry?: boolean }) | undefined

    if (!originalRequest || originalRequest._retry) {
      return Promise.reject(error)
    }

    // A forbidden hospital context (stale/forged override) must never widen access.
    // Clear the client-side override so subsequent requests fall back to the
    // user's server-validated default scope; for reads, retry once automatically.
    if (
      error.response?.status === 403 &&
      error.response?.data?.detail === "HOSPITAL_CONTEXT_DENIED"
    ) {
      localStorage.removeItem("hospital-override")
      const method = (originalRequest.method ?? "get").toLowerCase()
      if ((method === "get" || method === "head") && !originalRequest._contextRetry) {
        originalRequest._contextRetry = true
        delete originalRequest.headers?.["X-Hospital-ID"]
        return api(originalRequest)
      }
      return Promise.reject(error)
    }

    if (error.response?.status !== 401) {
      return Promise.reject(error)
    }

    if (originalRequest.url?.includes("/auth/refresh")) {
      forceLogout()
      return Promise.reject(error)
    }

    originalRequest._retry = true

    const token = await ensureValidToken()
    if (!token) {
      forceLogout()
      return Promise.reject(error)
    }

    originalRequest.headers = originalRequest.headers ?? {}
    originalRequest.headers.Authorization = "Bearer " + token
    return api(originalRequest)
  },
)

export default api
