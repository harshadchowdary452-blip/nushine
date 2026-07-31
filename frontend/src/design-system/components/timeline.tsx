import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"
import { EmptyState } from "./page-container"
import { Badge } from "./badge"

export type TimelineTone = "primary" | "accent" | "success" | "warning" | "danger" | "info" | "neutral"

const TONE_DOT: Record<TimelineTone, string> = {
  primary: "bg-[var(--ds-primary)]",
  accent: "bg-[var(--ds-accent)]",
  success: "bg-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger)]",
  info: "bg-[var(--ds-info)]",
  neutral: "bg-[var(--ds-text-tertiary)]",
}

const TONE_SOFT: Record<TimelineTone, string> = {
  primary: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
  accent: "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)]",
  success: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
  info: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  neutral: "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]",
}

export interface TimelineItem {
  id: string
  /** Event title — e.g. "Treatment plan approved". */
  title: string
  description?: string
  /** ISO date string or any string the consumer wants shown. */
  date?: string
  time?: string
  actor?: string
  status?: string
  tone?: TimelineTone
  /** Icon for the node. Falls back to a plain dot. */
  icon?: React.ElementType
  /** Optional expandable detail region. */
  details?: React.ReactNode
  actions?: React.ReactNode
  onClick?: () => void
}

interface TimelineProps {
  items: TimelineItem[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  className?: string
}

/**
 * The single reusable enterprise timeline used by patients, CRM, appointments,
 * treatments, cases and billing. Renders only the fields a consumer supplies —
 * missing values are omitted, never shown as placeholders.
 */
export function Timeline({ items, loading, emptyTitle = "No activity yet", emptyDescription = "Events will appear here as they happen.", className }: TimelineProps) {
  if (loading) {
    return (
      <div className={cn("flex flex-col gap-5", className)} role="status" aria-busy="true" aria-label="Loading timeline">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} size="compact" />
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const Icon = item.icon
        const isLast = index === items.length - 1
        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Connector line */}
            {!isLast && (
              <span aria-hidden="true" className="absolute left-4 top-9 h-[calc(100%-2rem)] w-px bg-[var(--ds-border-light)]" />
            )}
            <div
              className={cn(
                "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ds-surface)]",
                TONE_SOFT[item.tone ?? "neutral"]
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : <span className={cn("h-2 w-2 rounded-full", TONE_DOT[item.tone ?? "neutral"])} />}
            </div>

            <div
              className={cn("ds-min-w-0 flex-1", item.onClick && "cursor-pointer")}
              onClick={item.onClick}
              role={item.onClick ? "button" : undefined}
              tabIndex={item.onClick ? 0 : undefined}
              onKeyDown={item.onClick ? (e) => e.key === "Enter" && item.onClick?.() : undefined}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="ds-nav-label font-medium text-[var(--ds-text)]">{item.title}</span>
                {item.status && <Badge variant={item.tone === "danger" ? "danger" : item.tone === "success" ? "success" : item.tone === "warning" ? "warning" : item.tone === "info" ? "info" : item.tone === "accent" ? "accent" : item.tone === "primary" ? "primary" : "default"}>{item.status}</Badge>}
              </div>

              {(item.date || item.time || item.actor) && (
                <p className="ds-caption mt-0.5 text-[var(--ds-text-tertiary)]">
                  {[item.date, item.time, item.actor].filter(Boolean).join(" · ")}
                </p>
              )}

              {item.description && <p className="ds-secondary-text mt-1 text-[var(--ds-text-secondary)]">{item.description}</p>}

              {item.details && <div className="mt-2">{item.details}</div>}

              {item.actions && <div className="ds-cluster ds-cluster-sm mt-2">{item.actions}</div>}
            </div>

            {item.onClick && (
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 self-start text-[var(--ds-text-tertiary)]" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

interface TimelineItemActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export function TimelineItemAction({ className, children, ...props }: TimelineItemActionProps) {
  return (
    <button
      type="button"
      className={cn(
        "ds-focus-ring ds-nav-label inline-flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-2 py-1 text-xs text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-subtle)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
