import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "ds-target peer h-5 w-5 shrink-0 rounded-[var(--ds-radius-md)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] ds-transition-colors",
      "hover:border-[var(--ds-input-border-hover)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-[var(--ds-primary)] data-[state=checked]:bg-[var(--ds-primary)] data-[state=checked]:text-[var(--ds-primary-foreground)]",
      "data-[state=indeterminate]:border-[var(--ds-primary)] data-[state=indeterminate]:bg-[var(--ds-primary)] data-[state=indeterminate]:text-[var(--ds-primary-foreground)]",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? (
        <Minus className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
