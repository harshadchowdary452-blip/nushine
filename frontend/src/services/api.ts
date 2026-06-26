import axios from "axios";
import { useAuthStore } from "@/store/authStore";
import { queryClient } from "@/lib/queryClient";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const state = useAuthStore.getState();
  if (state._hasHydrated && state.accessToken) {
    config.headers.Authorization = "Bearer " + state.accessToken;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

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

    try {
      if (!refreshPromise) {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          forceLogout();
          return Promise.reject(error);
        }

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

      const accessToken = await refreshPromise;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = "Bearer " + accessToken;
      return api(originalRequest);
    } catch {
      forceLogout();
      return Promise.reject(error);
    }
  }
);

export default api;
