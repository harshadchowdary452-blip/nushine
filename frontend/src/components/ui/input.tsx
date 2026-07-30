import * as React from "react"
import { cn } from "@/lib/utils"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      autoComplete="off"
      className={cn(
        "flex h-9 w-full rounded-[var(--ds-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm text-[var(--ds-text)] shadow-sm transition-all",
        "placeholder:text-[var(--ds-text-placeholder)]",
        "hover:border-[var(--ds-border-hover)]",
        "focus:border-[var(--ds-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/10",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-surface-secondary)]",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
