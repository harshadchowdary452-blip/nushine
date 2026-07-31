import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PageContainerProps {
  children: ReactNode
  className?: string
  /**
   * `narrow` caps the content at --ds-container-narrow. Use it for forms and
   * settings, where a 1600px-wide field row separates its label from its input
   * far enough to break the association at a glance.
   */
  width?: "default" | "narrow"
  density?: "default" | "tight" | "loose"
}

export function PageContainer({ children, className, width = "default", density = "default" }: PageContainerProps) {
  return (
    <div
      className={cn(
        "ds-page ds-animate-page",
        density === "tight" && "ds-page-tight",
        density === "loose" && "ds-page-loose",
        width === "narrow" && "ds-container-narrow",
        className
      )}
    >
      {children}
    </div>
  )
}

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  /** Contextual metadata rendered above the title (status, owner, ID). */
  eyebrow?: ReactNode
  className?: string
}

/**
 * The single page-title treatment for the product.
 *
 * Renders exactly one `<h1>` per page so the document outline stays valid and
 * screen-reader users can jump straight to "what page am I on".
 */
export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[var(--ds-spacing-4)] sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="ds-min-w-0">
        {eyebrow && <div className="ds-overline mb-[var(--ds-spacing-1)]">{eyebrow}</div>}
        <h1 className="ds-page-title text-[var(--ds-text)]">{title}</h1>
        {description && (
          <p className="ds-secondary-text ds-prose mt-[var(--ds-spacing-1)]">{description}</p>
        )}
      </div>
      {actions && (
        // Actions wrap rather than overflow; on phones they stretch to full
        // width so the primary action stays thumb-reachable.
        <div className="ds-cluster ds-cluster-sm shrink-0 sm:justify-end">{actions}</div>
      )}
    </div>
  )
}

interface PageTabsProps {
  tabs: { key: string; label: string; icon?: React.ElementType; count?: number }[]
  activeTab: string
  onTabChange: (key: string) => void
  className?: string
  /** Accessible name for the tab list. */
  label?: string
}

/**
 * Tab bar with full keyboard support.
 *
 * Implements the WAI-ARIA Tabs pattern: roving tabindex (only the active tab
 * is in the tab order) plus Arrow/Home/End navigation, so the whole bar costs
 * one Tab stop instead of one per tab.
 */
export function PageTabs({ tabs, activeTab, onTabChange, className, label = "Page sections" }: PageTabsProps) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((t) => t.key === activeTab)
    if (currentIndex === -1) return

    let nextIndex: number | null = null
    switch (event.key) {
      case "ArrowRight": nextIndex = (currentIndex + 1) % tabs.length; break
      case "ArrowLeft":  nextIndex = (currentIndex - 1 + tabs.length) % tabs.length; break
      case "Home":       nextIndex = 0; break
      case "End":        nextIndex = tabs.length - 1; break
      default: return
    }

    event.preventDefault()
    const next = tabs[nextIndex]
    onTabChange(next.key)
    // Move focus with selection so the keyboard user follows the active tab.
    const el = event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab-key="${next.key}"]`)
    el?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn(
        "ds-scroll-x scrollbar-none flex gap-1 border-b border-[var(--ds-border)]",
        className
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            data-tab-key={tab.key}
            role="tab"
            type="button"
            id={`tab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "ds-nav-label ds-focus-ring relative flex items-center gap-2 whitespace-nowrap",
              "px-[var(--ds-spacing-4)] py-[var(--ds-spacing-2_5)] ds-transition-colors",
              isActive
                ? "text-[var(--ds-text)]"
                : "text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)]"
            )}
          >
            {Icon && <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "ds-badge-text ds-numeric inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5",
                  isActive
                    ? "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)]"
                    : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]"
                )}
              >
                {tab.count}
              </span>
            )}
            {/* Active state is carried by weight, colour AND this underline —
                never by colour alone (WCAG 1.4.1). */}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[var(--ds-primary)]"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export interface SectionCardProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
  /** Removes body padding — for edge-to-edge tables inside a card. */
  flush?: boolean
}

export function SectionCard({ title, description, children, className, actions, flush }: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)]",
        className
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-[var(--ds-spacing-4)] px-[var(--ds-card-padding)] pt-[var(--ds-card-padding)] pb-[var(--ds-spacing-3)]">
          <div className="ds-min-w-0">
            {title && <h2 className="ds-card-title text-[var(--ds-text)]">{title}</h2>}
            {description && <p className="ds-secondary-text mt-0.5">{description}</p>}
          </div>
          {actions && <div className="ds-cluster ds-cluster-sm shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "px-[var(--ds-card-padding)] pb-[var(--ds-card-padding)]")}>
        {children}
      </div>
    </section>
  )
}

export interface EmptyStateProps {
  icon?: React.ElementType
  title: string
  description?: string
  /** Primary call to action. */
  action?: ReactNode
  /** Secondary call to action — e.g. "Import instead", "Clear filters". */
  secondaryAction?: ReactNode
  className?: string
  size?: "default" | "compact"
}

