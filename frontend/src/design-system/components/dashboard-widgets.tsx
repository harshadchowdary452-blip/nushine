import * as React from "react"
import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "./skeleton"
import { Badge } from "./badge"
import { MiniSparkline } from "./charts"
import { ActivityFeed, type ActivityItem } from "./detail-drawer"

type WidgetTone = "primary" | "accent" | "success" | "warning" | "danger" | "info"

const TONE_BAR: Record<WidgetTone | "neutral", string> = {
  primary: "bg-[var(--ds-primary)]",
  accent: "bg-[var(--ds-accent)]",
  success: "bg-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger)]",
  info: "bg-[var(--ds-info)]",
  neutral: "bg-[var(--ds-surface-secondary)]",
}

const TONE_TEXT: Record<WidgetTone | "neutral", string> = {
  primary: "text-[var(--ds-primary)]",
  accent: "text-[var(--ds-accent)]",
  success: "text-[var(--ds-success)]",
  warning: "text-[var(--ds-warning)]",
  danger: "text-[var(--ds-danger)]",
  info: "text-[var(--ds-info)]",
  neutral: "text-[var(--ds-text-secondary)]",
}

const TONE_SOFT: Record<WidgetTone | "neutral", string> = {
  primary: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
  accent: "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)]",
  success: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
  info: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
  neutral: "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]",
}

interface TrendCardProps {
  title: string
  value: string
  /** Percentage change vs previous period, e.g. "+12.4%". */
  change?: string
  positive?: boolean
  periodLabel?: string
  icon?: React.ElementType
  tone?: WidgetTone
  sparkline?: number[]
  loading?: boolean
  onClick?: () => void
  className?: string
}

/** KPI-style card with a change indicator and optional sparkline. */
export function TrendCard({
  title,
  value,
  change,
  positive = true,
  periodLabel,
  icon: Icon,
  tone = "primary",
  sparkline,
  loading,
  onClick,
  className,
}: TrendCardProps) {
  if (loading) {
    return (
      <div className="rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={cn(
        "ds-hover-lift rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="ds-card-title text-[var(--ds-text-secondary)]">{title}</p>
        {Icon && (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]", TONE_TEXT[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="ds-min-w-0">
          <p className="ds-metric text-[var(--ds-text)]">{value}</p>
          <div className="ds-cluster ds-cluster-sm mt-1">
            {change && (
              <span className={cn("flex items-center gap-1 text-xs font-medium", positive ? "text-[var(--ds-success)]" : "text-[var(--ds-danger)]")}>
                {positive ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                {change}
              </span>
            )}
            {periodLabel && <span className="ds-caption text-[var(--ds-text-tertiary)]">{periodLabel}</span>}
          </div>
        </div>
        {sparkline && sparkline.length > 1 && (
          <MiniSparkline data={sparkline} id={`trend-${title.replace(/\s+/g, "-").toLowerCase()}`} height={40} className="w-24 shrink-0" />
        )}
      </div>
    </div>
  )
}

interface ProgressCardProps {
  title: string
  /** Human readable progress, e.g. "7 of 12 cases". */
  label: string
  /** 0–100. */
  value: number
  tone?: WidgetTone
  icon?: React.ElementType
  loading?: boolean
  className?: string
}

/** Progress widget with a coloured bar and numeric readout. */
export function ProgressCard({ title, label, value, tone = "primary", icon: Icon, loading, className }: ProgressCardProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]", className)}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="ds-card-title text-[var(--ds-text-secondary)]">{title}</p>
        {Icon && <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)]", TONE_TEXT[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>}
      </div>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-2 w-full" />
        </div>
      ) : (
        <>
          <p className="ds-metric text-[var(--ds-text)]">{label}</p>
          <div className="mt-2 flex items-center gap-3">
            <div
              role="progressbar"
              aria-valuenow={Math.round(clamped)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={title}
              className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--ds-surface-secondary)]"
            >
              <div className={cn("h-full rounded-full transition-[width] duration-500", TONE_BAR[tone])} style={{ width: `${clamped}%` }} />
            </div>
            <span className="ds-caption ds-numeric w-9 text-right text-[var(--ds-text-secondary)]">{Math.round(clamped)}%</span>
          </div>
        </>
      )}
    </div>
  )
}

