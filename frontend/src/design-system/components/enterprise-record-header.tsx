import * as React from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Separator } from "./separator"

export interface RecordHeaderMeta {
  icon?: React.ElementType
  label: string
  value?: React.ReactNode
}

export interface RecordStat {
  label: string
  value: React.ReactNode
}

export interface EnterpriseRecordHeaderProps {
  /** Avatar / profile image (recommended: design-system Avatar). */
  profile?: React.ReactNode
  /** Above-title context (record ID, reference number). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** Secondary line under the title (name, provider, location). */
  subtitle?: React.ReactNode
  primaryStatus?: React.ReactNode
  secondaryStatus?: React.ReactNode
  /** Key-value facts: hospital, doctor, owner, dates. */
  meta?: RecordHeaderMeta[]
  /** Quick summary stats (balances, counts). */
  stats?: RecordStat[]
  actions?: React.ReactNode
  favourite?: boolean
  onToggleFavourite?: () => void
  tags?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

export function EnterpriseRecordHeader({
  profile,
  eyebrow,
  title,
  subtitle,
  primaryStatus,
  secondaryStatus,
  meta = [],
  stats = [],
  actions,
  favourite,
  onToggleFavourite,
  tags,
  footer,
  className,
}: EnterpriseRecordHeaderProps) {
  const metaChunks = meta.filter((m) => m.value !== undefined && m.value !== null && m.value !== "")
  return (
    <section className={cn("rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 sm:p-5", className)}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            {profile}
            <div className="min-w-0">
              {eyebrow ? (
                <p className="ds-overline text-[var(--ds-text-tertiary)]">{eyebrow}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="ds-h3 min-w-0 truncate text-[var(--ds-text-primary)]">{title}</h2>
                {primaryStatus}
                {secondaryStatus}
              </div>
              {subtitle ? <p className="ds-body-sm mt-1 text-[var(--ds-text-secondary)]">{subtitle}</p> : null}
              {metaChunks.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {metaChunks.map((m, i) => {
                    const Icon = m.icon
                    return (
                      <span key={i} className="flex items-center gap-1.5 text-xs text-[var(--ds-text-tertiary)]">
                        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-tertiary)]" /> : null}
                        <span className="whitespace-nowrap">
                          {m.label}: <span className="ds-label-strong text-[var(--ds-text-secondary)]">{m.value}</span>
                        </span>
                      </span>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onToggleFavourite ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-pressed={favourite}
                aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
                onClick={onToggleFavourite}
              >
                <Star
                  className={cn("h-4 w-4", favourite ? "fill-[var(--ds-warning)] text-[var(--ds-warning)]" : "text-[var(--ds-text-tertiary)]")}
                />
              </Button>
            ) : null}
            {actions}
          </div>
        </div>

        {stats.length > 0 ? (
          <>
            <Separator className="bg-[var(--ds-border-subtle)]" />
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {stats.map((s, i) => (
                <div key={i} className="min-w-0">
                  <dt className="ds-overline text-[var(--ds-text-tertiary)]">{s.label}</dt>
                  <dd className="ds-label-strong mt-0.5 truncate text-[var(--ds-text-primary)]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}

        {tags || footer ? (
          <>
            <Separator className="bg-[var(--ds-border-subtle)]" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {tags ? <div className="flex flex-wrap items-center gap-1.5">{tags}</div> : null}
              {footer ? <div className="ml-auto">{footer}</div> : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
