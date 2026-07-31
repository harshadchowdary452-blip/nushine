"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = React.createContext<{
  toasts: Toast[]
  addToast: (toast: Omit<Toast, "id">) => void
  removeToast: (id: string) => void
}>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return React.useContext(ToastProvider)
}

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: "default" | "destructive" | "success"
}

const toastVariants = cva(
  "ds-toast-text ds-animate-toast pointer-events-auto relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-[var(--ds-radius-xl)] border p-4 pr-10 shadow-[var(--ds-shadow-dialog)]",
  {
    variants: {
      variant: {
        default: "border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text)]",
        destructive:
          "border-[var(--ds-danger)] bg-[var(--ds-danger)] text-[var(--ds-danger-foreground)]",
        success:
          "border-[var(--ds-success)] bg-[var(--ds-success)] text-[var(--ds-success-foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function ToastViewport({ className, ...props }: React.HTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      className={cn(
        "fixed bottom-0 right-0 z-[var(--ds-z-toast)] flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-[420px]",
        className
      )}
      {...props}
    />
  )
}

function Toast({
  className,
  variant,
  title,
  description,
  onClose,
}: VariantProps<typeof toastVariants> & {
  className?: string
  title?: string
  description?: string
  onClose?: () => void
}) {
  return (
    <li
      role={variant === "destructive" ? "alert" : "status"}
      aria-live={variant === "destructive" ? "assertive" : "polite"}
      className={cn(toastVariants({ variant }), className)}
    >
      <div className="grid gap-1">
        {title && <div className="text-sm font-semibold">{title}</div>}
        {description && (
          <div className="text-sm opacity-90">{description}</div>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss notification"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-[var(--ds-radius-lg)] p-1 opacity-60 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

export function Toaster() {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastProvider.Provider value={{ toasts, addToast, removeToast }}>
      <ToastViewport>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.variant}
            title={toast.title}
            description={toast.description}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </ToastViewport>
    </ToastProvider.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Toast, ToastViewport, toastVariants }
