import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "ds-input-text flex min-h-[var(--ds-input-height)] w-full rounded-[var(--ds-input-radius)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] px-[var(--ds-spacing-3)] py-[var(--ds-spacing-2)] text-[var(--ds-text)] shadow-[var(--ds-input-shadow)] ds-transition-colors",
        "hover:border-[var(--ds-input-border-hover)]",
        "focus:border-[var(--ds-input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/10",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-surface-disabled)]",
        "aria-[invalid=true]:border-[var(--ds-danger)] aria-[invalid=true]:focus:ring-[var(--ds-danger)]/10",
        "placeholder:text-[var(--ds-input-placeholder)]",
        "resize-y",
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = "Textarea"

export { Textarea }
