import axios from "axios";
import { useAuthStore, getTokenExpiry } from "@/store/authStore";
import { queryClient } from "@/lib/queryClient";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

let refreshPromise: Promise<string> | null = null;

function isTokenExpired(token: string, bufferSec = 15): boolean {
  const exp = getTokenExpiry(token);
  if (exp === null) return true;
  return Date.now() / 1000 >= exp - bufferSec;
}

async function ensureValidToken(): Promise<string | null> {
  const { accessToken, refreshToken } = useAuthStore.getState();
  if (!accessToken) return null;
  if (!isTokenExpired(accessToken)) return accessToken;

  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = axios
      .post("/api/v1/auth/refresh", { refresh_token: refreshToken })
      .then((res) => {
        const { access_token, refresh_token } = res.data;
        useAuthStore.getState().setTokens(access_token, refresh_token);
        return access_token as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Attach Authorization header with proactive token refresh
let requestCounter = 0;
api.interceptors.request.use(async (config) => {
  const token = await ensureValidToken();
  if (token) {
    config.headers.Authorization = "Bearer " + token;
  }
  config.headers["X-Request-ID"] = `req-${++requestCounter}-${Date.now().toString(36)}`;
  return config;
});

// Expose request ID from response for debugging
api.interceptors.response.use((response) => {
  const requestId = response.headers["x-request-id"];
  const responseTime = response.headers["x-response-time"];
  if (requestId && responseTime) {
    // Attach for dev tools visibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any).requestId = requestId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any).responseTime = responseTime;
  }
  return response;
});

const forceLogout = () => {
  queryClient.clear();
  useAuthStore.getState().logout();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes("/auth/refresh")) {
      forceLogout();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const token = await ensureValidToken();
    if (!token) {
      forceLogout();
      return Promise.reject(error);
    }

    originalRequest.headers = originalRequest.headers ?? {};
    originalRequest.headers.Authorization = "Bearer " + token;
    return api(originalRequest);
  }
);

export default api;
