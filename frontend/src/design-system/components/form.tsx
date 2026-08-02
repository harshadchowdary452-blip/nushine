import * as React from "react"
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/button"
import { Label } from "@/design-system/components/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/design-system/components/collapsible"
import { ChevronDown } from "lucide-react"

/**
 * Label + control + helper/error/success text in one block.
 * Error messages are announced via `aria-live` so assistive tech hears the
 * validation result without the user re-navigating the form.
 */
function FormField({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  success,
  warning,
  className,
  children,
}: {
  label?: React.ReactNode
  htmlFor?: string
  required?: boolean
  error?: React.ReactNode
  hint?: React.ReactNode
  success?: React.ReactNode
  warning?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const showError = Boolean(error)
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="ml-0.5 text-[var(--ds-danger)]" aria-hidden="true">
              *
            </span>
          )}
        </Label>
      )}
      {children}
      <div aria-live="polite">
        {showError ? (
          <p className="ds-error-text flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="ds-break-anywhere">{error}</span>
          </p>
        ) : success ? (
          <p className="ds-success-text flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="ds-break-anywhere">{success}</span>
          </p>
        ) : warning ? (
          <p className="ds-warning-text flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="ds-break-anywhere">{warning}</span>
          </p>
        ) : hint ? (
          <p className="ds-helper-text">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}
FormField.displayName = "FormField"

/**
 * A titled, collapsible form section. Long forms become scannable groups;
 * sections collapse to a summary so a screenful fits the viewport. Pass
 * `memoryKey` to persist each section's expanded/collapsed state across
 * sessions (keyed `nushine.ws.form.section.<memoryKey>`).
 */
function FormSection({
  title,
  description,
  icon: Icon,
  defaultOpen = true,
  memoryKey,
  className,
  children,
}: {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  memoryKey?: string
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState<boolean | undefined>(() => {
    if (!memoryKey) return undefined
    try {
      const raw = localStorage.getItem(`nushine.ws.form.section.${memoryKey}`)
      const parsed = raw ? (JSON.parse(raw) as { v?: number; s?: { open?: boolean } }) : null
      return typeof parsed?.s?.open === "boolean" ? parsed.s.open : undefined
    } catch {
      return undefined
    }
  })

  function handleOpenChange(next: boolean) {
    if (memoryKey) {
      try {
        localStorage.setItem(
          `nushine.ws.form.section.${memoryKey}`,
          JSON.stringify({ v: 1, s: { open: next } }),
        )
      } catch {
        // storage unavailable — degrade gracefully
      }
    }
    setOpen(next)
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} defaultOpen={defaultOpen} className={cn("ds-field", className)}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-[var(--ds-radius-lg)] py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/20">
        <span className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <span className="flex flex-col">
            <span className="ds-form-title text-[var(--ds-text)]">{title}</span>
            {description && <span className="ds-helper-text">{description}</span>}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ds-text-tertiary)] transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="ds-motion-accordion">
        <div className="pb-2 pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
FormSection.displayName = "FormSection"

/**
 * A sticky save bar pinned to the bottom of a long form. Exposes dirty state,
 * an explicit Save action with in-flight feedback, a Discard escape hatch, and
 * a status line (last saved / unsaved changes / save error) via a live region.
 */
function StickySaveBar({
  dirty,
  onSave,
  onReset,
  saving = false,
  savedAt,
  error,
  saveLabel = "Save Changes",
  className,
}: {
  dirty: boolean
  onSave: () => void
  onReset?: () => void
  saving?: boolean
  savedAt?: string | Date | null
  error?: React.ReactNode
  saveLabel?: string
  className?: string
}) {
  const statusText = error
    ? "Changes could not be saved"
    : dirty
      ? "You have unsaved changes"
      : savedAt
        ? `Saved ${savedAt instanceof Date ? savedAt.toLocaleTimeString() : savedAt}`
        : "All changes saved"

  return (
    <div
      className={cn(
        "sticky bottom-0 z-[var(--ds-z-dropdown)] mt-[var(--ds-spacing-4)] flex flex-col gap-2 rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] px-4 py-3 shadow-[var(--ds-shadow-dropdown)] sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "ds-helper-text",
          error ? "text-[var(--ds-danger)]" : dirty ? "text-[var(--ds-text-secondary)]" : "text-[var(--ds-text-tertiary)]"
        )}
      >
        {statusText}
      </p>
      <div className="flex items-center gap-2">
        {onReset && (
          <Button type="button" variant="ghost" onClick={onReset} disabled={!dirty || saving}>
            Discard
          </Button>
        )}
        <Button type="submit" onClick={onSave} disabled={!dirty} loading={saving} loadingLabel="Saving…">
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}
StickySaveBar.displayName = "StickySaveBar"

export { FormField, FormSection, StickySaveBar }
