import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * Per-dashboard widget personalization.
 *
 * Each dashboard owns a layout keyed by its id: an explicit ordering, plus the
 * set of hidden and pinned widget ids. Users can additionally snapshot the
 * current layout as a named saved view. Everything persists to localStorage so
 * a user's arrangement follows them across sessions. The admin default is
 * derived per page and can always be restored via `resetLayout`.
 */

export interface DashboardLayout {
  version: number
  order: string[]
  hidden: string[]
  pinned: string[]
}

export interface SavedDashboardView {
  id: string
  name: string
  layout: DashboardLayout
  createdAt: string
}

export const DEFAULT_LAYOUT_VERSION = 1

export function makeLayout(order: string[]): DashboardLayout {
  return { version: DEFAULT_LAYOUT_VERSION, order, hidden: [], pinned: [] }
}

interface PersonalizationState {
  layouts: Record<string, DashboardLayout>
  views: Record<string, SavedDashboardView[]>
  updateLayout: (dashboardId: string, patch: Partial<DashboardLayout>) => void
  resetLayout: (dashboardId: string, defaultOrder: string[]) => void
  saveView: (dashboardId: string, name: string, layout: DashboardLayout) => void
  deleteView: (dashboardId: string, viewId: string) => void
  applyView: (dashboardId: string, viewId: string) => void
  renameView: (dashboardId: string, viewId: string, name: string) => void
}

export const useDashboardPersonalizationStore = create<PersonalizationState>()(
  persist(
    (set, get) => ({
      layouts: {},
      views: {},

      updateLayout: (dashboardId, patch) =>
        set((state) => {
          const current = state.layouts[dashboardId] ?? makeLayout([])
          return {
            layouts: {
              ...state.layouts,
              [dashboardId]: { ...current, ...patch },
            },
          }
        }),

      resetLayout: (dashboardId, defaultOrder) =>
        set((state) => ({
          layouts: { ...state.layouts, [dashboardId]: makeLayout(defaultOrder) },
        })),

      saveView: (dashboardId, name, layout) =>
        set((state) => {
          const views = state.views[dashboardId] ?? []
          const view: SavedDashboardView = {
            id: `view_${Date.now()}`,
            name: name.trim() || `View ${views.length + 1}`,
            layout: { ...layout, order: [...layout.order], hidden: [...layout.hidden], pinned: [...layout.pinned] },
            createdAt: new Date().toISOString(),
          }
          return { views: { ...state.views, [dashboardId]: [...views, view] } }
        }),

      deleteView: (dashboardId, viewId) =>
        set((state) => ({
          views: {
            ...state.views,
            [dashboardId]: (state.views[dashboardId] ?? []).filter((v) => v.id !== viewId),
          },
        })),

      applyView: (dashboardId, viewId) => {
        const view = (get().views[dashboardId] ?? []).find((v) => v.id === viewId)
        if (view) get().updateLayout(dashboardId, view.layout)
      },

      renameView: (dashboardId, viewId, name) =>
        set((state) => ({
          views: {
            ...state.views,
            [dashboardId]: (state.views[dashboardId] ?? []).map((v) =>
              v.id === viewId ? { ...v, name: name.trim() || v.name } : v
            ),
          },
        })),
    }),
    { name: "appointin-dashboard-personalization" },
  ),
)
