import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PageContainerProps {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("animate-fade-in", className)}>
      {children}
    </div>
  )
}

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn(
      "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 lg:mb-7",
      className
    )}>
      <div className="min-w-0">
        <h1 className="font-[var(--ds-text-h1)] text-[var(--ds-text)]">{title}</h1>
        {description && (
          <p className="mt-1 text-[var(--ds-text-body)] text-[var(--ds-text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}

interface PageTabsProps {
  tabs: { key: string; label: string; icon?: React.ElementType; count?: number }[]
  activeTab: string
  onTabChange: (key: string) => void
  className?: string
}

export function PageTabs({ tabs, activeTab, onTabChange, className }: PageTabsProps) {
  return (
    <div className={cn("flex gap-1 border-b border-[var(--ds-border)] mb-6 overflow-x-auto scrollbar-none", className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "text-[var(--ds-text)]"
                : "text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)]"
            )}
          >
            {Icon && <Icon className="h-4 w-4" strokeWidth={1.5} />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold",
                isActive
                  ? "bg-[var(--ds-primary)] text-white"
                  : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]"
              )}>
                {tab.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--ds-primary)] rounded-full" />
            )}
          </button>
        )
      })}
    </div>
  )
}

export interface SectionCardProps {
  title?: string
  description?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}

export function SectionCard({ title, description, children, className, actions }: SectionCardProps) {
  return (
    <div className={cn(
      "rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-card)]",
      className
    )}>
      {(title || actions) && (
        <div className="flex items-start justify-between px-[var(--ds-card-padding)] pt-[var(--ds-card-padding)] pb-3">
          <div>
            {title && <h3 className="font-[var(--ds-text-h3)] text-[var(--ds-text)]">{title}</h3>}
            {description && (
              <p className="mt-0.5 text-[var(--ds-text-body-sm)] text-[var(--ds-text-secondary)]">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0 ml-4">{actions}</div>}
        </div>
      )}
      <div className="px-[var(--ds-card-padding)] pb-[var(--ds-card-padding)]">
        {children}
      </div>
    </div>
  )
}

export interface EmptyStateProps {
  icon?: React.ElementType
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-16 px-6 text-center",
      className
    )}>
      {Icon && (
        <div className="mb-4 flex items-center justify-center w-14 h-14 rounded-[var(--ds-radius-2xl)] bg-[var(--ds-surface-secondary)]">
          <Icon className="h-7 w-7 text-[var(--ds-text-tertiary)]" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="font-[var(--ds-text-h3)] text-[var(--ds-text)] mb-1">{title}</h3>
      {description && (
        <p className="text-[var(--ds-text-body-sm)] text-[var(--ds-text-secondary)] max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

interface LoadingSkeletonProps {
  rows?: number
  className?: string
}

export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ds-skeleton ds-skeleton-card" />
      ))}
    </div>
  )
}

export interface MetricCardProps {
  title: string
  value: string | number
  change?: string
  icon?: React.ElementType
  trend?: "up" | "down" | "neutral"
  className?: string
}

export function MetricCard({ title, value, change, icon: Icon, trend, className }: MetricCardProps) {
  return (
    <div className={cn(
      "rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-card)]",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[var(--ds-text-caption)] font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wider mb-0.5">
            {title}
          </p>
          <p className="font-[var(--ds-text-h2)] text-[var(--ds-text)] mt-1">
            {value}
          </p>
          {change && (
            <p className={cn(
              "mt-1 text-[var(--ds-text-caption)] font-medium flex items-center gap-1",
              trend === "up" && "text-[var(--ds-success)]",
              trend === "down" && "text-[var(--ds-danger)]",
              trend === "neutral" && "text-[var(--ds-text-tertiary)]"
            )}>
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex items-center justify-center w-10 h-10 rounded-[var(--ds-radius-xl)] bg-[var(--ds-primary-subtle)] shrink-0">
            <Icon className="h-5 w-5 text-[var(--ds-primary)]" strokeWidth={1.5} />
          </div>
        )}
      </div>
    </div>
  )
}
