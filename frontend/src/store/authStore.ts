import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

export function getTokenExpiry(token: string): number | null {
  try {
    const body = JSON.parse(atob(token.split(".")[1]));
    return body.exp ?? null;
  } catch {
    return null;
  }
}

export function useIsAuthenticated() {
  const { user, accessToken, refreshToken } = useAuthStore();
  return !!user && !!accessToken && !!refreshToken;
}
