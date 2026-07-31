import { Lightbulb } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/design-system/components/badge"
import { Skeleton } from "@/design-system/components/skeleton"
import { WidgetCard } from "./shell"

export type InsightTone = "positive" | "negative" | "neutral"

export interface Insight {
  id: string
  text: string
  tone: InsightTone
}

const TONE_STYLE: Record<InsightTone, { badge: "success" | "danger" | "outline"; label: string; dot: string }> = {
  positive: { badge: "success", label: "Positive", dot: "bg-[var(--ds-success)]" },
  negative: { badge: "danger", label: "Attention", dot: "bg-[var(--ds-danger)]" },
  neutral: { badge: "outline", label: "Neutral", dot: "bg-[var(--ds-info)]" },
}

export interface BusinessInsightsProps {
  items: Insight[]
  loading?: boolean
  title?: string
  description?: string
  className?: string
}

/**
 * Auto-generated observations from the current period's data — e.g. best
 * performing day, biggest payment method, patients that need follow-up.
 */
export function BusinessInsights({
  items,
  loading,
  title = "Business Insights",
  description = "Patterns and suggestions from this period",
  className,
}: BusinessInsightsProps) {
  return (
    <WidgetCard
      title={title}
      description={description}
      className={className}
      actions={<Lightbulb className="h-4 w-4 text-[var(--ds-accent)]" aria-hidden="true" />}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="ds-caption py-6 text-center text-[var(--ds-text-tertiary)]">No insights for this period yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((insight) => {
            const style = TONE_STYLE[insight.tone]
            return (
              <li key={insight.id} className="flex items-start gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
                <div className="ds-min-w-0 flex-1">
                  <p className="ds-body text-[var(--ds-text)]">{insight.text}</p>
                  <Badge variant={style.badge} className="mt-1">{style.label}</Badge>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
