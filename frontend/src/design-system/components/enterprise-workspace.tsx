import * as React from "react"
import { ArrowUpRight, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageHeader } from "./page-container"
import { FilterChips, SavedFilters } from "./filters"
import { DetailDrawer, type DetailDrawerTab } from "./detail-drawer"
import { Button } from "./button"
import { Input } from "./input"

/**
 * The single Enterprise Workspace list shell (Part 3C).
 *
 * Every module page (Patients, Doctors, Appointments, Cases, Treatments,
 * Billing, CRM, Hospitals, Reports, Settings, Administration, Analytics) opts
 * into this one composition so list pages share one layout, one sticky module
 * toolbar, one filter experience and one quick-view (master/detail peek)
 * behaviour — instead of each module building its own header/card/table stack.
 *
 * The shell is intentionally presentational: state (filters, page, sort,
 * quick view target) is owned by the module via `useServerFilters` and its own
 * queries, then handed down as props. This keeps zero module-specific logic
 * inside the shell so it stays reusable everywhere.
 */

export interface WorkspaceSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Accessible label; falls back to the placeholder. */
  ariaLabel?: string
}

export interface WorkspaceFiltersProps {
  /** Filter field grid (e.g. <PatientFilterBar/>). Rendered inside the sticky toolbar. */
  fields?: React.ReactNode
  /** Active filter chips — shaped like `useServerFilters` `activeChips`. */
  chips: { key: string; label: string; value: string }[]
  activeCount: number
  onRemoveChip: (key: string) => void
  onClearAll: () => void
  /** Enables the saved-filters control in the results meta row. */
  savedStorageKey?: string
  savedCurrent?: Record<string, string>
  onApplySaved?: (filters: Record<string, string>) => void
}

export interface QuickViewProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  eyebrow?: React.ReactNode
  /** Status pill rendered in the drawer footer. */
  statusPill?: React.ReactNode
  /** Header actions rendered right of the title. */
  actions?: React.ReactNode
  openLabel?: string
  onOpenFull?: () => void
  tabs?: DetailDrawerTab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  children?: React.ReactNode
  /** Overrides the default footer (status pill + "Open full record"). */
  footer?: React.ReactNode
  label?: string
  widthClassName?: string
}

export interface EnterpriseWorkspaceProps {
  title: string
  description?: string
  eyebrow?: React.ReactNode
  /** Page-header actions (primary CTAs, exports). */
  headerActions?: React.ReactNode
  /** Right side of the sticky module toolbar (e.g. export, refresh). */
  toolbarActions?: React.ReactNode
  search?: WorkspaceSearchProps
  filters?: WorkspaceFiltersProps
  totalCount?: number
  totalLabel?: string
  /** Generic master/detail peek drawer — open it without navigating away. */
  quickView?: QuickViewProps
  children?: React.ReactNode
  className?: string
  /** Freezes the toolbar row below the page header while the grid scrolls. */
  stickyToolbar?: boolean
}

/**
 * The generic record peek drawer. Use for master/detail quick view: click a
 * row, see the record, then jump to the full detail page with one action.
 */
export function QuickPreviewDrawer({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  statusPill,
  actions,
  openLabel = "Open full record",
  onOpenFull,
  tabs,
  activeTab,
  onTabChange,
  children,
  footer,
  label = "Quick view",
  widthClassName = "w-full max-w-xl",
}: QuickViewProps) {
  const resolvedFooter =
    footer ??
    (onOpenFull || statusPill ? (
      <div className="flex items-center justify-between gap-3">
        {statusPill}
        {onOpenFull && (
          <Button onClick={onOpenFull} className="gap-1.5">
            {openLabel}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    ) : undefined)

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      actions={actions}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
      label={label}
      widthClassName={widthClassName}
      footer={resolvedFooter}
    >
      {children}
    </DetailDrawer>
  )
}

/**
 * Enterprise list workspace: sticky page header → sticky module toolbar
 * (search + filters) → filter chips → results meta (count + saved filters) →
 * data grid → quick view drawer.
 */
export function EnterpriseWorkspace({
  title,
  description,
  eyebrow,
  headerActions,
  toolbarActions,
  search,
  filters,
  totalCount,
  totalLabel = "records",
  quickView,
  children,
  className,
  stickyToolbar = true,
}: EnterpriseWorkspaceProps) {
  const hasToolbar = !!search || !!filters?.fields || !!toolbarActions
  const hasMetaRow = totalCount !== undefined || !!filters?.savedStorageKey

  return (
    <div className={cn("flex min-h-full flex-col", className)}>
      <PageHeader title={title} description={description} eyebrow={eyebrow} actions={headerActions} />

      {hasToolbar && (
        <div
          className={cn(
            "flex flex-col gap-3",
            "-mx-[var(--ds-container-padding-sm)] sm:-mx-[var(--ds-container-padding)] lg:-mx-[var(--ds-container-padding-lg)]",
            "px-[var(--ds-container-padding-sm)] sm:px-[var(--ds-container-padding)] lg:px-[var(--ds-container-padding-lg)]",
            stickyToolbar &&
              "sticky top-0 z-20 border-b border-[var(--ds-border)] bg-[var(--ds-background)] shadow-[var(--ds-shadow-xs)]"
          )}
        >
          <div className="flex flex-wrap items-end justify-between gap-3 py-4">
            <div className="flex flex-wrap items-end gap-3">
              {search && (
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-tertiary)]"
                    aria-hidden="true"
                  />
                  <Input
                    value={search.value}
                    onChange={(e) => search.onChange(e.target.value)}
                    placeholder={search.placeholder ?? "Search…"}
                    aria-label={search.ariaLabel ?? search.placeholder ?? "Search"}
                    className="h-9 w-64 max-w-full pl-9 pr-8 text-sm"
                  />
                  {search.value && (
                    <button
                      type="button"
                      onClick={() => search.onChange("")}
                      className="ds-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--ds-radius-md)] p-1 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)]"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              {filters?.fields}
            </div>

            {toolbarActions && <div className="ds-cluster ds-cluster-sm shrink-0">{toolbarActions}</div>}
          </div>

          {filters && filters.chips.length > 0 && (
            <div className="pb-4">
              <FilterChips chips={filters.chips} onRemove={filters.onRemoveChip} onClearAll={filters.onClearAll} />
            </div>
          )}
        </div>
      )}

      {hasMetaRow && (
        <div className="flex items-center justify-between gap-3">
          {totalCount !== undefined ? (
            <p className="ds-caption text-[var(--ds-text-secondary)]">
              Showing{" "}
              <span className="ds-numeric font-medium text-[var(--ds-text)]">{totalCount}</span> {totalLabel}
            </p>
          ) : (
            <span />
          )}
          {filters?.savedStorageKey && (
            <SavedFilters
              storageKey={filters.savedStorageKey}
              current={filters.savedCurrent ?? {}}
              onApply={filters.onApplySaved ?? (() => {})}
            />
          )}
        </div>
      )}

      <div className="flex-1">{children}</div>

      {quickView && <QuickPreviewDrawer {...quickView} />}
    </div>
  )
}
