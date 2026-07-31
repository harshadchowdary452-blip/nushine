import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/use-media-query"
import { Sheet, SheetContent, SheetTitle } from "./sheet"
import { Badge } from "./badge"
import type { TimelineTone } from "./timeline"

export interface DetailDrawerTab {
  key: string
  label: string
  icon?: React.ElementType
  count?: number
}

interface DetailDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  eyebrow?: React.ReactNode
  /** Header actions — rendered right of the title (must stay on-screen). */
  actions?: React.ReactNode
  tabs?: DetailDrawerTab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  /** Sticky footer with the primary save/cancel actions. */
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
  widthClassName?: string
  /** Accessible label for the dialog. */
  label?: string
}

/**
 * The reusable record drawer used across modules: right-side on desktop,
 * bottom sheet on mobile, sticky header/footer and optional tabbed body.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  actions,
  tabs,
  activeTab,
  onTabChange,
  footer,
  children,
  className,
  widthClassName = "w-full max-w-xl",
  label = "Record details",
}: DetailDrawerProps) {
  const isMobile = useMediaQuery("(max-width: 767px)")

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 pb-[env(safe-area-inset-bottom)]",
          widthClassName,
          className
        )}
        aria-describedby={undefined}
        aria-label={label}
      >
        <SheetTitle className="ds-sr-only">{title}</SheetTitle>

        <div className="shrink-0 border-b border-[var(--ds-border)]">
          <div className="flex items-start justify-between gap-4 px-6 py-5">
            <div className="ds-min-w-0">
              {eyebrow && <div className="ds-overline mb-1">{eyebrow}</div>}
              <h2 className="ds-drawer-title text-[var(--ds-text)]">{title}</h2>
              {subtitle && <p className="ds-caption mt-0.5 text-[var(--ds-text-secondary)]">{subtitle}</p>}
            </div>
            {actions && <div className="ds-cluster ds-cluster-sm shrink-0">{actions}</div>}
          </div>

          {tabs && tabs.length > 0 && (
            <div role="tablist" aria-label="Drawer sections" className="flex gap-1 overflow-x-auto px-4">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = tab.key === activeTab
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onTabChange?.(tab.key)}
                    className={cn(
                      "ds-nav-label ds-focus-ring relative flex items-center gap-1.5 whitespace-nowrap rounded-t-[var(--ds-radius-lg)] px-3.5 py-2.5 text-[var(--ds-text-tertiary)] transition-colors hover:text-[var(--ds-text-secondary)]",
                      isActive && "text-[var(--ds-text)]"
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />}
                    {tab.label}
                    {tab.count !== undefined && (
                      <span
                        className={cn(
                          "ds-badge-text inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1",
                          isActive ? "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)]" : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]"
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                    {isActive && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--ds-primary)]" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="shrink-0 border-t border-[var(--ds-border)] bg-[var(--ds-surface)] px-6 py-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}

interface DrawerSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/** A titled block inside a drawer's body. */
export function DrawerSection({ title, description, children, actions, className }: DrawerSectionProps) {
  return (
    <section className={cn("mb-6 last:mb-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="ds-min-w-0">
          <h3 className="ds-card-title text-[var(--ds-text)]">{title}</h3>
          {description && <p className="ds-caption text-[var(--ds-text-tertiary)]">{description}</p>}
        </div>
        {actions && <div className="ds-cluster ds-cluster-sm shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export interface ActivityItem {
  id: string
  title: string
  meta?: string
  tone?: TimelineTone
  icon?: React.ElementType
  onClick?: () => void
}

interface ActivityFeedProps {
  items: ActivityItem[]
  emptyTitle?: string
  className?: string
}

const ACTIVITY_TONE_ICON: Record<string, string> = {
  primary: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
  accent: "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)]",
  success: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
  info: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  neutral: "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]",
}

/** Compact activity list used inside drawers, panels and dashboards. */
export function ActivityFeed({ items, emptyTitle = "No recent activity", className }: ActivityFeedProps) {
  if (items.length === 0) {
    return <p className="ds-caption py-6 text-center text-[var(--ds-text-tertiary)]">{emptyTitle}</p>
  }
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={item.onClick}
              disabled={!item.onClick}
              className={cn(
                "flex w-full items-start gap-3 rounded-[var(--ds-radius-xl)] px-2 py-2.5 text-left transition-colors",
                item.onClick ? "hover:bg-[var(--ds-surface-hover)]" : "cursor-default"
              )}
            >
              {Icon && (
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", ACTIVITY_TONE_ICON[item.tone ?? "neutral"])}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              <span className="ds-min-w-0 flex-1">
                <span className="ds-body block truncate text-[var(--ds-text)]">{item.title}</span>
                {item.meta && <span className="ds-caption block text-[var(--ds-text-tertiary)]">{item.meta}</span>}
              </span>
              {item.onClick && <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" aria-hidden="true" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export interface RelatedRecord {
  id: string
  title: string
  subtitle?: string
  href?: string
  onClick?: () => void
  icon?: React.ElementType
  badge?: React.ReactNode
}

interface RelatedRecordsProps {
  records: RelatedRecord[]
  className?: string
}

/** Links to records related to the one shown in the drawer. */
export function RelatedRecords({ records, className }: RelatedRecordsProps) {
  if (records.length === 0) return null
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {records.map((record) => {
        const Icon = record.icon
        const content = (
          <>
            <span className="ds-min-w-0 flex-1">
              <span className="ds-body block truncate text-[var(--ds-text)]">{record.title}</span>
              {record.subtitle && <span className="ds-caption block truncate text-[var(--ds-text-tertiary)]">{record.subtitle}</span>}
            </span>
            {record.badge}
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" aria-hidden="true" />
          </>
        )
        return (
          <li key={record.id}>
            {record.href ? (
              <a
                href={record.href}
                className="flex items-center gap-3 rounded-[var(--ds-radius-xl)] px-2 py-2.5 transition-colors hover:bg-[var(--ds-surface-hover)]"
              >
                {Icon && <Icon className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" aria-hidden="true" />}
                {content}
              </a>
            ) : (
              <button
                type="button"
                onClick={record.onClick}
                className="flex w-full items-center gap-3 rounded-[var(--ds-radius-xl)] px-2 py-2.5 text-left transition-colors hover:bg-[var(--ds-surface-hover)]"
              >
                {Icon && <Icon className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)]" aria-hidden="true" />}
                {content}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

interface DrawerStatusPillProps {
  tone?: TimelineTone
  children: React.ReactNode
}

/** Status pill used in drawer headers. */
export function DrawerStatusPill({ tone = "neutral", children }: DrawerStatusPillProps) {
  const toneToBadge = tone === "danger" ? "danger" : tone === "success" ? "success" : tone === "warning" ? "warning" : tone === "info" ? "info" : tone === "accent" ? "accent" : tone === "primary" ? "primary" : "default"
  return <Badge variant={toneToBadge as "danger" | "success" | "warning" | "info" | "accent" | "primary" | "default"}>{children}</Badge>
}
