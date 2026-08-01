import * as React from "react"
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type ProductivityInsightTone = "info" | "success" | "warning" | "danger" | "neutral"

export interface ProductivityInsight {
  id: string
  tone: ProductivityInsightTone
  icon?: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}

export interface ProductivitySectionProps {
  title: string
  icon?: React.ElementType
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

const toneStyles: Record<ProductivityInsightTone, { chip: string; icon: string }> = {
  info: { chip: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]", icon: "text-[var(--ds-info)]" },
  success: { chip: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]", icon: "text-[var(--ds-success)]" },
  warning: { chip: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]", icon: "text-[var(--ds-warning)]" },
  danger: { chip: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]", icon: "text-[var(--ds-danger)]" },
  neutral: { chip: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]", icon: "text-[var(--ds-text-tertiary)]" },
}

const toneIcons: Record<ProductivityInsightTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Info,
}

export function ProductivitySection({ title, icon: Icon, actions, children, className }: ProductivitySectionProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3.5",
        className
      )}
    >
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="ds-overline flex items-center gap-1.5 text-[var(--ds-text-tertiary)]">
          {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
          {title}
        </h3>
        {actions}
      </header>
      {children}
    </section>
  )
}

export interface ProductivityPanelProps {
  /** Rail heading shown on desktop; list of contextual business summaries. */
  title?: string
  description?: string
  insights?: ProductivityInsight[]
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** When false the rail scrolls with the page. Defaults to true. */
  sticky?: boolean
}

/**
 * Sticky right-side contextual productivity panel (Part 3C). Hosts
 * workspace-intelligence insights (outstanding bills, upcoming appointments,
 * pending treatments, recalls, unread communications) plus module-specific
 * sections such as quick actions, recent notes and pinned records.
 */
export function ProductivityPanel({
  title,
  description,
  insights = [],
  children,
  footer,
  className,
  sticky = true,
}: ProductivityPanelProps) {
  return (
    <aside
      className={cn(
        "flex min-w-0 flex-col gap-3",
        sticky && "lg:sticky lg:top-[var(--ds-header-h)] lg:max-h-[calc(100dvh-var(--ds-header-h))] lg:overflow-y-auto",
        className
      )}
    >
      {title ? (
        <div className="px-1">
          <h2 className="ds-h5 text-[var(--ds-text-primary)]">{title}</h2>
          {description ? <p className="ds-body-sm mt-0.5 text-[var(--ds-text-secondary)]">{description}</p> : null}
        </div>
      ) : null}

      {insights.length > 0 ? (
        <ProductivitySection title="Needs your attention">
          <ul className="flex flex-col gap-2">
            {insights.map((insight) => {
              const Icon = insight.icon ?? toneIcons[insight.tone]
              return (
                <li
                  key={insight.id}
                  className="flex items-start gap-2.5 rounded-lg bg-[var(--ds-background-subtle)] p-2.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      toneStyles[insight.tone].chip
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="ds-label-strong text-sm leading-tight text-[var(--ds-text-primary)]">{insight.title}</p>
                    {insight.description ? (
                      <p className="ds-body-sm mt-0.5 leading-snug text-[var(--ds-text-secondary)]">{insight.description}</p>
                    ) : null}
                    {insight.action ? <div className="mt-1.5">{insight.action}</div> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </ProductivitySection>
      ) : null}

      {children}

      {footer}
    </aside>
  )
}
