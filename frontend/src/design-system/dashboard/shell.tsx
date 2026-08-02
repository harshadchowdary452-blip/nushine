import * as React from "react"
import { useState } from "react"
import { CalendarRange, ChevronDown, Download, Maximize2, Minimize2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
// Deep import (not the barrel) to avoid a barrel → dashboard → shell → barrel cycle
// that forces Rollup to retain the recharts chart modules in the entry graph.
import { PageContainer } from "@/design-system/components/page-container"
import { Button } from "@/design-system/components/button"
import { Input } from "@/design-system/components/input"
import { Label } from "@/design-system/components/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/design-system/components/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/design-system/components/collapsible"
import { TooltipWrap } from "@/design-system/components/tooltip"
import { PERIOD_PRESETS } from "./period"

/* ────────────────────────────────────────────────────────────────────────────
   DashboardShell — page-level wrapper with consistent vertical rhythm.
   ──────────────────────────────────────────────────────────────────────────── */

export function DashboardShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <PageContainer density="loose" className={cn("space-y-[var(--ds-spacing-5)]", className)}>
      {children}
    </PageContainer>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   DashboardHeader — hero banner carrying the page title and time context.
   ──────────────────────────────────────────────────────────────────────────── */

export interface DashboardHeaderProps {
  eyebrow?: React.ReactNode
  title: string
  subtitle?: string
  /** Live stats shown on the right side of the banner. */
  stats?: { label: string; value: string; positive?: boolean }[]
  actions?: React.ReactNode
  className?: string
}

export function DashboardHeader({ eyebrow, title, subtitle, stats, actions, className }: DashboardHeaderProps) {
  return (
    <section className={cn("gradient-hero relative overflow-hidden rounded-[var(--ds-radius-2xl)] px-6 py-5", className)}>
      <div className="bg-grid-pattern absolute inset-0 opacity-10" aria-hidden="true" />
      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="ds-min-w-0">
          {eyebrow && <p className="ds-overline mb-1 text-white/70">{eyebrow}</p>}
          <h1 className="text-lg font-bold text-white sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-white/75">{subtitle}</p>}
        </div>
        <div className="ds-cluster ds-cluster-md shrink-0">
          {stats?.map((s) => (
            <div key={s.label} className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/60">{s.label}</p>
              <p className={cn("text-base font-bold text-white", s.positive === false ? "text-red-200" : s.positive === true ? "text-emerald-100" : "")}>
                {s.value}
              </p>
            </div>
          ))}
          {actions}
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   CommandCenter — the synchronized global filter + refresh/export/fullscreen.
   ──────────────────────────────────────────────────────────────────────────── */

export interface CommandCenterProps {
  period: string
  onPeriodChange: (period: string) => void
  startDate?: string
  endDate?: string
  onStartDateChange?: (date: string) => void
  onEndDateChange?: (date: string) => void
  rangeSummary?: string
  onRefresh?: () => void
  refreshing?: boolean
  onExport?: () => void
  /** Rendered between the period control and the action buttons. */
  extraFilters?: React.ReactNode
  className?: string
}

export function CommandCenter({
  period,
  onPeriodChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  rangeSummary,
  onRefresh,
  refreshing,
  onExport,
  extraFilters,
  className,
}: CommandCenterProps) {
  const [fullscreenEl, setFullscreenEl] = useState<HTMLDivElement | null>(null)
  const isFullscreen = typeof document !== "undefined" && !!document.fullscreenElement

  const toggleFullscreen = () => {
    if (!fullscreenEl) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void fullscreenEl.requestFullscreen()
    }
  }

  const isCustom = period === "custom"

  return (
    <div
      ref={setFullscreenEl}
      className={cn(
        "rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3 shadow-[var(--ds-shadow-card)]",
        className
      )}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-[var(--ds-text-secondary)]">
          <CalendarRange className="h-4 w-4 text-[var(--ds-primary)]" aria-hidden="true" />
          <Label htmlFor="dash-period" className="ds-form-label text-[var(--ds-text-tertiary)]">
            Period
          </Label>
          <Select value={period} onValueChange={onPeriodChange}>
            <SelectTrigger id="dash-period" aria-label="Dashboard period" className="h-9 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCustom && (
          <>
            <div className="space-y-1">
              <Label htmlFor="dash-from" className="ds-form-label text-[var(--ds-text-tertiary)]">From</Label>
              <Input
                id="dash-from"
                type="date"
                value={startDate || ""}
                onChange={(e) => onStartDateChange?.(e.target.value)}
                className="h-9 w-[150px] text-sm"
                aria-label="Start date"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dash-to" className="ds-form-label text-[var(--ds-text-tertiary)]">To</Label>
              <Input
                id="dash-to"
                type="date"
                value={endDate || ""}
                onChange={(e) => onEndDateChange?.(e.target.value)}
                className="h-9 w-[150px] text-sm"
                aria-label="End date"
              />
            </div>
          </>
        )}

        {rangeSummary && (
          <p className="ds-caption mb-1.5 hidden text-[var(--ds-text-tertiary)] lg:block" aria-live="polite">
            {rangeSummary}
          </p>
        )}

        {extraFilters}

        <div className="ds-cluster ds-cluster-sm ml-auto">
          {onRefresh && (
            <TooltipWrap content="Refresh data">
              <Button variant="outline" size="icon-sm" onClick={onRefresh} disabled={refreshing} aria-label="Refresh data">
                <RefreshCw className={cn(refreshing && "animate-spin")} />
              </Button>
            </TooltipWrap>
          )}
          {onExport && (
            <TooltipWrap content="Export CSV">
              <Button variant="outline" size="icon-sm" onClick={onExport} aria-label="Export CSV">
                <Download />
              </Button>
            </TooltipWrap>
          )}
          <TooltipWrap content={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <Button variant="outline" size="icon-sm" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </TooltipWrap>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   WidgetCard — the shared shell every dashboard widget renders inside.
   ──────────────────────────────────────────────────────────────────────────── */

export interface WidgetCardProps {
  title?: string
  description?: string
  actions?: React.ReactNode
  icon?: React.ElementType
  children: React.ReactNode
  className?: string
  /** Removes body padding for edge-to-edge content. */
  flush?: boolean
}

export function WidgetCard({ title, description, actions, icon: Icon, children, className, flush }: WidgetCardProps) {
  return (
    <section className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)]", className)}>
      {(title || actions || Icon) && (
        <header className="flex items-start justify-between gap-3 px-[var(--ds-card-padding)] pt-[var(--ds-card-padding)] pb-[var(--ds-spacing-3)]">
          <div className="ds-min-w-0 flex items-start gap-2.5">
            {Icon && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-secondary)] text-[var(--ds-primary)]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
            <div className="ds-min-w-0">
              {title && <h2 className="ds-card-title text-[var(--ds-text)]">{title}</h2>}
              {description && <p className="ds-caption mt-0.5 text-[var(--ds-text-tertiary)]">{description}</p>}
            </div>
          </div>
          {actions && <div className="ds-cluster ds-cluster-sm shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "px-[var(--ds-card-padding)] pb-[var(--ds-card-padding)]")}>{children}</div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   DashboardSection — collapsible section used for the spec's widget order.
   ──────────────────────────────────────────────────────────────────────────── */

export interface DashboardSectionProps {
  title: string
  description?: string
  icon?: React.ElementType
  actions?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

export function DashboardSection({ title, description, icon: Icon, actions, defaultOpen = true, children, className }: DashboardSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)]", className)}>
      <div className="flex items-center justify-between gap-3 rounded-t-[var(--ds-card-radius)] px-[var(--ds-card-padding)] py-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="ds-focus-ring flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[var(--ds-radius-lg)] text-left"
            aria-expanded={open}
          >
            <span className="ds-min-w-0 flex items-center gap-2.5">
              {Icon && <Icon className="h-4 w-4 shrink-0 text-[var(--ds-primary)]" aria-hidden="true" />}
              <span className="ds-min-w-0">
                <span className="ds-card-title block text-[var(--ds-text)]">{title}</span>
                {description && <span className="ds-caption block text-[var(--ds-text-tertiary)]">{description}</span>}
              </span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)] transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
        </CollapsibleTrigger>
        {actions && <div className="ds-cluster ds-cluster-sm shrink-0">{actions}</div>}
      </div>
      <CollapsibleContent>
        <div className="px-[var(--ds-card-padding)] pb-[var(--ds-card-padding)]">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
