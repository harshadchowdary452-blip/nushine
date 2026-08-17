import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface RecentItem {
  kind: string
  id: string
  title: string
  subtitle?: string
  path: string
  ts: number
}

interface RecentItemsState {
  items: RecentItem[]
  track: (item: Omit<RecentItem, "ts">) => void
  clear: () => void
  remove: (kind: string, id: string) => void
}

const MAX_RECENTS = 20

export const useRecentItemsStore = create<RecentItemsState>()(
  persist(
    (set, get) => ({
      items: [],
      track: (item) => {
        const key = `${item.kind}:${item.id}`
        const remaining = get().items.filter(
          (r) => `${r.kind}:${r.id}` !== key
        )
        set({ items: [{ ...item, ts: Date.now() }, ...remaining].slice(0, MAX_RECENTS) })
      },
      clear: () => set({ items: [] }),
      remove: (kind, id) =>
        set({
          items: get().items.filter((r) => !(r.kind === kind && r.id === id)),
        }),
    }),
    { name: "appointin-recent-items", version: 1 }
  )
)

export function recentItemsByKind(kind?: string): RecentItem[] {
  const items = useRecentItemsStore.getState().items
  return kind ? items.filter((r) => r.kind === kind) : items
}
