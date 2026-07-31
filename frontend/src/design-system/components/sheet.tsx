import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      "ds-motion-overlay fixed inset-0 z-[var(--ds-z-dialog)] bg-[var(--ds-background-overlay)]",
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "ds-motion-sheet fixed z-[var(--ds-z-dialog)] flex flex-col overflow-y-auto border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-drawer)]",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[90dvh] border-b ds-motion-sheet-top",
        bottom: "inset-x-0 bottom-0 max-h-[90dvh] border-t rounded-t-[var(--ds-radius-2xl)]",
        left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm ds-motion-drawer-left",
        right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm ds-motion-drawer-right",
      },
    },
    defaultVariants: { side: "right" },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", className, children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-5 top-5 rounded-[var(--ds-radius-lg)] p-1.5 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)] transition-all opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
)
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1 border-b border-[var(--ds-border)] px-6 py-5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 border-t border-[var(--ds-border)] px-6 py-4 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("ds-drawer-title text-[var(--ds-text)]", className)} {...props} />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("ds-secondary-text", className)} {...props} />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose,
  SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription,
}
