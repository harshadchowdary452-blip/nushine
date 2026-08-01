 
import * as React from "react"
import { useState } from "react"
import { createPortal } from "react-dom"
import {
  ArrowUpRight, ChevronDown, ChevronUp, EyeOff, FileDown, Maximize2, MoreHorizontal, Pin, PinOff, Printer, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/design-system/components/dropdown-menu"
import { TooltipWrap } from "@/design-system/components/tooltip"
import { useDashboardPersonalizationStore, makeLayout } from "@/store/dashboardPersonalizationStore"
import type { SavedDashboardView } from "@/store/dashboardPersonalizationStore"
import { WidgetCard } from "./shell"
import { downloadCSV } from "./charts"
import { printRows } from "./enterprise-charts"

/* ────────────────────────────────────────────────────────────────────────────
   useDashboardPersonalization — page-level personalization state.
   ──────────────────────────────────────────────────────────────────────────── */

export interface DashboardPersonalization {
  /** Visible widget ids, pinned first, in the persisted order. */
  orderedIds: string[]
  isPinned: (id: string) => boolean
  isHidden: (id: string) => boolean
  togglePin: (id: string) => void
  toggleHide: (id: string) => void
  moveUp: (id: string) => void
  moveDown: (id: string) => void
  reset: () => void
  views: SavedDashboardView[]
  saveView: (name: string) => void
  loadView: (viewId: string) => void
  deleteView: (viewId: string) => void
  renameView: (viewId: string, name: string) => void
}

/** Merges persisted layout with freshly added default widgets (forward-compat). */
function mergeDefaults(layout: { order: string[]; hidden: string[]; pinned: string[] }, defaults: string[]) {
  const order = [...layout.order]
  for (const id of defaults) if (!order.includes(id)) order.push(id)
  const hidden = layout.hidden.filter((id) => defaults.includes(id))
  const pinned = layout.pinned.filter((id) => defaults.includes(id))
  return { order, hidden, pinned }
}

export function useDashboardPersonalization(dashboardId: string, defaultOrder: string[]): DashboardPersonalization {
  const store = useDashboardPersonalizationStore
  const persisted = store((s) => s.layouts[dashboardId])
  const savedViews = store((s) => s.views[dashboardId]) ?? []

  const layout = React.useMemo(
    () => (persisted ? mergeDefaults(persisted, defaultOrder) : makeLayout(defaultOrder)),
    [persisted, defaultOrder],
  )

  const patch = React.useCallback(
    (update: (current: { order: string[]; hidden: string[]; pinned: string[] }) => Partial<{ order: string[]; hidden: string[]; pinned: string[] }>) => {
      store.getState().updateLayout(dashboardId, update({ ...layout }))
    },
    [store, dashboardId, layout],
  )

  const togglePin = React.useCallback(
    (id: string) => {
      if (!defaultOrder.includes(id)) return
      patch((current) => ({
        pinned: current.pinned.includes(id)
          ? current.pinned.filter((p) => p !== id)
          : [...current.pinned, id],
      }))
    },
    [patch, defaultOrder],
  )

  const toggleHide = React.useCallback(
    (id: string) => {
      if (!defaultOrder.includes(id)) return
      patch((current) => ({
        hidden: current.hidden.includes(id)
          ? current.hidden.filter((h) => h !== id)
          : [...current.hidden, id],
      }))
    },
    [patch, defaultOrder],
  )

  const move = React.useCallback(
    (id: string, dir: -1 | 1) => {
      patch((current) => {
        const order = [...current.order]
        const from = order.indexOf(id)
        const to = from + dir
        if (from < 0 || to < 0 || to >= order.length) return {}
        ;[order[from], order[to]] = [order[to], order[from]]
        return { order }
      })
    },
    [patch],
  )

  const moveUp = React.useCallback((id: string) => move(id, -1), [move])
  const moveDown = React.useCallback((id: string) => move(id, 1), [move])

  const reset = React.useCallback(() => {
    store.getState().resetLayout(dashboardId, defaultOrder)
  }, [store, dashboardId, defaultOrder])

  const saveView = React.useCallback(
    (name: string) => {
      store.getState().saveView(dashboardId, name, makeLayout(layout.order))
    },
    [store, dashboardId, layout.order],
  )

  const loadView = React.useCallback(
    (viewId: string) => {
      store.getState().applyView(dashboardId, viewId)
    },
    [store, dashboardId],
  )

  const deleteView = React.useCallback(
    (viewId: string) => {
      store.getState().deleteView(dashboardId, viewId)
    },
    [store, dashboardId],
  )

  const renameView = React.useCallback(
    (viewId: string, name: string) => {
      store.getState().renameView(dashboardId, viewId, name)
    },
    [store, dashboardId],
  )

  const orderedIds = React.useMemo(() => {
    const { order, hidden, pinned } = layout
    const visible = order.filter((id) => !hidden.includes(id))
    const pinnedSet = new Set(pinned)
    return [...visible.filter((id) => pinnedSet.has(id)), ...visible.filter((id) => !pinnedSet.has(id))]
  }, [layout])

  return {
    orderedIds,
    isPinned: (id) => layout.pinned.includes(id),
    isHidden: (id) => layout.hidden.includes(id),
    togglePin,
    toggleHide,
    moveUp,
    moveDown,
    reset,
    views: savedViews,
    saveView,
    loadView,
    deleteView,
    renameView,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   DashboardWidget — actionable widget frame (pin / move / export / print /
   fullscreen / drill-down / hide).
   ──────────────────────────────────────────────────────────────────────────── */

export interface DashboardWidgetProps {
  id: string
  title?: string
  description?: string
  icon?: React.ElementType
  className?: string
  flush?: boolean
  children: React.ReactNode
  pinned?: boolean
  onTogglePin?: () => void
  onHide?: () => void
  canMoveUp?: boolean
  onMoveUp?: () => void
  canMoveDown?: boolean
  onMoveDown?: () => void
  onDrillDown?: () => void
  exportRows?: Record<string, unknown>[]
  exportColumns?: string[]
  exportTitle?: string
  exportFilename?: string
  fullscreenContent?: React.ReactNode
}

export function DashboardWidget({
  id,
  title,
  description,
  icon,
  className,
  flush,
  children,
  pinned,
  onTogglePin,
  onHide,
  canMoveUp,
  onMoveUp,
  canMoveDown,
  onMoveDown,
  onDrillDown,
  exportRows = [],
  exportColumns = [],
  exportTitle = title ?? id,
  exportFilename,
  fullscreenContent,
}: DashboardWidgetProps) {
  const [fullscreen, setFullscreen] = useState(false)
  const filename = exportFilename ?? id.replace(/[^a-z0-9]+/gi, "_").toLowerCase()

  const actions = (
    <div className="ds-cluster ds-cluster-sm">
      {onDrillDown && (
        <TooltipWrap content="Open records">
          <Button variant="ghost" size="icon-sm" onClick={onDrillDown} aria-label="Open records">
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </TooltipWrap>
      )}
      {onTogglePin && (
        <TooltipWrap content={pinned ? "Unpin" : "Pin to top"}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onTogglePin}
            aria-label={pinned ? "Unpin widget" : "Pin widget to top"}
            aria-pressed={pinned}
            className={cn(pinned && "text-[var(--ds-primary)]")}
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
        </TooltipWrap>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Widget menu" className="text-[var(--ds-text-secondary)]">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="ds-caption text-[var(--ds-text-tertiary)]">Widget actions</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onMoveUp} disabled={!canMoveUp}>
            <ChevronUp className="h-4 w-4" aria-hidden="true" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onMoveDown} disabled={!canMoveDown}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => downloadCSV(filename, exportRows, exportColumns)}>
            <FileDown className="h-4 w-4" aria-hidden="true" /> Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => printRows(exportTitle, exportRows, exportColumns)}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Print
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFullscreen(true)}>
            <Maximize2 className="h-4 w-4" aria-hidden="true" /> Fullscreen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onHide}
            className="text-[var(--ds-danger)] focus:text-[var(--ds-danger)]"
          >
            <EyeOff className="h-4 w-4" aria-hidden="true" /> Hide widget
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  const overlay = fullscreen
    ? createPortal(
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-[var(--ds-bg)] p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${title ?? "Widget"} fullscreen`}
        >
          <header className="mb-4 flex items-center justify-between gap-3">
            <div className="ds-min-w-0">
              <h2 className="ds-card-title text-[var(--ds-text)]">{title}</h2>
              {description && <p className="ds-caption text-[var(--ds-text-tertiary)]">{description}</p>}
            </div>
            <div className="ds-cluster ds-cluster-sm shrink-0">
              <TooltipWrap content="Print">
                <Button variant="outline" size="icon-sm" onClick={() => printRows(exportTitle, exportRows, exportColumns)} aria-label="Print">
                  <Printer className="h-4 w-4" />
                </Button>
              </TooltipWrap>
              <Button variant="outline" size="icon-sm" onClick={() => setFullscreen(false)} aria-label="Close fullscreen">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <div className="ds-min-h-0 flex-1 overflow-auto">
            {fullscreenContent ?? children}
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <WidgetCard title={title} description={description} icon={icon} actions={actions} className={className} flush={flush}>
        {children}
      </WidgetCard>
      {overlay}
    </>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   SavedViewsMenu — named snapshots of a dashboard layout.
   ──────────────────────────────────────────────────────────────────────────── */

export interface SavedViewsMenuProps {
  views: SavedDashboardView[]
  onSave: (name: string) => void
  onLoad: (viewId: string) => void
  onDelete: (viewId: string) => void
  onReset: () => void
  disabled?: boolean
}

export function SavedViewsMenu({ views, onSave, onLoad, onDelete, onReset, disabled }: SavedViewsMenuProps) {
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} aria-label="Saved views">
          Views ({views.length})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="ds-caption text-[var(--ds-text-tertiary)]">Saved views</DropdownMenuLabel>
        {views.length === 0 && (
          <p className="ds-caption px-2 pb-2 text-[var(--ds-text-tertiary)]">No saved views yet.</p>
        )}
        {views.map((view) => (
          <div key={view.id} className="group flex items-center gap-1 px-1">
            <DropdownMenuItem className="ds-min-w-0 flex-1" onSelect={() => onLoad(view.id)}>
              <span className="ds-truncate">{view.name}</span>
            </DropdownMenuItem>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => onDelete(view.id)}
              aria-label={`Delete view ${view.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <DropdownMenuSeparator />
        {saving ? (
          <form
            className="flex items-center gap-1.5 px-2 pb-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (!draft.trim()) return
              onSave(draft)
              setDraft("")
              setSaving(false)
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="View name…"
              aria-label="New view name"
              className="ds-focus-ring h-8 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-2 text-sm text-[var(--ds-text)]"
            />
            <Button type="submit" size="icon-sm" className="h-8 w-8 shrink-0" aria-label="Save view">
              <Pin className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <DropdownMenuItem onSelect={() => setSaving(true)}>
            <Pin className="h-4 w-4" aria-hidden="true" /> Save current layout
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onReset} className="text-[var(--ds-danger)] focus:text-[var(--ds-danger)]">
          <X className="h-4 w-4" aria-hidden="true" /> Reset to default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
