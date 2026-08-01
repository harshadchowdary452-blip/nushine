import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "ds-button-text ds-press inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "ds-transition-colors",
    // Focus is drawn by the global :focus-visible rule in a11y.css; the ring is
    // repeated here with an offset so it clears the button's own background.
    "focus-visible:outline-[var(--ds-focus-ring-width)] focus-visible:outline-offset-[var(--ds-focus-ring-offset)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)] shadow-[var(--ds-button-primary-shadow)] hover:bg-[var(--ds-primary-hover)] active:bg-[var(--ds-primary-active)] active:scale-[0.98]",
        secondary:
          "bg-[var(--ds-surface-secondary)] text-[var(--ds-text)] hover:bg-[var(--ds-border)] active:bg-[var(--ds-border-hover)] active:scale-[0.98]",
        accent:
          "bg-[var(--ds-accent)] text-[var(--ds-accent-foreground)] shadow-sm hover:bg-[var(--ds-accent-hover)] active:bg-[var(--ds-accent-active)] active:scale-[0.98]",
        destructive:
          "bg-[var(--ds-danger)] text-white shadow-sm hover:bg-[var(--ds-danger-hover)] active:scale-[0.98]",
        success:
          "bg-[var(--ds-success)] text-white shadow-sm hover:bg-[var(--ds-success-hover)] active:scale-[0.98]",
        warning:
          "bg-[var(--ds-warning)] text-white shadow-sm hover:bg-[var(--ds-warning-hover)] active:scale-[0.98]",
        info:
          "bg-[var(--ds-info)] text-white shadow-sm hover:bg-[var(--ds-info-hover)] active:scale-[0.98]",
        outline:
          "border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-text)] shadow-sm hover:bg-[var(--ds-surface-hover)] hover:border-[var(--ds-border-hover)] active:scale-[0.98]",
        ghost:
          "text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]",
        link:
          "text-[var(--ds-primary)] underline-offset-4 hover:underline p-0 h-auto",
      },
      // Heights sit at or above --ds-target-comfortable (36px). `sm`/`icon-sm`
      // are 32px, below the comfortable floor but above the WCAG 2.5.8 minimum
      // of 24px; a11y.css expands their hit area to 44px on coarse pointers.
      size: {
        default: "h-[var(--ds-btn-h)] px-4 py-2 rounded-[var(--ds-radius-lg)]",
        sm: "ds-button-text-sm h-[var(--ds-btn-h-sm)] rounded-[var(--ds-radius-lg)] px-3",
        lg: "ds-button-text-lg h-[var(--ds-btn-h-lg)] rounded-[var(--ds-radius-xl)] px-6",
        xl: "ds-button-text-lg h-[var(--ds-btn-h-xl)] rounded-[var(--ds-radius-xl)] px-8",
        icon: "ds-target h-[var(--ds-btn-h)] w-[var(--ds-btn-h)] rounded-[var(--ds-radius-lg)]",
        "icon-sm": "ds-target h-[var(--ds-btn-h-sm)] w-[var(--ds-btn-h-sm)] rounded-[var(--ds-radius-lg)]",
        "icon-lg": "ds-target h-[var(--ds-btn-h-lg)] w-[var(--ds-btn-h-lg)] rounded-[var(--ds-radius-xl)]",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * Shows a spinner and blocks interaction while an action is in flight.
   *
   * The button keeps its label and is sized by it, so the surrounding layout
   * cannot shift when the state flips — swapping the label for "Saving…" is
   * what causes buttons to resize mid-click and rows to jump.
   */
  loading?: boolean
  /** Announced to screen readers while `loading`. */
  loadingLabel?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, loadingLabel = "Working…", disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"

    // `asChild` delegates rendering to the consumer's element, which has no
    // slot for a spinner — forwarding the busy state is the most we can do.
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          aria-busy={loading || undefined}
          {...props}
        >
          {children}
        </Comp>
      )
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <>
            <span className="ds-spinner-sm ds-spinner" role="presentation" aria-hidden="true" />
            <span className="ds-sr-only">{loadingLabel}</span>
          </>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

 
export { Button, buttonVariants }
