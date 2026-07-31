import { create } from "zustand"
import { persist } from "zustand/middleware"

type Theme = "light" | "dark"

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => {
      const initial = getSystemTheme()
      if (typeof document !== "undefined") {
        applyTheme(initial)
      }
      return {
        theme: initial,
        setTheme: (theme) => {
          applyTheme(theme)
          set({ theme })
        },
        toggleTheme: () => {
          const next = get().theme === "light" ? "dark" : "light"
          applyTheme(next)
          set({ theme: next })
        },
      }
    },
    {
      name: "nushine-theme",
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          applyTheme(state.theme)
        }
      },
    }
  )
)
