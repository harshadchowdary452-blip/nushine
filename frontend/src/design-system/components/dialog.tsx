import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "ds-motion-overlay fixed inset-0 z-[var(--ds-z-dialog)] bg-[var(--ds-background-overlay)] backdrop-blur-sm",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      onCloseAutoFocus={(e) => e.preventDefault()}
      className={cn(
        "ds-motion-dialog fixed left-[50%] top-[50%] z-[var(--ds-z-dialog)] translate-x-[-50%] translate-y-[-50%]",
        "flex flex-col border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-dialog)]",
        // Width is capped by the viewport minus a gutter so the dialog never
        // touches the screen edge or forces horizontal scroll on small phones.
        "w-[calc(100vw-var(--ds-spacing-8))] sm:w-full",
        // `dvh` accounts for mobile browser chrome; `vh` alone leaves the
        // footer under the address bar on iOS.
        "max-h-[calc(100dvh-var(--ds-spacing-8))] sm:max-h-[90dvh]",
        "rounded-[var(--ds-radius-2xl)]",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close className="absolute right-5 top-5 rounded-[var(--ds-radius-lg)] p-1.5 text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-surface-hover)] transition-all opacity-70 focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1 px-6 py-5 border-b border-[var(--ds-border)] shrink-0",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "overflow-y-auto px-6 py-5 flex-1",
      className
    )}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--ds-border)] shrink-0",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "ds-dialog-title text-[var(--ds-text)]",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "ds-secondary-text",
      className
    )}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
}
