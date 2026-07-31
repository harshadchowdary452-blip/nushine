import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "ds-motion-popover ds-tooltip-text z-[var(--ds-z-dialog-dropdown)] rounded-[var(--ds-radius-md)] bg-[var(--ds-tooltip-bg)] px-2.5 py-1.5 text-[var(--ds-tooltip-fg)] shadow-[var(--ds-shadow-dropdown)]",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

function TooltipWrap({
  children,
  content,
  side = "top",
}: {
  children: React.ReactNode
  content: string
  side?: "top" | "right" | "bottom" | "left"
}) {
  if (!content) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  )
}

TooltipWrap.displayName = "TooltipWrap"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipWrap }
