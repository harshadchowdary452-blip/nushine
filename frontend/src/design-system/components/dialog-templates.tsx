import * as React from "react"
import { AlertTriangle, CheckCircle2, Loader2, Maximize2, Trash2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import { Button } from "./button"

type DialogTemplateProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

interface ConfirmDialogProps extends DialogTemplateProps {
  tone?: "primary" | "danger" | "success" | "warning"
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => void
}

/** Confirmation dialog for consequential actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  tone = "primary",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const variant = tone === "danger" ? "destructive" : tone === "success" ? "success" : tone === "warning" ? "warning" : "primary"
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md" aria-describedby={description ? "confirm-desc" : undefined}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                tone === "danger" ? "bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]" : "bg-[var(--ds-primary-subtle)] text-[var(--ds-primary)]"
              )}
            >
              {tone === "danger" ? <Trash2 className="h-5 w-5" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription id="confirm-desc">{description}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        {children && <DialogBody>{children}</DialogBody>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  /** The name of the record being deleted — e.g. "Patient #OP-1042". */
  itemName: string
  description?: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
}

/** Destructive-action dialog with a double-confirm step for extra safety. */
export function DeleteDialog({
  open,
  onOpenChange,
  title = "Delete this record?",
  itemName,
  description,
  confirmLabel = "Delete permanently",
  loading = false,
  onConfirm,
}: DeleteDialogProps) {
  const [armed, setArmed] = React.useState(false)

  React.useEffect(() => {
    if (!open) setArmed(false)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md" aria-describedby="delete-desc">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription id="delete-desc">
                {description ?? (
                  <>
                    <strong className="text-[var(--ds-text)]">{itemName}</strong> will be permanently removed.
                    This action cannot be undone.
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {!armed ? (
          <DialogBody>
            <p className="ds-secondary-text text-[var(--ds-text-secondary)]">
              To confirm, type the name of the record you are deleting.
            </p>
            <input
              value={armed ? itemName : ""}
              onChange={(e) => setArmed(e.target.value.trim().toLowerCase() === itemName.trim().toLowerCase())}
              placeholder={itemName}
              className="ds-focus-ring ds-input-text mt-3 h-[var(--ds-input-height)] w-full rounded-[var(--ds-input-radius)] border border-[var(--ds-input-border)] bg-[var(--ds-surface)] px-[var(--ds-spacing-3)] text-[var(--ds-text)]"
              aria-label={`Type ${itemName} to confirm deletion`}
              autoFocus
            />
          </DialogBody>
        ) : (
          <DialogBody>
            <p className="ds-secondary-text text-[var(--ds-text-secondary)]">
              You have confirmed. Press delete to continue.
            </p>
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading} disabled={!armed}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface SuccessDialogProps extends DialogTemplateProps {}

/** Confirmation of a completed action; closes itself automatically. */
export function SuccessDialog({ open, onOpenChange, title, description, children, autoCloseMs = 2500 }: SuccessDialogProps & { autoCloseMs?: number }) {
  React.useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => onOpenChange(false), autoCloseMs)
    return () => clearTimeout(timer)
  }, [open, autoCloseMs, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-sm" aria-describedby="success-desc">
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ds-success-subtle)] text-[var(--ds-success)]">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-center">{title}</DialogTitle>
              {description && (
                <DialogDescription id="success-desc">{description}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        {children && <DialogBody className="text-center">{children}</DialogBody>}
        <DialogFooter className="justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ErrorDialogProps extends DialogTemplateProps {
  onRetry?: () => void
}

/** Error dialog with optional retry. */
export function ErrorDialog({ open, onOpenChange, title, description, onRetry, children }: ErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md" aria-describedby="error-desc">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ds-danger-subtle)] text-[var(--ds-danger)]">
              <XCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription id="error-desc">{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        {children && <DialogBody>{children}</DialogBody>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {onRetry && (
            <Button onClick={onRetry}>
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ProgressDialogProps extends DialogTemplateProps {
  /** 0–100. */
  value: number
  status?: string
  cancelable?: boolean
}

/** Non-dismissable progress dialog for long-running operations. */
export function ProgressDialog({ open, onOpenChange, title, description, value, status, cancelable = false }: ProgressDialogProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <Dialog open={open} onOpenChange={cancelable ? onOpenChange : () => undefined}>
      <DialogContent className="w-full sm:max-w-sm" aria-describedby="progress-desc" showCloseButton={cancelable}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {title}
          </DialogTitle>
          {description && <DialogDescription id="progress-desc">{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody>
          <div role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} aria-label={status ?? "Progress"}>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ds-surface-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--ds-primary)] transition-[width] duration-300"
                style={{ width: `${clamped}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="ds-caption text-[var(--ds-text-secondary)]">{status ?? "Working…"}</span>
              <span className="ds-caption ds-numeric text-[var(--ds-text-secondary)]">{Math.round(clamped)}%</span>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

interface FullscreenDialogProps extends DialogTemplateProps {
  footer?: React.ReactNode
}

/** Fullscreen dialog with sticky header and footer — for complex editors. */
export function FullscreenDialog({ open, onOpenChange, title, description, children, footer, className }: FullscreenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[calc(100dvh-var(--ds-spacing-6))] w-[calc(100vw-var(--ds-spacing-6))] max-h-none max-w-none flex-col p-0 sm:w-[calc(100vw-var(--ds-spacing-6))]",
          className
        )}
        showCloseButton
      >
        <DialogHeader className="flex-row items-center justify-between gap-4 pr-14">
          <div>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </DialogHeader>
        <DialogBody className="flex-1">{children}</DialogBody>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

interface PreviewDialogProps extends DialogTemplateProps {}

/** Large, scrollable preview surface for documents, images and reports. */
export function PreviewDialog({ open, onOpenChange, title, description, children, className }: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("w-full max-w-4xl", className)} showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Maximize2 className="h-4 w-4 text-[var(--ds-text-tertiary)]" aria-hidden="true" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody className="flex items-start justify-center">{children}</DialogBody>
      </DialogContent>
    </Dialog>
  )
}
