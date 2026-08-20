import * as React from "react"
import { Bookmark, Check, MoreHorizontal, Save, SlidersHorizontal, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Badge } from "./badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu"

interface FilterBarProps {
  activeCount: number
  onReset: () => void
  children: React.ReactNode
  className?: string
}

/**
 * Filter toolbar. Renders as an inline row on desktop and a slide-over sheet
 * on mobile so the field grid never squeezes below usable width.
 */
export function FilterBar({ activeCount, onReset, children, className }: FilterBarProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={cn("space-y-3", className)}>
      <div className="hidden flex-wrap items-end gap-3 md:flex">
        {children}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-9 text-xs">
            <X className="h-3 w-3" aria-hidden="true" />
            Reset
          </Button>
        )}
      </div>
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
              {activeCount > 0 && (
                <Badge variant="primary" className="h-5 min-w-[20px] px-1.5">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] overflow-y-auto sm:w-[380px]" aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">{children}</div>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="flex-1">
                Close
              </Button>
              {activeCount > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onReset()
                    setOpen(false)
                  }}
                  className="flex-1"
                >
                  Reset All
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

interface FilterChipsProps {
  chips: { key: string; label: string; value: string }[]
  onRemove: (key: string) => void
  onClearAll: () => void
}

/** Active-filter chips with individual and "clear all" removal. */
export function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips
        .filter((chip) => chip.key !== "date_preset")
        .map((chip) => (
          <Badge key={chip.key} variant="default" className="gap-1 py-0.5 pl-2.5 pr-1 font-normal">
            <span className="ds-caption text-[var(--ds-text-tertiary)]">{chip.label}:</span>
            <span className="ds-body-sm text-[var(--ds-text-secondary)]">{chip.value}</span>
            <button
              type="button"
              onClick={() => onRemove(chip.key)}
              className="ds-focus-ring ml-0.5 rounded-full p-0.5 text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
              aria-label={`Remove ${chip.label} filter`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="h-6 px-2 text-xs text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]"
      >
        Clear all
      </Button>
    </div>
  )
}

interface FilterFieldProps {
  label: string
  children: React.ReactNode
  className?: string
}

/** Labelled field used inside a FilterBar. */
export function FilterField({ label, children, className }: FilterFieldProps) {
  const fieldId = React.useId()
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={fieldId} className="ds-form-label text-[var(--ds-text-tertiary)]">{label}</label>
      {children}
    </div>
  )
}

export interface SavedFilterSet {
  id: string
  name: string
  filters: Record<string, string>
}

interface SavedFiltersProps {
  /** LocalStorage key namespace, e.g. "patient-list". */
  storageKey: string
  current: Record<string, string>
  onApply: (filters: Record<string, string>) => void
}

/**
 * Persists filter combinations per module. "Save current" stores the active
 * filter set under a name; applying one restores it in one click.
 */
export function SavedFilters({ storageKey, current, onApply }: SavedFiltersProps) {
  const [sets, setSets] = React.useState<SavedFilterSet[]>(() => {
    try {
      const raw = localStorage.getItem(`appointin.saved-filters.${storageKey}`)
      return raw ? (JSON.parse(raw) as SavedFilterSet[]) : []
    } catch {
      return []
    }
  })
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const persist = (next: SavedFilterSet[]) => {
    setSets(next)
    try {
      localStorage.setItem(`appointin.saved-filters.${storageKey}`, JSON.stringify(next))
    } catch {
      // Storage may be unavailable (private mode) — the feature degrades to session-only.
    }
  }

  const activeKeys = Object.entries(current).filter(([, value]) => value && value !== "")
  const saveDisabled = activeKeys.length === 0

  function saveCurrent() {
    if (saveDisabled) return
    const trimmed = name.trim()
    const next: SavedFilterSet = {
      id: crypto.randomUUID(),
      name: trimmed || `Filter ${sets.length + 1}`,
      filters: Object.fromEntries(activeKeys),
    }
    persist([...sets, next])
    setName("")
    setSaving(false)
  }

  function removeSet(id: string) {
    persist(sets.filter((set) => set.id !== id))
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && setSaving(false)}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          <Bookmark className="h-3.5 w-3.5" />
          Saved
          {sets.length > 0 && (
            <Badge variant="default" className="h-4 min-w-[16px] px-1 text-[10px]">
              {sets.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {!saving ? (
          <DropdownMenuItem disabled={saveDisabled} onSelect={() => setSaving(true)}>
            <Save className="h-4 w-4" />
            Save current filters
          </DropdownMenuItem>
        ) : (
          <div className="flex items-center gap-1.5 p-1.5" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveCurrent()
                if (e.key === "Escape") setSaving(false)
              }}
              placeholder="Filter name"
              aria-label="Filter name"
              className="ds-focus-ring h-8 flex-1 rounded-[var(--ds-radius-lg)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] px-2 text-sm"
            />
            <Button size="icon-sm" className="h-8 w-8" onClick={saveCurrent} disabled={saveDisabled} aria-label="Save">
              <Check className="h-4 w-4" />
            </Button>
          </div>
        )}

        <DropdownMenuSeparator />

        {sets.length === 0 ? (
          <DropdownMenuLabel className="font-normal text-[var(--ds-text-tertiary)]">No saved filters yet</DropdownMenuLabel>
        ) : (
          sets.map((set) => (
            <div key={set.id} className="group relative">
              <DropdownMenuItem onSelect={() => onApply(set.filters)} className="pr-9">
                <span className="ds-truncate">{set.name}</span>
              </DropdownMenuItem>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeSet(set.id)
                }}
                className="ds-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--ds-radius-md)] p-1 text-[var(--ds-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--ds-danger)] group-hover:opacity-100"
                aria-label={`Delete saved filter ${set.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {sets.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1 font-normal text-[var(--ds-text-tertiary)]">
              <MoreHorizontal className="h-3.5 w-3.5" />
              Saved to this browser
            </DropdownMenuLabel>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
