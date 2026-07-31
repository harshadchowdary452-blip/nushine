import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default: "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)] shadow-sm hover:bg-[var(--ds-primary-hover)] active:scale-[0.97]",
        destructive: "bg-[var(--ds-danger)] text-white shadow-sm hover:bg-[var(--ds-danger-hover)] active:scale-[0.97]",
        outline: "border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-text)] shadow-sm hover:bg-[var(--ds-surface-hover)] hover:border-[var(--ds-border-hover)] active:scale-[0.97]",
        secondary: "bg-[var(--ds-surface-secondary)] text-[var(--ds-text)] hover:bg-[var(--ds-border)] active:scale-[0.97]",
        ghost: "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]",
        link: "text-[var(--ds-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-lg",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-xl px-6",
        xl: "h-12 rounded-xl px-8 text-base",
        icon: "h-9 w-9 rounded-lg",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-lg": "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
