import { create } from "zustand"

interface SearchStore {
  open: boolean
  setOpen: (val: boolean) => void
  toggle: () => void
}

export const useSearchStore = create<SearchStore>((set) => ({
  open: false,
  setOpen: (val) => set({ open: val }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
