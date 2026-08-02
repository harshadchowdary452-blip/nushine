import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { SplitButton } from "./button-composites"
import { DropdownMenuItem } from "./dropdown-menu"

/**
 * The single sticky action bar (Part 3D). Every Create/Edit workflow saves
 * from here — users never scroll to save. Supports the enterprise save
 * variants (Save, Save & New, Save & Continue, Save & Close), Cancel, Reset
 * and a live status line announced to assistive tech.
 */
export interface EnterpriseActionBarProps {
  /** True when values differ from the loaded record. */
  dirty?: boolean
  saving?: boolean
  savedAt?: string | Date | null
  error?: React.ReactNode
  /** Custom status line (overrides the default dirty/saved wording). */
  statusText?: string
  onSave?: () => void
  onSaveNew?: () => void
  onSaveContinue?: () => void
  onSaveClose?: () => void
  onCancel?: () => void
  onReset?: () => void
  saveLabel?: string
  /** Renders a plain (non-sticky) row — used inside dialog footers. */
  inline?: boolean
  className?: string
}

export function EnterpriseActionBar({
  dirty = false,
  saving = false,
  savedAt,
  error,
  statusText,
  onSave,
  onSaveNew,
  onSaveContinue,
  onSaveClose,
  onCancel,
  onReset,
  saveLabel = "Save",
  inline = false,
  className,
}: EnterpriseActionBarProps) {
  const hasVariants = Boolean(onSaveNew || onSaveContinue || onSaveClose)
  const primaryDisabled = !dirty || saving

  const status = error
    ? "Changes could not be saved"
    : dirty
      ? "You have unsaved changes"
      : savedAt
        ? `Saved ${savedAt instanceof Date ? savedAt.toLocaleTimeString() : savedAt}`
        : statusText ?? "All changes saved"

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        inline
          ? "sm:flex-row sm:items-center sm:justify-between"
          : "sticky bottom-0 z-[var(--ds-z-dropdown)] mt-[var(--ds-spacing-4)] rounded-[var(--ds-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] px-4 py-3 shadow-[var(--ds-shadow-dropdown)] sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "ds-helper-text",
          error
            ? "text-[var(--ds-danger)]"
            : dirty
              ? "text-[var(--ds-text-secondary)]"
              : "text-[var(--ds-text-tertiary)]",
        )}
      >
        {status}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onReset && (
          <Button type="button" variant="ghost" onClick={onReset} disabled={!dirty || saving}>
            Reset
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        {onSave &&
          (hasVariants ? (
            <SplitButton label={saveLabel} onClick={onSave} disabled={primaryDisabled}>
              {onSaveNew && (
                <DropdownMenuItem onSelect={onSaveNew} disabled={primaryDisabled}>
                  Save & New
                </DropdownMenuItem>
              )}
              {onSaveContinue && (
                <DropdownMenuItem onSelect={onSaveContinue} disabled={primaryDisabled}>
                  Save & Continue
                </DropdownMenuItem>
              )}
              {onSaveClose && (
                <DropdownMenuItem onSelect={onSaveClose} disabled={primaryDisabled}>
                  Save & Close
                </DropdownMenuItem>
              )}
            </SplitButton>
          ) : (
            <Button
              type="button"
              onClick={onSave}
              disabled={primaryDisabled}
              loading={saving}
              loadingLabel="Saving…"
            >
              {saveLabel}
            </Button>
          ))}
      </div>
    </div>
  )
}
EnterpriseActionBar.displayName = "EnterpriseActionBar"
