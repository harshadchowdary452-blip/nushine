import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { Skeleton } from "@/design-system/components/skeleton"
import { MiniSparkline } from "@/design-system/components/charts"

interface KpiStatus {
  tone: "success" | "warning" | "danger" | "neutral"
  label: string
}

interface KpiQuickAction {
  label: string
  onClick: () => void
  icon?: React.ElementType
}

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  /** Simple up/down trend line (legacy API kept for compatibility). */
  trend?: { value: string; positive: boolean }
  /** Percentage change vs the previous period, e.g. "+12.4%". */
  change?: string
  positive?: boolean
  /** Human-readable previous-period reference, e.g. "vs ₹8.4L last month". */
  previousPeriod?: string
  status?: KpiStatus
  quickAction?: KpiQuickAction
  icon: React.ElementType
  color?: string
  delay?: number
  loading?: boolean
  /** Sparkline points for the trailing period. */
  sparkline?: number[]
  /** Makes the card clickable for drill-down. */
  onClick?: () => void
}

const STATUS_DOT: Record<KpiStatus["tone"], string> = {
  success: "bg-[var(--ds-success)]",
  warning: "bg-[var(--ds-warning)]",
  danger: "bg-[var(--ds-danger)]",
  neutral: "bg-[var(--ds-text-tertiary)]",
}

/** Named tone shortcuts (compat with the legacy layout KpiCard). */
const NAMED_TEXT: Record<string, string> = {
  primary: "text-[var(--ds-primary)]",
  success: "text-[var(--ds-success)]",
  warning: "text-[var(--ds-warning)]",
  info: "text-[var(--ds-info)]",
  danger: "text-[var(--ds-danger)]",
}

const NAMED_SOFT: Record<string, string> = {
  primary: "bg-[var(--ds-primary-subtle)]",
  success: "bg-[var(--ds-success-subtle)]",
  warning: "bg-[var(--ds-warning-subtle)]",
  info: "bg-[var(--ds-info-subtle)]",
  danger: "bg-[var(--ds-danger-subtle)]",
}

function resolveColor(color?: string): { text: string; soft: string } {
  if (color && color in NAMED_TEXT) {
    return { text: NAMED_TEXT[color], soft: NAMED_SOFT[color] }
  }
  return { text: color ?? "text-[var(--ds-primary)]", soft: "bg-[var(--ds-surface-secondary)]" }
}

export default function KpiCard({
  title,
  value,
  subtitle,
  trend,
  change,
  positive = true,
  previousPeriod,
  status,
  quickAction,
  icon: Icon,
  color = "text-[var(--ds-primary)]",
  delay = 0,
  loading,
  sparkline,
  onClick,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    )
  }

  const showChange = change ?? (trend ? trend.value : undefined)
  const changePositive = positive ?? trend?.positive ?? true
  const { text: colorText, soft: colorSoft } = resolveColor(color)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={cn(
        "ds-hover-lift group rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-card-padding)] shadow-[var(--ds-shadow-card)]",
        onClick && "cursor-pointer"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="ds-min-w-0">
          <p className="ds-card-title text-[var(--ds-text-secondary)]">{title}</p>
          {status && (
            <span className="ds-caption mt-0.5 flex items-center gap-1.5 text-[var(--ds-text-tertiary)]">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status.tone])} aria-hidden="true" />
              {status.label}
            </span>
          )}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ds-radius-xl)] transition-transform duration-300 group-hover:scale-110", colorSoft, colorText)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-1">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: delay + 0.1 }}
          className="ds-metric text-[var(--ds-text)]"
        >
          {value}
        </motion.p>
        {subtitle && <p className="ds-caption text-[var(--ds-text-tertiary)]">{subtitle}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {showChange && (
          <span className={cn("flex items-center gap-1 text-xs font-medium", changePositive ? "text-[var(--ds-success)]" : "text-[var(--ds-danger)]")}>
            {changePositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {showChange}
          </span>
        )}
        {previousPeriod && <span className="ds-caption text-[var(--ds-text-tertiary)]">{previousPeriod}</span>}
        {quickAction && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              quickAction.onClick()
            }}
            className="ds-focus-ring ds-nav-label ml-auto flex items-center gap-1 rounded-[var(--ds-radius-lg)] px-2 py-1 text-xs text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-subtle)]"
          >
            {quickAction.icon && <quickAction.icon className="h-3 w-3" aria-hidden="true" />}
            {quickAction.label}
          </button>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <MiniSparkline data={sparkline} id={`kpi-${title.replace(/\s+/g, "-").toLowerCase()}`} height={36} className="mt-3" />
      )}
    </motion.div>
  )
}
