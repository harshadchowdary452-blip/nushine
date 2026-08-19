import { create } from "zustand"

export type SubStatus = "ACTIVE" | "TRIAL" | "PAST_DUE" | "EXPIRED" | "CANCELLED" | "NO_SUBSCRIPTION" | null

interface SubscriptionState {
  status: SubStatus
  message: string | null
  blockedAt: number | null
  setStatus: (status: SubStatus, message?: string | null) => void
  clearBlocked: () => void
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  status: null,
  message: null,
  blockedAt: null,
  setStatus: (status, message = null) =>
    set((s) => ({
      status,
      message,
      blockedAt: status && status !== "ACTIVE" && status !== "TRIAL" ? Date.now() : null,
    })),
  clearBlocked: () => set({ status: null, message: null, blockedAt: null }),
}))
