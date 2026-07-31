import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { scrollable?: boolean }
>(({ className, scrollable = false, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center gap-1 rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface-secondary)] p-1",
      scrollable && "ds-scroll-x scrollbar-none max-w-full overflow-x-auto",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    /** Counter badge shown on the right of the label. */
    count?: number
  }
>(({ className, count, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "ds-nav-label inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--ds-radius-lg)] px-3.5 py-1.5 text-[var(--ds-text-secondary)] ds-transition-colors",
      "ring-offset-[var(--ds-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/20 focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-[var(--ds-surface)] data-[state=active]:text-[var(--ds-text)] data-[state=active]:shadow-sm",
      "hover:text-[var(--ds-text)]",
      className
    )}
    {...props}
  >
    {children}
    {count !== undefined && (
      <span className="ds-badge-text ds-numeric inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ds-background-subtle)] px-1 text-[var(--ds-text-secondary)]">
        {count}
      </span>
    )}
  </TabsPrimitive.Trigger>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-5 ring-offset-[var(--ds-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/20 focus-visible:ring-offset-2",
      "data-[state=active]:animate-fade-in",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
