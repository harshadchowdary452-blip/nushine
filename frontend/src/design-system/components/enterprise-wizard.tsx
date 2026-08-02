import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/design-system/components/button"

export interface EnterpriseWizardStep {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Rule keys validated before the step can advance. */
  fields?: string[]
}

export interface EnterpriseWizardProps {
  steps: EnterpriseWizardStep[]
  currentStep: number
  onStepChange: (index: number) => void
  /** Returns true when the step is complete. Called before advancing. */
  validateStep?: (index: number) => boolean
  onSubmit?: () => void
  submitting?: boolean
  submitLabel?: string
  nextLabel?: string
  backLabel?: string
  onCancel?: () => void
  cancelLabel?: string
  className?: string
  /** Step content for the current index. */
  children: React.ReactNode
}

/**
 * Multi-step wizard (Part 3D). Long create/edit flows are split into logical
 * steps with a clickable stepper, a progress indicator and Back/Next/Submit
 * actions. Each step is validated before advancing so users only ever see a
 * screenful of related fields.
 *
 * Fully controlled — the parent owns `currentStep` (so the dialog can reset it
 * on open) and implements `validateStep` from its form rules.
 */
export function EnterpriseWizard({
  steps,
  currentStep,
  onStepChange,
  validateStep,
  onSubmit,
  submitting = false,
  submitLabel = "Save",
  nextLabel = "Next",
  backLabel = "Back",
  onCancel,
  cancelLabel = "Cancel",
  className,
  children,
}: EnterpriseWizardProps) {
  const isLast = currentStep === steps.length - 1
  const canGoBack = currentStep > 0

  const progress =
    steps.length <= 1
      ? 100
      : Math.round((currentStep / (steps.length - 1)) * 100)

  function handleNext() {
    const ok = validateStep ? validateStep(currentStep) : true
    if (ok && !isLast) onStepChange(currentStep + 1)
    if (ok && isLast) onSubmit?.()
  }

  function handleStepClick(index: number) {
    // Users may return to completed steps freely; forward navigation is
    // sequential so every step's data exists before the next can be shown.
    if (index <= currentStep && index !== currentStep) onStepChange(index)
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {/* Stepper header */}
      <nav aria-label="Progress" className="shrink-0">
        <ol className="flex items-start gap-1 sm:gap-2">
          {steps.map((step, index) => {
            const completed = index < currentStep
            const active = index === currentStep
            const Icon = step.icon
            return (
              <li key={step.title} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <button
                  type="button"
                  disabled={index > currentStep}
                  onClick={() => handleStepClick(index)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group flex min-w-0 items-center gap-2 rounded-[var(--ds-radius-lg)] px-1 py-1.5 text-left transition-all",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/20",
                    index <= currentStep ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      completed && "bg-[var(--ds-success)] text-white",
                      active && "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)]",
                      !completed && !active && "border border-[var(--ds-border)] bg-[var(--ds-surface-secondary)] text-[var(--ds-text-tertiary)]",
                    )}
                  >
                    {completed ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="ds-min-w-0 hidden sm:block">
                    <span
                      className={cn(
                        "ds-form-title block truncate",
                        active ? "text-[var(--ds-text)]" : "text-[var(--ds-text-secondary)]",
                      )}
                    >
                      {step.title}
                    </span>
                    {step.description && (
                      <span className="ds-caption block truncate text-[var(--ds-text-tertiary)]">
                        {step.description}
                      </span>
                    )}
                  </span>
                  {Icon && (
                    <Icon
                      className={cn(
                        "hidden h-4 w-4 shrink-0 sm:block",
                        active ? "text-[var(--ds-primary)]" : "text-[var(--ds-text-tertiary)]",
                      )}
                    />
                  )}
                </button>
                <span
                  className={cn(
                    "h-0.5 w-full rounded-full transition-colors",
                    index <= currentStep ? "bg-[var(--ds-primary)]/60" : "bg-[var(--ds-border)]",
                  )}
                  aria-hidden="true"
                />
              </li>
            )
          })}
        </ol>
        {/* Progress */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="ds-caption text-[var(--ds-text-tertiary)]">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="ds-caption text-[var(--ds-text-secondary)]" role="status" aria-live="polite">
            {progress}% complete
          </span>
        </div>
      </nav>

      {/* Step content */}
      <div className="ds-motion-accordion min-h-0 flex-1 overflow-y-auto py-4">{children}</div>

      {/* Footer actions */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--ds-border)] pt-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onStepChange(currentStep - 1)}
          disabled={!canGoBack || submitting}
        >
          {backLabel}
        </Button>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            onClick={handleNext}
            loading={submitting && isLast}
            loadingLabel="Saving…"
          >
            {isLast ? submitLabel : nextLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
EnterpriseWizard.displayName = "EnterpriseWizard"
