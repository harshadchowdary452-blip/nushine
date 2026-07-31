import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/design-system/components/skeleton"
import { TooltipWrap } from "@/design-system/components/tooltip"
import { WidgetCard } from "./shell"

export interface QuickAction {
  id: string
  label: string
  description?: string
  icon: React.ElementType
  tone?: "primary" | "accent" | "success" | "warning" | "danger" | "info"
  onClick: () => void
}

const TONE_TEXT: Record<NonNullable<QuickAction["tone"]>, string> = {
  primary: "text-[var(--ds-primary)]",
  accent: "text-[var(--ds-accent)]",
  success: "text-[var(--ds-success)]",
  warning: "text-[var(--ds-warning)]",
  danger: "text-[var(--ds-danger)]",
  info: "text-[var(--ds-info)]",
}

const TONE_SOFT: Record<NonNullable<QuickAction["tone"]>, string> = {
  primary: "bg-[var(--ds-primary-subtle)]",
  accent: "bg-[var(--ds-accent-subtle)]",
  success: "bg-[var(--ds-success-subtle)]",
  warning: "bg-[var(--ds-warning-subtle)]",
  danger: "bg-[var(--ds-danger-subtle)]",
  info: "bg-[var(--ds-info-subtle)]",
}

export interface QuickActionCenterProps {
  items: QuickAction[]
  loading?: boolean
  title?: string
  description?: string
  className?: string
}

/**
 * One-tap actions for the most frequent workflows. Each action is a large
 * touch-friendly target labelled with icon + text (never icon only).
 */
export function QuickActionCenter({
  items,
  loading,
  title = "Quick Actions",
  description = "Common tasks without leaving the dashboard",
  className,
}: QuickActionCenterProps) {
  return (
    <WidgetCard title={title} description={description} className={className}>
      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="ds-caption py-6 text-center text-[var(--ds-text-tertiary)]">No quick actions for this role.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((action) => {
            const Icon = action.icon
            const tone = action.tone ?? "primary"
            return (
              <TooltipWrap key={action.id} content={action.description ?? action.label}>
                <button
                  type="button"
                  onClick={action.onClick}
                  className="ds-focus-ring group flex w-full flex-col items-start gap-2 rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-3 text-left transition-colors hover:border-[var(--ds-border-hover)] hover:bg-[var(--ds-surface-hover)]"
                >
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-[var(--ds-radius-lg)] transition-transform duration-200 group-hover:scale-110", TONE_SOFT[tone], TONE_TEXT[tone])}>
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="ds-min-w-0 w-full">
                    <span className="ds-nav-label block truncate text-[var(--ds-text)]">{action.label}</span>
                    <span className="ds-caption mt-0.5 flex items-center gap-1 text-[var(--ds-text-tertiary)]">
                      <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                      {action.description ?? "Open"}
                    </span>
                  </span>
                </button>
              </TooltipWrap>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}
