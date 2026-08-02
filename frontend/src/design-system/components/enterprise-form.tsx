import * as React from "react"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/design-system/components/dialog"

const dialogWidths = {
  sm: "sm:max-w-[500px]",
  md: "sm:max-w-[640px]",
  lg: "sm:max-w-[800px]",
  xl: "sm:max-w-[960px]",
} as const

export interface EnterpriseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: keyof typeof dialogWidths
  /** Footer actions (Cancel/Save). Omit for dialogs with inline actions. */
  footer?: React.ReactNode
  /** False when the body manages its own scroll (e.g. inside a wizard). */
  scrollable?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * The one form dialog every module opens (Part 3D). Standardizes the
 * scrollable-body / sticky-header / sticky-footer pattern used across the app
 * so dialog chrome stops being re-built per page.
 */
export function EnterpriseFormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "sm",
  footer,
  scrollable = true,
  className,
  children,
}: EnterpriseFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(dialogWidths[size], "max-h-[90vh] flex flex-col", className)}>
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {scrollable ? (
          <DialogBody className="min-h-0 flex-1">{children}</DialogBody>
        ) : (
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden px-6 py-5">{children}</div>
        )}
        {footer && <DialogFooter className="shrink-0 border-t border-[var(--ds-border)]">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
EnterpriseFormDialog.displayName = "EnterpriseFormDialog"

export interface EnterpriseFieldGridProps {
  /** Number of equal columns on desktop (1 column below sm). */
  columns?: 1 | 2 | 3 | 4
  className?: string
  children: React.ReactNode
}

/**
 * Responsive field grid for form rows — one column on phones, the requested
 * count on larger screens. Use inside FormSection bodies.
 */
export function EnterpriseFieldGrid({ columns = 2, className, children }: EnterpriseFieldGridProps) {
  const cols =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : columns === 4
          ? "grid-cols-2 lg:grid-cols-4"
          : "grid-cols-1 sm:grid-cols-2"
  return <div className={cn("grid gap-4", cols, className)}>{children}</div>
}
EnterpriseFieldGrid.displayName = "EnterpriseFieldGrid"
