import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "ds-badge-text inline-flex items-center rounded-full px-2.5 py-0.5 ds-transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[var(--ds-background-subtle)] text-[var(--ds-text-secondary)]",
        primary: "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]",
        accent: "bg-[var(--ds-accent-subtle)] text-[var(--ds-accent)]",
        success: "bg-[var(--ds-success-subtle)] text-[var(--ds-success)]",
        warning: "bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]",
        danger: "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]",
        info: "bg-[var(--ds-info-subtle)] text-[var(--ds-info)]",
        outline: "border border-[var(--ds-border)] text-[var(--ds-text-secondary)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
)
Badge.displayName = "Badge"

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
