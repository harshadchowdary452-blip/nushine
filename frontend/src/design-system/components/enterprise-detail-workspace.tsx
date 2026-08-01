import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { PageTabs, LoadingSkeleton, EmptyState } from "./page-container"
import { ErrorState } from "./error-state"
import { EnterpriseRecordHeader, type EnterpriseRecordHeaderProps } from "./enterprise-record-header"

export interface EnterpriseDetailTab {
  key: string
  label: string
  icon?: React.ElementType
  count?: number
}

export interface EnterpriseDetailWorkspaceProps {
  /** Back navigation (breadcrumb to the list). */
  backLabel?: string
  onBack?: () => void
  header: EnterpriseRecordHeaderProps
  /** Dynamic per-entity business tabs. */
  tabs?: EnterpriseDetailTab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  tabsLabel?: string
  /** Keep the tab bar pinned below the app header while scrolling. */
  stickyTabs?: boolean
  /** Sticky right-side contextual panel (recommended: ProductivityPanel). */
  panel?: React.ReactNode
  /** Panel column width class. Defaults to a 300-320px rail. */
  panelClassName?: string
  loading?: boolean
  error?: React.ReactNode
  empty?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/**
 * Reusable enterprise details workspace (Part 3C): back navigation, an
 * EnterpriseRecordHeader summary block, dynamic business tabs and an optional
 * sticky contextual panel. Every module's details page composes this — no
 * per-module detail layouts.
 */
export function EnterpriseDetailWorkspace({
  backLabel = "Back to list",
  onBack,
  header,
  tabs,
  activeTab,
  onTabChange,
  tabsLabel = "Record sections",
  stickyTabs = true,
  panel,
  panelClassName,
  loading,
  error,
  empty,
  children,
  className,
}: EnterpriseDetailWorkspaceProps) {
  const hasSidebar = Boolean(panel)

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {onBack ? (
        <div className="flex items-center">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-[var(--ds-text-secondary)]" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Button>
        </div>
      ) : null}

      <EnterpriseRecordHeader {...header} />

      {tabs && tabs.length > 0 ? (
        <div
          className={cn(
            "bg-[var(--ds-bg)]",
            stickyTabs && "sticky top-[var(--ds-header-h)] z-[var(--ds-z-sticky)]"
          )}
        >
          <PageTabs
            tabs={tabs}
            activeTab={activeTab ?? tabs[0].key}
            onTabChange={onTabChange ?? (() => {})}
            label={tabsLabel}
          />
        </div>
      ) : null}

      <div className={cn("flex items-start gap-5", hasSidebar && "flex-col lg:flex-row")}>
        <main className="min-w-0 flex-1">
          {error ? (
            <ErrorState kind="unknown" title="Could not load this record" onRetry={onBack ? () => onBack() : undefined} />
          ) : null}
          {!error && loading ? <LoadingSkeleton rows={4} variant="card" /> : null}
          {!error && !loading && empty ? <EmptyState title="Nothing to show" /> : null}
          {!error && !loading && !empty ? children : null}
        </main>
        {hasSidebar ? (
          <aside className={cn("w-full min-w-0 lg:w-[320px] lg:shrink-0", panelClassName)}>{panel}</aside>
        ) : null}
      </div>
    </div>
  )
}
