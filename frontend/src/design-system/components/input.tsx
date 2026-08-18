import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoComplete, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      autoComplete={autoComplete || "off"}
      className={cn(
        "ds-input-text flex h-[var(--ds-input-height)] w-full rounded-[var(--ds-input-radius)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] px-[var(--ds-spacing-3)] py-[var(--ds-spacing-2)] text-[var(--ds-text)] shadow-[var(--ds-input-shadow)] ds-transition-colors",
        "hover:border-[var(--ds-input-border-hover)]",
        "focus:border-[var(--ds-input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-focus-ring-alpha)]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-surface-secondary)]",
        "aria-[invalid=true]:border-[var(--ds-danger)] aria-[invalid=true]:focus:ring-[var(--ds-danger)]/10",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
