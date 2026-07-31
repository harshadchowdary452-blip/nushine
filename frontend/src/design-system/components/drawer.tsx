import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Drawer = DialogPrimitive.Root
const DrawerTrigger = DialogPrimitive.Trigger
const DrawerClose = DialogPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "ds-motion-overlay fixed inset-0 z-[var(--ds-z-dialog)] bg-[var(--ds-background-overlay)]",
      className
    )}
    {...props}
  />
))
DrawerOverlay.displayName = "DrawerOverlay"

interface DrawerContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "left" | "right"
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side = "right", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onCloseAutoFocus={(e) => e.preventDefault()}
      className={cn(
        "fixed top-0 z-[var(--ds-z-dialog)] flex h-full flex-col border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-drawer)]",
        // Full-bleed on phones; capped panel on anything larger.
        "w-full sm:max-w-lg",
        // `h-dvh` keeps the footer above mobile browser chrome.
        "h-dvh",
        // Entrance/exit are bound to Radix data-state so the exit animation
        // actually plays; the previous class only animated entry.
        side === "right"
          ? "right-0 border-l ds-motion-drawer-right"
          : "left-0 border-r ds-motion-drawer-left",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-5 top-5 rounded-[var(--ds-radius-lg)] p-1.5 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)] transition-all opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1 px-6 py-5 border-b border-[var(--ds-border)] shrink-0",
      className
    )}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "overflow-y-auto px-6 py-5 flex-1",
      className
    )}
    {...props}
  />
)
DrawerBody.displayName = "DrawerBody"

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--ds-border)] shrink-0",
      className
    )}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("ds-drawer-title text-[var(--ds-text)]", className)}
    {...props}
  />
))
DrawerTitle.displayName = DialogPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("ds-secondary-text", className)}
    {...props}
  />
))
DrawerDescription.displayName = DialogPrimitive.Description.displayName

export {
  Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent,
  DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle, DrawerDescription,
}
