import { create } from "zustand";

interface SidebarState {
  collapsed: boolean;
  mobileOpen: boolean;
  bottomNavOpen: boolean;
  toggle: () => void;
  setMobileOpen: (open: boolean) => void;
  setBottomNavOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  mobileOpen: false,
  bottomNavOpen: false,
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  setMobileOpen: (open) => set({ mobileOpen: open }),
  setBottomNavOpen: (open) => set({ bottomNavOpen: open }),
}));
