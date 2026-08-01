 
import * as React from "react"
import { AlertTriangle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/design-system/components/badge"
import { Skeleton } from "@/design-system/components/skeleton"
import { WidgetCard } from "./shell"

export type SummaryTone = "positive" | "negative" | "mixed"

export interface SummaryMetric {
  label: string
  value: string
  /** Percentage change vs the previous period. */
  change?: number | null
  /** False when a rise is bad (e.g. expenses, pending billing). */
  positiveIsGood?: boolean
}

export interface SummaryHighlight {
  icon?: React.ElementType
  label: string
  text: string
}

export interface ExecutiveSummaryProps {
  title?: string
  description?: string
  metrics: SummaryMetric[]
  highlights?: SummaryHighlight[]
  caution?: string
  loading?: boolean
  className?: string
  /** Renders the narrative only (no card chrome) so an outer widget can own the card. */
  bare?: boolean
}

/** Derives an overall tone from the metric deltas (rules only, no AI). */
export function buildSummaryTone(metrics: SummaryMetric[]): SummaryTone {
  let good = 0
  let bad = 0
  for (const m of metrics) {
    if (m.change === undefined || m.change === null) continue
    const rise = m.change > 0.5
    const positive = m.positiveIsGood !== false
    if (rise === positive) good++
    else if (rise !== positive) bad++
  }
  if (good > 0 && bad === 0) return "positive"
  if (bad > 0 && good === 0) return "negative"
  return "mixed"
}

const dir = (c: number) => (c > 0.5 ? "rose" : c < -0.5 ? "fell" : "held steady")
const pct = (c: number) => `${Math.abs(c).toFixed(1)}%`

/** Builds a lead sentence from up to two period metrics. */
export function buildLeadSentence(metrics: SummaryMetric[]): string {
  const withChange = metrics.filter((m) => m.change !== undefined && m.change !== null)
  const [first, second] = withChange.length > 0 ? withChange : metrics

  if (!first) return "No period metrics available yet."

  if (first.change === undefined || first.change === null) {
    const tail = second && second.change !== undefined && second.change !== null
      ? ` ${second.label} ${dir(second.change)} ${pct(second.change)} to ${second.value}.`
      : ""
    return `${first.label} stood at ${first.value} for the selected period.${tail}`
  }

  const lead = `${first.label} ${dir(first.change)} ${pct(first.change)} to ${first.value} vs the previous period.`
  if (second && second.change !== undefined && second.change !== null) {
    return `${lead} Meanwhile, ${second.label} ${dir(second.change)} ${pct(second.change)} to ${second.value}.`
  }
  return lead
}

const TONE_BADGE: Record<SummaryTone, { badge: "success" | "danger" | "outline"; label: string; className: string }> = {
  positive: { badge: "success", label: "Healthy period", className: "border-[var(--ds-success)]/30 bg-[var(--ds-success)]/10 text-[var(--ds-success)]" },
  negative: { badge: "danger", label: "Needs attention", className: "border-[var(--ds-danger)]/30 bg-[var(--ds-danger)]/10 text-[var(--ds-danger)]" },
  mixed: { badge: "outline", label: "Mixed results", className: "border-[var(--ds-info)]/30 bg-[var(--ds-info)]/10 text-[var(--ds-info)]" },
}

/**
 * Executive Summary — a short rule-generated narrative from real period data.
 * Sentences are assembled from the supplied metric deltas; no fabricated numbers.
 */
export function ExecutiveSummary({
  title = "Executive Summary",
  description = "What happened this period, in plain language",
  metrics,
  highlights = [],
  caution,
  loading,
  className,
  bare,
}: ExecutiveSummaryProps) {
  const tone = buildSummaryTone(metrics)
  const lead = buildLeadSentence(metrics)
  const toneStyle = TONE_BADGE[tone]

  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="ds-body text-[var(--ds-text)]" aria-live="polite">{lead}</p>
        <div>
          <Badge variant={toneStyle.badge}>{toneStyle.label}</Badge>
        </div>
      </div>

      {highlights.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {highlights.map((h, i) => (
            <li key={`${h.label}-${i}`} className="flex items-start gap-2.5 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] px-3 py-2.5">
              {h.icon && <h.icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-primary)]" aria-hidden="true" />}
              <span className="ds-min-w-0">
                <span className="ds-caption block text-[var(--ds-text-tertiary)]">{h.label}</span>
                <span className="ds-body block text-[var(--ds-text)]">{h.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {caution && (
        <p className="ds-caption flex items-start gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-warning)]/30 bg-[var(--ds-warning)]/10 px-3 py-2.5 text-[var(--ds-warning)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-warning)]" aria-hidden="true" />
          <span>{caution}</span>
        </p>
      )}
    </div>
  )

  if (bare) {
    return <div className={cn(className)}>{loading ? <SummarySkeleton /> : body}</div>
  }

  return (
    <WidgetCard
      title={title}
      description={description}
      className={className}
      actions={<Sparkles className="h-4 w-4 text-[var(--ds-accent)]" aria-hidden="true" />}
    >
      {loading ? <SummarySkeleton /> : body}
    </WidgetCard>
  )
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}
