import { formatDistanceToNow, parseISO } from "date-fns"
import { History } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/design-system/components/skeleton"
import { WidgetCard } from "./shell"

export type ActivityTone = "primary" | "accent" | "success" | "warning" | "danger" | "info"

const TONE_TEXT: Record<ActivityTone, string> = {
  primary: "text-[var(--ds-primary)]",
  accent: "text-[var(--ds-accent)]",
  success: "text-[var(--ds-success)]",
  warning: "text-[var(--ds-warning)]",
  danger: "text-[var(--ds-danger)]",
  info: "text-[var(--ds-info)]",
}

const TONE_SOFT: Record<ActivityTone, string> = {
  primary: "bg-[var(--ds-primary-subtle)]",
  accent: "bg-[var(--ds-accent-subtle)]",
  success: "bg-[var(--ds-success-subtle)]",
  warning: "bg-[var(--ds-warning-subtle)]",
  danger: "bg-[var(--ds-danger-subtle)]",
  info: "bg-[var(--ds-info-subtle)]",
}

export interface ActivityEvent {
  id: string
  description: string
  date?: string
  icon?: React.ElementType
  tone?: ActivityTone
  onClick?: () => void
}

export interface RecentActivityProps {
  items: ActivityEvent[]
  loading?: boolean
  title?: string
  description?: string
  className?: string
}

function timeAgo(date?: string): string {
  if (!date) return ""
  try {
    const parsed = parseISO(date)
    if (Number.isNaN(parsed.getTime())) return ""
    return formatDistanceToNow(parsed, { addSuffix: true })
  } catch {
    return ""
  }
}

/**
 * Latest events from across the module — new patients, appointments, billing
 * activity — newest first.
 */
export function RecentActivity({
  items,
  loading,
  title = "Recent Activity",
  description = "The latest changes across the practice",
  className,
}: RecentActivityProps) {
  return (
    <WidgetCard
      title={title}
      description={description}
      className={className}
      actions={<History className="h-4 w-4 text-[var(--ds-text-tertiary)]" aria-hidden="true" />}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="ds-caption py-8 text-center text-[var(--ds-text-tertiary)]">No recent activity for this period.</p>
      ) : (
        <ol className="relative flex flex-col gap-1" aria-label="Recent activity">
          {items.map((event) => {
            const Icon = event.icon
            const tone = event.tone ?? "info"
            return (
              <li key={event.id}>
                <div
                  role={event.onClick ? "button" : undefined}
                  tabIndex={event.onClick ? 0 : undefined}
                  onClick={event.onClick}
                  onKeyDown={event.onClick ? (e) => e.key === "Enter" && event.onClick?.() : undefined}
                  className={cn(
                    "flex items-start gap-3 rounded-[var(--ds-radius-lg)] px-2 py-2",
                    event.onClick && "ds-focus-ring cursor-pointer transition-colors hover:bg-[var(--ds-surface-hover)]"
                  )}
                >
                  {Icon && (
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONE_SOFT[tone], TONE_TEXT[tone])}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                  <div className="ds-min-w-0 flex-1">
                    <p className="ds-body text-[var(--ds-text)]">{event.description}</p>
                    {event.date && <p className="ds-caption mt-0.5 text-[var(--ds-text-tertiary)]">{timeAgo(event.date)}</p>}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </WidgetCard>
  )
}
