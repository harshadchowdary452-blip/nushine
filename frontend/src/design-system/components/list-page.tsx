import type { ReactNode } from "react"
import { Search, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "./page-container"
import { LoadingSkeleton, EmptyState } from "./page-container"
import type { PageHeaderProps } from "./page-container"

export interface ListPageProps {
  title: string
  description?: string
  actions?: ReactNode
  headerProps?: Partial<PageHeaderProps>
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  filters?: ReactNode
  filterChips?: ReactNode
  loading?: boolean
  empty?: boolean
  emptyIcon?: React.ElementType
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  totalCount?: number
  totalLabel?: string
  page?: number
  totalPages?: number
  onPrevPage?: () => void
  onNextPage?: () => void
  children?: ReactNode
  className?: string
}

export function ListPage({
  title, description, actions, headerProps,
  searchValue, onSearchChange, searchPlaceholder = "Search...",
  filters, filterChips,
  loading, empty, emptyIcon, emptyTitle, emptyDescription, emptyAction,
  totalCount, totalLabel = "items",
  page, totalPages, onPrevPage, onNextPage,
  children, className,
}: ListPageProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <PageHeader title={title} description={description} actions={actions} {...headerProps} />

      {(filters || searchValue !== undefined) && (
        <div className="flex items-center gap-3 flex-wrap">
          {onSearchChange && (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
              <Input
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          )}
          {filters}
          {searchValue && onSearchChange && (
            <Button variant="ghost" size="sm" onClick={() => onSearchChange("")}>
              <RotateCcw className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {filterChips && <div className="mb-4">{filterChips}</div>}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : empty ? (
        <EmptyState icon={emptyIcon} title={emptyTitle || "No results"} description={emptyDescription} action={emptyAction} />
      ) : (
        <>
          {children}

          {(totalCount !== undefined || (page !== undefined && totalPages !== undefined && totalPages > 1)) && (
            <div className="flex items-center justify-between mt-4">
              {totalCount !== undefined && (
                <p className="text-sm text-[var(--ds-text-secondary)]">
                  {totalCount} {totalLabel}
                </p>
              )}
              {page !== undefined && totalPages !== undefined && onPrevPage && onNextPage && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={onPrevPage} disabled={page <= 1}>
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <span className="text-sm text-[var(--ds-text-secondary)] px-1">
                    {page} / {totalPages}
                  </span>
                  <Button variant="outline" size="sm" onClick={onNextPage} disabled={page >= totalPages}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export interface DetailPageProps {
  title: string
  description?: string
  actions?: ReactNode
  onBack?: () => void
  backLabel?: string
  loading?: boolean
  tabs?: { key: string; label: string; icon?: React.ElementType; count?: number }[]
  activeTab?: string
  onTabChange?: (key: string) => void
  children?: ReactNode
  className?: string
}

export function DetailPage({
  title, description, actions, onBack, backLabel = "Back",
  loading, tabs, activeTab, onTabChange,
  children, className,
}: DetailPageProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <PageHeader
        title={title}
        description={description}
        actions={actions}
      />
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-[var(--ds-text-secondary)] hover:text-[var(--ds-text)] transition-colors -mb-4">
          <ChevronLeft className="h-3.5 w-3.5" /> {backLabel}
        </button>
      )}

      {tabs && activeTab !== undefined && onTabChange && (
        <div className="flex gap-1 border-b border-[var(--ds-border)] overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = tab.key === activeTab
            return (
              <button key={tab.key} onClick={() => onTabChange(tab.key)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive ? "text-[var(--ds-text)]" : "text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)]"
                )}>
                {Icon && <Icon className="h-4 w-4" strokeWidth={1.5} />}
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold",
                    isActive ? "bg-[var(--ds-primary)] text-white" : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]"
                  )}>
                    {tab.count}
                  </span>
                )}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--ds-primary)] rounded-full" />}
              </button>
            )
          })}
        </div>
      )}

      {loading ? <LoadingSkeleton rows={3} /> : children}
    </div>
  )
}

export interface FormPageProps {
  title: string
  description?: string
  loading?: boolean
  children?: ReactNode
  saveLabel?: string
  saving?: boolean
  onSave?: () => void
  onCancel?: () => void
  cancelLabel?: string
  className?: string
}

export function FormPage({
  title, description, loading, children,
  saveLabel = "Save", saving, onSave, onCancel, cancelLabel = "Cancel",
  className,
}: FormPageProps) {
  return (
    <div className={cn("space-y-6 pb-24", className)}>
      <PageHeader title={title} description={description} />

      {loading ? <LoadingSkeleton rows={5} /> : children}

      {(onSave || onCancel) && (
        <div className="fixed bottom-0 left-0 right-0 z-[var(--ds-z-sticky)] border-t border-[var(--ds-border)] bg-[var(--ds-surface)] px-6 py-3 flex items-center justify-end gap-3 shadow-[var(--ds-shadow-elevated)]"
          style={{ marginLeft: "var(--ds-sidebar-width)" }}>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          )}
          {onSave && (
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : saveLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