interface ComparisonDatum {
  label: string
  value: number
}

interface ComparisonCardProps {
  title: string
  current: ComparisonDatum
  previous: ComparisonDatum
  valueLabel?: (value: number) => string
  icon?: React.ElementType
  loading?: boolean
  className?: string
}

/** Side-by-side bar comparison of two periods. */
export function ComparisonCard({ title, current, previous, valueLabel = String, icon: Icon, loading, className }: ComparisonCardProps) {
  const max = Math.max(current.value, previous.value, 1)
  return (
    <div className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="ds-card-title text-[var(--ds-text-secondary)]">{title}</p>
        {Icon && <Icon className="h-4 w-4 text-[var(--ds-text-tertiary)]" aria-hidden="true" />}
      </div>
      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {[current, previous].map((datum, index) => {
            const isCurrent = index === 0
            return (
              <div key={datum.label}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="ds-caption text-[var(--ds-text-secondary)]">{datum.label}</span>
                  <span className="ds-nav-label ds-numeric font-semibold text-[var(--ds-text)]">{valueLabel(datum.value)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--ds-surface-secondary)]">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-500", isCurrent ? "bg-[var(--ds-primary)]" : "bg-[var(--ds-text-tertiary)]")}
                    style={{ width: `${(datum.value / max) * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface UpcomingActivitiesProps {
  title?: string
  items: ActivityItem[]
  loading?: boolean
  className?: string
}

/** "Upcoming" widget showing what needs attention next. */
export function UpcomingActivities({ title = "Upcoming", items, loading, className }: UpcomingActivitiesProps) {
  return (
    <div className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]", className)}>
      <h3 className="ds-card-title mb-3 text-[var(--ds-text)]">{title}</h3>
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ActivityFeed items={items} />
      )}
    </div>
  )
}

export interface NotificationItem {
  id: string
  title: string
  meta?: string
  unread?: boolean
  tone?: WidgetTone
  icon?: React.ElementType
  time?: string
  onClick?: () => void
}

interface NotificationsFeedProps {
  items: NotificationItem[]
  loading?: boolean
  onMarkAllRead?: () => void
  className?: string
}

/** Notification feed with unread indicators and a mark-all-read action. */
export function NotificationsFeed({ items, loading, onMarkAllRead, className }: NotificationsFeedProps) {
  const unreadCount = items.filter((item) => item.unread).length
  return (
    <div className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="ds-card-title text-[var(--ds-text)]">Notifications</h3>
          {unreadCount > 0 && (
            <Badge variant="primary" className="h-5 min-w-[20px] px-1.5">{unreadCount}</Badge>
          )}
        </div>
        {unreadCount > 0 && onMarkAllRead && (
          <button type="button" onClick={onMarkAllRead} className="ds-focus-ring ds-nav-label rounded-[var(--ds-radius-lg)] px-2 py-1 text-xs text-[var(--ds-primary)] hover:bg-[var(--ds-primary-subtle)]">
            Mark all read
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="ds-caption py-6 text-center text-[var(--ds-text-tertiary)]">No notifications</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.id} className="border-b border-[var(--ds-border-light)] last:border-0">
                <button
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-start gap-3 rounded-[var(--ds-radius-lg)] px-2 py-2.5 text-left transition-colors hover:bg-[var(--ds-surface-hover)]"
                >
                  {Icon && (
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONE_SOFT[item.tone ?? "neutral"])}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                  <span className="ds-min-w-0 flex-1">
                    <span className="ds-body block text-[var(--ds-text)]">{item.title}</span>
                    {item.meta && <span className="ds-caption block text-[var(--ds-text-tertiary)]">{item.meta}</span>}
                  </span>
                  <span className="ds-cluster ds-cluster-sm shrink-0">
                    {item.time && <span className="ds-caption text-[var(--ds-text-tertiary)]">{item.time}</span>}
                    {item.unread && <span className="h-2 w-2 rounded-full bg-[var(--ds-primary)]" aria-label="Unread" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
