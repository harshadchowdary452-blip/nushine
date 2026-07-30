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
      "fixed inset-0 z-[var(--ds-z-dialog)] bg-black/50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out backdrop-blur-sm",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      onCloseAutoFocus={(e) => e.preventDefault()}
      className={cn(
        "fixed left-[50%] top-[50%] z-[var(--ds-z-dialog)] w-full translate-x-[-50%] translate-y-[-50%] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-dialog)]",
        "rounded-[var(--ds-radius-2xl)] max-h-[90vh] flex flex-col",
        "data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out",
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
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className, ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1 px-6 py-5 border-b border-[var(--ds-border)] shrink-0", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogBody = ({
  className, ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("overflow-y-auto px-6 py-5 flex-1", className)} {...props} />
)
DialogBody.displayName = "DialogBody"

const DialogFooter = ({
  className, ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--ds-border)] shrink-0", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("font-[var(--ds-text-h3)] text-[var(--ds-text)]", className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-[var(--ds-text-secondary)]", className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
}
