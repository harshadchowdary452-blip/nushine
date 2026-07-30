import { create } from "zustand"
import { persist } from "zustand/middleware"

interface FavoriteStore {
  items: string[]
  add: (path: string) => void
  remove: (path: string) => void
  toggle: (path: string) => void
  isFavorite: (path: string) => boolean
}

export const useFavoriteStore = create<FavoriteStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (path) => set((s) => ({ items: s.items.includes(path) ? s.items : [...s.items, path] })),
      remove: (path) => set((s) => ({ items: s.items.filter((p) => p !== path) })),
      toggle: (path) => {
        const items = get().items
        set({ items: items.includes(path) ? items.filter((p) => p !== path) : [...items, path] })
      },
      isFavorite: (path) => get().items.includes(path),
    }),
    { name: "nushine-favorites" }
  )
)