/**
 * Empty state.
 *
 * Always explains *why* the area is empty and offers the next step. A bare
 * "No data" leaves the user unable to tell a working-but-empty screen from a
 * broken one.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "default",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-[var(--ds-spacing-6)] text-center",
        size === "compact" ? "py-[var(--ds-spacing-10)]" : "py-[var(--ds-spacing-16)]",
        className
      )}
    >
      {Icon && (
        <div className="mb-[var(--ds-spacing-4)] flex h-14 w-14 items-center justify-center rounded-[var(--ds-radius-2xl)] bg-[var(--ds-surface-secondary)]">
          <Icon className="h-7 w-7 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
      <h3 className="ds-card-title text-[var(--ds-text)]">{title}</h3>
      {description && (
        <p className="ds-secondary-text mt-[var(--ds-spacing-1)] max-w-sm">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="ds-cluster mt-[var(--ds-spacing-5)] justify-center">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}

interface LoadingSkeletonProps {
  rows?: number
  className?: string
  /**
   * Shape of the content being awaited. Matching the skeleton to the real
   * layout is what keeps CLS at zero when data lands.
   */
  variant?: "card" | "table" | "list" | "form" | "metrics"
  /** Accessible status message announced while loading. */
  label?: string
}

/**
 * Skeleton placeholder.
 *
 * Marked `aria-busy` on a live region so assistive tech announces the wait
 * once, rather than reading out a wall of empty decorative boxes.
 */
export function LoadingSkeleton({ rows = 3, className, variant = "card", label = "Loading content" }: LoadingSkeletonProps) {
  return (
    <div
      className={cn("ds-stack", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      {variant === "metrics" && (
        <div className="ds-auto-metrics">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="ds-skeleton h-[92px] rounded-[var(--ds-card-radius)]" />
          ))}
        </div>
      )}

      {variant === "table" && (
        <div className="overflow-hidden rounded-[var(--ds-table-radius)] border border-[var(--ds-border)]">
          <div className="ds-skeleton h-11 rounded-none" />
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-[var(--ds-spacing-4)] border-t border-[var(--ds-border-light)] px-[var(--ds-spacing-4)] py-[var(--ds-spacing-3)]"
            >
              <div className="ds-skeleton h-8 w-8 rounded-full" />
              <div className="ds-skeleton h-3 flex-1" />
              <div className="ds-skeleton h-3 w-24" />
              <div className="ds-skeleton h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {variant === "list" && (
        <div className="ds-stack">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-[var(--ds-spacing-3)]">
              <div className="ds-skeleton h-10 w-10 rounded-full" />
              <div className="ds-stack-sm flex-1">
                <div className="ds-skeleton h-3 w-1/3" />
                <div className="ds-skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === "form" && (
        <div className="ds-form-grid">
          {Array.from({ length: rows * 2 }).map((_, i) => (
            <div key={i} className="ds-field">
              <div className="ds-skeleton h-3 w-24" />
              <div className="ds-skeleton h-[var(--ds-input-height)] w-full rounded-[var(--ds-input-radius)]" />
            </div>
          ))}
        </div>
      )}

      {variant === "card" &&
        Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="ds-skeleton h-[120px] rounded-[var(--ds-card-radius)]" />
        ))}

      <span className="ds-sr-only">{label}</span>
    </div>
  )
}

export interface MetricCardProps {
  title: string
  value: string | number
  change?: string
  icon?: React.ElementType
  trend?: "up" | "down" | "neutral"
  className?: string
  /** Renders a skeleton in the exact final geometry — prevents layout shift. */
  loading?: boolean
}

export function MetricCard({ title, value, change, icon: Icon, trend, className, loading }: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-spacing-5)] shadow-[var(--ds-shadow-card)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-[var(--ds-spacing-3)]">
        <div className="ds-min-w-0 flex-1">
          <p className="ds-overline ds-truncate">{title}</p>

          {loading ? (
            // Height matches the rendered metric so the card does not resize.
            <div className="ds-skeleton mt-[var(--ds-spacing-2)] h-[28px] w-2/3" />
          ) : (
            <p className="ds-metric mt-[var(--ds-spacing-1)] text-[var(--ds-text)]">{value}</p>
          )}

          {change && !loading && (
            <p
              className={cn(
                "ds-caption mt-[var(--ds-spacing-1)] flex items-center gap-1 font-medium",
                trend === "up" && "text-[var(--ds-success)]",
                trend === "down" && "text-[var(--ds-danger)]",
                trend === "neutral" && "text-[var(--ds-text-tertiary)]"
              )}
            >
              {/* Direction is stated in text, not just encoded in colour. */}
              {trend && (
                <span className="ds-sr-only">
                  {trend === "up" ? "Increase:" : trend === "down" ? "Decrease:" : "No change:"}
                </span>
              )}
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ds-radius-xl)] bg-[var(--ds-primary-subtle)]">
            <Icon className="h-5 w-5 text-[var(--ds-primary)]" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  )
}
