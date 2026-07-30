import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      autoComplete="off"
      className={cn(
        "flex h-[var(--ds-input-height)] w-full rounded-[var(--ds-input-radius)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] px-3 py-2 text-[var(--ds-text-body)] text-[var(--ds-text)] shadow-[var(--ds-input-shadow)] transition-all",
        "placeholder:text-[var(--ds-text-placeholder)]",
        "hover:border-[var(--ds-input-border-hover)]",
        "focus:border-[var(--ds-input-border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/10",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-surface-secondary)]",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
