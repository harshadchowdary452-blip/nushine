import { Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/design-system/components/skeleton"
import { WidgetCard } from "./shell"

export interface PerformerDatum {
  id?: string
  name: string
  value: string
  /** Secondary line, e.g. "₹1.2L · 34 patients". */
  subtitle?: string
  onClick?: () => void
}

export interface DepartmentPerformanceProps {
  items: PerformerDatum[]
  loading?: boolean
  title?: string
  description?: string
  className?: string
}

const RANK_STYLE = [
  "bg-[var(--ds-accent-100)] text-[var(--ds-accent-700)]",
  "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]",
  "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
]

/**
 * Ranked leaderboard of entities — hospitals, doctors or treatment types —
 * for the current period. Rows are clickable for drill-down.
 */
export function DepartmentPerformance({
  items,
  loading,
  title = "Department Performance",
  description = "Ranked by revenue for this period",
  className,
}: DepartmentPerformanceProps) {
  return (
    <WidgetCard
      title={title}
      description={description}
      className={className}
      actions={<Trophy className="h-4 w-4 text-[var(--ds-accent)]" aria-hidden="true" />}
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="ds-caption py-8 text-center text-[var(--ds-text-tertiary)]">No performance data for this period.</p>
      ) : (
        <ol className="flex flex-col" aria-label={title}>
          {items.map((item, i) => {
            const rank = i + 1
            return (
              <li key={item.id ?? `${item.name}-${i}`}>
                <div
                  role={item.onClick ? "button" : undefined}
                  tabIndex={item.onClick ? 0 : undefined}
                  onClick={item.onClick}
                  onKeyDown={item.onClick ? (e) => e.key === "Enter" && item.onClick?.() : undefined}
                  className={cn(
                    "relative flex items-center gap-3 overflow-hidden rounded-[var(--ds-radius-lg)] px-2 py-2.5",
                    item.onClick && "ds-focus-ring cursor-pointer transition-colors hover:bg-[var(--ds-surface-hover)]"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      RANK_STYLE[Math.min(i, 2)]
                    )}
                    aria-label={`Rank ${rank}`}
                  >
                    {rank}
                  </span>
                  <div className="ds-min-w-0 flex-1">
                    <p className="ds-body truncate text-[var(--ds-text)]">{item.name}</p>
                    {item.subtitle && <p className="ds-caption truncate text-[var(--ds-text-tertiary)]">{item.subtitle}</p>}
                  </div>
                  <span className="ds-nav-label ds-numeric shrink-0 text-[var(--ds-text)]">{item.value}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </WidgetCard>
  )
}
