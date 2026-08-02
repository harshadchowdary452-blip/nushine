import * as React from "react"
import { AlertTriangle, ArrowRight, CheckCircle2, Eye, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/design-system/components/dialog"
import { Button, type ButtonProps } from "@/design-system/components/button"
import { Badge } from "@/design-system/components/badge"

export interface WorkflowSummaryItem {
  label: React.ReactNode
  value: React.ReactNode
}

export interface WorkflowSummaryPanelProps {
  title?: React.ReactNode
  icon?: React.ReactNode
  items: WorkflowSummaryItem[]
  /** Sticky within its scroll container (long wizard workflows). */
  sticky?: boolean
  className?: string
}

/**
 * A compact label/value panel used to surface the records a workflow will
 * create. When `sticky`, it stays pinned inside a scrolling wizard body so
 * the operator always sees the workflow they are building.
 */
export function WorkflowSummaryPanel({ title = "Workflow summary", icon, items, sticky = false, className }: WorkflowSummaryPanelProps) {
  return (
    <section
      aria-label={typeof title === "string" ? title : "Workflow summary"}
      className={cn(
        "rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-light)] bg-[var(--ds-surface-secondary)] p-4",
        sticky && "sticky top-0 z-10 shadow-[var(--ds-card-shadow)]",
        className,
      )}
    >
      {title && (
        <h3 className="ds-form-title mb-3 flex items-center gap-2 text-[var(--ds-text)]">
          {icon}
          {title}
        </h3>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        {items.map((item, i) => (
          <div key={`${String(item.label)}-${i}`} className="min-w-0">
            <dt className="ds-caption truncate text-[var(--ds-text-tertiary)]">{item.label}</dt>
            <dd className="ds-body-sm mt-0.5 truncate font-medium text-[var(--ds-text)]">{item.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export interface WorkflowNextAction {
  label: React.ReactNode
  onClick: () => void
  icon?: React.ReactNode
  variant?: ButtonProps["variant"]
  disabled?: boolean
}

export interface WorkflowNextActionsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** e.g. "Patient registered" */
  title: React.ReactNode
  description?: React.ReactNode
  /** The record that was just created — rendered as a summary. */
  summary?: WorkflowSummaryItem[]
  summaryTitle?: React.ReactNode
  /** The recommended next step, shown prominently. */
  primaryAction?: WorkflowNextAction
  /** Related-record shortcuts, e.g. schedule appointment, create case. */
  secondaryActions?: WorkflowNextAction[]
  /** Label for the quiet "done" action. */
  doneLabel?: React.ReactNode
}

/**
 * Smart workflow completion dialog. After a record is saved it shows the
 * created record summary and offers related-record shortcuts so the operator
 * can continue the journey without re-navigating (no dead-ends).
 */
export function WorkflowNextActions({
  open,
  onOpenChange,
  title,
  description,
  summary,
  summaryTitle,
  primaryAction,
  secondaryActions,
  doneLabel = "Done",
}: WorkflowNextActionsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg" aria-describedby="workflow-next-desc">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--ds-success-subtle)] text-[var(--ds-success)]">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription id="workflow-next-desc">{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        {summary && summary.length > 0 && (
          <DialogBody className="space-y-4">
            <WorkflowSummaryPanel title={summaryTitle} items={summary} />
          </DialogBody>
        )}
        {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {primaryAction && (
                <Button variant={primaryAction.variant ?? "primary"} onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
                  {primaryAction.icon}
                  {primaryAction.label}
                  {!primaryAction.icon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </Button>
              )}
              {secondaryActions?.map((action, i) => (
                <Button
                  key={i}
                  variant={action.variant ?? "outline"}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {doneLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

export interface DuplicateCandidateRow {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
  matched_on: string[]
  confidence: "high" | "medium"
}

const MATCH_LABELS: Record<string, string> = {
  phone: "same phone",
  email: "same email",
  full_name: "same name",
  name: "similar name",
}

export interface DuplicateWarningProps {
  candidates: DuplicateCandidateRow[]
  /** Called when the operator picks an existing record to open instead. */
  onOpenExisting?: (candidate: DuplicateCandidateRow) => void
  /** Called when the operator chooses to continue registering anyway. */
  onContinueAnyway?: () => void
  className?: string
}

/**
 * Inline smart-duplicate warning shown in a registration form. Lists the
 * likely existing records and lets the operator open one or explicitly
 * continue anyway (the choice is the operator's — registration is never
 * hard-blocked).
 */
export function DuplicateWarning({ candidates, onOpenExisting, onContinueAnyway, className }: DuplicateWarningProps) {
  const [dismissed, setDismissed] = React.useState(false)
  React.useEffect(() => setDismissed(false), [candidates])
  if (!candidates.length || dismissed) return null

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-warning-border)] bg-[var(--ds-warning-subtle)] p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-warning)]" aria-hidden="true" />
          <div>
            <p className="ds-body-sm font-medium text-[var(--ds-text)]">
              Possible existing record{candidates.length > 1 ? "s" : ""} found
            </p>
            <p className="ds-caption text-[var(--ds-text-secondary)]">
              {candidates.length} patient{candidates.length > 1 ? "s" : ""} may already exist. Open the record to avoid a duplicate.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ds-target flex h-6 w-6 items-center justify-center rounded-md text-[var(--ds-text-tertiary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
          aria-label="Dismiss duplicate warning"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ds-border-light)] bg-[var(--ds-surface)] px-3 py-2">
            <div className="min-w-0">
              <p className="ds-body-sm truncate font-medium text-[var(--ds-text)]">{c.full_name}</p>
              <p className="ds-caption truncate text-[var(--ds-text-secondary)]">
                {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.matched_on.map((m) => (
                  <Badge key={m} variant={c.confidence === "high" ? "warning" : "outline"} className="ds-caption">
                    {MATCH_LABELS[m] ?? m}
                  </Badge>
                ))}
              </div>
            </div>
            {onOpenExisting && (
              <Button variant="outline" size="sm" onClick={() => onOpenExisting(c)}>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Open
              </Button>
            )}
          </li>
        ))}
      </ul>
      {onContinueAnyway && (
        <Button variant="ghost" size="sm" className="self-start" onClick={onContinueAnyway}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Continue anyway
        </Button>
      )}
    </div>
  )
}
