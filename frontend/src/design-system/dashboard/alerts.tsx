import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/design-system/components/badge"
import { Skeleton } from "@/design-system/components/skeleton"
import { WidgetCard } from "./shell"

export type AlertSeverity = "critical" | "warning" | "info" | "success"

export interface AlertItem {
  id: string
  title: string
  description?: string
  severity: AlertSeverity
  onClick?: () => void
}

const SEVERITY_CONFIG: Record<AlertSeverity, { icon: React.ElementType; border: string; iconColor: string; soft: string }> = {
  critical: {
    icon: AlertOctagon,
    border: "border-l-[var(--ds-danger)]",
    iconColor: "text-[var(--ds-danger)]",
    soft: "bg-[var(--ds-danger-subtle)]",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-l-[var(--ds-warning)]",
    iconColor: "text-[var(--ds-warning)]",
    soft: "bg-[var(--ds-warning-subtle)]",
  },
  info: {
    icon: Info,
    border: "border-l-[var(--ds-info)]",
    iconColor: "text-[var(--ds-info)]",
    soft: "bg-[var(--ds-info-subtle)]",
  },
  success: {
    icon: CheckCircle2,
    border: "border-l-[var(--ds-success)]",
    iconColor: "text-[var(--ds-success)]",
    soft: "bg-[var(--ds-success-subtle)]",
  },
}

const SEVERITY_ORDER: AlertSeverity[] = ["critical", "warning", "info", "success"]

export interface AlertCenterProps {
  items: AlertItem[]
  loading?: boolean
  /** Omit to show all severities. */
  minSeverity?: AlertSeverity
  title?: string
  description?: string
  className?: string
}

/**
 * Critical alert strip rendered directly below the quick statistics. Alerts are
 * sorted by severity so the most urgent item is always read first.
 */
export function AlertCenter({
  items,
  loading,
  minSeverity = "warning",
  title = "Critical Alerts",
  description = "Items that need your attention right now",
  className,
}: AlertCenterProps) {
  const minIndex = SEVERITY_ORDER.indexOf(minSeverity)
  const visible = items
    .filter((a) => SEVERITY_ORDER.indexOf(a.severity) <= minIndex)
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))

  const criticalCount = items.filter((a) => a.severity === "critical").length

  if (loading) {
    return (
      <WidgetCard title={title} description={description} className={className}>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </WidgetCard>
    )
  }

  return (
    <WidgetCard
      title={title}
      description={description}
      className={className}
      actions={
        items.length > 0 ? (
          <Badge variant={criticalCount > 0 ? "danger" : "warning"} className="h-5 min-w-[20px] px-1.5">
            {items.length}
          </Badge>
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-success-subtle)] bg-[var(--ds-success-subtle)] px-4 py-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--ds-success)]" aria-hidden="true" />
          <p className="ds-body text-[var(--ds-text)]">All clear — no critical items in this period.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Alerts">
          {visible.map((alert) => {
            const config = SEVERITY_CONFIG[alert.severity]
            const Icon = config.icon
            return (
              <li key={alert.id}>
                <div
                  role={alert.onClick ? "button" : undefined}
                  tabIndex={alert.onClick ? 0 : undefined}
                  onClick={alert.onClick}
                  onKeyDown={alert.onClick ? (e) => e.key === "Enter" && alert.onClick?.() : undefined}
                  className={cn(
                    "flex items-start gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] border-l-[3px] px-4 py-3",
                    config.border,
                    alert.onClick && "cursor-pointer transition-colors hover:bg-[var(--ds-surface-hover)] ds-focus-ring"
                  )}
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)]", config.soft, config.iconColor)}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="ds-min-w-0 flex-1">
                    <p className="ds-body font-semibold text-[var(--ds-text)]">{alert.title}</p>
                    {alert.description && <p className="ds-caption mt-0.5 text-[var(--ds-text-secondary)]">{alert.description}</p>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </WidgetCard>
  )
}
