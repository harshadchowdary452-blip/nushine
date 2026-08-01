 
import * as React from "react"
import { motion } from "framer-motion"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/design-system/components/skeleton"
import { MiniSparkline } from "@/design-system/components/charts"
import { TooltipWrap } from "@/design-system/components/tooltip"

export type KpiTone = "primary" | "accent" | "success" | "warning" | "danger" | "info"

const TONE_TEXT: Record<KpiTone, string> = {
  primary: "text-[var(--ds-primary)]",
  accent: "text-[var(--ds-accent)]",
  success: "text-[var(--ds-success)]",
  warning: "text-[var(--ds-warning)]",
  danger: "text-[var(--ds-danger)]",
  info: "text-[var(--ds-info)]",
}

const TONE_SOFT: Record<KpiTone, string> = {
  primary: "bg-[var(--ds-primary-subtle)]",
  accent: "bg-[var(--ds-accent-subtle)]",
  success: "bg-[var(--ds-success-subtle)]",
  warning: "bg-[var(--ds-warning-subtle)]",
  danger: "bg-[var(--ds-danger-subtle)]",
  info: "bg-[var(--ds-info-subtle)]",
}

export interface KpiDatum {
  id: string
  title: string
  value: string
  /** Raw numeric value, used for aria and comparing. */
  rawValue?: number
  /** Percentage change vs the previous period. */
  change?: number | null
  /** Set false when a rise is undesirable (overdue counts, losses…). */
  positiveIsGood?: boolean
  /** Human label of the comparison window, e.g. "vs last month". */
  previousLabel?: string
  icon?: React.ElementType
  tone?: KpiTone
  sparkline?: number[]
  hint?: string
  loading?: boolean
  /** Drill-down navigation. */
  onClick?: () => void
}

export function formatChange(change: number | null | undefined): string | undefined {
  if (change === null || change === undefined || Number.isNaN(change)) return undefined
  const sign = change > 0 ? "+" : ""
  return `${sign}${change.toFixed(1)}%`
}

export function changeIsPositive(change: number | null | undefined, positiveIsGood = true): boolean {
  if (change === null || change === undefined || Number.isNaN(change)) return true
  const up = change >= 0
  return positiveIsGood ? up : !up
}

interface EnterpriseKpiProps extends KpiDatum {
  index?: number
}

/**
 * Enterprise time-aware KPI card. Every KPI is bound to the dashboard period,
 * shows a comparison against the previous period, and supports drill-down.
 */
export function EnterpriseKpi({
  id,
  title,
  value,
  rawValue,
  change,
  positiveIsGood = true,
  previousLabel,
  icon: Icon,
  tone = "primary",
  sparkline,
  hint,
  loading,
  onClick,
  index = 0,
}: EnterpriseKpiProps) {
  if (loading) {
    return (
      <div className="rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-9 rounded-[var(--ds-radius-xl)]" />
          </div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    )
  }

  const changeText = formatChange(change)
  const isGood = changeIsPositive(change, positiveIsGood)

  const body = (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      aria-label={onClick ? `${title}: ${value}. ${changeText ? `Change ${changeText}` : ""} ${previousLabel ? previousLabel : ""}. Opens filtered view.` : undefined}
      className={cn(
        "group h-full rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]",
        "ds-transition-colors",
        onClick && "cursor-pointer hover:border-[var(--ds-primary-300)] hover:bg-[var(--ds-surface-hover)] ds-focus-ring"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="ds-min-w-0">
          <p className="ds-card-title text-[var(--ds-text-secondary)]">{title}</p>
          {previousLabel && <p className="ds-caption mt-0.5 text-[var(--ds-text-tertiary)]">{previousLabel}</p>}
        </div>
        {Icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ds-radius-xl)] transition-transform duration-300 group-hover:scale-110", TONE_SOFT[tone], TONE_TEXT[tone])}>
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
      </div>

      <p className="ds-metric text-[var(--ds-text)]">{value}</p>

      <div className="mt-3 flex items-center gap-2">
        {changeText && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-1.5 py-0.5 text-xs font-semibold",
              isGood ? "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]" : "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]"
            )}
          >
            {isGood ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
            <span className="ds-sr-only">{isGood ? "Increase" : "Decrease"}</span>
            {changeText}
          </span>
        )}
        {onClick && (
          <span className="ds-caption ml-auto text-[var(--ds-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">
            View details
          </span>
        )}
        {rawValue !== undefined && <span className="ds-sr-only">Value: {rawValue}</span>}
      </div>

      {sparkline && sparkline.length > 1 && (
        <MiniSparkline data={sparkline} id={`kpi-${id}`} height={36} className="mt-3" stroke={`var(--ds-chart-1)`} fill={`var(--ds-chart-1)`} />
      )}
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4), ease: "easeOut" }}
      className="h-full"
    >
      {hint ? (
        <TooltipWrap content={hint}>
          <div className="h-full">{body}</div>
        </TooltipWrap>
      ) : (
        body
      )}
    </motion.div>
  )
}

export interface KpiGridProps {
  items: KpiDatum[]
  cols?: 3 | 4 | 6
  className?: string
}

/** Responsive grid that renders a row of `EnterpriseKpi` cards. */
export function KpiGrid({ items, cols = 4, className }: KpiGridProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        cols === 6 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        className
      )}
    >
      {items.map((item, i) => (
        <EnterpriseKpi key={item.id} {...item} index={i} />
      ))}
    </div>
  )
}
