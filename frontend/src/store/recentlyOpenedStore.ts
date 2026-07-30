import { create } from "zustand"
import { persist } from "zustand/middleware"

interface RecentItem {
  path: string
  label: string
  timestamp: number
}

interface RecentlyOpenedStore {
  items: RecentItem[]
  push: (item: { path: string; label: string }) => void
  clear: () => void
}

const MAX_ITEMS = 8

export const useRecentlyOpenedStore = create<RecentlyOpenedStore>()(
  persist(
    (set) => ({
      items: [],
      push: (item) =>
        set((s) => {
          const filtered = s.items.filter((i) => i.path !== item.path)
          return {
            items: [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS),
          }
        }),
      clear: () => set({ items: [] }),
    }),
    { name: "nushine-recently-opened" }
  )
)
