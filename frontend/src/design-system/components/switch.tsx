import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "ds-target peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent ds-transition-colors",
      "h-6 w-10 bg-[var(--ds-neutral-300)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[var(--ds-primary)]",
      className
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-[var(--ds-surface)] shadow-lg ring-0 transition-transform",
        "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
